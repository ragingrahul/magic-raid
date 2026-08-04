import { NextResponse } from "next/server";
import { adaptRoomStrategy } from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";

export const runtime = "nodejs";

type RoomStrategyRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function POST(request: Request, context: RoomStrategyRouteContext) {
  try {
    const { roomCode } = await context.params;
    const body = await readJsonBody(request);
    const room = getRoomOrThrow(roomCode.toUpperCase());

    return NextResponse.json(await adaptRoomStrategy(room, body));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
