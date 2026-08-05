import { describe, expect, it } from "vitest";
import {
  BOSS_STRATEGIES,
  deriveRaidStatePda,
  MAGICBLOCK_DEVNET,
  RAID_SETTLEMENT_PROGRAM_ID,
  RAID_STATE_RULES,
  RAID_STATE_SEED,
  roomCodeToRaidId
} from "@/lib/magicblock";
import {
  BOSS_ATTACK_COOLDOWNS_MS,
  BossStrategyDecisionSchema,
  GAME_LIMITS,
  PLAYER_ATTACK_COOLDOWNS_MS,
  RaidAnalyticsSummarySchema,
  RaidClientMessageSchema,
  RaidSnapshotSchema,
  RaidSummarySchema,
  RoomStrategyUpdateSchema,
  SettlementSummarySchema
} from "@/game/schemas";

const walletAddress = RAID_SETTLEMENT_PROGRAM_ID.toBase58();

const contribution = {
  damage: 125,
  support: 10,
  survival: 50,
  objective: 5,
  total: 190
};

const position = {
  x: 400,
  y: 320
};

const bossAttackReadyAtMs = {
  cleave: 1_000,
  ground_slam: 1_500,
  leap: 2_000,
  arcane_shield: 2_500,
  marked_strike: 3_000
};

const playerState = {
  id: "player-1",
  wallet: walletAddress,
  displayName: "Demo Warrior",
  class: "warrior",
  status: "alive",
  hp: 120,
  maxHp: 120,
  position,
  facingRadians: 0,
  moveSpeed: 260,
  normalAttackReadyAtMs: 1_000,
  specialReadyAtMs: 8_000,
  contribution
};

