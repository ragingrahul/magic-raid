import { z } from "zod";

export const GAME_LIMITS = {
  players: {
    min: 1,
    minRaidStart: 2,
    demoMax: 4,
    max: 8
  },
  arena: {
    width: 1280,
    height: 720
  },
  raid: {
    durationSeconds: 180,
    maxRecentWindowSeconds: 30
  },
  boss: {
    maxHp: 1200,
    phaseTwoHpPercent: 0.66,
    phaseThreeHpPercent: 0.33
  },
  player: {
    maxHp: 160,
    maxMoveSpeed: 360
  },
  attacks: {
    maxHitDamage: 250,
    maxActiveAttacks: 32,
    maxCooldownMs: 30_000
  },
  scoring: {
    maxComponent: 10_000,
    maxTotal: 40_000
  },
  networking: {
    maxInputSequence: 1_000_000,
    maxSnapshotTick: 1_000_000
  }
} as const;

export const PLAYER_ATTACK_COOLDOWNS_MS = {
  warrior: {
    normal: 650,
    special: 8_000
  },
  ranger: {
    normal: 500,
    special: 7_500
  },
  mage: {
    normal: 800,
    special: 9_000
  }
} as const;

export const BOSS_ATTACK_COOLDOWNS_MS = {
  cleave: 1_800,
  ground_slam: 4_500,
  leap: 5_500,
  arcane_shield: 12_000,
  marked_strike: 7_000
} as const;

export const PlayerClassSchema = z.enum(["warrior", "ranger", "mage"]);
export const PLAYER_CLASSES = PlayerClassSchema.options;

export const RaidStatusSchema = z.enum([
  "lobby",
  "active",
  "victory",
  "defeat",
  "timeout",
  "settled"
]);

export const RaidResultSchema = z.enum(["victory", "defeat", "timeout"]);

export const BossStrategySchema = z.enum([
  "area_denial",
  "leap_to_ranged",
  "magic_resistance",
  "focus_healer",
  "melee_retaliation"
]);
export const BOSS_STRATEGIES = BossStrategySchema.options;

export const BossPhaseSchema = z.enum(["phase_1", "phase_2", "phase_3"]);

export const PlayerCombatStatusSchema = z.enum(["alive", "downed", "reviving"]);

export const DamageTypeSchema = z.enum(["melee", "ranged", "magic"]);

export const PlayerAttackKindSchema = z.enum(["normal", "special"]);

export const BossAttackKindSchema = z.enum([
  "cleave",
  "ground_slam",
  "leap",
  "arcane_shield",
  "marked_strike"
]);
export const BOSS_ATTACK_KINDS = BossAttackKindSchema.options;

export const EntityIdSchema = z.string().trim().min(1).max(64);

export const RoomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{4,8}$/);

export const SolanaAddressSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

export const RoomDisplayNameSchema = z.string().trim().min(1).max(32);

export const PositionSchema = z
  .object({
    x: z.number().finite().min(0).max(GAME_LIMITS.arena.width),
    y: z.number().finite().min(0).max(GAME_LIMITS.arena.height)
  })
  .strict();

export const DirectionSchema = z
  .object({
    x: z.number().finite().min(-1).max(1),
    y: z.number().finite().min(-1).max(1)
  })
  .strict()
  .refine((direction) => Math.hypot(direction.x, direction.y) <= 1, {
    message: "movement direction must be normalized"
  });

export const PlayerContributionSchema = z
  .object({
    damage: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    support: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    survival: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    objective: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    total: z.number().int().min(0).max(GAME_LIMITS.scoring.maxTotal)
  })
  .strict();

export const PlayerStateSchema = z
  .object({
    id: EntityIdSchema,
    wallet: SolanaAddressSchema.optional(),
    displayName: z.string().trim().min(1).max(32),
    class: PlayerClassSchema,
    status: PlayerCombatStatusSchema,
    hp: z.number().int().min(0).max(GAME_LIMITS.player.maxHp),
    maxHp: z.number().int().min(1).max(GAME_LIMITS.player.maxHp),
    position: PositionSchema,
    facingRadians: z.number().finite().min(-Math.PI).max(Math.PI),
    moveSpeed: z.number().int().min(0).max(GAME_LIMITS.player.maxMoveSpeed),
    normalAttackReadyAtMs: z.number().int().min(0),
    specialReadyAtMs: z.number().int().min(0),
    contribution: PlayerContributionSchema
  })
  .strict();

export const BossStateSchema = z
  .object({
    id: EntityIdSchema,
    hp: z.number().int().min(0).max(GAME_LIMITS.boss.maxHp),
    maxHp: z.number().int().min(1).max(GAME_LIMITS.boss.maxHp),
    phase: BossPhaseSchema,
    strategy: BossStrategySchema,
    position: PositionSchema,
    activeShieldUntilMs: z.number().int().min(0).optional(),
    attackReadyAtMs: z
      .object({
        cleave: z.number().int().min(0),
        ground_slam: z.number().int().min(0),
        leap: z.number().int().min(0),
        arcane_shield: z.number().int().min(0),
        marked_strike: z.number().int().min(0)
      })
      .strict(),
    nextAttackReadyAtMs: z.number().int().min(0)
  })
  .strict();

