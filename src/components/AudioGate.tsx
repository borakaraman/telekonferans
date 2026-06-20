"use client";

import { useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

/**
 * Mobile browsers block audio playback until a user gesture. LiveKit reports
 * this via room.canPlaybackAudio; when blocked we show a full-width tap target
 * that calls room.startAudio() (a real gesture) to unlock playback. The banner
 * hides itself once audio is allowed.
 */
export default function AudioGate() {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!room) return;
    const update = () => setBlocked(!room.canPlaybackAudio);
    update();
    room.on(RoomEvent.AudioPlaybackStatusChanged, update);
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, update);
    };
  }, [room]);

  if (!blocked) return null;

  return (
    <button
      onClick={() => room?.startAudio().catch(() => {})}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: "16px 24px",
        border: "none",
        background: "var(--success, #16a34a)",
        color: "#fff",
        fontFamily: "var(--font-body)",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      🔊 Sesi etkinleştirmek için dokunun
    </button>
  );
}
