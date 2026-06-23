/**
 * TranslationBridge: Connects a LiveKit room to a Gemini Live API WebSocket
 * for real-time audio translation.
 *
 * Each bridge instance:
 * 1. Joins the LiveKit room as a bot participant (e.g., "translator-es")
 * 2. Subscribes to the organizer's audio track
 * 3. Pipes PCM audio frames to Gemini Live API via WebSocket
 * 4. Receives translated audio back and publishes it as a new track
 */

import {
  Room,
  RoomEvent,
  LocalAudioTrack,
  AudioSource,
  AudioFrame,
  TrackPublishOptions,
  TrackSource,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
  TrackKind,
  AudioStream,
} from "@livekit/rtc-node";
import WebSocket from "ws";
import { SpeechVad } from "@/lib/audio-vad";

export type BridgeStatus = "starting" | "active" | "error" | "closed";

export class TranslationBridge {
  private room: Room | null = null;
  private geminiWs: WebSocket | null = null;
  private audioSource: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private publishedTrackSid: string = "";
  private transcriptionSegmentId: number = 0;
  private framesSentToGemini: number = 0;
  private framesReceivedFromGemini: number = 0;

  public readonly targetLanguage: string;
  public readonly voice: string;
  public readonly sessionId: string;
  public readonly identity: string;
  public status: BridgeStatus = "starting";
  public subscriberCount: number = 0;

  // Gemini Live API config
  private readonly geminiApiKey: string;
  private readonly geminiModel: string = "gemini-3.5-live-translate-preview";
  private readonly sampleRate: number = 24000; // Gemini outputs 24kHz
  private readonly inputSampleRate: number = 48000; // LiveKit default
  private readonly channels: number = 1;

  // LiveKit config
  private readonly livekitUrl: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;

  private geminiSetupComplete: boolean = false;
  // Identity of the single participant whose audio this bridge translates.
  public readonly speakerIdentity: string;
  private lastAudioFrameTime: number = 0;
  private captureChain: Promise<void> = Promise.resolve();
  private isPiping: boolean = false;
  // Reader of the currently piped audio stream, so we can cancel it to switch
  // sources (e.g. when screen-share audio should take over from the mic).
  private activeReader: ReadableStreamDefaultReader<AudioFrame> | null = null;
  // TrackSource of the audio currently piped to Gemini (-1 = none).
  private activeSource: number = -1;
  private readonly speechVad = new SpeechVad();

  constructor(
    sessionId: string,
    targetLanguage: string,
    voice: string,
    speakerIdentity: string,
    config: {
      geminiApiKey: string;
      livekitUrl: string;
      livekitApiKey: string;
      livekitApiSecret: string;
    }
  ) {
    this.sessionId = sessionId;
    this.targetLanguage = targetLanguage;
    this.voice = voice;
    this.speakerIdentity = speakerIdentity;
    // One translator bot per (language, voice, speaker):
    // translator-{lang}-{voice}-{speaker}
    this.identity = `translator-${targetLanguage}-${voice}-${speakerIdentity}`;
    this.geminiApiKey = config.geminiApiKey;
    this.livekitUrl = config.livekitUrl;
    this.livekitApiKey = config.livekitApiKey;
    this.livekitApiSecret = config.livekitApiSecret;
  }

  async start(): Promise<void> {
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Starting bridge for session ${this.sessionId}`
    );

    try {
      // 1. Generate token and join LiveKit room
      await this.joinLiveKitRoom();

      // 2. Connect to Gemini Live API
      await this.connectGemini();

      // 3. Subscribe to this speaker's audio and wire up the pipeline
      this.subscribeToSpeaker();

      this.status = "active";
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Bridge is active`
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Failed to start:`,
        error
      );
      this.status = "error";
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Stopping bridge`
    );
    this.status = "closed";

