import {
  CreateRoomRequestSchema,
  GAME_LIMITS,
  JoinRoomRequestSchema,
  RaidAnalyticsEventSchema,
  RaidClientMessageSchema,
  RaidSnapshotMessageSchema,
  RaidSnapshotSchema,
  RoomCodeSchema,
  RoomProfileUpdateRequestSchema,
  RoomStrategyRequestSchema,
  RoomStrategyUpdateSchema,
  type BossStrategyDecision,
  type RaidAnalyticsEvent,
  type RaidAnalyticsSummary,
  type PlayerState,
  type RaidClientMessage,
  type RaidSnapshot,
  type RoomProfile,
  type RoomProfileUpdateRequest,
  type RoomSession,
  type RoomStrategyUpdate
} from "@/game/schemas";
import {
  advanceBoss,
  applyPlayerAttack,
  createLocalRaidSnapshot,
  movePlayer,
  PLAYER_ATTACK_DEFINITIONS,
  setBossStrategy
} from "@/game/rules";
import {
  pruneAnalyticsEvents,
  summarizeRaidAnalytics
} from "@/game/analytics";
import {
  selectBossStrategyDecision,
  type StrategySelectionOptions
} from "@/game/ai-strategy";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_MOVE_DELTA_MS = 90;
const MAX_MOVE_DELTA_MS = 180;
const PLAYER_STARTS = [
  { x: 250, y: GAME_LIMITS.arena.height / 2 },
  { x: 190, y: GAME_LIMITS.arena.height / 2 - 105 },
  { x: 190, y: GAME_LIMITS.arena.height / 2 + 105 },
  { x: 310, y: GAME_LIMITS.arena.height / 2 + 8 }
] as const;

type StrategyDecisionSelector = (
  analytics: RaidAnalyticsSummary,
  options?: StrategySelectionOptions
) => Promise<BossStrategyDecision>;

export type RoomAuthorityState = {
  roomCode: string;
  createdAtUnixMs: number;
  snapshot: RaidSnapshot;
  analyticsEvents: RaidAnalyticsEvent[];
  lastAnalytics?: RaidAnalyticsSummary;
  lastStrategyDecision?: BossStrategyDecision;
  strategyAdaptationCount: number;
  lastStrategyDecisionAtMs?: number;
  lastStrategyAdaptationAtMs?: number;
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

  const room: RoomAuthorityState = {
    roomCode,
    createdAtUnixMs: options.nowUnixMs ?? Date.now(),
    snapshot: RaidSnapshotSchema.parse(snapshot),
    analyticsEvents: [],
    strategyAdaptationCount: 0,
    lastInputSequenceByPlayer: {},
    lastMoveAtMsByPlayer: {
      [firstPlayer.id]: 0
    },
    nextPlayerNumber: 2
  };

  refreshRoomAnalytics(room, 0);
  return room;
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
  refreshRoomAnalytics(room, roomTimeMs(room, nowUnixMs));

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
    const result = applyPlayerAttack(
      room.snapshot,
      message.playerId,
      message.attack,
      nowMs
    );
    room.snapshot = result.snapshot;

    if (result.applied && result.damage > 0) {
      recordAnalyticsEvent(room, {
        type: "player_damage",
        atMs: nowMs,
        playerId: message.playerId,
        playerClass: player.class,
        damageType: PLAYER_ATTACK_DEFINITIONS[player.class][message.attack].damageType,
        damage: result.damage
      });
    }
  } else {
    player.class = message.playerClass;
    player.normalAttackReadyAtMs = nowMs;
    player.specialReadyAtMs = nowMs;
    room.snapshot = RaidSnapshotSchema.parse({
      ...room.snapshot,
      tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
    });
  }

  refreshRoomAnalytics(room, nowMs);
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
  refreshRoomAnalytics(room, roomTimeMs(room, nowUnixMs));
  return roomSession(room, update.playerId);
}

export function advanceRoomAuthority(
  room: RoomAuthorityState,
  nowUnixMs = Date.now()
): RaidSnapshot {
  if (room.snapshot.status === "active") {
    const nowMs = roomTimeMs(room, nowUnixMs);
    const before = room.snapshot;
    const result = advanceBoss(room.snapshot, nowMs);
    room.snapshot = result.snapshot;
    recordNewlyDownedPlayers(room, before, room.snapshot, nowMs);
  }

  refreshRoomAnalytics(room, roomTimeMs(room, nowUnixMs));
  return raidSnapshotMessage(room.snapshot).snapshot;
}

