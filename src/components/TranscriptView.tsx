"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

interface TranscriptEntry {
  id: string;
  text: string;
  kind: "source" | "translation";
  speaker: string;
  final: boolean;
  timestamp: number;
}

/**
 * Renders the live transcript for a chosen language: both the spoken (source)
 * text and the translated text. Listens to the "transcription" data channel
 * published by the translator bots. Shared by the attendee and organizer views.
 */
export default function TranscriptView({
  language,
  excludeSpeaker,
}: {
  language: string;
  /** Don't show this speaker's lines (e.g. the local user's own speech). */
  excludeSpeaker?: string;
}) {
  const room = useRoomContext();
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const langRef = useRef(language);
  const excludeRef = useRef(excludeSpeaker);

  // Track the selected language; clear transcripts when it changes.
  useEffect(() => {
    langRef.current = language;
    setTranscripts([]);
  }, [language]);

  useEffect(() => {
    excludeRef.current = excludeSpeaker;
  }, [excludeSpeaker]);

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic: string | undefined
    ) => {
      if (topic !== "transcription") return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type !== "transcription") return;
        // Only show transcripts for the currently selected language
        if (data.language !== langRef.current) return;
        // Optionally hide our own speech (we don't translate ourselves)
        if (excludeRef.current && data.speaker === excludeRef.current) return;

        const entryKind: "source" | "translation" =
          data.kind === "source" ? "source" : "translation";

        setTranscripts((prev) => {
          const existing = prev.findIndex((t) => t.id === data.segmentId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              ...updated[existing],
              text: updated[existing].text + data.text,
              final: data.final,
            };
            return updated;
          }
          const entry: TranscriptEntry = {
            id: data.segmentId,
            text: data.text,
            kind: entryKind,
            speaker: data.speaker || "",
            final: data.final,
            timestamp: data.timestamp,
          };
          return [...prev, entry].slice(-60);
        });
      } catch {
        // Not a JSON transcription message
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  useEffect(() => {
    // Scroll only within the transcript box, never the whole page
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcripts]);

  if (language === "original") {
    return (
      <div className="panel-scroll">
        <p className="body-sm italic">Metin için bir çeviri dili seçin.</p>
      </div>
    );
  }

  if (transcripts.length === 0) {
    return (
      <div className="panel-scroll">
        <p className="body-sm italic">Konuşma bekleniyor…</p>
      </div>
    );
  }

  return (
    <div className="panel-scroll" style={{ paddingRight: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {transcripts.map((t, i) => {
          const isSource = t.kind === "source";
          return (
            <div key={`${t.id}-${i}`}>
              <span
                className="label"
                style={{
                  display: "block",
                  marginBottom: 2,
                  color: isSource ? "var(--fg-ghost)" : "var(--success)",
                }}
              >
                {isSource ? "🗣 Konuşulan" : "🌐 Çeviri"}
              </span>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  lineHeight: 1.6,
                  fontStyle: isSource ? "italic" : "normal",
                  color: isSource
                    ? "var(--fg-tertiary)"
                    : t.final
                    ? "var(--fg)"
                    : "var(--fg-tertiary)",
                  transition: "color 0.3s ease",
                }}
              >
                {t.text}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
