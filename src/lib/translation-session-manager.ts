/**
 * TranslationSessionManager: Singleton that manages translation bridges.
 *
 * Design: one Gemini Live API session **per (language, speaker)**. Each speaker
 * (the organizer and anyone given the floor) gets a dedicated bridge per active
 * language, publishing a `translator-{lang}-{speaker}` audio track. This keeps
 * each speaker's translation clean (no mixing of voices into one session) and
 * lets clients choose whose translations to hear — e.g. the organizer hears
 * every other speaker but not their own voice.
 */

import { TranslationBridge, BridgeStatus } from "./translation-bridge";

export interface TranslationInfo {
  language: string;
  status: BridgeStatus;
  subscriberCount: number;
  speakerCount: number;
}

export interface FloorRequest {
  identity: string;
  name: string;
  requestedAt: number;
}

export interface SessionInfo {
  sessionId: string;
  organizerIdentity: string;
  createdAt: Date;
  // Secret known only to the organizer; required to broadcast or manage the floor.
  hostKey: string;
  // Participants currently allowed to speak (their audio gets translated).
  speakers: Set<string>;
  // Pending "raise hand" requests, keyed by participant identity.
  floorRequests: Map<string, FloorRequest>;
}

export interface FloorState {
  speakers: string[];
  requests: FloorRequest[];
}

// All bridges for one language in one session, plus how many listeners want it.
interface LanguageGroup {
  subscriberCount: number;
  bridges: Map<string, TranslationBridge>; // keyed by speaker identity
}

// Store the singleton on globalThis so it survives Next.js dev HMR reloads and
// is shared across every API route bundle (and the single prod server process).
const globalForManager = globalThis as unknown as {
  __translationSessionManager?: TranslationSessionManager;
};

class TranslationSessionManager {
  // Map<sessionId, Map<languageCode, LanguageGroup>>
  private translations: Map<string, Map<string, LanguageGroup>> = new Map();

  // Map<sessionId, SessionInfo>
  private sessions: Map<string, SessionInfo> = new Map();

  private constructor() {}

  static getInstance(): TranslationSessionManager {
    if (!globalForManager.__translationSessionManager) {
      globalForManager.__translationSessionManager = new TranslationSessionManager();
    }
    return globalForManager.__translationSessionManager;
  }

  private buildConfig() {
    return {
      geminiApiKey: process.env.GEMINI_API_KEY!,
      livekitUrl:
        process.env.LIVEKIT_URL ||
        process.env.NEXT_PUBLIC_LIVEKIT_URL ||
        "ws://localhost:7880",
      livekitApiKey: process.env.LIVEKIT_API_KEY!,
      livekitApiSecret: process.env.LIVEKIT_API_SECRET!,
    };
  }

  // ─── Session management ────────────────────────────────────────────────

  createSession(
    sessionId: string,
    organizerIdentity: string,
    hostKey: string
  ): SessionInfo {
    const info: SessionInfo = {
      sessionId,
      organizerIdentity,
      createdAt: new Date(),
      hostKey,
      speakers: new Set([organizerIdentity]),
      floorRequests: new Map(),
    };
    this.sessions.set(sessionId, info);
    console.log(`[SessionManager] Created session ${sessionId} for organizer ${organizerIdentity}`);
    return info;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /** Validate that the given key matches the session's host key. */
  isHost(sessionId: string, hostKey: string | null | undefined): boolean {
    const session = this.sessions.get(sessionId);
    return !!session && !!hostKey && session.hostKey === hostKey;
  }

  // ─── Floor (speaking permission) management ────────────────────────────

  /** Record a "raise hand" request from an attendee. */
  addFloorRequest(sessionId: string, identity: string, name: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.speakers.has(identity)) return; // already a speaker
    session.floorRequests.set(identity, { identity, name, requestedAt: Date.now() });
    console.log(`[SessionManager] Floor requested by ${identity} in ${sessionId}`);
  }

  /** Withdraw a pending request (attendee cancels, or it gets resolved). */
  removeFloorRequest(sessionId: string, identity: string): void {
    this.sessions.get(sessionId)?.floorRequests.delete(identity);
  }

  /**
   * Grant the floor to an attendee. Spins up a dedicated bridge for that
   * speaker in every language that currently has listeners.
   */
  async grantFloor(sessionId: string, identity: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.speakers.add(identity);
    session.floorRequests.delete(identity);

    const langMap = this.translations.get(sessionId);
    if (langMap) {
      for (const [language, group] of langMap) {
        await this.ensureBridge(sessionId, language, identity, group);
      }
    }
    console.log(`[SessionManager] Granted floor to ${identity} in ${sessionId}`);
  }

  /**
   * Revoke the floor from a speaker. Tears down their bridges in every language.
   */
  async revokeFloor(sessionId: string, identity: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (identity === session.organizerIdentity) return; // can't revoke the organizer
    session.speakers.delete(identity);
    session.floorRequests.delete(identity);

    const langMap = this.translations.get(sessionId);
    if (langMap) {
      for (const [, group] of langMap) {
        const bridge = group.bridges.get(identity);
        if (bridge) {
          await bridge.stop();
          group.bridges.delete(identity);
        }
      }
    }
    console.log(`[SessionManager] Revoked floor from ${identity} in ${sessionId}`);
  }