export async function adaptRoomStrategy(
  room: RoomAuthorityState,
  rawRequest: unknown,
  nowUnixMs = Date.now(),
  strategySelector: StrategyDecisionSelector = selectBossStrategyDecision
): Promise<RoomStrategyUpdate> {
  const request = RoomStrategyRequestSchema.parse(rawRequest);
  requirePlayer(room.snapshot, request.playerId);
  advanceRoomAuthority(room, nowUnixMs);

  const nowMs = roomTimeMs(room, nowUnixMs);
  const analytics = refreshRoomAnalytics(room, nowMs);

  if (
    room.snapshot.status === "active" &&
    canRequestStrategyDecision(room, nowMs)
  ) {
    room.lastStrategyDecisionAtMs = nowMs;
    const decision = await strategySelector(analytics, {
      createdAtMs: nowMs
    });
    room.lastStrategyDecision = decision;

    if (canApplyStrategyDecision(room, decision, nowMs)) {
      room.snapshot = setBossStrategy(room.snapshot, decision.strategy);
      room.strategyAdaptationCount += 1;
      room.lastStrategyAdaptationAtMs = nowMs;
      room.snapshot = RaidSnapshotSchema.parse({
        ...room.snapshot,
        tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
      });
      refreshRoomAnalytics(room, nowMs);
    }
  }

  return roomStrategyUpdate(room);
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

function roomStrategyUpdate(room: RoomAuthorityState): RoomStrategyUpdate {
  const analytics =
    room.lastAnalytics ?? summarizeRaidAnalytics(room.snapshot, room.analyticsEvents);

  return RoomStrategyUpdateSchema.parse({
    snapshot: raidSnapshotMessage(room.snapshot).snapshot,
    analytics,
    lastDecision: room.lastStrategyDecision,
    adaptationCount: room.strategyAdaptationCount
  });
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

function refreshRoomAnalytics(
  room: RoomAuthorityState,
  nowMs: number
): RaidAnalyticsSummary {
  room.analyticsEvents = pruneAnalyticsEvents(room.analyticsEvents, nowMs);
  room.lastAnalytics = summarizeRaidAnalytics(room.snapshot, room.analyticsEvents, {
    nowMs
  });
  return room.lastAnalytics;
}

function recordAnalyticsEvent(
  room: RoomAuthorityState,
  rawEvent: RaidAnalyticsEvent
) {
  const event = RaidAnalyticsEventSchema.parse(rawEvent);
  room.analyticsEvents = pruneAnalyticsEvents([...room.analyticsEvents, event], event.atMs);
}

function recordNewlyDownedPlayers(
  room: RoomAuthorityState,
  previous: RaidSnapshot,
  next: RaidSnapshot,
  nowMs: number
) {
  for (const player of next.players) {
    const previousPlayer = previous.players.find((candidate) => candidate.id === player.id);
    if (previousPlayer?.status === "alive" && player.status === "downed") {
      recordAnalyticsEvent(room, {
        type: "player_downed",
        atMs: nowMs,
        playerId: player.id
      });
    }
  }
}

function canRequestStrategyDecision(
  room: RoomAuthorityState,
  nowMs: number
): boolean {
  return (
    room.lastStrategyDecisionAtMs === undefined ||
    nowMs - room.lastStrategyDecisionAtMs >= GAME_LIMITS.ai.strategyDecisionCooldownMs
  );
}

function canApplyStrategyDecision(
  room: RoomAuthorityState,
  decision: BossStrategyDecision,
  nowMs: number
): boolean {
  if (room.snapshot.status !== "active") {
    return false;
  }

  if (decision.strategy === room.snapshot.boss.strategy) {
    return false;
  }

  if (room.strategyAdaptationCount >= GAME_LIMITS.ai.maxStrategyAdaptations) {
    return false;
  }

  return (
    room.lastStrategyAdaptationAtMs === undefined ||
    nowMs - room.lastStrategyAdaptationAtMs >= GAME_LIMITS.ai.strategyAdaptationCooldownMs
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
