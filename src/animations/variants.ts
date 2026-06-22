// Shared Framer Motion springs + variants — the motion vocabulary for the app.
import type { Variants, Transition } from "framer-motion";

export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };
export const springSnappy: Transition = { type: "spring", stiffness: 420, damping: 32 };
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Staggered container — children reveal in sequence. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

/** Item that fades + rises into place. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

/** Subtle scale-in for surfaces/panels. */
export const surfaceIn: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
};

/** Cross-fade between mutually exclusive states (use with AnimatePresence). */
export const stateSwap: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16 } },
};
