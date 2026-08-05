import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createRoomAuthorityFromOnChain,
  ensureRoomRuntimeState,
  RoomAuthorityError,
  type RoomAuthorityState
} from "@/game/room-authority";
import { RaidErrorMessageSchema } from "@/game/schemas";
import {
  onChainRoomStateEnabled,
  readOnChainRoom
} from "@/lib/room-chain";

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

export async function getRoomOrThrow(roomCode: string): Promise<RoomAuthorityState> {
  const room = roomStore.get(roomCode);
  if (!room) {
    if (onChainRoomStateEnabled()) {
      try {
        const onChainRoom = await readOnChainRoom(roomCode);
        if (onChainRoom) {
          const reconstructed = createRoomAuthorityFromOnChain(roomCode, onChainRoom);
          roomStore.set(roomCode, reconstructed);
          return reconstructed;
        }
      } catch (error) {
        throw new RoomAuthorityError(
          "room_chain_unavailable",
          error instanceof Error
            ? error.message
            : "Could not read the on-chain room state.",
          503
        );
      }
    }

    throw new RoomAuthorityError("room_not_found", "Room code is invalid or expired.", 404);
  }

  return ensureRoomRuntimeState(room);
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
