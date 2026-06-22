"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Copy, Check, X, QrCode } from "lucide-react";
import SessionQRCode from "@/components/SessionQRCode";

/**
 * Professional invite flow — a compact trigger that opens a glass dialog with a
 * large QR, the join link, copy + native-share actions. Keeps the dashboard
 * uncluttered (no always-on QR panel).
 */
export default function InviteDialog({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Telekonferans", text: "Yayına katıl", url });
      } catch {
        /* dismissed */
      }
    } else {
      copy();
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        style={{ width: "100%" }}
      >
        <Share2 size={16} /> Davet et
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
                onClick={() => setOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 2000,
                  background: "rgba(3,5,10,0.62)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    maxWidth: 380,
                    background: "rgba(15,20,32,0.94)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: 22,
                    boxShadow: "0 40px 90px -30px rgba(0,0,0,0.85)",
                    padding: 26,
                    textAlign: "center",
                    position: "relative",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Kapat"
                    onClick={() => setOpen(false)}
                    className="btn-ghost"
                    style={{ position: "absolute", top: 12, right: 12, padding: 8 }}
                  >
                    <X size={18} />
                  </button>

                  <span className="label" style={{ justifyContent: "center", marginBottom: 16 }}>
                    <QrCode size={13} /> Yayına davet
                  </span>

                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                    <SessionQRCode url={url} size={188} />
                  </div>

                  <p className="body-sm" style={{ marginBottom: 16 }}>
                    Telefonla QR’ı okutun ya da bağlantıyı paylaşın.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: 11,
                      padding: "8px 8px 8px 14px",
                      marginBottom: 12,
                    }}
                  >
                    <span className="mono" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", color: "var(--fg-secondary)" }}>
                      {url}
                    </span>
                    <button type="button" className="btn-pill btn-pill-accent" onClick={copy} style={{ flexShrink: 0 }}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Kopyalandı" : "Kopyala"}
                    </button>
                  </div>

                  <button type="button" className="btn btn-outline" onClick={share} style={{ width: "100%" }}>
                    <Share2 size={15} /> Bağlantıyı paylaş
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