    if (this.geminiWs) {
      this.geminiWs.close();
      this.geminiWs = null;
    }

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    this.audioSource = null;
    this.localTrack = null;
    this.geminiSetupComplete = false;
    this.endSpeechIfActive();
  }

  private async joinLiveKitRoom(): Promise<void> {
    // Generate a token for the bot participant using the server SDK
    const { AccessToken } = await import("livekit-server-sdk");

    const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
      identity: this.identity,
      name: `Translator (${this.targetLanguage.toUpperCase()})`,
    });

    at.addGrant({
      roomJoin: true,
      room: this.sessionId,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // Create and connect to the room
    this.room = new Room();

    this.room.on(RoomEvent.Disconnected, () => {
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Disconnected from room`
      );
      this.status = "closed";
    });

    await this.room.connect(this.livekitUrl, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Joined room as ${this.identity}`
    );

    // Create an AudioSource to publish translated audio
    // Gemini outputs 24kHz mono PCM
    this.audioSource = new AudioSource(this.sampleRate, this.channels);
    this.localTrack = LocalAudioTrack.createAudioTrack(
      `translated-audio-${this.targetLanguage}`,
      this.audioSource
    );

    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;

    await this.room.localParticipant!.publishTrack(
      this.localTrack,
      publishOptions
    );

    // Save published track SID for transcription
    const pubs = this.room.localParticipant!.trackPublications;
    for (const [, pub] of pubs) {
      if (pub.track === this.localTrack) {
        this.publishedTrackSid = pub.sid || "";
        break;
      }
    }

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Published translated audio track (sid: ${this.publishedTrackSid || 'pending'})`
    );
  }

  private async connectGemini(): Promise<void> {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.geminiApiKey}`;

    return new Promise<void>((resolve, reject) => {
      this.geminiWs = new WebSocket(wsUrl);

      this.geminiWs.on("open", () => {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket connected`
        );
        this.sendGeminiSetup();
      });

      this.geminiWs.on("message", (data: WebSocket.Data) => {
        this.handleGeminiMessage(data);
        if (!this.geminiSetupComplete) {
          // Wait for setup complete message
          // resolve will be called in handleGeminiMessage
        }
      });

      this.geminiWs.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket error:`,
          error
        );
        if (!this.geminiSetupComplete) {
          reject(error);
        }
      });

      this.geminiWs.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket closed`,
          { code, reason: reasonStr }
        );
        if (!this.geminiSetupComplete) {
          reject(new Error(`Gemini WebSocket closed before setup: code=${code} reason=${reasonStr}`));
        } else if (this.status === "active") {
          // Auto-reconnect on GoAway or unexpected closure
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Reconnecting Gemini WebSocket...`
          );
          this.geminiSetupComplete = false;
          this.reconnectGemini();
        }
      });

      // Store resolve for use when setup complete arrives
      const checkSetup = setInterval(() => {
        if (this.geminiSetupComplete) {
          clearInterval(checkSetup);
          resolve();
        }
      }, 100);

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!this.geminiSetupComplete) {
          clearInterval(checkSetup);
          reject(new Error("Gemini setup timeout"));
        }
      }, 15000);
    });
  }

  /**
   * Reconnect the Gemini WebSocket after a GoAway or unexpected closure.
   * Reuses the existing LiveKit room + audio pipeline.
   */
  private async reconnectGemini(): Promise<void> {
    try {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.geminiApiKey}`;

      this.geminiWs = new WebSocket(wsUrl);

      this.geminiWs.on("open", () => {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket reconnected`
        );
        this.sendGeminiSetup();
      });

      this.geminiWs.on("message", (data: WebSocket.Data) => {
        if (!this.geminiSetupComplete) {
          const msg = JSON.parse(data.toString());
          if (msg.setupComplete) {
            console.log(
              `[TranslationBridge:${this.targetLanguage}] Gemini reconnect setup complete`
            );
            this.geminiSetupComplete = true;
            return;
          }
        }
        this.handleGeminiMessage(data);
      });

      this.geminiWs.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Gemini reconnect error:`,
          error
        );
      });

      this.geminiWs.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini reconnected WS closed`,
          { code, reason: reasonStr }
        );
        if (this.status === "active") {
          setTimeout(() => {
            this.geminiSetupComplete = false;
            this.reconnectGemini();
          }, 1000);
        }
      });
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Gemini reconnect failed:`,
        error
      );
      this.status = "error";
    }
  }

  private sendGeminiSetup(): void {
    const setupMessage = {
      setup: {
        model: `models/${this.geminiModel}`,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        generationConfig: {
          responseModalities: ["AUDIO"],
          // Pin the output voice so every speaker/language/reconnect uses the
          // same voice instead of a random one.
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voice,
              },
            },
          },
          translationConfig: {
            targetLanguageCode: this.targetLanguage,
            echoTargetLanguage: true,
          },
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: true,
          },
          turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
        },
      },
    };

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Sending Gemini setup:`,
      JSON.stringify(setupMessage, null, 2)
    );

    this.geminiWs!.send(JSON.stringify(setupMessage));
  }

  private handleGeminiMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Log all messages before setup is complete for debugging
      if (!this.geminiSetupComplete) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini message (pre-setup):`,
          JSON.stringify(message).slice(0, 500)
        );
      }

      // Handle setup complete
      if (message.setupComplete) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini setup complete`
        );
        this.geminiSetupComplete = true;
        return;
      }

      // Handle audio response
      const serverContent = message?.serverContent;
      const parts = serverContent?.modelTurn?.parts;

      if (parts?.length) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            this.framesReceivedFromGemini++;
            if (this.framesReceivedFromGemini <= 3 || this.framesReceivedFromGemini % 100 === 0) {
              console.log(
                `[TranslationBridge:${this.targetLanguage}] Received audio frame #${this.framesReceivedFromGemini} from Gemini (${part.inlineData.data.length} bytes base64)`
              );
            }
            // Queue frame for sequential capture (avoid promise pile-up)
            this.queueAudioFrame(part.inlineData.data);
          }
        }
      }

      // Handle input transcription — what the speaker actually said (source language)
      if (serverContent?.inputTranscription?.text) {
        this.publishTranscriptionText(
          serverContent.inputTranscription.text,
          !serverContent.turnComplete,
          "source"
        );
      }

      // Handle output transcription — the translated text (target language)
      if (serverContent?.outputTranscription?.text) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Transcription:`,
          serverContent.outputTranscription.text.slice(0, 100)
        );
        this.publishTranscriptionText(
          serverContent.outputTranscription.text,
          !serverContent.turnComplete,
          "translation"
        );
      }

      // If turn is complete, advance the segment id
      if (serverContent?.turnComplete) {
        this.transcriptionSegmentId++;
      }
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error parsing Gemini message:`,
        error
      );
    }
  }

  /**
   * Queue an audio frame for sequential capture.
   * Chains each captureFrame call to avoid promise pile-up.
   */
  private queueAudioFrame(base64Audio: string): void {
    this.captureChain = this.captureChain.then(() =>
      this.publishTranslatedAudio(base64Audio)
    );
  }

  private async publishTranslatedAudio(base64Audio: string): Promise<void> {
    if (!this.audioSource || this.status === "closed") return;

    try {
      const pcmBuffer = Buffer.from(base64Audio, "base64");
      const int16 = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset,
        pcmBuffer.byteLength / 2
      );

      const frame = new AudioFrame(int16, this.sampleRate, this.channels, int16.length);
      await this.audioSource.captureFrame(frame);

      const now = Date.now();
      if (this.lastAudioFrameTime && now - this.lastAudioFrameTime > 2000) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Audio resumed after ${now - this.lastAudioFrameTime}ms gap (frame #${this.framesReceivedFromGemini})`
        );
      }
      this.lastAudioFrameTime = now;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("InvalidState") || msg.includes("closed")) {
        console.warn(
          `[TranslationBridge:${this.targetLanguage}] AudioSource closed — stopping capture`
        );
        this.audioSource = null;
      } else {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Error capturing audio frame:`,
          error
        );
      }
    }
  }

  /**
   * Subscribe to this bridge's single speaker and pipe their audio to Gemini.
   */
  private subscribeToSpeaker(): void {
    if (!this.room) return;

    // Subscribe if the speaker is already in the room
    for (const [, participant] of this.room.remoteParticipants) {
      if (participant.identity === this.speakerIdentity) {
        this.subscribeToParticipantAudio(participant);
      }
    }

    // Subscribe to the speaker's track if it gets published later
    this.room.on(
      RoomEvent.TrackPublished,
      (
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (
          participant.identity === this.speakerIdentity &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Speaker published audio track (source=${publication.source}) — subscribing`
          );
          publication.setSubscribed(true);
        }
      }
    );

    // Once any of the speaker's audio is subscribed, (re)evaluate what to pipe.
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        _track: RemoteAudioTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (
          participant.identity === this.speakerIdentity &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          this.evaluateAudioSource();
        }
      }
    );

    // When a track goes away (e.g. screen share stopped, mic muted), re-evaluate
    // so we fall back to whatever audio is still available.
    this.room.on(
      RoomEvent.TrackUnsubscribed,
      (
        _track: RemoteAudioTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (
          participant.identity === this.speakerIdentity &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          // If the source we're currently piping disappeared, drop it; the
          // active pipe's readLoop will end and re-evaluate on its own.
          this.evaluateAudioSource();
        }
      }
    );
  }

  /**
   * Manually subscribe to a participant's audio track (needed when autoSubscribe is off).
   */
  private subscribeToParticipantAudio(
    participant: RemoteParticipant
  ): void {
    for (const [, publication] of participant.trackPublications) {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Subscribing to existing audio track (source=${publication.source})`
        );
        // Manually subscribe — this triggers TrackSubscribed event
        publication.setSubscribed(true);
      }
    }
  }

  /** Higher number = preferred. Screen-share audio wins over the microphone. */
  private sourcePriority(source: number): number {
    if (source === TrackSource.SOURCE_SCREENSHARE_AUDIO) return 2;
    if (source === TrackSource.SOURCE_MICROPHONE) return 1;
    return 0;
  }

  /**
   * Find the speaker's best currently-subscribed audio track (screen-share
   * audio preferred over mic), or null if none is available.
   */
  private bestAvailableAudio(): {
    track: RemoteAudioTrack;
    source: number;
  } | null {
    if (!this.room) return null;
    let best: { track: RemoteAudioTrack; source: number } | null = null;
    for (const [, participant] of this.room.remoteParticipants) {
      if (participant.identity !== this.speakerIdentity) continue;
      for (const [, pub] of participant.trackPublications) {
        if (
          pub.kind === TrackKind.KIND_AUDIO &&
          pub.subscribed &&
          pub.track
        ) {
          const source = pub.source ?? TrackSource.SOURCE_UNKNOWN;
          if (!best || this.sourcePriority(source) > this.sourcePriority(best.source)) {
            best = { track: pub.track as RemoteAudioTrack, source };
          }
        }
      }
    }
    return best;
  }

  /**
   * Decide which of the speaker's audio tracks to feed Gemini. If nothing is
   * piping, start the best one. If a higher-priority source appeared (e.g.
   * screen-share audio while the mic was piping), cancel the current pipe so
   * the readLoop's finally re-evaluates and switches over.
   */
  private evaluateAudioSource(): void {
    const best = this.bestAvailableAudio();
    if (!best) return;

    if (!this.isPiping) {
      this.pipeTrackToGemini(best.track, best.source);
      return;
    }

    // Already piping: switch only if a strictly higher-priority source exists.
    if (this.sourcePriority(best.source) > this.sourcePriority(this.activeSource)) {
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Switching audio source ${this.activeSource} → ${best.source}`
      );
      this.activeReader?.cancel().catch(() => {});
      // readLoop ends → finally clears state → re-evaluates and picks `best`.
    }
  }

  private pipeTrackToGemini(track: RemoteAudioTrack, source: number): void {
    if (this.isPiping) return; // already piping this speaker
    this.isPiping = true;
    this.activeSource = source;
    const label =
      source === TrackSource.SOURCE_SCREENSHARE_AUDIO ? "screen-share" : "mic";
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Piping ${this.speakerIdentity}'s ${label} audio to Gemini`
    );

    const audioStream = new AudioStream(track, {
      sampleRate: this.inputSampleRate,
      numChannels: this.channels,
      frameSizeMs: 100,
    });

    // Process frames as they arrive via ReadableStream reader
    const reader = audioStream.getReader();
    this.activeReader = reader;
    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.sendAudioToGemini(value);
      }
    };

    readLoop()
      .catch((err: Error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Audio stream error:`,
          err
        );
      })
      .finally(() => {
        // This source ended (track unpublished or we cancelled to switch).
        this.endSpeechIfActive();
        this.isPiping = false;
        this.activeSource = -1;
        this.activeReader = null;
        // Fall back to / switch to whatever audio is still available.
        if (this.status === "active") {
          this.evaluateAudioSource();
        }
      });
  }

  private sendAudioToGemini(frame: AudioFrame): void {
    if (
      !this.geminiWs ||
      this.geminiWs.readyState !== WebSocket.OPEN ||
      !this.geminiSetupComplete
    ) {
      return;
    }

    const action = this.speechVad.process(frame.data);

    switch (action.type) {
      case "drop":
        return;
      case "begin":
        this.sendGeminiActivity("start");
        for (const prelude of action.prelude) {
          this.sendRawAudioToGemini(prelude);
        }
        this.sendRawAudioToGemini(frame.data);
        return;
      case "relay":
        this.sendRawAudioToGemini(frame.data);
        return;
      case "finish":
        this.sendGeminiActivity("end");
        return;
    }
  }

  private sendGeminiActivity(phase: "start" | "end"): void {
    if (
      !this.geminiWs ||
      this.geminiWs.readyState !== WebSocket.OPEN ||
      !this.geminiSetupComplete
    ) {
      return;
    }

    const key = phase === "start" ? "activityStart" : "activityEnd";
    this.geminiWs.send(JSON.stringify({ realtimeInput: { [key]: {} } }));
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Gemini ${key}`
    );
  }

  private endSpeechIfActive(): void {
    if (!this.speechVad.isSpeaking()) {
      this.speechVad.reset();
      return;
    }
    this.sendGeminiActivity("end");
    this.speechVad.reset();
  }

  private sendRawAudioToGemini(samples: Int16Array): void {
    if (
      !this.geminiWs ||
      this.geminiWs.readyState !== WebSocket.OPEN ||
      !this.geminiSetupComplete
    ) {
      return;
    }

    try {
      const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
      const base64 = buffer.toString("base64");

      this.framesSentToGemini++;
      if (this.framesSentToGemini <= 3 || this.framesSentToGemini % 500 === 0) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Sent audio frame #${this.framesSentToGemini} to Gemini (${base64.length} bytes base64, ${samples.length} samples)`
        );
      }

      this.geminiWs.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: `audio/pcm;rate=${this.inputSampleRate}`,
              data: base64,
            },
          },
        })
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error sending audio to Gemini:`,
        error
      );
    }
  }

  private async publishTranscriptionText(
    text: string,
    interim: boolean,
    kind: "source" | "translation"
  ): Promise<void> {
    if (!this.room || !this.room.localParticipant) return;

    try {
      const payload = JSON.stringify({
        type: "transcription",
        kind,
        language: this.targetLanguage,
        voice: this.voice,
        speaker: this.speakerIdentity,
        segmentId: `${kind}-${this.targetLanguage}-${this.voice}-${this.speakerIdentity}-${this.transcriptionSegmentId}`,
        text,
        final: !interim,
        timestamp: Date.now(),
      });

      await this.room.localParticipant.publishData(
        new TextEncoder().encode(payload),
        { reliable: true, topic: "transcription" }
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error publishing transcription:`,
        error
      );
    }
  }
}
