import { NextRequest, NextResponse } from "next/server";
import TranslationSessionManager from "@/lib/translation-session-manager";
import { DEFAULT_VOICE, isValidVoice } from "@/lib/voices";

// POST /api/translate — Request a translation stream for a (language, voice)
export async function POST(req: NextRequest) {
  try {
    const { sessionId, targetLanguage, voice, previousLanguage, previousVoice } =
      await req.json();

    if (!sessionId || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing sessionId or targetLanguage" },
        { status: 400 }
      );
    }

    // Pin to a known voice; ignore anything unexpected from the client.
    const safeVoice = isValidVoice(voice) ? voice : DEFAULT_VOICE;

    const manager = TranslationSessionManager.getInstance();
    const session = manager.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Unsubscribe from the previous (language, voice) if switching
    if (previousLanguage && previousLanguage !== "original") {
      const prevVoice = isValidVoice(previousVoice) ? previousVoice : DEFAULT_VOICE;
      await manager.unsubscribe(sessionId, previousLanguage, prevVoice);
    }

    // Skip translation for the original language (no bridge needed)
    if (targetLanguage === "original") {
      return NextResponse.json({
        translatorIdentity: null,
        status: "original",
        message: "Using original audio",
      });
    }

    // Ensure a bridge exists for every speaker in this (language, voice)
    const info = await manager.getOrCreate(sessionId, targetLanguage, safeVoice);

    return NextResponse.json({
      status: info.status,
      targetLanguage: info.language,
      voice: info.voice,
      speakerCount: info.speakerCount,
    });
  } catch (error) {
    console.error("Error requesting translation:", error);
    return NextResponse.json(
      { error: "Failed to start translation: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/translate — Unsubscribe from a translation (e.g. on disconnect)
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId, targetLanguage, voice } = await req.json();

    if (!sessionId || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing sessionId or targetLanguage" },
        { status: 400 }
      );
    }

    const safeVoice = isValidVoice(voice) ? voice : DEFAULT_VOICE;
    const manager = TranslationSessionManager.getInstance();
    await manager.unsubscribe(sessionId, targetLanguage, safeVoice);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
