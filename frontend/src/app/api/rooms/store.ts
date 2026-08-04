import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  RoomAuthorityError,
  type RoomAuthorityState
} from "@/game/room-authority";
import { RaidErrorMessageSchema } from "@/game/schemas";

type RoomStoreGlobal = typeof globalThis & {
  __magicRaidRooms?: Map<string, RoomAuthorityState>;
};

const roomGlobal = globalThis as RoomStoreGlobal;

export const roomStore =
  roomGlobal.__magicRaidRooms ?? new Map<string, RoomAuthorityState>();

roomGlobal.__magicRaidRooms = roomStore;

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RoomAuthorityError("invalid_json", "Request body must be valid JSON.");
  }
}

export function getRoomOrThrow(roomCode: string): RoomAuthorityState {
  const room = roomStore.get(roomCode);
  if (!room) {
    throw new RoomAuthorityError("room_not_found", "Room code is invalid or expired.", 404);
  }

  return room;
}

export function roomErrorResponse(error: unknown) {
  if (error instanceof RoomAuthorityError) {
    return NextResponse.json(
      RaidErrorMessageSchema.parse({
        type: "raid_error",
        code: error.code,
        message: error.message
      }),
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      RaidErrorMessageSchema.parse({
        type: "raid_error",
        code: "invalid_payload",
        message: "Room payload failed validation."
      }),
      { status: 400 }
    );
  }

  return NextResponse.json(
    RaidErrorMessageSchema.parse({
      type: "raid_error",
      code: "room_error",
      message: "Room service failed."
    }),
    { status: 500 }
  );
}
