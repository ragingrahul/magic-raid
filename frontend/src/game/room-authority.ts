import {
  CreateRoomRequestSchema,
  GAME_LIMITS,
  JoinRoomRequestSchema,
  RaidClientMessageSchema,
  RaidSnapshotMessageSchema,
  RaidSnapshotSchema,
  RoomCodeSchema,
  RoomProfileUpdateRequestSchema,
  type PlayerState,
  type RaidClientMessage,
  type RaidSnapshot,
  type RoomProfile,
  type RoomProfileUpdateRequest,
  type RoomSession
} from "@/game/schemas";
import {
  advanceBoss,
  applyPlayerAttack,
  createLocalRaidSnapshot,
  movePlayer
} from "@/game/rules";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_MOVE_DELTA_MS = 90;
const MAX_MOVE_DELTA_MS = 180;
const PLAYER_STARTS = [
  { x: 250, y: GAME_LIMITS.arena.height / 2 },
  { x: 190, y: GAME_LIMITS.arena.height / 2 - 105 },
  { x: 190, y: GAME_LIMITS.arena.height / 2 + 105 },
  { x: 310, y: GAME_LIMITS.arena.height / 2 + 8 }
] as const;

export type RoomAuthorityState = {
  roomCode: string;
  createdAtUnixMs: number;
  snapshot: RaidSnapshot;
  lastInputSequenceByPlayer: Record<string, number>;
  lastMoveAtMsByPlayer: Record<string, number>;
  nextPlayerNumber: number;
};

export class RoomAuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "RoomAuthorityError";
  }
}

export function createRoomCode(
  existingCodes: ReadonlySet<string> = new Set(),
  random = Math.random
): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let roomCode = "";
    for (let index = 0; index < 6; index += 1) {
      roomCode += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
    }

    const parsed = RoomCodeSchema.parse(roomCode);
    if (!existingCodes.has(parsed)) {
      return parsed;
    }
  }

  throw new RoomAuthorityError("room_code_unavailable", "Could not create a room code.", 503);
}

export function createRoomAuthority(
  rawProfile: unknown,
  options: {
    roomCode?: string;
    nowUnixMs?: number;
    existingCodes?: ReadonlySet<string>;
  } = {}
): RoomAuthorityState {
  const profile = CreateRoomRequestSchema.parse(rawProfile);
  const roomCode = RoomCodeSchema.parse(
    options.roomCode ?? createRoomCode(options.existingCodes)
  );
  const firstPlayer = createRoomPlayer(roomCode, 1, profile);
  const snapshot = createLocalRaidSnapshot(profile.playerClass);

  snapshot.raidId = `raid-${roomCode}`;
  snapshot.roomCode = roomCode;
  snapshot.players = [firstPlayer];
  snapshot.serverTimeMs = 0;
  snapshot.elapsedSeconds = 0;
  snapshot.tick = 0;
  snapshot.status = "active";

  return {
    roomCode,
    createdAtUnixMs: options.nowUnixMs ?? Date.now(),
    snapshot: RaidSnapshotSchema.parse(snapshot),
    lastInputSequenceByPlayer: {},
    lastMoveAtMsByPlayer: {
      [firstPlayer.id]: 0
    },
    nextPlayerNumber: 2
  };
}

export function joinRoomAuthority(
  room: RoomAuthorityState,
  rawProfile: unknown,
  nowUnixMs = Date.now()
): RoomSession {
  const profile = JoinRoomRequestSchema.parse({
    ...asRecord(rawProfile),
    roomCode: room.roomCode
  });

  advanceRoomAuthority(room, nowUnixMs);

  if (room.snapshot.players.length >= GAME_LIMITS.players.demoMax) {
    throw new RoomAuthorityError(
      "room_full",
      `Room ${room.roomCode} already has ${GAME_LIMITS.players.demoMax} players.`,
      409
    );
  }

  const player = createRoomPlayer(room.roomCode, room.nextPlayerNumber, profile);
  room.nextPlayerNumber += 1;
  room.snapshot.players = [...room.snapshot.players, player];
  room.lastMoveAtMsByPlayer[player.id] = roomTimeMs(room, nowUnixMs);
  room.snapshot = RaidSnapshotSchema.parse({
    ...room.snapshot,
    tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
  });

  return roomSession(room, player.id);
}

export function recoverRoomAuthority(
  room: RoomAuthorityState,
  playerId: string,
  nowUnixMs = Date.now()
): RoomSession {
  advanceRoomAuthority(room, nowUnixMs);
  requirePlayer(room.snapshot, playerId);
  return roomSession(room, playerId);
}

