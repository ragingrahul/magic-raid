import { NextResponse } from "next/server";
import { updateRoomProfile } from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";

export const runtime = "nodejs";

type RoomProfileRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function PATCH(request: Request, context: RoomProfileRouteContext) {
  try {
    const { roomCode } = await context.params;
    const body = await readJsonBody(request);
    const room = await getRoomOrThrow(roomCode.toUpperCase());

    return NextResponse.json(updateRoomProfile(room, body));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
