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
import { motion, AnimatePresence } from "framer-motion";
import InviteDialog from "@/components/InviteDialog";
import LanguagePicker from "../watch/components/LanguagePicker";
import VoiceSelector from "../watch/components/VoiceSelector";
import TranscriptView from "@/components/TranscriptView";
import VideoStage from "@/components/VideoStage";
import AudioGate from "@/components/AudioGate";
import { DEFAULT_VOICE } from "@/lib/voices";
import AIOrb, { type OrbState } from "@/design-system/AIOrb";
import AmbientBlobs from "@/design-system/AmbientBlobs";
import {
  Radio,
  Mic,
  Users,
  Hand,
  Globe,
  Languages,
  AudioLines,
  UserPlus,
  UserMinus,
  PhoneOff,
} from "lucide-react";

interface TranslationInfo {
  language: string;
  voice: string;
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
      <span className="label" style={{ marginBottom: 12 }}>
        <Users size={13} /> Katılımcılar · {attendees.length}
      </span>
      {attendees.length === 0 ? (
        <p className="body-sm italic">Henüz katılımcı yok</p>
      ) : (
        <AnimatePresence initial={false}>
        {attendees.map((p) => {
          const id = p.identity;
          const isSpeaker = speakers.includes(id);
          const requested = requestedSet.has(id);
          const isBusy = busy === id;
          return (
            <motion.div
              key={id}
              className="lang-row"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
            >
              <div className="lang-row-left">
                <span
                  className="avatar"
                  style={
                    isSpeaker
                      ? { color: "var(--success)", background: "var(--success-soft)" }
                      : requested
                      ? { color: "var(--warning)", background: "var(--warning-soft)" }
                      : undefined
                  }
                >
                  {isSpeaker ? <Mic size={16} /> : requested ? <Hand size={16} /> : <Users size={16} />}
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
                  className="btn-pill btn-pill-danger"
                  disabled={isBusy}
                  onClick={() => act("revoke", id)}
                >
                  {isBusy ? <span className="spinner spinner-sm" /> : <UserMinus size={14} />}
                  {isBusy ? "Kapatılıyor" : "Sözü bitir"}
                </button>
              ) : (
                <button
                  className="btn-pill btn-pill-accent"
                  disabled={isBusy}
                  onClick={() => act("grant", id)}
                >
                  {isBusy ? <span className="spinner spinner-sm" /> : <UserPlus size={14} />}
                  {isBusy ? "Açılıyor" : "Söz ver"}
                </button>
              )}
            </motion.div>
          );
        })}
        </AnimatePresence>
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
  const [listenVoice, setListenVoice] = useState(DEFAULT_VOICE);
  const [preparing, setPreparing] = useState(false);
  const ownTranslator = `translator-${listenLanguage}-${listenVoice}-organizer-host`;

