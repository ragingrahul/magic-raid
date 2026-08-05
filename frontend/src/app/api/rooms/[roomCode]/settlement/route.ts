import { NextResponse } from "next/server";
import {
  createRoomSettlementSummary,
  markRoomSettlement,
  RoomAuthorityError
} from "@/game/room-authority";
import { SettlementSubmissionRequestSchema } from "@/game/schemas";
import {
  getRoomOrThrow,
  readJsonBody,
  roomErrorResponse
} from "@/app/api/rooms/store";
import {
  settlementAuthorityAddress,
  submitSettlementSummary
} from "@/lib/settlement-server";

export const runtime = "nodejs";

type RoomSettlementRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function POST(request: Request, context: RoomSettlementRouteContext) {
  try {
    const { roomCode } = await context.params;
    const body = SettlementSubmissionRequestSchema.parse(await readJsonBody(request));
    const room = await getRoomOrThrow(roomCode.toUpperCase());
    const authority =
      settlementAuthorityAddress() ??
      room.snapshot.players.find((player) => player.id === body.playerId)?.wallet;

    if (!authority) {
      throw new RoomAuthorityError(
        "settlement_authority_missing",
        "Settlement authority is unavailable.",
        503
      );
    }

    const summary = createRoomSettlementSummary(room, body.playerId, authority);
    const settlement = await submitSettlementSummary(summary, room.authority);

    return NextResponse.json(markRoomSettlement(room, settlement));
  } catch (error) {
    return roomErrorResponse(error);
  }
}
