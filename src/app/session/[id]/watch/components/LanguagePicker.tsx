"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Check, ChevronsUpDown, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, getLanguageByCode } from "@/lib/languages";

interface Item {
  code: string;
  name: string;
  flag: string;
}

const ORIGINAL: Item = { code: "original", name: "Orijinal ses", flag: "🔊" };

/**
 * ⌘K-style command palette for picking a translation language. A glass trigger
 * shows the current choice; the palette searches 70+ languages with full
 * keyboard navigation (type to filter, ↑/↓ to move, Enter to pick, Esc to close).
 */
export default function LanguagePicker({
  currentLanguage,
  onLanguageChange,
  includeOriginal = true,
}: {
  currentLanguage: string;
  onLanguageChange: (code: string) => void;
  includeOriginal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const all: Item[] = useMemo(
    () => (includeOriginal ? [ORIGINAL, ...SUPPORTED_LANGUAGES] : SUPPORTED_LANGUAGES),
    [includeOriginal]
  );

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return all;
    return all.filter(
      (l) =>
        l.name.toLocaleLowerCase("tr").includes(q) ||
        l.code.toLocaleLowerCase("tr").includes(q)
    );
  }, [query, all]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const pick = useCallback(
    (code: string) => {
      onLanguageChange(code);
      close();
    },
    [onLanguageChange, close]
  );

  // ⌘K / Ctrl+K toggles the palette globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  // Keep active index in range; scroll the highlighted row into view.
  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) pick(results[active].code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const current =
    currentLanguage === "original" ? ORIGINAL : getLanguageByCode(currentLanguage);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        className="select-field"
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "left",
          backgroundImage: "none",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 17 }}>{current?.flag ?? "🌐"}</span>
        <span style={{ flex: 1, fontWeight: 500 }}>{current?.name ?? "Dil seç"}</span>
        <kbd
          className="mono"
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            color: "var(--fg-tertiary)",
          }}
        >
          ⌘K
        </kbd>
        <ChevronsUpDown size={14} style={{ color: "var(--fg-tertiary)" }} />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={close}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 2000,
                  background: "rgba(3,5,10,0.6)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  padding: "12vh 20px 20px",
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    maxWidth: 480,
                    maxHeight: "62vh",
                    display: "flex",
                    flexDirection: "column",
                    background: "rgba(15,20,32,0.92)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: 18,
                    boxShadow: "0 40px 90px -30px rgba(0,0,0,0.85)",
                    overflow: "hidden",
                  }}
                >
                  {/* Search */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-light)" }}>
                    <Search size={16} style={{ color: "var(--fg-tertiary)", flexShrink: 0 }} />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                      }}
                      onKeyDown={onInputKey}
                      placeholder="Dil ara… (örn. İngilizce, Almanca, ja)"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--fg)",
                        fontFamily: "var(--font-body)",
                        fontSize: 15,
                      }}
                    />
                  </div>

                  {/* Results */}
                  <div ref={listRef} style={{ overflowY: "auto", padding: 8 }}>
                    {results.length === 0 ? (
                      <p className="body-sm" style={{ padding: "18px 12px", textAlign: "center" }}>
                        Sonuç yok
                      </p>
                    ) : (
                      results.map((l, idx) => {
                        const selected = l.code === currentLanguage;
                        const isActive = idx === active;
                        return (
                          <button
                            key={l.code}
                            type="button"
                            data-idx={idx}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => pick(l.code)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 11,
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              background: isActive ? "var(--accent-soft)" : "transparent",
                              color: "var(--fg)",
                              transition: "background 0.12s ease",
                            }}
                          >
                            <span style={{ fontSize: 18, width: 22 }}>{l.flag}</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{l.name}</span>
                            <span className="mono" style={{ fontSize: 11, color: "var(--fg-ghost)" }}>{l.code}</span>
                            {selected && <Check size={15} style={{ color: "var(--accent)" }} />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer hint */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderTop: "1px solid var(--border-light)", color: "var(--fg-tertiary)" }}>
                    <Globe size={12} />
                    <span className="mono" style={{ fontSize: 11 }}>↑↓ gez · ↵ seç · esc kapat</span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
