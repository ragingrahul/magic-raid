import { NextResponse } from "next/server";
import { joinRoomAuthority } from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";

export const runtime = "nodejs";

type RoomJoinRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function POST(request: Request, context: RoomJoinRouteContext) {
  try {
    const { roomCode } = await context.params;
    const body = await readJsonBody(request);
    const room = getRoomOrThrow(roomCode.toUpperCase());

    return NextResponse.json(joinRoomAuthority(room, body));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
