import { NextResponse } from "next/server";
import {
  cloneRoomAuthority,
  joinRoomAuthority,
  recoverRoomAuthority,
  RoomAuthorityError
} from "@/game/room-authority";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse,
  roomStore
} from "@/app/api/rooms/store";
import {
  joinOnChainRoom,
  onChainRoomStateEnabled
} from "@/lib/room-chain";

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
    const room = await getRoomOrThrow(roomCode.toUpperCase());
    const draft = cloneRoomAuthority(room);
    const session = joinRoomAuthority(draft, body);
    const joinedPlayer = draft.snapshot.players.find(
      (player) => player.id === session.playerId
    );

    if (onChainRoomStateEnabled()) {
      if (!joinedPlayer?.wallet) {
        throw new RoomAuthorityError(
          "wallet_required",
          "Connect a wallet before joining a live devnet room.",
          400
        );
      }

      const onChainRoom = await joinOnChainRoom(
        draft.roomCode,
        joinedPlayer.wallet,
        joinedPlayer.class
      );
      draft.authority = onChainRoom.authorityStatus;
      draft.settlement = {
        ...draft.settlement,
        authority: onChainRoom.authorityStatus
      };
    }

    roomStore.set(draft.roomCode, draft);

    return NextResponse.json(recoverRoomAuthority(draft, session.playerId));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
