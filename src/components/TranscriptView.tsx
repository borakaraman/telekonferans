"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { motion } from "framer-motion";
import { Mic, Languages } from "lucide-react";

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
  voice,
  excludeSpeaker,
}: {
  language: string;
  /** Only show transcripts from this voice's bridges (matches the heard audio). */
  voice?: string;
  /** Don't show this speaker's lines (e.g. the local user's own speech). */
  excludeSpeaker?: string;
}) {
  const room = useRoomContext();
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const langRef = useRef(language);
  const voiceRef = useRef(voice);
  const excludeRef = useRef(excludeSpeaker);

  // Track the selected language; clear transcripts when it changes.
  useEffect(() => {
    langRef.current = language;
    setTranscripts([]);
  }, [language]);

  // Voice change → different bridges/segment ids, so clear and re-filter.
  useEffect(() => {
    voiceRef.current = voice;
    setTranscripts([]);
  }, [voice]);

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
        // Only the chosen voice's bridges (avoids duplicate text when other
        // listeners picked a different voice for the same language).
        if (voiceRef.current && data.voice && data.voice !== voiceRef.current) return;
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
      <div className="panel-scroll" style={{ display: "grid", placeItems: "center" }}>
        <p className="body-sm italic">Metin için bir çeviri dili seçin.</p>
      </div>
    );
  }

  if (transcripts.length === 0) {
    return (
      <div className="panel-scroll" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span className="status status--waiting" style={{ padding: "8px 14px" }}>
            <span className="status-dot pulse" />
            Konuşma bekleniyor
          </span>
          <p className="body-sm" style={{ maxWidth: 240 }}>
            Konuşmacı konuştuğunda çeviri burada canlı olarak akacak.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel-scroll"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      style={{
        paddingRight: 8,
        // depth: older lines fade out at the top edge
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 26px)",
        maskImage: "linear-gradient(to bottom, transparent 0, #000 26px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
        {transcripts.map((t, i) => {
          const isSource = t.kind === "source";
          const who = speakerLabel(t.speaker);

          if (isSource) {
            return (
              <motion.p
                key={`${t.id}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontStyle: "italic",
                  color: "var(--fg-tertiary)",
                }}
              >
                <Mic size={12} style={{ flexShrink: 0, transform: "translateY(2px)" }} />
                {t.text}
              </motion.p>
            );
          }

          return (
            <motion.div
              key={`${t.id}-${i}`}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 10, fontWeight: 700 }}>
                  {initials(who)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{who}</span>
                <span className="label" style={{ color: "var(--success)", letterSpacing: "0.1em" }}>
                  <Languages size={11} /> Çeviri
                </span>
              </div>
              <div
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "4px 16px 16px 16px",
                  padding: "12px 15px",
                  boxShadow: "var(--e2, 0 6px 16px -6px rgba(0,0,0,0.55))",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 17,
                    lineHeight: 1.5,
                    letterSpacing: "-0.01em",
                    color: t.final ? "var(--fg)" : "var(--fg-2, var(--fg-secondary))",
                    transition: "color 0.3s ease",
                  }}
                >
                  {t.text}
                  {!t.final && (
                    <motion.span
                      aria-hidden
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{ display: "inline-block", width: 2, height: 16, background: "var(--accent)", marginLeft: 3, verticalAlign: "middle", borderRadius: 2 }}
                    />
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** Friendly speaker name from a LiveKit identity. */
function speakerLabel(s: string): string {
  if (!s) return "Konuşmacı";
  if (s.startsWith("organizer")) return "Sunucu";
  if (s.startsWith("attendee")) return "Konuk";
  return s;
}

function initials(label: string): string {
  return label.slice(0, 2).toUpperCase();
}
