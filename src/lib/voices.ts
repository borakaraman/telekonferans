export interface Voice {
  /** Gemini prebuilt voice name (sent as voiceName). */
  id: string;
  /** Friendly label shown in the UI. */
  label: string;
  gender: "female" | "male";
}

// Gemini Live prebuilt voices. IDs must contain no dashes — they're embedded in
// the translator bot identity `translator-{lang}-{voice}-{speaker}`.
export const SUPPORTED_VOICES: Voice[] = [
  { id: "Kore", label: "Kore", gender: "female" },
  { id: "Aoede", label: "Aoede", gender: "female" },
  { id: "Leda", label: "Leda", gender: "female" },
  { id: "Zephyr", label: "Zephyr", gender: "female" },
  { id: "Puck", label: "Puck", gender: "male" },
  { id: "Charon", label: "Charon", gender: "male" },
  { id: "Fenrir", label: "Fenrir", gender: "male" },
  { id: "Orus", label: "Orus", gender: "male" },
];

export const DEFAULT_VOICE =
  process.env.GEMINI_VOICE && isValidVoice(process.env.GEMINI_VOICE)
    ? process.env.GEMINI_VOICE
    : "Kore";

export function isValidVoice(voice: string | null | undefined): boolean {
  return !!voice && SUPPORTED_VOICES.some((v) => v.id === voice);
}
