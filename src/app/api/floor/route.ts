import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import TranslationSessionManager from "@/lib/translation-session-manager";

// Derive the LiveKit HTTP(S) URL from the WS(S) URL used elsewhere.
function livekitHttpUrl(): string {
  const ws =
    process.env.LIVEKIT_URL ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    "ws://localhost:7880";
  return ws.replace(/^ws/, "http");
}

function roomService(): RoomServiceClient {
  return new RoomServiceClient(
    livekitHttpUrl(),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );
}

// GET /api/floor?sessionId=&hostKey= — Organizer fetches pending requests + speakers
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const hostKey = req.nextUrl.searchParams.get("hostKey");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const manager = TranslationSessionManager.getInstance();
  if (!manager.isHost(sessionId, hostKey)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json(manager.getFloorState(sessionId));
}

// POST /api/floor — request / cancel / grant / revoke the floor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, action, identity, name, hostKey } = body as {
      sessionId?: string;
      action?: string;
      identity?: string;
      name?: string;
      hostKey?: string;
    };

    if (!sessionId || !action || !identity) {
      return NextResponse.json(
        { error: "Missing sessionId, action or identity" },
        { status: 400 }
      );
    }

    const manager = TranslationSessionManager.getInstance();
    const session = manager.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    switch (action) {
      // Attendee asks to speak
      case "request":
        manager.addFloorRequest(sessionId, identity, name || identity);
        return NextResponse.json({ ok: true, status: "requested" });

      // Attendee withdraws their request
      case "cancel":
        manager.removeFloorRequest(sessionId, identity);
        return NextResponse.json({ ok: true, status: "cancelled" });

      // Organizer approves — grant publish permission live, no reconnect needed
      case "grant": {
        if (!manager.isHost(sessionId, hostKey)) {
          return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }
        await roomService().updateParticipant(sessionId, identity, {
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishData: true,
          },
        });
        await manager.grantFloor(sessionId, identity);
        return NextResponse.json({ ok: true, status: "granted" });
      }

      // Organizer revokes a speaker, OR a speaker steps down ("leave").
      // "revoke" requires the host key; "leave" is self-service for the attendee.
      case "revoke":
      case "leave": {
        if (action === "revoke" && !manager.isHost(sessionId, hostKey)) {
          return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }
        await roomService().updateParticipant(sessionId, identity, {
          permission: {
            canSubscribe: true,
            canPublish: false,
            canPublishData: false,
          },
        });
        await manager.revokeFloor(sessionId, identity);
        return NextResponse.json({ ok: true, status: "revoked" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Floor action failed:", error);
    return NextResponse.json(
      { error: "Floor action failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}