export const AttackTargetSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("boss")
    })
    .strict(),
  z
    .object({
      targetType: z.literal("player"),
      playerId: EntityIdSchema
    })
    .strict(),
  z
    .object({
      targetType: z.literal("position"),
      position: PositionSchema
    })
    .strict()
]);

export const PlayerAttackIntentSchema = z
  .object({
    type: z.literal("player_attack"),
    raidId: EntityIdSchema,
    playerId: EntityIdSchema,
    attack: PlayerAttackKindSchema,
    target: AttackTargetSchema,
    clientSequence: z.number().int().min(0).max(GAME_LIMITS.networking.maxInputSequence),
    clientTimeMs: z.number().int().min(0)
  })
  .strict();

export const PlayerMoveIntentSchema = z
  .object({
    type: z.literal("player_move"),
    raidId: EntityIdSchema,
    playerId: EntityIdSchema,
    direction: DirectionSchema,
    clientSequence: z.number().int().min(0).max(GAME_LIMITS.networking.maxInputSequence),
    clientTimeMs: z.number().int().min(0)
  })
  .strict();

export const PlayerReadyIntentSchema = z
  .object({
    type: z.literal("player_ready"),
    raidId: EntityIdSchema,
    playerId: EntityIdSchema,
    playerClass: PlayerClassSchema
  })
  .strict();

export const RaidClientMessageSchema = z.discriminatedUnion("type", [
  PlayerAttackIntentSchema,
  PlayerMoveIntentSchema,
  PlayerReadyIntentSchema
]);

export const AttackEventSchema = z
  .object({
    id: EntityIdSchema,
    sourceId: EntityIdSchema,
    source: z.enum(["player", "boss"]),
    kind: z.union([PlayerAttackKindSchema, BossAttackKindSchema]),
    damageType: DamageTypeSchema.optional(),
    damage: z.number().int().min(0).max(GAME_LIMITS.attacks.maxHitDamage),
    radius: z.number().int().min(0).max(GAME_LIMITS.arena.width),
    origin: PositionSchema,
    target: AttackTargetSchema,
    startedAtMs: z.number().int().min(0),
    expiresAtMs: z.number().int().min(0)
  })
  .strict();

export const RaidSnapshotSchema = z
  .object({
    raidId: EntityIdSchema,
    roomCode: RoomCodeSchema.optional(),
    status: RaidStatusSchema,
    tick: z.number().int().min(0).max(GAME_LIMITS.networking.maxSnapshotTick),
    serverTimeMs: z.number().int().min(0),
    elapsedSeconds: z.number().int().min(0).max(GAME_LIMITS.raid.durationSeconds),
    players: z
      .array(PlayerStateSchema)
      .min(GAME_LIMITS.players.min)
      .max(GAME_LIMITS.players.max),
    boss: BossStateSchema,
    attacks: z.array(AttackEventSchema).max(GAME_LIMITS.attacks.maxActiveAttacks)
  })
  .strict();

export const RaidSnapshotMessageSchema = z
  .object({
    type: z.literal("raid_snapshot"),
    snapshot: RaidSnapshotSchema
  })
  .strict();

export const RaidErrorMessageSchema = z
  .object({
    type: z.literal("raid_error"),
    raidId: EntityIdSchema.optional(),
    code: z.string().trim().min(1).max(48),
    message: z.string().trim().min(1).max(160)
  })
  .strict();

export const RaidServerMessageSchema = z.discriminatedUnion("type", [
  RaidSnapshotMessageSchema,
  RaidErrorMessageSchema
]);

export const RoomProfileSchema = z
  .object({
    displayName: RoomDisplayNameSchema,
    playerClass: PlayerClassSchema,
    wallet: SolanaAddressSchema.optional()
  })
  .strict();

export const CreateRoomRequestSchema = RoomProfileSchema;

export const JoinRoomRequestSchema = RoomProfileSchema.extend({
  roomCode: RoomCodeSchema
}).strict();

export const RoomProfileUpdateRequestSchema = z
  .object({
    playerId: EntityIdSchema,
    displayName: RoomDisplayNameSchema.optional(),
    playerClass: PlayerClassSchema.optional(),
    wallet: SolanaAddressSchema.nullable().optional()
  })
  .strict();

export const RoomSessionSchema = z
  .object({
    roomCode: RoomCodeSchema,
    playerId: EntityIdSchema,
    snapshot: RaidSnapshotSchema
  })
  .strict();

export const DamageByClassSchema = z
  .object({
    warrior: z.number().int().min(0),
    ranger: z.number().int().min(0),
    mage: z.number().int().min(0)
  })
  .strict();

export const DamageByTypeSchema = z
  .object({
    melee: z.number().int().min(0),
    ranged: z.number().int().min(0),
    magic: z.number().int().min(0)
  })
  .strict();

