"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Shared ambient backdrop — the same drifting light blobs used on the landing,
 * so every screen shares one cohesive atmosphere. Fixed behind all content.
 */
export default function AmbientBlobs() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <motion.div
        style={blob("var(--accent)", 560, { top: "-14%", left: "-8%" })}
        animate={{ x: [0, 40, 0], y: [0, 28, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={blob("var(--accent-2)", 520, { bottom: "-16%", right: "-8%" })}
        animate={{ x: [0, -34, 0], y: [0, -24, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={blob("#22D3EE", 340, { top: "34%", right: "30%" })}
        animate={{ opacity: [0.05, 0.12, 0.05] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function blob(color: string, size: number, pos: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    opacity: 0.1,
    filter: "blur(120px)",
    ...pos,
  };
}