  // Keep a bridge alive for the selected (language, voice); cleanup unsubscribes
  // (strict-mode safe: sub → unsub → sub nets one subscription).
  useEffect(() => {
    if (listenLanguage === "original") {
      setPreparing(false);
      return;
    }
    setPreparing(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, targetLanguage: listenLanguage, voice: listenVoice }),
    })
      .catch(() => {})
      .finally(() => setPreparing(false));
    return () => {
      fetch("/api/translate/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetLanguage: listenLanguage, voice: listenVoice }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [listenLanguage, listenVoice, sessionId]);

  useEffect(() => {
    const onUnload = () => {
      if (listenLanguage !== "original") {
        navigator.sendBeacon?.(
          "/api/translate/unsubscribe",
          new Blob([JSON.stringify({ sessionId, targetLanguage: listenLanguage, voice: listenVoice })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [listenLanguage, listenVoice, sessionId]);

  // Subscribe to the right tracks: "original" → other human speakers; a language
  // → that language's translator bots, excluding the organizer's own voice.
  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      const langPrefix = `translator-${listenLanguage}-${listenVoice}-`;

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
  }, [room, listenLanguage, listenVoice, ownTranslator, remoteParticipants]);

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

  const orbState: OrbState = preparing
    ? "translating"
    : isMicOn
    ? "listening"
    : "idle";

  return (
    <div className="stage enter">
      <AmbientBlobs />
      {/* Header */}
      <div className="stage-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <AIOrb size={46} state={orbState} />
          <div style={{ minWidth: 0 }}>
            <h1 className="display display-md" style={{ marginBottom: 1 }}>
              Yayın
            </h1>
            <p className="mono">{sessionId}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <AnimatePresence>
            {preparing && (
              <motion.span
                className="loading-pill"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <span className="spinner spinner-sm" />
                Hazırlanıyor<span className="dots" />
              </motion.span>
            )}
          </AnimatePresence>
          <span
            className="status"
            style={{ color: isMicOn ? "var(--success)" : "var(--fg-ghost)" }}
          >
            <span className={`status-dot ${isMicOn ? "pulse" : ""}`} />
            {isMicOn ? "Canlı" : "Sessiz"}
          </span>
          <span className="status">
            <Users size={13} /> {listenerCount}
          </span>
          <button
            className="btn-danger"
            onClick={() => {
              room.disconnect();
              window.location.href = "/";
            }}
          >
            <PhoneOff size={15} /> Bitir
          </button>
        </div>
      </div>

      {/* Host console — narrow control rail + dominant conversation */}
      <div className="stage-body stage-body--console">
        {/* Left rail — compact controls, participants, translations, invite */}
        <div className="stage-col stage-col--scroll">
          {/* Compact control card */}
          <div className="panel">
            <span className="label" style={{ marginBottom: 10 }}>
              <Mic size={13} /> Mikrofon / Ekran
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <TrackToggle
                source={Track.Source.Microphone}
                style={{
                  padding: "11px 12px",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  border: isMicOn ? "1px solid var(--error)" : "none",
                  borderRadius: 10,
                  background: isMicOn ? "transparent" : "var(--fg)",
                  color: isMicOn ? "var(--error)" : "#0A0D14",
                  cursor: "pointer",
                }}
              />
              <TrackToggle
                source={Track.Source.ScreenShare}
                captureOptions={{ audio: true }}
                style={{
                  padding: "11px 12px",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                  color: "var(--fg)",
                  cursor: "pointer",
                }}
              />
            </div>
            <p className="body-sm" style={{ marginTop: 8, fontSize: 11.5 }}>
              Sekme sesi için: <b>Chrome Sekmesi</b> + <b>“Sekme sesini paylaş”</b>.
            </p>

            <div className="rule" style={{ margin: "15px 0" }} />

            <span className="label" style={{ marginBottom: 9 }}>
              <Languages size={13} /> Dinleme dili
            </span>
            <LanguagePicker
              currentLanguage={listenLanguage}
              onLanguageChange={setListenLanguage}
            />
            <div style={{ marginTop: 9 }}>
              <span className="label" style={{ marginBottom: 9 }}>
                <AudioLines size={13} /> Çeviri sesi
              </span>
              <VoiceSelector
                currentVoice={listenVoice}
                onVoiceChange={setListenVoice}
                disabled={listenLanguage === "original"}
              />
            </div>
          </div>

          {/* Participants */}
          <div className="panel">
            <FloorPanel sessionId={sessionId} />
          </div>

          {/* Active translations — compact chips */}
          {translations.length > 0 && (
            <div className="panel">
              <span className="label" style={{ marginBottom: 11 }}>
                <Globe size={13} /> Etkin çeviriler · {translations.length}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {translations.map((t) => (
                  <span key={`${t.language}-${t.voice}`} className="chip">
                    <span style={{ fontSize: 14 }}>{FLAGS[t.language] || "🌐"}</span>
                    {LANG_NAMES[t.language] || t.language.toUpperCase()}
                    <span className="lang-meta" style={{ marginLeft: 1 }}>
                      {t.voice} · {t.subscriberCount}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Invite */}
          <InviteDialog url={joinUrl} />
        </div>

        {/* Main — screen share (if any) + dominant live transcript */}
        <div className="stage-col">
          <VideoStage />
          <div className="panel panel--fill">
            <span className="label" style={{ marginBottom: 12 }}>
              <Radio size={13} /> Canlı metin
            </span>
            <TranscriptView language={listenLanguage} voice={listenVoice} />
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
            Bir sorun oluştu
          </p>
          <p className="body-sm" style={{ marginBottom: 32 }}>{error}</p>
          <button className="btn btn-outline" onClick={() => (window.location.href = "/")}>
            Ana sayfa
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
        setError("Yayın bağlantısı kesildi. Lütfen ağ bağlantınızı kontrol edip tekrar deneyin.");
      }}
    >
      <RoomAudioRenderer />
      <AudioGate />
      <BroadcastControls sessionId={sessionId} />
    </LiveKitRoom>
  );
}
