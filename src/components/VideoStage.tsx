"use client";

import { useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import { MonitorUp } from "lucide-react";

/**
 * Renders the screen-share video of every speaker (organizer + anyone given
 * the floor). Camera is disabled project-wide for now. Translator bots have no
 * video, so they never appear. Returns nothing when nothing is being shared.
 */
export default function VideoStage() {
  const tracks = useTracks(
    [Track.Source.ScreenShare],
    { onlySubscribed: true }
  ).filter(
    (t) => t.publication && !t.participant.identity.startsWith("translator-")
  );

  if (tracks.length === 0) return null;

  return (
    // Fills whatever box the parent provides (full-width 16:9 on the listener,
    // a full-height half on the host's side-by-side layout). The parent owns
    // the dimensions; tiles letterbox (contain) so the whole screen stays visible.
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        gap: 8,
        minHeight: 0,
      }}
    >
      {tracks.map((t) => (
        <div
          key={t.publication!.trackSid}
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            height: "100%",
            background: "#000",
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--panel-border)",
          }}
        >
          <VideoTrack
            trackRef={t}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
          <span
            className="mono"
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              fontSize: 11,
              color: "#fff",
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(6px)",
              borderRadius: 999,
            }}
          >
            {t.source === Track.Source.ScreenShare && <MonitorUp size={12} />}
            {t.participant.isLocal ? "Siz" : t.participant.identity}
          </span>
        </div>
      ))}
    </div>
  );
}
