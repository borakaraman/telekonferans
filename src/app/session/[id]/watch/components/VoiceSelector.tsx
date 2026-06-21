"use client";

import { SUPPORTED_VOICES } from "@/lib/voices";

interface VoiceSelectorProps {
  currentVoice: string;
  onVoiceChange: (voice: string) => void;
  disabled?: boolean;
}

/**
 * Presentation-only voice dropdown. Each listener picks the voice they hear the
 * translation in; the subscribe/unsubscribe lifecycle is handled by the parent
 * page (keyed on language + voice).
 */
export default function VoiceSelector({
  currentVoice,
  onVoiceChange,
  disabled,
}: VoiceSelectorProps) {
  const female = SUPPORTED_VOICES.filter((v) => v.gender === "female");
  const male = SUPPORTED_VOICES.filter((v) => v.gender === "male");

  return (
    <div style={{ width: "100%" }}>
      <select
        id="voice-select"
        className="select-field"
        value={currentVoice}
        onChange={(e) => onVoiceChange(e.target.value)}
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <optgroup label="Kadın sesi">
          {female.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Erkek sesi">
          {male.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
