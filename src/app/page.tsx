"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Globe, Zap, AudioLines, ArrowRight, Loader2 } from "lucide-react";
import LiveTranslateDemo from "@/design-system/LiveTranslateDemo";
import { staggerContainer, fadeUp, surfaceIn } from "@/animations/variants";

const STATS = [
  { icon: Globe, label: "70+ dil" },
  { icon: Zap, label: "Gerçek zamanlı" },
  { icon: AudioLines, label: "Ses + altyazı" },
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const reduce = useReducedMotion();

  async function createSession() {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizerName: "host" }),
      });
      const data = await res.json();
      if (data.hostKey) {
        localStorage.setItem(`hostKey:${data.sessionId}`, data.hostKey);
      }
      router.push(`/session/${data.sessionId}/broadcast`);
    } catch (err) {
      console.error("Failed to create session:", err);
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ position: "relative", overflow: "hidden" }}>
      {/* Cinematic backdrop: dimmed imagery + layered moving gradients */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage:
            "linear-gradient(115deg, rgba(5,7,13,0.93) 30%, rgba(5,7,13,0.72) 100%), url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2200&auto=format&fit=crop')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {!reduce && (
        <>
          <motion.div
            aria-hidden
            style={blob("var(--accent)", 560, { top: "-12%", left: "-8%" })}
            animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            style={blob("var(--accent-2)", 520, { bottom: "-14%", right: "-6%" })}
            animate={{ x: [0, -34, 0], y: [0, -26, 0] }}
            transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            style={blob("#22D3EE", 360, { top: "30%", right: "26%" })}
            animate={{ opacity: [0.06, 0.14, 0.06] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="hero">
        <div className="hero-grid">
          {/* Left — copy */}
          <div className="hero-copy">
            <motion.div variants={fadeUp} style={{ marginBottom: 22 }}>
              <span
                className="status"
                style={{ background: "var(--accent-soft)", borderColor: "rgba(79,141,247,0.25)", color: "var(--accent-hover)", padding: "7px 14px" }}
              >
                <Sparkles size={14} />
                <span style={{ letterSpacing: "0.12em", fontSize: 11 }}>CANLI ÇEVİRİ PLATFORMU</span>
              </span>
            </motion.div>

            <motion.h1 variants={fadeUp} className="display display-xl" style={{ marginBottom: 20 }}>
              Herkes kendi <br />dilinde <span className="text-accent">dinler.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="body" style={{ maxWidth: 460, marginBottom: 30 }}>
              Siz konuşun; dinleyiciler kendi dilini ve sesini seçsin. Çeviri
              gerçek zamanlı, sesli ve altyazılı olarak herkese ulaşsın.
            </motion.p>

            <motion.div variants={fadeUp} className="cta-row" style={{ marginBottom: 26 }}>
              <motion.button
                className="btn btn-primary"
                onClick={createSession}
                disabled={loading}
                id="create-session-btn"
                whileHover={reduce ? undefined : { scale: 1.04, y: -1 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                style={{ fontSize: 15, padding: "16px 30px" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="spin-ico" /> Oluşturuluyor…
                  </>
                ) : (
                  <>
                    Yayın başlat <ArrowRight size={17} />
                  </>
                )}
              </motion.button>
              <span className="mono" style={{ fontSize: 12 }}>Kurulum yok · saniyede başla</span>
            </motion.div>

            <motion.div variants={fadeUp} className="stat-row">
              {STATS.map((s) => {
                const Icon = s.icon;
                return (
                  <span key={s.label} className="status" style={{ padding: "7px 13px" }}>
                    <Icon size={13} style={{ color: "var(--accent-hover)" }} />
                    {s.label}
                  </span>
                );
              })}
            </motion.div>
          </div>

          {/* Right — living translation card */}
          <motion.div variants={surfaceIn}>
            <LiveTranslateDemo />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function blob(
  color: string,
  size: number,
  pos: React.CSSProperties
): React.CSSProperties {
  return {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    opacity: 0.12,
    filter: "blur(110px)",
    pointerEvents: "none",
    zIndex: 0,
    ...pos,
  };
}
