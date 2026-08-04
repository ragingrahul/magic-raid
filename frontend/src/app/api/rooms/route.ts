import { NextResponse } from "next/server";
import { createRoomAuthority } from "@/game/room-authority";
import { readJsonBody, roomErrorResponse, roomStore } from "@/app/api/rooms/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const room = createRoomAuthority(body, {
      existingCodes: new Set(roomStore.keys())
    });
    roomStore.set(room.roomCode, room);

    return NextResponse.json({
      roomCode: room.roomCode,
      playerId: room.snapshot.players[0].id,
      snapshot: room.snapshot
    });
  } catch (error) {
    return roomErrorResponse(error);
  }
}