export function applyRoomInput(
  room: RoomAuthorityState,
  rawMessage: unknown,
  nowUnixMs = Date.now()
): RaidSnapshot {
  const message = RaidClientMessageSchema.parse(rawMessage);
  advanceRoomAuthority(room, nowUnixMs);

  if (message.raidId !== room.snapshot.raidId) {
    throw new RoomAuthorityError("raid_mismatch", "Input does not match this raid.", 409);
  }

  const player = requirePlayer(room.snapshot, message.playerId);

  if (message.type !== "player_ready") {
    const lastSequence = room.lastInputSequenceByPlayer[message.playerId] ?? -1;
    if (message.clientSequence <= lastSequence) {
      throw new RoomAuthorityError("stale_input", "Input sequence is stale.", 409);
    }
    room.lastInputSequenceByPlayer[message.playerId] = message.clientSequence;
  }

  const nowMs = roomTimeMs(room, nowUnixMs);

  if (message.type === "player_move") {
    const lastMoveAtMs = room.lastMoveAtMsByPlayer[message.playerId] ?? nowMs;
    const deltaMs = Math.min(
      MAX_MOVE_DELTA_MS,
      Math.max(DEFAULT_MOVE_DELTA_MS, nowMs - lastMoveAtMs)
    );
    room.snapshot = movePlayer(room.snapshot, message.playerId, message.direction, deltaMs);
    room.lastMoveAtMsByPlayer[message.playerId] = nowMs;
  } else if (message.type === "player_attack") {
    room.snapshot = applyPlayerAttack(
      room.snapshot,
      message.playerId,
      message.attack,
      nowMs
    ).snapshot;
  } else {
    player.class = message.playerClass;
    player.normalAttackReadyAtMs = nowMs;
    player.specialReadyAtMs = nowMs;
    room.snapshot = RaidSnapshotSchema.parse({
      ...room.snapshot,
      tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
    });
  }

  return raidSnapshotMessage(room.snapshot).snapshot;
}

export function updateRoomProfile(
  room: RoomAuthorityState,
  rawUpdate: unknown,
  nowUnixMs = Date.now()
): RoomSession {
  const update = RoomProfileUpdateRequestSchema.parse(rawUpdate);
  advanceRoomAuthority(room, nowUnixMs);
  const player = requirePlayer(room.snapshot, update.playerId);
  applyProfileUpdate(player, update);
  room.snapshot = RaidSnapshotSchema.parse({
    ...room.snapshot,
    tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
  });
  return roomSession(room, update.playerId);
}

export function advanceRoomAuthority(
  room: RoomAuthorityState,
  nowUnixMs = Date.now()
): RaidSnapshot {
  if (room.snapshot.status === "active") {
    room.snapshot = advanceBoss(room.snapshot, roomTimeMs(room, nowUnixMs)).snapshot;
  }

  return raidSnapshotMessage(room.snapshot).snapshot;
}

export function raidSnapshotMessage(snapshot: RaidSnapshot) {
  return RaidSnapshotMessageSchema.parse({
    type: "raid_snapshot",
    snapshot
  });
}

function roomSession(room: RoomAuthorityState, playerId: string): RoomSession {
  return {
    roomCode: room.roomCode,
    playerId,
    snapshot: raidSnapshotMessage(room.snapshot).snapshot
  };
}

function createRoomPlayer(
  roomCode: string,
  playerNumber: number,
  profile: RoomProfile
): PlayerState {
  const slot = PLAYER_STARTS[(playerNumber - 1) % PLAYER_STARTS.length];

  return {
    id: `${roomCode.toLowerCase()}-player-${playerNumber}`,
    wallet: profile.wallet,
    displayName: profile.displayName,
    class: profile.playerClass,
    status: "alive",
    hp: GAME_LIMITS.player.maxHp,
    maxHp: GAME_LIMITS.player.maxHp,
    position: {
      x: slot.x,
      y: slot.y
    },
    facingRadians: 0,
    moveSpeed: 260,
    normalAttackReadyAtMs: 0,
    specialReadyAtMs: 0,
    contribution: {
      damage: 0,
      support: 0,
      survival: 0,
      objective: 0,
      total: 0
    }
  };
}

function applyProfileUpdate(
  player: PlayerState,
  update: RoomProfileUpdateRequest
) {
  if (update.displayName !== undefined) {
    player.displayName = update.displayName;
  }

  if (update.playerClass !== undefined) {
    player.class = update.playerClass;
  }

  if (update.wallet === null) {
    delete player.wallet;
  } else if (update.wallet !== undefined) {
    player.wallet = update.wallet;
  }
}

function requirePlayer(snapshot: RaidSnapshot, playerId: string): PlayerState {
  const player = snapshot.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RoomAuthorityError("player_not_found", "Player is not in this room.", 404);
  }

  return player;
}

function roomTimeMs(room: RoomAuthorityState, nowUnixMs: number): number {
  return Math.max(0, nowUnixMs - room.createdAtUnixMs);
}

export function parseRaidClientMessage(rawMessage: unknown): RaidClientMessage {
  return RaidClientMessageSchema.parse(rawMessage);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
