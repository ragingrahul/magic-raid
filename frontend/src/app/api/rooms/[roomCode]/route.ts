import { NextResponse } from "next/server";
import { recoverRoomAuthority } from "@/game/room-authority";
import {
  getRoomOrThrow,
  roomErrorResponse
} from "@/app/api/rooms/store";

export const runtime = "nodejs";

type RoomRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function GET(request: Request, context: RoomRouteContext) {
  try {
    const { roomCode } = await context.params;
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json(
        {
          type: "raid_error",
          code: "missing_player",
          message: "Player id is required for room recovery."
        },
        { status: 400 }
      );
    }

    const room = getRoomOrThrow(roomCode.toUpperCase());
    return NextResponse.json(recoverRoomAuthority(room, playerId));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