  getFloorState(sessionId: string): FloorState {
    const session = this.sessions.get(sessionId);
    if (!session) return { speakers: [], requests: [] };
    return {
      speakers: Array.from(session.speakers),
      requests: Array.from(session.floorRequests.values()).sort(
        (a, b) => a.requestedAt - b.requestedAt
      ),
    };
  }

  // ─── Translation management ────────────────────────────────────────────

  /**
   * Ensure a bridge exists for (language, speaker). Sets the map entry before
   * awaiting start() so concurrent callers don't create duplicates.
   */
  private async ensureBridge(
    sessionId: string,
    language: string,
    speaker: string,
    group: LanguageGroup
  ): Promise<void> {
    const existing = group.bridges.get(speaker);
    if (existing) {
      if (existing.status === "active" || existing.status === "starting") return;
      // Stale (error/closed) → recreate
      await existing.stop();
      group.bridges.delete(speaker);
    }

    const bridge = new TranslationBridge(sessionId, language, speaker, this.buildConfig());
    group.bridges.set(speaker, bridge); // reserve the slot before the first await
    try {
      await bridge.start();
    } catch (error) {
      group.bridges.delete(speaker);
      console.error(
        `[SessionManager] Failed to start bridge ${language}/${speaker}:`,
        error
      );
    }
  }

  /**
   * A listener wants `targetLanguage`. Bump the subscriber count and make sure
   * every current speaker has a bridge for that language.
   */
  async getOrCreate(
    sessionId: string,
    targetLanguage: string
  ): Promise<TranslationInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    let langMap = this.translations.get(sessionId);
    if (!langMap) {
      langMap = new Map();
      this.translations.set(sessionId, langMap);
    }

    let group = langMap.get(targetLanguage);
    if (!group) {
      group = { subscriberCount: 0, bridges: new Map() };
      langMap.set(targetLanguage, group);
    }
    group.subscriberCount++;

    // One bridge per current speaker
    await Promise.all(
      Array.from(session.speakers).map((speaker) =>
        this.ensureBridge(sessionId, targetLanguage, speaker, group!)
      )
    );

    return {
      language: targetLanguage,
      status: "active",
      subscriberCount: group.subscriberCount,
      speakerCount: group.bridges.size,
    };
  }

  getActiveTranslations(sessionId: string): TranslationInfo[] {
    const langMap = this.translations.get(sessionId);
    if (!langMap) return [];

    const result: TranslationInfo[] = [];
    for (const [language, group] of langMap) {
      let status: BridgeStatus = "starting";
      for (const [, bridge] of group.bridges) {
        if (bridge.status === "active") {
          status = "active";
          break;
        }
      }
      result.push({
        language,
        status,
        subscriberCount: group.subscriberCount,
        speakerCount: group.bridges.size,
      });
    }
    return result;
  }

  /**
   * Decrement subscriber count for a language. If the last listener leaves,
   * tear down all of that language's bridges.
   */
  async unsubscribe(sessionId: string, targetLanguage: string): Promise<void> {
    const langMap = this.translations.get(sessionId);
    if (!langMap) return;

    const group = langMap.get(targetLanguage);
    if (!group) return;

    group.subscriberCount = Math.max(0, group.subscriberCount - 1);
    console.log(
      `[SessionManager] Unsubscribed from ${targetLanguage} in session ${sessionId} (${group.subscriberCount} remaining)`
    );

    if (group.subscriberCount === 0) {
      console.log(
        `[SessionManager] No more subscribers for ${targetLanguage}, tearing down ${group.bridges.size} bridge(s)`
      );
      for (const [, bridge] of group.bridges) {
        await bridge.stop();
      }
      langMap.delete(targetLanguage);
      if (langMap.size === 0) {
        this.translations.delete(sessionId);
      }
    }
  }

  async removeTranslation(sessionId: string, targetLanguage: string): Promise<void> {
    const langMap = this.translations.get(sessionId);
    if (!langMap) return;

    const group = langMap.get(targetLanguage);
    if (group) {
      for (const [, bridge] of group.bridges) {
        await bridge.stop();
      }
      langMap.delete(targetLanguage);
      console.log(
        `[SessionManager] Removed all bridges for ${targetLanguage} in session ${sessionId}`
      );
    }
  }

  async removeAllTranslations(sessionId: string): Promise<void> {
    const langMap = this.translations.get(sessionId);
    if (langMap) {
      for (const [, group] of langMap) {
        for (const [, bridge] of group.bridges) {
          await bridge.stop();
        }
      }
      this.translations.delete(sessionId);
    }
    this.sessions.delete(sessionId);
    console.log(`[SessionManager] Removed all bridges and session for ${sessionId}`);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }
}

export default TranslationSessionManager;