describe("shared game schemas", () => {
  it("validates the minimal raid summary contract", () => {
    const summary = RaidSummarySchema.parse({
      raidId: "raid-demo",
      status: "active",
      playerCount: 4,
      bossHp: 1200,
      strategy: "area_denial",
      durationSeconds: 45
    });

    expect(summary.playerCount).toBe(4);
  });

  it("validates network-facing authoritative raid snapshots", () => {
    const snapshot = RaidSnapshotSchema.parse({
      raidId: "raid-demo",
      roomCode: "RAID42",
      status: "active",
      tick: 12,
      serverTimeMs: 10_000,
      elapsedSeconds: 45,
      players: [playerState],
      boss: {
        id: "boss-1",
        hp: 1_075,
        maxHp: GAME_LIMITS.boss.maxHp,
        phase: "phase_1",
        strategy: "area_denial",
        position: {
          x: GAME_LIMITS.arena.width / 2,
          y: GAME_LIMITS.arena.height / 2
        },
        attackReadyAtMs: bossAttackReadyAtMs,
        nextAttackReadyAtMs: 12_000
      },
      attacks: [
        {
          id: "attack-1",
          sourceId: "player-1",
          source: "player",
          kind: "normal",
          damageType: "melee",
          damage: 125,
          radius: 24,
          origin: position,
          target: {
            targetType: "boss"
          },
          startedAtMs: 10_000,
          expiresAtMs: 10_250
        }
      ]
    });

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.attacks[0].damage).toBeLessThanOrEqual(
      GAME_LIMITS.attacks.maxHitDamage
    );
  });

  it("rejects invalid movement and arena payloads", () => {
    expect(() =>
      RaidClientMessageSchema.parse({
        type: "player_move",
        raidId: "raid-demo",
        playerId: "player-1",
        direction: {
          x: 0.8,
          y: 0.8
        },
        clientSequence: 1,
        clientTimeMs: 10
      })
    ).toThrow();

    expect(() =>
      RaidSnapshotSchema.parse({
        raidId: "raid-demo",
        status: "active",
        tick: 1,
        serverTimeMs: 10,
        elapsedSeconds: 1,
        players: [
          {
            ...playerState,
            position: {
              x: GAME_LIMITS.arena.width + 1,
              y: 10
            }
          }
        ],
        boss: {
          id: "boss-1",
          hp: 1_200,
          maxHp: 1_200,
          phase: "phase_1",
          strategy: "area_denial",
          position,
          attackReadyAtMs: bossAttackReadyAtMs,
          nextAttackReadyAtMs: 100
        },
        attacks: []
      })
    ).toThrow();
  });

  it("validates AI-facing analytics and strategy decisions", () => {
    const analytics = RaidAnalyticsSummarySchema.parse({
      raidId: "raid-demo",
      generatedAtMs: 12_000,
      windowSeconds: 15,
      playerCount: 4,
      clusterScore: 0.72,
      averagePairwiseDistance: 180,
      damageByClass: {
        warrior: 220,
        ranger: 420,
        mage: 180
      },
      damageByType: {
        melee: 220,
        ranged: 420,
        magic: 180
      },
      healingEvents: 3,
      downedPlayers: 1,
      bossPhase: "phase_2",
      currentStrategy: "area_denial",
      timeRemainingSeconds: 90,
      dominantClass: "ranger",
      dominantDamageType: "ranged",
      signals: {
        clusteredPlayers: true,
        rangedDominance: true,
        magicDominance: false,
        frequentHealing: true,
        meleeDominance: false
      }
    });

    const decision = BossStrategyDecisionSchema.parse({
      raidId: analytics.raidId,
      strategy: "leap_to_ranged",
      reason: "Ranged damage is dominant in the recent combat window.",
      confidence: 0.84,
      source: "llm",
      createdAtMs: 12_100
    });

    expect(decision.strategy).toBe("leap_to_ranged");

    const strategyUpdate = RoomStrategyUpdateSchema.parse({
      snapshot: {
        raidId: "raid-demo",
        roomCode: "RAID42",
        status: "active",
        tick: 12,
        serverTimeMs: 10_000,
        elapsedSeconds: 45,
        players: [playerState],
        boss: {
          id: "boss-1",
          hp: 1_075,
          maxHp: GAME_LIMITS.boss.maxHp,
          phase: "phase_1",
          strategy: "leap_to_ranged",
          position: {
            x: GAME_LIMITS.arena.width / 2,
            y: GAME_LIMITS.arena.height / 2
          },
          attackReadyAtMs: bossAttackReadyAtMs,
          nextAttackReadyAtMs: 12_000
        },
        attacks: []
      },
      analytics,
      lastDecision: decision,
      adaptationCount: 1
    });

    expect(strategyUpdate.lastDecision?.source).toBe("llm");
  });

  it("validates settlement summaries and score bounds", () => {
    const settlement = SettlementSummarySchema.parse({
      raidId: "raid-demo",
      authority: walletAddress,
      result: "victory",
      durationSeconds: 118,
      bossFinalHp: 0,
      settledSlot: 123_456,
      transactionSignature:
        "5f6yXkC8qvMEJteREMsSDBqTNBR9yiU1Kw9h2XKkG9FqHcUsgQmXMS2xoT7WhGoYjZkEJpYkMc3PzKxXzYz3mVUp",
      contributions: [
        {
          playerId: "player-1",
          wallet: walletAddress,
          class: "warrior",
          ...contribution
        }
      ]
    });

    expect(settlement.contributions[0].total).toBe(190);

    expect(() =>
      SettlementSummarySchema.parse({
        ...settlement,
        contributions: [
          {
            ...settlement.contributions[0],
            damage: GAME_LIMITS.scoring.maxComponent + 1
          }
        ]
      })
    ).toThrow();
  });

  it("rejects unsupported boss strategies", () => {
    expect(() =>
      RaidSummarySchema.parse({
        raidId: "raid-demo",
        status: "active",
        playerCount: 4,
        bossHp: 1200,
        strategy: "rewrite_damage_values",
        durationSeconds: 45
      })
    ).toThrow();
  });

  it("pins MagicBlock devnet constants for APP-001", () => {
    expect(MAGICBLOCK_DEVNET.routerRpc).toBe("https://devnet-router.magicblock.app");
    expect(MAGICBLOCK_DEVNET.solanaDevnetRpc).toBe("https://api.devnet.solana.com");
    expect(MAGICBLOCK_DEVNET.asiaValidator).toBe(
      "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"
    );
    expect(BOSS_STRATEGIES).toContain("magic_resistance");
  });

  it("derives the compact RaidState PDA used by the MagicBlock spike", () => {
    const raidId = roomCodeToRaidId("LIVE42");
    const [raidStatePda, bump] = deriveRaidStatePda(raidId);
    const [secondDerivation] = deriveRaidStatePda(raidId, RAID_SETTLEMENT_PROGRAM_ID);
    const [differentRoom] = deriveRaidStatePda(roomCodeToRaidId("LIVE43"));

    expect(RAID_STATE_SEED).toBe("raid-state");
    expect(RAID_STATE_RULES).toMatchObject({
      bossMaxHp: 1200,
      durationSeconds: 180,
      maxHitDamage: 250,
      maxPlayers: 8
    });
    expect(GAME_LIMITS).toMatchObject({
      players: {
        minRaidStart: 2,
        max: 8
      },
      arena: {
        width: 1280,
        height: 720
      },
      raid: {
        durationSeconds: 180
      },
      scoring: {
        maxComponent: 10_000,
        maxTotal: 40_000
      }
    });
    expect(PLAYER_ATTACK_COOLDOWNS_MS.mage.special).toBeLessThanOrEqual(
      GAME_LIMITS.attacks.maxCooldownMs
    );
    expect(BOSS_ATTACK_COOLDOWNS_MS.arcane_shield).toBeLessThanOrEqual(
      GAME_LIMITS.attacks.maxCooldownMs
    );
    expect(raidStatePda.toBase58()).toBe(secondDerivation.toBase58());
    expect(raidStatePda.toBase58()).not.toBe(differentRoom.toBase58());
    expect(raidStatePda.toBase58()).not.toBe(RAID_SETTLEMENT_PROGRAM_ID.toBase58());
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });
});
