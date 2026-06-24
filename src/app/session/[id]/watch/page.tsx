"use client";

import { useEffect, useState, useCallback, use } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useRemoteParticipants,
  useLocalParticipant,
  TrackToggle,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import { motion, AnimatePresence } from "framer-motion";
import LanguagePicker from "./components/LanguagePicker";
import VoiceSelector from "./components/VoiceSelector";
import TranscriptView from "@/components/TranscriptView";
import VideoStage from "@/components/VideoStage";
import AudioGate from "@/components/AudioGate";
import { DEFAULT_VOICE } from "@/lib/voices";
import AIOrb, { type OrbState } from "@/design-system/AIOrb";
import AmbientBlobs from "@/design-system/AmbientBlobs";
import {
  Hand,
  Mic,
  LogOut,
  Loader2,
  Languages,
  AudioLines,
  Radio,
} from "lucide-react";

type SpeakState = "idle" | "requested" | "speaking";

function SpeakControl({
  sessionId,
  identity,
}: {
  sessionId: string;
  identity: string;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [state, setState] = useState<SpeakState>("idle");
  const [busy, setBusy] = useState(false);
  // True while we're acquiring the mic after being granted the floor —
  // there's a real gap, so we show feedback instead of a dead button.
  const [activating, setActivating] = useState(false);

  // Track whether the server has granted publish permission.
  const canPublish = !!localParticipant?.permissions?.canPublish;

  useEffect(() => {
    if (!room) return;
    const sync = () => {
      const allowed = !!room.localParticipant?.permissions?.canPublish;
      setState((prev) => {
        if (allowed) return "speaking";
        // Permission removed → back to idle (unless still waiting on a request)
        return prev === "requested" ? "requested" : "idle";
      });
    };
    sync();
    room.on(RoomEvent.ParticipantPermissionsChanged, sync);
    return () => {
      room.off(RoomEvent.ParticipantPermissionsChanged, sync);
    };
  }, [room]);

  // When the organizer grants the floor, auto-enable the mic — with a visible
  // "activating" state during the (real) acquisition gap.
  useEffect(() => {
    if (!canPublish) return;
    setState("speaking");
    setActivating(true);
    Promise.resolve(localParticipant?.setMicrophoneEnabled(true))
      .catch(() => {})
      .finally(() => setActivating(false));
  }, [canPublish, localParticipant]);

  const post = useCallback(
    async (action: string) => {
      setBusy(true);
      try {
        await fetch("/api/floor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action, identity, name: identity }),
        });
      } finally {
        setBusy(false);
      }
    },
    [sessionId, identity]
  );

  const requestFloor = async () => {
    setState("requested");
    await post("request");
  };

  const cancelRequest = async () => {
    setState("idle");
    await post("cancel");
  };

  const leaveStage = async () => {
    // Turn mic + screen share off, then drop publish permission server-side
    try {
      await localParticipant?.setMicrophoneEnabled(false);
      await localParticipant?.setScreenShareEnabled(false);
    } catch {}
    await post("leave");
    setState("idle");
  };

  return (
    <div>
      <span className="label" style={{ marginBottom: 12 }}>
        <Mic size={13} /> Konuşma
      </span>

      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {state === "speaking" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activating ? (
            <span className="loading-pill">
              <span className="spinner spinner-sm" />
              Mikrofonunuz açılıyor<span className="dots" />
            </span>
          ) : (
            <span className="status status--active">
              <span className="status-dot pulse" />
              Söz sizde
            </span>
          )}
          <TrackToggle
            source={Track.Source.Microphone}
            style={{
              width: "100%",
              padding: "14px 24px",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              borderRadius: 11,
              background: "var(--fg)",
              color: "#0A0D14",
              cursor: "pointer",
            }}
          />
          <TrackToggle
            source={Track.Source.ScreenShare}
            captureOptions={{ audio: true }}
            style={{
              width: "100%",
              padding: "12px 24px",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid var(--border)",
              borderRadius: 11,
              background: "rgba(255,255,255,0.02)",
              color: "var(--fg)",
              cursor: "pointer",
            }}
          />
          <button className="btn btn-outline" onClick={leaveStage} disabled={busy}>
            {busy ? <span className="spinner spinner-sm" /> : <LogOut size={16} />}
            Sözü bırak
          </button>
        </div>
      ) : state === "requested" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="loading-pill" style={{ color: "var(--warning)", background: "var(--warning-soft)", borderColor: "rgba(251,191,36,0.22)" }}>
            <Loader2 size={14} className="spin-ico" />
            Onay bekleniyor<span className="dots" />
          </span>
          <button className="btn btn-outline" onClick={cancelRequest} disabled={busy}>
            İsteği iptal et
          </button>
        </div>
      ) : (
        <button
          className="btn btn-primary"
          onClick={requestFloor}
          disabled={busy}
          style={{ width: "100%" }}
        >
          {busy ? <span className="spinner spinner-sm spinner-dark" /> : <Hand size={16} />}
          Söz iste
        </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AttendeeView({
  sessionId,
  identity,
}: {
  sessionId: string;
  identity: string;
}) {
  const room = useRoomContext();
  // Default English — translates immediately; user can change it freely.
  const [language, setLanguage] = useState("en");
  // Each listener picks the voice they hear the translation in.
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  // True while the translation pipeline for the chosen (language, voice) spins
  // up — covers the real delay between selecting and hearing audio.
  const [preparing, setPreparing] = useState(false);
  const remoteParticipants = useRemoteParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);
  const screenShares = useTracks([Track.Source.ScreenShare], { onlySubscribed: true }).filter(
    (t) => t.publication && !t.participant.identity.startsWith("translator-")
  );
  const sharing = screenShares.length > 0;

  const organizerParticipant = remoteParticipants.find((p) =>
    p.identity.startsWith("organizer-")
  );

  // Our own translator bot (exists only while we hold the floor) — we never
  // listen to our own translation.
  const ownTranslator = `translator-${language}-${voice}-${identity}`;

  // Keep a bridge alive for the selected (language, voice) while selected.
  // Cleanup unsubscribes on change/unmount (strict-mode safe: sub→unsub→sub).
  useEffect(() => {
    if (language === "original") {
      setPreparing(false);
      return;
    }
    setPreparing(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, targetLanguage: language, voice }),
    })
      .catch(() => {})
      .finally(() => setPreparing(false));
    return () => {
      fetch("/api/translate/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetLanguage: language, voice }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [language, voice, sessionId]);

  // Reliable unsubscribe on real tab close (effect cleanup may not run then).
  useEffect(() => {
    const onUnload = () => {
      if (language !== "original") {
        navigator.sendBeacon?.(
          "/api/translate/unsubscribe",
          new Blob([JSON.stringify({ sessionId, targetLanguage: language, voice })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [language, voice, sessionId]);

  // Manage which audio/video tracks are subscribed
  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      const langPrefix = `translator-${language}-${voice}-`;

      for (const [, participant] of room.remoteParticipants) {
        const isTranslator = participant.identity.startsWith("translator-");
        // Every speaker translated into the chosen language+voice, except ours.
        const isOtherLangTranslator =
          participant.identity.startsWith(langPrefix) &&
          participant.identity !== ownTranslator;

        for (const [, pub] of participant.trackPublications) {
          if (pub.kind === Track.Kind.Audio) {
            if (language === "original") {
              pub.setSubscribed(!isTranslator);
            } else {
              pub.setSubscribed(isOtherLangTranslator);
            }
          } else if (pub.kind === Track.Kind.Video) {
            // Show speakers' screen share, regardless of audio language choice.
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
  }, [room, language, voice, ownTranslator, remoteParticipants]);

  useEffect(() => {
    const hasAudio = audioTracks.some((t) => {
      const pub = t.publication;
      if (language === "original") {
        return !t.participant.identity.startsWith("translator-") && pub.isSubscribed;
      }
      return (
        t.participant.identity.startsWith(`translator-${language}-${voice}-`) &&
        t.participant.identity !== ownTranslator &&
        pub.isSubscribed
      );
    });
    setIsReceivingAudio(hasAudio);
  }, [audioTracks, language, voice, ownTranslator]);

  const isConnected = organizerParticipant !== undefined;
  const orbState: OrbState = !isConnected
    ? "connecting"
    : preparing
    ? "translating"
    : isReceivingAudio
    ? "speaking"
    : "idle";

  return (
    <div className="stage stage--listener enter">
      <AmbientBlobs />
      {/* Header */}
      <div className="stage-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <AIOrb size={46} state={orbState} />
          <div style={{ minWidth: 0 }}>
            <h1 className="display display-md" style={{ marginBottom: 1 }}>
              Dinleme
            </h1>
            <p className="mono">{sessionId}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className={`waveform ${isReceivingAudio ? "active" : "idle"}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="waveform-bar" />
            ))}
          </div>
          {preparing ? (
            <span className="loading-pill">
              <span className="spinner spinner-sm" />
              Çeviri hazırlanıyor<span className="dots" />
            </span>
          ) : isConnected ? (
            <span className="status status--active">
              <span className="status-dot pulse" />
              {language === "original" ? "Orijinal" : language.toUpperCase()}
            </span>
          ) : (
            <span className="status status--waiting">
              <span className="status-dot pulse" />
              Yayın bekleniyor
            </span>
          )}
        </div>
      </div>

      {/* Two-column dashboard — fits the viewport */}
      <div className="stage-body">
        {/* Left column: video + controls */}
        <div className="stage-col stage-col--scroll">
          {sharing && (
            <div className="video-box">
              <VideoStage />
            </div>
          )}

          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span className="label" style={{ marginBottom: 10 }}>
                <Languages size={13} /> Dil
              </span>
              <LanguagePicker
                currentLanguage={language}
                onLanguageChange={setLanguage}
              />
            </div>
            <div>
              <span className="label" style={{ marginBottom: 10 }}>
                <AudioLines size={13} /> Çeviri sesi
              </span>
              <VoiceSelector
                currentVoice={voice}
                onVoiceChange={setVoice}
                disabled={language === "original"}
              />
            </div>
          </div>

          <div className="panel">
            <SpeakControl sessionId={sessionId} identity={identity} />
          </div>
        </div>

        {/* Right column: transcript (scrolls internally) */}
        <div className="stage-col">
          <div className="panel panel--fill">
            <span className="label" style={{ marginBottom: 12 }}>
              <Radio size={13} /> Canlı metin
            </span>
            <TranscriptView language={language} voice={voice} />
          </div>
        </div>
      </div>
    </div>
  );
}


export default function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      try {
        const id = `attendee-${Math.random().toString(36).slice(2, 8)}`;
        setIdentity(id);
        const res = await fetch(
          `/api/token?room=${sessionId}&identity=${id}&role=attendee`
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
          <button
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Tekrar dene
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
          <p className="mono">Bağlanılıyor…</p>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="page">
        <div className="container enter" style={{ textAlign: "center" }}>
          <h1 className="display display-lg" style={{ marginBottom: 12 }}>
            Hazır
          </h1>
          <p className="body" style={{ marginBottom: 36 }}>
            Yayına katılmak ve sesi etkinleştirmek için dokunun.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setStarted(true)}
          >
            Dinlemeye başla
          </button>
          <p className="mono" style={{ marginTop: 32, fontSize: 12 }}>
            Oturum {sessionId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={false}
      token={token}
      serverUrl={livekitUrl}
      connectOptions={{ autoSubscribe: false }}
      style={{ width: "100%", height: "100dvh" }}
    >
      <RoomAudioRenderer />
      <AudioGate />
      <AttendeeView sessionId={sessionId} identity={identity} />
    </LiveKitRoom>
  );
}
