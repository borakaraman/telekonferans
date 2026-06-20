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
import LanguageSelector from "./components/LanguageSelector";
import TranscriptView from "@/components/TranscriptView";
import VideoStage from "@/components/VideoStage";
import AudioGate from "@/components/AudioGate";

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

  // When the organizer grants the floor, auto-enable the mic.
  useEffect(() => {
    if (canPublish) {
      setState("speaking");
      localParticipant?.setMicrophoneEnabled(true).catch(() => {});
    }
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
      <span className="label" style={{ display: "block", marginBottom: 12 }}>
        Konuşma
      </span>

        {state === "speaking" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="status status--active">
              <span className="status-dot pulse" />
              Söz sizde — mikrofonunuzu açabilirsiniz
            </span>
            <TrackToggle
              source={Track.Source.Microphone}
              style={{
                width: "100%",
                padding: "14px 24px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 500,
                border: "none",
                borderRadius: 0,
                background: "var(--fg)",
                color: "var(--bg)",
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
                border: "1px solid var(--fg)",
                borderRadius: 0,
                background: "transparent",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            />
            <button className="btn btn-outline" onClick={leaveStage} disabled={busy}>
              Sözü bırak
            </button>
          </div>
        ) : state === "requested" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="status status--waiting">
              <span className="status-dot pulse" />
              İstek gönderildi — sahibin onayı bekleniyor
            </span>
            <button className="btn btn-outline" onClick={cancelRequest} disabled={busy}>
              İsteği iptal et
            </button>
          </div>
        ) : (
          <button
            className="btn"
            onClick={requestFloor}
            disabled={busy}
            style={{ width: "100%" }}
          >
            ✋ Söz iste
          </button>
        )}
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
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const remoteParticipants = useRemoteParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);

  const organizerParticipant = remoteParticipants.find((p) =>
    p.identity.startsWith("organizer-")
  );

  // Our own translator bot (exists only while we hold the floor) — we never
  // listen to our own translation.
  const ownTranslator = `translator-${language}-${identity}`;

  // Keep a bridge alive for the selected language while it's selected.
  // Cleanup unsubscribes on change/unmount (strict-mode safe: sub→unsub→sub).
  useEffect(() => {
    if (language === "original") return;
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, targetLanguage: language }),
    }).catch(() => {});
    return () => {
      fetch("/api/translate/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetLanguage: language }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [language, sessionId]);

  // Reliable unsubscribe on real tab close (effect cleanup may not run then).
  useEffect(() => {
    const onUnload = () => {
      if (language !== "original") {
        navigator.sendBeacon?.(
          "/api/translate/unsubscribe",
          new Blob([JSON.stringify({ sessionId, targetLanguage: language })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [language, sessionId]);

  // Manage which audio/video tracks are subscribed
  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      const langPrefix = `translator-${language}-`;

      for (const [, participant] of room.remoteParticipants) {
        const isTranslator = participant.identity.startsWith("translator-");
        // Every speaker translated into the chosen language, except our own voice.
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
  }, [room, language, ownTranslator, remoteParticipants]);

  useEffect(() => {
    const hasAudio = audioTracks.some((t) => {
      const pub = t.publication;
      if (language === "original") {
        return !t.participant.identity.startsWith("translator-") && pub.isSubscribed;
      }
      return (
        t.participant.identity.startsWith(`translator-${language}-`) &&
        t.participant.identity !== ownTranslator &&
        pub.isSubscribed
      );
    });
    setIsReceivingAudio(hasAudio);
  }, [audioTracks, language, ownTranslator]);

  const isConnected = organizerParticipant !== undefined;

  return (
    <div className="stage enter">
      {/* Header */}
      <div className="stage-header">
        <div>
          <h1 className="display display-md" style={{ marginBottom: 2 }}>
            <em>Listening</em>
          </h1>
          <p className="mono">{sessionId}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className={`waveform ${isReceivingAudio ? "active" : "idle"}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="waveform-bar" />
            ))}
          </div>
          {isConnected ? (
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
          <VideoStage />

          <div className="panel">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Dil
            </span>
            <LanguageSelector
              currentLanguage={language}
              onLanguageChange={setLanguage}
            />
          </div>

          <div className="panel">
            <SpeakControl sessionId={sessionId} identity={identity} />
          </div>
        </div>

        {/* Right column: transcript (scrolls internally) */}
        <div className="stage-col">
          <div className="panel panel--fill">
            <span className="label" style={{ display: "block", marginBottom: 12 }}>
              Metin (konuşulan + çeviri)
            </span>
            <TranscriptView language={language} excludeSpeaker={identity} />
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
            Something went wrong
          </p>
          <p className="body-sm" style={{ marginBottom: 32 }}>{error}</p>
          <button
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Retry
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
          <p className="mono">Joining…</p>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="page">
        <div className="container enter" style={{ textAlign: "center" }}>
          <h1 className="display display-lg" style={{ marginBottom: 12 }}>
            <em>Ready</em>
          </h1>
          <p className="body-sm" style={{ marginBottom: 40 }}>
            Tap below to join the broadcast and enable audio.
          </p>
          <button
            className="btn"
            onClick={() => setStarted(true)}
          >
            Start listening
          </button>
          <p className="mono" style={{ marginTop: 32, fontSize: 12 }}>
            Session {sessionId}
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
