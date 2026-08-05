import {
  CreateRoomRequestSchema,
  GAME_LIMITS,
  JoinRoomRequestSchema,
  RaidAnalyticsEventSchema,
  RaidClientMessageSchema,
  RaidSnapshotMessageSchema,
  RaidSnapshotSchema,
  RoomAuthorityStatusSchema,
  RoomSettlementStatusSchema,
  RoomCodeSchema,
  RoomProfileUpdateRequestSchema,
  RoomStrategyRequestSchema,
  RoomStrategyUpdateSchema,
  SettlementSummarySchema,
  type BossStrategyDecision,
  type RoomAuthorityStatus,
  type RaidAnalyticsEvent,
  type RaidAnalyticsSummary,
  type PlayerState,
  type PlayerClass,
  type RaidClientMessage,
  type RaidResult,
  type RaidSnapshot,
  type RoomProfile,
  type RoomProfileUpdateRequest,
  type RoomSettlementStatus,
  type RoomSession,
  type RoomStrategyUpdate
} from "@/game/schemas";
import {
  advanceBoss,
  applyPlayerAttack,
  createLocalRaidSnapshot,
  getBossPhase,
  isTerminalRaidStatus,
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
import {
  deriveRaidStatePda,
  deriveSettlementRecordPda,
  raidIdBytesToHex,
  roomCodeToRaidId
} from "@/lib/magicblock";

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

export type CriticalCombatMutation = {
  roomCode: string;
  raidId: string;
  playerId: string;
  playerIndex: number;
  playerCount: number;
  playerWallet?: string;
  playerClass: PlayerClass;
  damage: number;
  elapsedDeltaSeconds: number;
  terminalResult?: RaidResult;
};

export type CriticalAuthorityReadback = {
  mode: "magicblock_live" | "local_fallback";
  raidStatePda: string;
  transactionSignature?: string;
  lifecycle?: "active" | "victory" | "timeout" | "defeat";
  bossHp?: number;
  elapsedSeconds?: number;
  contributionDamage?: number[];
  playerCount?: number;
  error?: string;
};

export type CriticalAuthorityAdapter = {
  applyPlayerHit: (mutation: CriticalCombatMutation) => Promise<CriticalAuthorityReadback>;
};

type RoomInputApplication = {
  snapshot: RaidSnapshot;
  criticalMutation?: CriticalCombatMutation;
};

export type RoomAuthorityState = {
  roomCode: string;
  createdAtUnixMs: number;
  snapshot: RaidSnapshot;
  authority: RoomAuthorityStatus;
  settlement: RoomSettlementStatus;
  analyticsEvents: RaidAnalyticsEvent[];
  lastAnalytics?: RaidAnalyticsSummary;
  lastStrategyDecision?: BossStrategyDecision;
  strategyAdaptationCount: number;
  lastStrategyDecisionAtMs?: number;
  lastStrategyAdaptationAtMs?: number;
  lastInputSequenceByPlayer: Record<string, number>;
  lastMoveAtMsByPlayer: Record<string, number>;
  lastCriticalElapsedSeconds: number;
  nextPlayerNumber: number;
};

export type OnChainRoomRosterState = {
  raidStatePda: string;
  settlementRecordPda: string;
  raidIdHex: string;
  delegated: boolean;
  lifecycle: "active" | "victory" | "timeout" | "defeat";
  bossHp: number;
  bossMaxHp: number;
  playerCount: number;
  elapsedSeconds: number;
  strategy: RaidSnapshot["boss"]["strategy"];
  players: Array<{
    wallet: string;
    class: PlayerClass;
    contributionDamage: number;
  }>;
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

export function ensureRoomRuntimeState(room: RoomAuthorityState): RoomAuthorityState {
  room.authority = RoomAuthorityStatusSchema.parse(
    room.authority ??
      createFallbackAuthorityStatus(room.roomCode, room.snapshot.players.length)
  );
  room.settlement = RoomSettlementStatusSchema.parse(
    room.settlement ?? {
      status: "idle",
      authority: room.authority
    }
  );
  room.lastCriticalElapsedSeconds =
    room.lastCriticalElapsedSeconds ?? room.snapshot.elapsedSeconds;

  return room;
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
    authority: createFallbackAuthorityStatus(roomCode, snapshot.players.length),
    settlement: RoomSettlementStatusSchema.parse({
      status: "idle",
      authority: createFallbackAuthorityStatus(roomCode, snapshot.players.length)
    }),
    analyticsEvents: [],
    strategyAdaptationCount: 0,
    lastInputSequenceByPlayer: {},
    lastMoveAtMsByPlayer: {
      [firstPlayer.id]: 0
    },
    lastCriticalElapsedSeconds: 0,
    nextPlayerNumber: 2
  };

  refreshRoomAnalytics(room, 0);
  return room;
}

export function createRoomAuthorityFromOnChain(
  roomCode: string,
  chainState: OnChainRoomRosterState,
  nowUnixMs = Date.now()
): RoomAuthorityState {
  if (chainState.players.length === 0) {
    throw new RoomAuthorityError(
      "room_roster_empty",
      "On-chain room roster is empty.",
      409
    );
  }

  const snapshot = createLocalRaidSnapshot(chainState.players[0].class);
  snapshot.raidId = `raid-${roomCode}`;
  snapshot.roomCode = roomCode;
  snapshot.players = chainState.players.map((player, index) => {
    const localPlayer = createRoomPlayer(roomCode, index + 1, {
      displayName: `Raider ${index + 1}`,
      playerClass: player.class,
      wallet: player.wallet
    });
    localPlayer.contribution = setContributionDamage(
      localPlayer.contribution,
      player.contributionDamage
    );
    return localPlayer;
  });
  snapshot.boss.hp = clampInteger(chainState.bossHp, 0, chainState.bossMaxHp);
  snapshot.boss.maxHp = chainState.bossMaxHp;
  snapshot.boss.phase = getBossPhase(snapshot.boss.hp, snapshot.boss.maxHp);
  snapshot.boss.strategy = chainState.strategy;
  snapshot.serverTimeMs = chainState.elapsedSeconds * 1_000;
  snapshot.elapsedSeconds = chainState.elapsedSeconds;
  snapshot.tick = 0;
  snapshot.status = chainLifecycleToStatus(chainState.lifecycle);

  const authority = RoomAuthorityStatusSchema.parse({
    mode: "magicblock_live",
    movementAuthority: "room_server",
    combatAuthority: "magicblock_router",
    raidIdHex: chainState.raidIdHex,
    raidStatePda: chainState.raidStatePda,
    settlementRecordPda: chainState.settlementRecordPda,
    playerCount: chainState.playerCount,
    lastReconciledAtMs: snapshot.serverTimeMs
  });
  const room: RoomAuthorityState = {
    roomCode,
    createdAtUnixMs: nowUnixMs - snapshot.serverTimeMs,
    snapshot: RaidSnapshotSchema.parse(snapshot),
    authority,
    settlement: RoomSettlementStatusSchema.parse({
      status: "idle",
      authority
    }),
    analyticsEvents: [],
    strategyAdaptationCount: 0,
    lastInputSequenceByPlayer: {},
    lastMoveAtMsByPlayer: Object.fromEntries(
      snapshot.players.map((player) => [player.id, snapshot.serverTimeMs])
    ),
    lastCriticalElapsedSeconds: snapshot.elapsedSeconds,
    nextPlayerNumber: snapshot.players.length + 1
  };

  refreshRoomAnalytics(room, snapshot.serverTimeMs);
  return room;
}

export function cloneRoomAuthority(room: RoomAuthorityState): RoomAuthorityState {
  return ensureRoomRuntimeState(structuredClone(room) as RoomAuthorityState);
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

  if (room.authority.mode === "magicblock_live" && roomCombatHasStarted(room)) {
    throw new RoomAuthorityError(
      "live_raid_started",
      "Live devnet raid already started.",
      409
    );
  }

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
  return applyRoomInputInternal(room, rawMessage, nowUnixMs).snapshot;
}

export async function applyRoomInputWithCriticalAuthority(
  room: RoomAuthorityState,
  rawMessage: unknown,
  nowUnixMs = Date.now(),
  criticalAuthority?: CriticalAuthorityAdapter
): Promise<RaidSnapshot> {
  const application = applyRoomInputInternal(room, rawMessage, nowUnixMs);

  if (application.criticalMutation && criticalAuthority) {
    try {
      const readback = await criticalAuthority.applyPlayerHit(application.criticalMutation);
      reconcileCriticalAuthorityReadback(room, readback, roomTimeMs(room, nowUnixMs));
    } catch (error) {
      reconcileCriticalAuthorityReadback(
        room,
        {
          ...createFallbackAuthorityReadback(
            application.criticalMutation.roomCode,
            application.criticalMutation.playerCount
          ),
          error: error instanceof Error ? error.message : "MagicBlock authority failed."
        },
        roomTimeMs(room, nowUnixMs)
      );
    }
  }

  return raidSnapshotMessage(room.snapshot, room.authority).snapshot;
}

function applyRoomInputInternal(
  room: RoomAuthorityState,
  rawMessage: unknown,
  nowUnixMs = Date.now()
): RoomInputApplication {
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
  let criticalMutation: CriticalCombatMutation | undefined;

  if (message.type === "player_move") {
    const lastMoveAtMs = room.lastMoveAtMsByPlayer[message.playerId] ?? nowMs;
    const deltaMs = Math.min(
      MAX_MOVE_DELTA_MS,
      Math.max(DEFAULT_MOVE_DELTA_MS, nowMs - lastMoveAtMs)
    );
    room.snapshot = movePlayer(room.snapshot, message.playerId, message.direction, deltaMs);
    room.lastMoveAtMsByPlayer[message.playerId] = nowMs;
  } else if (message.type === "player_attack") {
    const playerIndex = room.snapshot.players.findIndex(
      (candidate) => candidate.id === message.playerId
    );
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

      criticalMutation = {
        roomCode: room.roomCode,
        raidId: room.snapshot.raidId,
        playerId: message.playerId,
        playerIndex,
        playerCount: room.snapshot.players.length,
        playerWallet: player.wallet,
        playerClass: player.class,
        damage: result.damage,
        elapsedDeltaSeconds: Math.max(
          0,
          room.snapshot.elapsedSeconds - room.lastCriticalElapsedSeconds
        ),
        terminalResult: statusToRaidResult(room.snapshot.status)
      };
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
  return {
    snapshot: raidSnapshotMessage(room.snapshot, room.authority).snapshot,
    criticalMutation
  };
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
  return raidSnapshotMessage(room.snapshot, room.authority).snapshot;
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

export function createRoomSettlementSummary(
  room: RoomAuthorityState,
  playerId: string,
  authority: string
) {
  requirePlayer(room.snapshot, playerId);

  if (room.settlement.summary && room.snapshot.status === "settled") {
    return room.settlement.summary;
  }

  const result = statusToRaidResult(room.snapshot.status);
  if (!result) {
    throw new RoomAuthorityError(
      "raid_not_terminal",
      "Raid must end before settlement.",
      409
    );
  }

  const missingWallet = room.snapshot.players.find((player) => !player.wallet);
  if (missingWallet) {
    throw new RoomAuthorityError(
      "wallets_required",
      "Every raider needs a wallet before settlement.",
      409
    );
  }

  return SettlementSummarySchema.parse({
    raidId: room.snapshot.raidId,
    authority,
    result,
    durationSeconds: room.snapshot.elapsedSeconds,
    bossFinalHp: room.snapshot.boss.hp,
    contributions: room.snapshot.players.map((player) => ({
      playerId: player.id,
      wallet: player.wallet,
      class: player.class,
      ...player.contribution
    }))
  });
}

export function markRoomSettlement(
  room: RoomAuthorityState,
  rawSettlement: RoomSettlementStatus
): RoomSettlementStatus {
  const settlement = RoomSettlementStatusSchema.parse({
    ...rawSettlement,
    authority: rawSettlement.authority ?? room.authority
  });
  room.settlement = settlement;

  if (
    (settlement.status === "success" || settlement.status === "local_verified") &&
    isTerminalRaidStatus(room.snapshot.status) &&
    room.snapshot.status !== "settled"
  ) {
    room.snapshot = RaidSnapshotSchema.parse({
      ...room.snapshot,
      status: "settled",
      tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
    });
  }

  return settlement;
}

export function raidSnapshotMessage(
  snapshot: RaidSnapshot,
  authority?: RoomAuthorityStatus
) {
  return RaidSnapshotMessageSchema.parse({
    type: "raid_snapshot",
    snapshot,
    authority
  });
}

function roomSession(room: RoomAuthorityState, playerId: string): RoomSession {
  return {
    roomCode: room.roomCode,
    playerId,
    snapshot: raidSnapshotMessage(room.snapshot, room.authority).snapshot,
    authority: room.authority
  };
}

function roomStrategyUpdate(room: RoomAuthorityState): RoomStrategyUpdate {
  const analytics =
    room.lastAnalytics ?? summarizeRaidAnalytics(room.snapshot, room.analyticsEvents);

  return RoomStrategyUpdateSchema.parse({
    snapshot: raidSnapshotMessage(room.snapshot, room.authority).snapshot,
    authority: room.authority,
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

function createFallbackAuthorityStatus(
  roomCode = "DEMO00",
  playerCount: number = GAME_LIMITS.players.min,
  error?: string
): RoomAuthorityStatus {
  const raidId = roomCodeToRaidId(roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);

  return RoomAuthorityStatusSchema.parse({
    mode: "local_fallback",
    movementAuthority: "room_server",
    combatAuthority: "room_server",
    raidIdHex: raidIdBytesToHex(raidId),
    raidStatePda: raidStatePda.toBase58(),
    settlementRecordPda: settlementRecordPda.toBase58(),
    playerCount,
    ...(error ? { lastError: truncateMessage(error) } : {})
  });
}

function createFallbackAuthorityReadback(
  roomCode = "DEMO00",
  playerCount: number = GAME_LIMITS.players.min,
  error?: string
): CriticalAuthorityReadback {
  const fallback = createFallbackAuthorityStatus(roomCode, playerCount);

  return {
    mode: "local_fallback",
    raidStatePda: fallback.raidStatePda,
    playerCount,
    error
  };
}

function reconcileCriticalAuthorityReadback(
  room: RoomAuthorityState,
  readback: CriticalAuthorityReadback,
  nowMs: number
) {
  const raidId = roomCodeToRaidId(room.roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);
  const mode = readback.error ? "local_fallback" : readback.mode;

  room.authority = RoomAuthorityStatusSchema.parse({
    mode,
    movementAuthority: "room_server",
    combatAuthority: mode === "magicblock_live" ? "magicblock_router" : "room_server",
    raidIdHex: raidIdBytesToHex(raidId),
    raidStatePda: readback.raidStatePda,
    settlementRecordPda: settlementRecordPda.toBase58(),
    playerCount: readback.playerCount ?? room.snapshot.players.length,
    lastReconciledAtMs: nowMs,
    ...(readback.transactionSignature ? { lastSignature: readback.transactionSignature } : {}),
    ...(readback.error ? { lastError: truncateMessage(readback.error) } : {})
  });

  if (mode !== "magicblock_live") {
    return;
  }

  if (readback.bossHp !== undefined) {
    room.snapshot.boss.hp = clampInteger(readback.bossHp, 0, room.snapshot.boss.maxHp);
    room.snapshot.boss.phase = getBossPhase(room.snapshot.boss.hp, room.snapshot.boss.maxHp);
  }

  if (readback.elapsedSeconds !== undefined) {
    room.snapshot.elapsedSeconds = clampInteger(
      readback.elapsedSeconds,
      0,
      GAME_LIMITS.raid.durationSeconds
    );
    room.lastCriticalElapsedSeconds = room.snapshot.elapsedSeconds;
  }

  if (readback.contributionDamage) {
    for (const [index, damage] of readback.contributionDamage.entries()) {
      const player = room.snapshot.players[index];
      if (!player) {
        continue;
      }
      player.contribution = setContributionDamage(player.contribution, damage);
    }
  }

  const nextStatus = lifecycleToStatus(readback.lifecycle);
  if (nextStatus) {
    room.snapshot.status = nextStatus;
  }

  room.snapshot = RaidSnapshotSchema.parse({
    ...room.snapshot,
    tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, room.snapshot.tick + 1)
  });
  refreshRoomAnalytics(room, nowMs);
}

function statusToRaidResult(status: RaidSnapshot["status"]): RaidResult | undefined {
  if (status === "victory" || status === "defeat" || status === "timeout") {
    return status;
  }

  return undefined;
}

function lifecycleToStatus(
  lifecycle: CriticalAuthorityReadback["lifecycle"]
): RaidSnapshot["status"] | undefined {
  if (lifecycle === "victory" || lifecycle === "defeat" || lifecycle === "timeout") {
    return lifecycle;
  }

  return undefined;
}

function chainLifecycleToStatus(
  lifecycle: OnChainRoomRosterState["lifecycle"]
): RaidSnapshot["status"] {
  return lifecycle === "active" ? "active" : lifecycle;
}

function roomCombatHasStarted(room: RoomAuthorityState): boolean {
  return (
    room.snapshot.boss.hp < room.snapshot.boss.maxHp ||
    room.snapshot.players.some((player) => player.contribution.damage > 0) ||
    room.snapshot.status !== "active"
  );
}

function setContributionDamage(
  contribution: PlayerState["contribution"],
  damage: number
): PlayerState["contribution"] {
  const nextDamage = clampInteger(damage, 0, GAME_LIMITS.scoring.maxComponent);
  const total = clampInteger(
    nextDamage + contribution.support + contribution.survival + contribution.objective,
    0,
    GAME_LIMITS.scoring.maxTotal
  );

  return {
    ...contribution,
    damage: nextDamage,
    total
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(Math.min(max, Math.max(min, value)));
}

function truncateMessage(message: string, maxLength = 180) {
  return message.length <= maxLength ? message : `${message.slice(0, maxLength - 3)}...`;
}
