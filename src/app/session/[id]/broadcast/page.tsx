"use client";

import { useEffect, useState, useCallback, use } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useRemoteParticipants,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import SessionQRCode from "@/components/SessionQRCode";
import LanguageSelector from "../watch/components/LanguageSelector";
import TranscriptView from "@/components/TranscriptView";
import VideoStage from "@/components/VideoStage";
import AudioGate from "@/components/AudioGate";

interface TranslationInfo {
  language: string;
  translatorIdentity: string;
  status: string;
  subscriberCount: number;
}

const FLAGS: Record<string, string> = {
  en: "🇺🇸", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹",
  pt: "🇧🇷", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ar: "🇸🇦",
  hi: "🇮🇳", ru: "🇷🇺", tr: "🇹🇷", nl: "🇳🇱", pl: "🇵🇱", sv: "🇸🇪",
};

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
  hi: "Hindi", ru: "Russian", tr: "Turkish", nl: "Dutch", pl: "Polish", sv: "Swedish",
};

interface FloorRequest {
  identity: string;
  name: string;
  requestedAt: number;
}

function FloorPanel({ sessionId }: { sessionId: string }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [requests, setRequests] = useState<FloorRequest[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const hostKey =
    typeof window !== "undefined"
      ? localStorage.getItem(`hostKey:${sessionId}`)
      : null;

  const fetchFloor = useCallback(async () => {
    if (!hostKey) return;
    try {
      const res = await fetch(
        `/api/floor?sessionId=${sessionId}&hostKey=${encodeURIComponent(hostKey)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests || []);
      // Hide the organizer from the speakers list
      setSpeakers((data.speakers || []).filter((s: string) => s !== "organizer-host"));
    } catch {
      // ignore transient polling errors
    }
  }, [sessionId, hostKey]);

  useEffect(() => {
    fetchFloor();
    const interval = setInterval(fetchFloor, 3000);
    return () => clearInterval(interval);
  }, [fetchFloor]);

  const act = useCallback(
    async (action: "grant" | "revoke", identity: string) => {
      setBusy(identity);
      try {
        await fetch("/api/floor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action, identity, hostKey }),
        });
        // Hand off the mic: muting self when granting, taking it back when revoking.
        try {
          if (action === "grant") {
            await localParticipant?.setMicrophoneEnabled(false);
          } else {
            await localParticipant?.setMicrophoneEnabled(true);
          }
        } catch {}
        await fetchFloor();
      } finally {
        setBusy(null);
      }
    },
    [sessionId, hostKey, fetchFloor, localParticipant]
  );

  // Everyone in the room who isn't a translator bot or the organizer
  const attendees = remoteParticipants.filter(
    (p) =>
      !p.identity.startsWith("translator-") &&
      !p.identity.startsWith("organizer-")
  );
  const requestedSet = new Set(requests.map((r) => r.identity));

  return (
    <div>
      <span className="label" style={{ marginBottom: 12, display: "block" }}>
        Katılımcılar · {attendees.length}
      </span>
      {attendees.length === 0 ? (
        <p className="body-sm italic">Henüz katılımcı yok</p>
      ) : (
        attendees.map((p) => {
          const id = p.identity;
          const isSpeaker = speakers.includes(id);
          const requested = requestedSet.has(id);
          return (
            <div key={id} className="lang-row">
              <div className="lang-row-left">
                <span className="lang-flag">
                  {isSpeaker ? "🎤" : requested ? "✋" : "👤"}
                </span>
                <span className="lang-name">
                  {p.name || id}
                  {requested && !isSpeaker && (
                    <span className="lang-meta" style={{ marginLeft: 8 }}>
                      söz istiyor
                    </span>
                  )}
                </span>
              </div>
              {isSpeaker ? (
                <button
                  className="btn-danger"
                  disabled={busy === id}
                  onClick={() => act("revoke", id)}
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  Sözü bitir
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={busy === id}
                  onClick={() => act("grant", id)}
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  Söz ver
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function BroadcastControls({ sessionId }: { sessionId: string }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [translations, setTranslations] = useState<TranslationInfo[]>([]);
  const [isMicOn, setIsMicOn] = useState(false);
  const audioTracks = useTracks([Track.Source.Microphone]);
  const remoteParticipants = useRemoteParticipants();

  // The organizer picks a language to hear other speakers translated (default
  // Turkish). It's always active and freely changeable; they never hear their
  // own voice translated.
  const [listenLanguage, setListenLanguage] = useState("tr");
  const ownTranslator = `translator-${listenLanguage}-organizer-host`;

  // Keep a bridge alive for the selected language; cleanup unsubscribes
  // (strict-mode safe: sub → unsub → sub nets one subscription).
  useEffect(() => {
    if (listenLanguage === "original") return;
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, targetLanguage: listenLanguage }),
    }).catch(() => {});
    return () => {
      fetch("/api/translate/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetLanguage: listenLanguage }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [listenLanguage, sessionId]);

  useEffect(() => {
    const onUnload = () => {
      if (listenLanguage !== "original") {
        navigator.sendBeacon?.(
          "/api/translate/unsubscribe",
          new Blob([JSON.stringify({ sessionId, targetLanguage: listenLanguage })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [listenLanguage, sessionId]);

  // Subscribe to the right tracks: "original" → other human speakers; a language
  // → that language's translator bots, excluding the organizer's own voice.
  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      const langPrefix = `translator-${listenLanguage}-`;

      for (const [, participant] of room.remoteParticipants) {
        const isTranslator = participant.identity.startsWith("translator-");
        const isOtherSpeakerTranslator =
          participant.identity.startsWith(langPrefix) &&
          participant.identity !== ownTranslator;

        for (const [, pub] of participant.trackPublications) {
          if (pub.kind === Track.Kind.Audio) {
            if (listenLanguage === "original") {
              // Other live human speakers (guests), never translator bots.
              pub.setSubscribed(!isTranslator);
            } else {
              pub.setSubscribed(isOtherSpeakerTranslator);
            }
          } else if (pub.kind === Track.Kind.Video) {
            // Show other speakers' screen share.
            pub.setSubscribed(!isTranslator);
          }
        }
      }
    };

    updateSubscriptions();
    const handleUpdate = () => updateSubscriptions();
    room.on(RoomEvent.TrackPublished, handleUpdate);
    room.on(RoomEvent.ParticipantConnected, handleUpdate);
    return () => {
      room.off(RoomEvent.TrackPublished, handleUpdate);
      room.off(RoomEvent.ParticipantConnected, handleUpdate);
    };
  }, [room, listenLanguage, ownTranslator, remoteParticipants]);

  // Count only real attendees, not translator bots
  const listenerCount = remoteParticipants.filter(
    (p) => !p.identity.startsWith("translator-")
  ).length;

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/session/${sessionId}/watch`
      : "";

  const fetchTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/status?sessionId=${sessionId}`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch (err) {
      console.error("Failed to fetch translations:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchTranslations();
    const interval = setInterval(fetchTranslations, 3000);
    return () => clearInterval(interval);
  }, [fetchTranslations]);

  useEffect(() => {
    const hasAudio = audioTracks.some(
      (t) => t.participant.identity === localParticipant.identity
    );
    setIsMicOn(hasAudio);
  }, [audioTracks, localParticipant.identity]);

  return (
    <div className="stage enter">
      {/* Header */}
      <div className="stage-header">
        <div>
          <h1 className="display display-md" style={{ marginBottom: 2 }}>
            Broadcasting
          </h1>
          <p className="mono">{sessionId}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span
            className="status"
            style={{ color: isMicOn ? "var(--success)" : "var(--fg-ghost)" }}
          >
            <span className={`status-dot ${isMicOn ? "pulse" : ""}`} />
            {isMicOn ? "Live" : "Muted"}
          </span>
          <span className="mono">
            {listenerCount} listener{listenerCount !== 1 ? "s" : ""}
          </span>
          <button
            className="btn-danger"
            onClick={() => {
              room.disconnect();
              window.location.href = "/";
            }}
            style={{ padding: "8px 18px", fontSize: 13 }}
          >
            Bitir
          </button>
        </div>
      </div>

      {/* Two-column dashboard — fits the viewport */}
      <div className="stage-body">
        {/* Left column: video + controls */}
        <div className="stage-col stage-col--scroll">
          <VideoStage />

          <div className="panel">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Mikrofon / Ekran paylaşımı
            </span>
            <TrackToggle
              source={Track.Source.Microphone}
              style={{
                width: "100%",
                padding: "12px 20px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 500,
                border: isMicOn ? "1px solid var(--error)" : "none",
                borderRadius: 0,
                background: isMicOn ? "transparent" : "var(--fg)",
                color: isMicOn ? "var(--error)" : "var(--bg)",
                cursor: "pointer",
              }}
            />
            <TrackToggle
              source={Track.Source.ScreenShare}
              captureOptions={{ audio: true }}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "12px 20px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--fg)",
                borderRadius: 0,
                background: "transparent",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            />
            <p className="body-sm italic" style={{ marginTop: 8 }}>
              YouTube/Zoom paylaşmak için <b>Chrome Sekmesi</b>’ni seçin ve
              açılan pencerede <b>“Sekme sesini de paylaş”</b> kutusunu
              işaretleyin. Sekme sesi otomatik olarak (mikrofonun yerine)
              çevrilir; ekranı kapatınca mikrofona geri dönülür. Tüm
              ekran/pencere paylaşımında tarayıcı sesi yakalayamaz.
            </p>
          </div>

          <div className="panel">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Dinleme dili
            </span>
            <LanguageSelector
              currentLanguage={listenLanguage}
              onLanguageChange={setListenLanguage}
            />
            <p className="body-sm italic" style={{ marginTop: 8 }}>
              Söz verdiğiniz kişiler konuştuğunda seçtiğiniz dilde duyarsınız.
            </p>
          </div>

          <div className="panel">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Davet — paylaş
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <SessionQRCode url={joinUrl} size={92} />
              <p className="mono" style={{ wordBreak: "break-all", flex: 1 }}>
                {joinUrl}
              </p>
            </div>
          </div>
        </div>

        {/* Right column: floor + translations + transcript (transcript scrolls) */}
        <div className="stage-col">
          <div className="panel">
            <FloorPanel sessionId={sessionId} />
          </div>

          {translations.length > 0 && (
            <div className="panel">
              <span className="label" style={{ marginBottom: 10, display: "block" }}>
                Çeviriler · {translations.length}
              </span>
              {translations.map((t) => (
                <div key={t.language} className="lang-row">
                  <div className="lang-row-left">
                    <span className="lang-flag">{FLAGS[t.language] || "🌐"}</span>
                    <span className="lang-name">
                      {LANG_NAMES[t.language] || t.language.toUpperCase()}
                    </span>
                  </div>
                  <span className="lang-meta">
                    {t.subscriberCount} listener{t.subscriberCount !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="panel panel--fill">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Metin (konuşulan + çeviri)
            </span>
            <TranscriptView language={listenLanguage} excludeSpeaker="organizer-host" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchToken() {
      try {
        const identity = `organizer-host`;
        const hostKey =
          typeof window !== "undefined"
            ? localStorage.getItem(`hostKey:${sessionId}`)
            : null;
        if (!hostKey) {
          throw new Error(
            "You are not the owner of this session (no host key on this device)."
          );
        }
        const res = await fetch(
          `/api/token?room=${sessionId}&identity=${identity}&role=organizer&hostKey=${encodeURIComponent(
            hostKey
          )}`
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setToken(data.token);
        setLivekitUrl(data.serverUrl);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    fetchToken();
  }, [sessionId]);

  if (error) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: "center" }}>
          <p className="display display-md" style={{ marginBottom: 16 }}>
            Something went wrong
          </p>
          <p className="body-sm" style={{ marginBottom: 32 }}>{error}</p>
          <button className="btn btn-outline" onClick={() => (window.location.href = "/")}>
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <div className="page">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={true}
      token={token}
      serverUrl={livekitUrl}
      connectOptions={{ autoSubscribe: false }}
      style={{ width: "100%", height: "100dvh" }}
      onDisconnected={() => {
        setError("Disconnected from LiveKit room. Please check your credentials or network connection.");
      }}
    >
      <RoomAudioRenderer />
      <AudioGate />
      <BroadcastControls sessionId={sessionId} />
    </LiveKitRoom>
  );
}
