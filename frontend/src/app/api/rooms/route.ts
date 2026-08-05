import { NextResponse } from "next/server";
import {
  createRoomAuthority,
  recoverRoomAuthority,
  RoomAuthorityError
} from "@/game/room-authority";
import { readJsonBody, roomErrorResponse, roomStore } from "@/app/api/rooms/store";
import {
  createOnChainRoom,
  onChainRoomStateEnabled
} from "@/lib/room-chain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const room = createRoomAuthority(body, {
      existingCodes: new Set(roomStore.keys())
    });

    if (onChainRoomStateEnabled()) {
      const firstPlayer = room.snapshot.players[0];
      if (!firstPlayer.wallet) {
        throw new RoomAuthorityError(
          "wallet_required",
          "Connect a wallet before creating a live devnet room.",
          400
        );
      }

      const onChainRoom = await createOnChainRoom(
        room.roomCode,
        firstPlayer.wallet,
        firstPlayer.class
      );
      room.authority = onChainRoom.authorityStatus;
      room.settlement = {
        ...room.settlement,
        authority: onChainRoom.authorityStatus
      };
    }

    roomStore.set(room.roomCode, room);

    return NextResponse.json(recoverRoomAuthority(room, room.snapshot.players[0].id));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
