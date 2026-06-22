"use client";

import { motion, useReducedMotion } from "framer-motion";

export type OrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "translating"
  | "speaking";

const TINT: Record<OrbState, { a: string; b: string; ring: string }> = {
  idle: { a: "#4F8DF7", b: "#8B5CF6", ring: "#4F8DF7" },
  connecting: { a: "#6B7588", b: "#4F8DF7", ring: "#6B7588" },
  listening: { a: "#22D3EE", b: "#4F8DF7", ring: "#22D3EE" },
  translating: { a: "#8B5CF6", b: "#4F8DF7", ring: "#8B5CF6" },
  speaking: { a: "#4F8DF7", b: "#22D3EE", ring: "#4F8DF7" },
};

/**
 * Living AI presence orb. Layered: glow halo · rotating conic ring · glass core
 * · specular highlight. Breathes continuously; tints + energizes per state and
 * (optionally) reacts to an audio `level` (0..1). Decorative — aria-hidden.
 */
export default function AIOrb({
  size = 180,
  state = "idle",
  level = 0,
  className,
}: {
  size?: number;
  state?: OrbState;
  level?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const t = TINT[state];
  const active = state === "listening" || state === "speaking";
  const energy = Math.min(1, Math.max(0, level));

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        isolation: "isolate",
      }}
    >
      {/* Glow halo */}
      <motion.div
        style={{
          position: "absolute",
          width: size * 1.7,
          height: size * 1.7,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${t.a}55, transparent 62%)`,
          filter: "blur(28px)",
          zIndex: 0,
        }}
        animate={
          reduce
            ? undefined
            : { opacity: [0.5, 0.85, 0.5], scale: [1, 1.06 + energy * 0.12, 1] }
        }
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Rotating conic ring */}
      <motion.div
        style={{
          position: "absolute",
          width: size * 1.12,
          height: size * 1.12,
          borderRadius: "50%",
          background: `conic-gradient(from 0deg, ${t.ring}, ${t.b}, #22D3EE, ${t.ring})`,
          WebkitMaskImage:
            "radial-gradient(closest-side, transparent 66%, #000 69%, #000 100%)",
          maskImage:
            "radial-gradient(closest-side, transparent 66%, #000 69%, #000 100%)",
          opacity: 0.9,
          zIndex: 1,
        }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: active ? 7 : 16, repeat: Infinity, ease: "linear" }}
      />

      {/* Expanding pulse when active */}
      {active && !reduce && (
        <motion.div
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: "50%",
            border: `1px solid ${t.a}`,
            zIndex: 1,
          }}
          animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      {/* Glass core */}
      <motion.div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(120% 120% at 32% 26%, ${t.a}, ${t.b} 52%, #0A0F1C 100%)`,
          boxShadow: `inset 0 2px 18px rgba(255,255,255,0.28), inset 0 -22px 44px rgba(0,0,0,0.55), 0 24px 60px -18px ${t.a}88`,
          border: "1px solid rgba(255,255,255,0.14)",
          zIndex: 2,
          overflow: "hidden",
        }}
        animate={
          reduce
            ? undefined
            : { scale: [0.97, 1.03 + energy * 0.05, 0.97] }
        }
        transition={{ duration: active ? 2.4 : 5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Specular highlight */}
        <div
          style={{
            position: "absolute",
            top: "14%",
            left: "16%",
            width: "44%",
            height: "34%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.85), transparent 70%)",
            filter: "blur(6px)",
          }}
        />
        {/* Soft inner drift */}
        <motion.div
          style={{
            position: "absolute",
            inset: "-20%",
            background: `radial-gradient(circle at 70% 75%, ${t.b}66, transparent 55%)`,
          }}
          animate={reduce ? undefined : { rotate: [0, 360] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>
    </div>
  );
}
