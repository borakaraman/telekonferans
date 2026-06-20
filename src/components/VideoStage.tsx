"use client";

import { useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: tracks.length > 1 ? "1fr 1fr" : "1fr",
        gap: 8,
        width: "100%",
        marginBottom: 24,
      }}
    >
      {tracks.map((t) => (
        <div
          key={t.publication!.trackSid}
          style={{
            position: "relative",
            background: "#000",
            borderRadius: 4,
            overflow: "hidden",
            aspectRatio: "16 / 9",
          }}
        >
          <VideoTrack
            trackRef={t}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <span
            className="mono"
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              padding: "2px 8px",
              fontSize: 11,
              color: "#fff",
              background: "rgba(0,0,0,0.5)",
              borderRadius: 2,
            }}
          >
            {(t.participant.isLocal ? "Siz" : t.participant.identity) +
              (t.source === Track.Source.ScreenShare ? " · ekran" : "")}
          </span>
        </div>
      ))}
    </div>
  );
}
