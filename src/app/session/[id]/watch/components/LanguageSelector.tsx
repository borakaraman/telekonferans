"use client";

import { SUPPORTED_LANGUAGES, getLanguageByCode } from "@/lib/languages";

interface LanguageSelectorProps {
  currentLanguage: string;
  onLanguageChange: (languageCode: string) => void;
  disabled?: boolean;
  /** Reason shown when disabled (e.g. while the user is the active speaker). */
  disabledNote?: string;
}

/**
 * Presentation-only language dropdown. The subscribe/unsubscribe lifecycle for
 * the translation bridge is handled by the parent page (keyed on the effective
 * language), so this component is a pure controlled <select>.
 */
export default function LanguageSelector({
  currentLanguage,
  onLanguageChange,
  disabled,
  disabledNote,
}: LanguageSelectorProps) {
  const currentLang = getLanguageByCode(currentLanguage);

  return (
    <div style={{ width: "100%" }}>
      <select
        id="language-select"
        className="select-field"
        value={currentLanguage}
        onChange={(e) => onLanguageChange(e.target.value)}
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <option value="original">Orijinal ses</option>
        <optgroup label="Çeviriler">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name} {lang.flag}
            </option>
          ))}
        </optgroup>
      </select>

      <div style={{ marginTop: 10, minHeight: 20 }}>
        {disabled ? (
          <span className="body-sm italic">
            {disabledNote || "Konuşurken çeviri pasif."}
          </span>
        ) : (
          currentLanguage !== "original" &&
          currentLang && (
            <span className="status status--active">
              <span className="status-dot pulse" />
              {currentLang.name} dilinde
            </span>
          )
        )}
      </div>
    </div>
  );
}