export const RaidAnalyticsSummarySchema = z
  .object({
    raidId: EntityIdSchema,
    generatedAtMs: z.number().int().min(0),
    windowSeconds: z
      .number()
      .int()
      .min(1)
      .max(GAME_LIMITS.raid.maxRecentWindowSeconds),
    playerCount: z
      .number()
      .int()
      .min(GAME_LIMITS.players.min)
      .max(GAME_LIMITS.players.max),
    clusterScore: z.number().finite().min(0).max(1),
    averagePairwiseDistance: z.number().finite().min(0).max(GAME_LIMITS.arena.width),
    damageByClass: DamageByClassSchema,
    damageByType: DamageByTypeSchema,
    healingEvents: z.number().int().min(0),
    downedPlayers: z.number().int().min(0).max(GAME_LIMITS.players.max),
    bossPhase: BossPhaseSchema,
    currentStrategy: BossStrategySchema,
    timeRemainingSeconds: z.number().int().min(0).max(GAME_LIMITS.raid.durationSeconds),
    dominantClass: PlayerClassSchema.nullable(),
    dominantDamageType: DamageTypeSchema.nullable()
  })
  .strict();

export const BossStrategyDecisionSchema = z
  .object({
    raidId: EntityIdSchema,
    strategy: BossStrategySchema,
    reason: z.string().trim().min(1).max(280),
    confidence: z.number().finite().min(0).max(1),
    source: z.enum(["llm", "fallback"]),
    createdAtMs: z.number().int().min(0)
  })
  .strict();

export const SettlementContributionSchema = z
  .object({
    playerId: EntityIdSchema,
    wallet: SolanaAddressSchema,
    class: PlayerClassSchema,
    damage: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    support: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    survival: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    objective: z.number().int().min(0).max(GAME_LIMITS.scoring.maxComponent),
    total: z.number().int().min(0).max(GAME_LIMITS.scoring.maxTotal)
  })
  .strict();

export const SettlementSummarySchema = z
  .object({
    raidId: EntityIdSchema,
    authority: SolanaAddressSchema,
    result: RaidResultSchema,
    durationSeconds: z.number().int().min(0).max(GAME_LIMITS.raid.durationSeconds),
    bossFinalHp: z.number().int().min(0).max(GAME_LIMITS.boss.maxHp),
    settledSlot: z.number().int().min(0).optional(),
    transactionSignature: z.string().trim().min(64).max(128).optional(),
    contributions: z
      .array(SettlementContributionSchema)
      .min(GAME_LIMITS.players.min)
      .max(GAME_LIMITS.players.max)
  })
  .strict();

export const RaidSummarySchema = z
  .object({
    raidId: EntityIdSchema,
    status: RaidStatusSchema,
    playerCount: z
      .number()
      .int()
      .min(GAME_LIMITS.players.minRaidStart)
      .max(GAME_LIMITS.players.max),
    bossHp: z.number().int().min(0).max(GAME_LIMITS.boss.maxHp),
    strategy: BossStrategySchema,
    durationSeconds: z.number().int().min(0).max(GAME_LIMITS.raid.durationSeconds)
  })
  .strict();

export type GameLimits = typeof GAME_LIMITS;
export type PlayerClass = z.infer<typeof PlayerClassSchema>;
export type RaidStatus = z.infer<typeof RaidStatusSchema>;
export type RaidResult = z.infer<typeof RaidResultSchema>;
export type BossStrategy = z.infer<typeof BossStrategySchema>;
export type BossPhase = z.infer<typeof BossPhaseSchema>;
export type PlayerCombatStatus = z.infer<typeof PlayerCombatStatusSchema>;
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type PlayerAttackKind = z.infer<typeof PlayerAttackKindSchema>;
export type BossAttackKind = z.infer<typeof BossAttackKindSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type PlayerContribution = z.infer<typeof PlayerContributionSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type BossState = z.infer<typeof BossStateSchema>;
export type AttackTarget = z.infer<typeof AttackTargetSchema>;
export type PlayerAttackIntent = z.infer<typeof PlayerAttackIntentSchema>;
export type PlayerMoveIntent = z.infer<typeof PlayerMoveIntentSchema>;
export type PlayerReadyIntent = z.infer<typeof PlayerReadyIntentSchema>;
export type RaidClientMessage = z.infer<typeof RaidClientMessageSchema>;
export type AttackEvent = z.infer<typeof AttackEventSchema>;
export type RaidSnapshot = z.infer<typeof RaidSnapshotSchema>;
export type RaidServerMessage = z.infer<typeof RaidServerMessageSchema>;
export type RoomProfile = z.infer<typeof RoomProfileSchema>;
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type RoomProfileUpdateRequest = z.infer<typeof RoomProfileUpdateRequestSchema>;
export type RoomSession = z.infer<typeof RoomSessionSchema>;
export type RaidAnalyticsSummary = z.infer<typeof RaidAnalyticsSummarySchema>;
export type BossStrategyDecision = z.infer<typeof BossStrategyDecisionSchema>;
export type SettlementContribution = z.infer<typeof SettlementContributionSchema>;
export type SettlementSummary = z.infer<typeof SettlementSummarySchema>;
export type RaidSummary = z.infer<typeof RaidSummarySchema>;
