import { NextResponse } from "next/server";
import {
  applyRoomInput,
  raidSnapshotMessage
} from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";

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
    const room = getRoomOrThrow(roomCode.toUpperCase());
    const snapshot = applyRoomInput(room, body);

    return NextResponse.json(raidSnapshotMessage(snapshot));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
