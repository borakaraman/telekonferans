import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import TranslationSessionManager from "@/lib/translation-session-manager";

// GET /api/token — Generate a LiveKit access token
export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");
  const identity = req.nextUrl.searchParams.get("identity");
  const role = req.nextUrl.searchParams.get("role") || "attendee";
  const hostKey = req.nextUrl.searchParams.get("hostKey");

  if (!room || !identity) {
    return NextResponse.json(
      { error: "Missing room or identity parameter" },
      { status: 400 }
    );
  }

  // Only the verified session owner can join as the organizer (publisher).
  if (role === "organizer") {
    const manager = TranslationSessionManager.getInstance();
    if (!manager.isHost(room, hostKey)) {
      return NextResponse.json(
        { error: "Invalid or missing host key for this session" },
        { status: 403 }
      );
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit credentials not configured" },
      { status: 500 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: identity,
    ttl: "4h",
  });

  const isOrganizer = role === "organizer";

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: isOrganizer,
    canSubscribe: true,
    canPublishData: isOrganizer,
  });

  const token = await at.toJwt();
  const serverUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

  return NextResponse.json({ token, serverUrl });
}
