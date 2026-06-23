"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const SOURCE = "Bugün hepinize çok önemli bir haberim var.";

const TARGETS = [
  { flag: "🇬🇧", name: "English", text: "I have very important news for all of you today." },
  { flag: "🇪🇸", name: "Español", text: "Hoy tengo una noticia muy importante para todos." },
  { flag: "🇩🇪", name: "Deutsch", text: "Ich habe heute eine sehr wichtige Nachricht für euch." },
  { flag: "🇫🇷", name: "Français", text: "J'ai une nouvelle très importante pour vous tous." },
  { flag: "🇯🇵", name: "日本語", text: "今日は皆さんにとても大切なお知らせがあります。" },
  { flag: "🇸🇦", name: "العربية", text: "لدي خبر مهم جدًا لكم جميعًا اليوم." },
];

/**
 * Landing centerpiece — a living card that shows one spoken line being
 * translated into language after language in real time. Communicates the whole
 * product in a glance and keeps the hero alive.
 */
export default function LiveTranslateDemo() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((p) => (p + 1) % TARGETS.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const t = TARGETS[i];

  return (
    <div
      className="panel"
      style={{
        padding: 22,
        boxShadow: "var(--shadow-float, 0 40px 80px -28px rgba(0,0,0,0.75))",
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
      }}
    >
      {/* Live header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span className="status status--error" style={{ color: "#F87171" }}>
          <span className="status-dot pulse" /> CANLI
        </span>
        <div className="waveform active" style={{ height: 22 }}>
          {Array.from({ length: 5 }).map((_, k) => (
            <div key={k} className="waveform-bar" />
          ))}
        </div>
      </div>

      {/* Source (spoken) */}
      <span className="label" style={{ marginBottom: 6 }}>🗣 Konuşulan · Türkçe</span>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.5, color: "var(--fg-secondary)", fontStyle: "italic", marginBottom: 18 }}>
        {SOURCE}
      </p>

      <div className="rule" style={{ marginBottom: 16 }} />

      {/* Translation (cycles) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, minHeight: 22 }}>
        <span className="label" style={{ color: "var(--success)" }}>🌐 Çeviri</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={t.name}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg)", fontWeight: 600 }}
          >
            <span style={{ fontSize: 16 }}>{t.flag}</span> {t.name}
          </motion.span>
        </AnimatePresence>
      </div>

      <div style={{ minHeight: 80 }}>
        <AnimatePresence mode="wait">
          <motion.p
            key={t.text}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            style={{ fontFamily: "var(--font-body)", fontSize: 19, lineHeight: 1.45, color: "var(--fg)", letterSpacing: "-0.01em" }}
            dir={t.name === "العربية" ? "rtl" : "ltr"}
          >
            {t.text}
            <motion.span
              aria-hidden
              animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{ display: "inline-block", width: 2, height: 18, background: "var(--accent)", marginLeft: 3, verticalAlign: "middle", borderRadius: 2 }}
            />
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Language strip */}
      <div style={{ display: "flex", gap: 7, marginTop: 18, flexWrap: "wrap" }}>
        {TARGETS.map((x, k) => (
          <span
            key={x.name}
            style={{
              fontSize: 16,
              lineHeight: 1,
              padding: "5px 7px",
              borderRadius: 8,
              transition: "all 0.3s ease",
              background: k === i ? "var(--accent-soft)" : "transparent",
              opacity: k === i ? 1 : 0.4,
              transform: k === i ? "scale(1.12)" : "scale(1)",
            }}
          >
            {x.flag}
          </span>
        ))}
      </div>
    </div>
  );
}
