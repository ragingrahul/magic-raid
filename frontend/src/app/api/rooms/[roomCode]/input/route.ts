import { NextResponse } from "next/server";
import {
  applyRoomInputWithCriticalAuthority,
  raidSnapshotMessage
} from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";
import { createMagicBlockCriticalAuthorityAdapter } from "@/lib/magicblock-authority";

export const runtime = "nodejs";

type RoomInputRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function POST(request: Request, context: RoomInputRouteContext) {
  try {
    const { roomCode } = await context.params;
    const body = await readJsonBody(request);
    const room = await getRoomOrThrow(roomCode.toUpperCase());
    const snapshot = await applyRoomInputWithCriticalAuthority(
      room,
      body,
      Date.now(),
      createMagicBlockCriticalAuthorityAdapter()
    );

    return NextResponse.json(raidSnapshotMessage(snapshot, room.authority));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
