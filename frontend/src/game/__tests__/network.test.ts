import { describe, expect, it } from "vitest";
import {
  BossStrategyDecisionSchema,
  GAME_LIMITS,
  RaidClientMessageSchema,
  RaidSnapshotMessageSchema
} from "@/game/schemas";
import {
  adaptRoomStrategy,
  applyRoomInput,
  applyRoomInputWithCriticalAuthority,
  createRoomSettlementSummary,
  createRoomAuthority,
  joinRoomAuthority,
  markRoomSettlement,
  recoverRoomAuthority,
  RoomAuthorityError,
  updateRoomProfile
} from "@/game/room-authority";

const hostProfile = {
  displayName: "Host",
  playerClass: "warrior" as const
};

const guestProfile = {
  displayName: "Guest",
  playerClass: "ranger" as const
};

const hostWallet = "11111111111111111111111111111112";
const guestWallet = "11111111111111111111111111111113";

describe("NET-001 room snapshots", () => {
  it("creates a room code and lets another player join the same raid", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "SYNC42",
      nowUnixMs: 10_000
    });
    const host = recoverRoomAuthority(room, room.snapshot.players[0].id, 10_000);
    const guest = joinRoomAuthority(room, guestProfile, 10_100);

    expect(host.roomCode).toBe("SYNC42");
    expect(guest.roomCode).toBe(host.roomCode);
    expect(guest.snapshot.raidId).toBe(host.snapshot.raidId);
    expect(guest.snapshot.players).toHaveLength(2);
    expect(guest.snapshot.boss.hp).toBe(host.snapshot.boss.hp);
  });

  it("allows live devnet roster joins before combat damage starts", () => {
    const room = createRoomAuthority(
      {
        ...hostProfile,
        wallet: hostWallet
      },
      {
        roomCode: "LIVEJN",
        nowUnixMs: 10_000
      }
    );
    room.authority = {
      ...room.authority,
      mode: "magicblock_live",
      combatAuthority: "magicblock_router"
    };

    const guest = joinRoomAuthority(
      room,
      {
        ...guestProfile,
        wallet: guestWallet
      },
      15_000
    );

    expect(guest.snapshot.players).toHaveLength(2);
    expect(guest.authority?.mode).toBe("magicblock_live");
  });

  it("validates client input before authoritative processing", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "INPUT7",
      nowUnixMs: 20_000
    });
    const playerId = room.snapshot.players[0].id;

    expect(() =>
      RaidClientMessageSchema.parse({
        type: "player_move",
        raidId: room.snapshot.raidId,
        playerId,
        direction: {
          x: 0.9,
          y: 0.9
        },
        clientSequence: 1,
        clientTimeMs: 0
      })
    ).toThrow();

    const snapshot = applyRoomInput(
      room,
      {
        type: "player_move",
        raidId: room.snapshot.raidId,
        playerId,
        direction: {
          x: 1,
          y: 0
        },
        clientSequence: 1,
        clientTimeMs: 0
      },
      20_120
    );

    expect(RaidSnapshotMessageSchema.parse({ type: "raid_snapshot", snapshot })).toBeTruthy();
    expect(snapshot.players[0].position.x).toBeGreaterThan(250);
    expect(snapshot.tick).toBeGreaterThan(0);
  });

  it("rejects stale input sequences", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "STALE7",
      nowUnixMs: 30_000
    });
    const playerId = room.snapshot.players[0].id;
    const input = {
      type: "player_attack",
      raidId: room.snapshot.raidId,
      playerId,
      attack: "normal",
      target: {
        targetType: "boss"
      },
      clientSequence: 2,
      clientTimeMs: 0
    } as const;

    room.snapshot.players[0].position = {
      x: room.snapshot.boss.position.x - 80,
      y: room.snapshot.boss.position.y
    };

    applyRoomInput(room, input, 30_100);

    expect(() => applyRoomInput(room, input, 30_200)).toThrow(RoomAuthorityError);
  });

  it("reconciles combat-critical attacks from a MagicBlock authority readback", async () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "MBLIVE",
      nowUnixMs: 60_000
    });
    const playerId = room.snapshot.players[0].id;
    room.snapshot.players[0].position = {
      x: room.snapshot.boss.position.x - 80,
      y: room.snapshot.boss.position.y
    };

    const snapshot = await applyRoomInputWithCriticalAuthority(
      room,
      {
        type: "player_attack",
        raidId: room.snapshot.raidId,
        playerId,
        attack: "normal",
        target: {
          targetType: "boss"
        },
        clientSequence: 1,
        clientTimeMs: 0
      },
      60_120,
      {
        applyPlayerHit: async (mutation) => ({
          mode: "magicblock_live",
          raidStatePda: room.authority.raidStatePda,
          transactionSignature:
            "5f6yXkC8qvMEJteREMsSDBqTNBR9yiU1Kw9h2XKkG9FqHcUsgQmXMS2xoT7WhGoYjZkEJpYkMc3PzKxXzYz3mVUp",
          lifecycle: "active",
          bossHp: 1_100,
          elapsedSeconds: mutation.elapsedDeltaSeconds,
          contributionDamage: [100]
        })
      }
    );

    expect(snapshot.boss.hp).toBe(1_100);
    expect(snapshot.players[0].contribution.damage).toBe(100);
    expect(room.authority.mode).toBe("magicblock_live");
    expect(room.authority.combatAuthority).toBe("magicblock_router");
  });
});

describe("AI-003 room strategy adaptation", () => {
  it("applies at most two validated strategy changes per raid", async () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "AIMODE",
      nowUnixMs: 100_000
    });
    const playerId = room.snapshot.players[0].id;
    const strategies = ["leap_to_ranged", "magic_resistance", "melee_retaliation"] as const;

    const first = await adaptRoomStrategy(
      room,
      { playerId },
      113_000,
      async (analytics, options) =>
        BossStrategyDecisionSchema.parse({
          raidId: analytics.raidId,
          strategy: strategies[0],
          reason: "Ranged damage is dominant.",
          confidence: 0.9,
          source: "llm",
          createdAtMs: options?.createdAtMs ?? analytics.generatedAtMs
        })
    );
    const second = await adaptRoomStrategy(
      room,
      { playerId },
      126_000,
      async (analytics, options) =>
        BossStrategyDecisionSchema.parse({
          raidId: analytics.raidId,
          strategy: strategies[1],
          reason: "Magic damage is dominant.",
          confidence: 0.9,
          source: "llm",
          createdAtMs: options?.createdAtMs ?? analytics.generatedAtMs
        })
    );
    const third = await adaptRoomStrategy(
      room,
      { playerId },
      139_000,
      async (analytics, options) =>
        BossStrategyDecisionSchema.parse({
          raidId: analytics.raidId,
          strategy: strategies[2],
          reason: "Melee damage is dominant.",
          confidence: 0.9,
          source: "llm",
          createdAtMs: options?.createdAtMs ?? analytics.generatedAtMs
        })
    );

    expect(first.snapshot.boss.strategy).toBe("leap_to_ranged");
    expect(second.snapshot.boss.strategy).toBe("magic_resistance");
    expect(third.snapshot.boss.strategy).toBe("magic_resistance");
    expect(third.adaptationCount).toBe(GAME_LIMITS.ai.maxStrategyAdaptations);
    expect(third.lastDecision?.strategy).toBe("melee_retaliation");
  });
});

describe("NET-002 reconnect recovery", () => {
  it("recovers the latest snapshot by room code and player id", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "BACK88",
      nowUnixMs: 40_000
    });
    const playerId = room.snapshot.players[0].id;

    room.snapshot.players[0].position = {
      x: room.snapshot.boss.position.x - 80,
      y: room.snapshot.boss.position.y
    };
    const afterHit = applyRoomInput(
      room,
      {
        type: "player_attack",
        raidId: room.snapshot.raidId,
        playerId,
        attack: "normal",
        target: {
          targetType: "boss"
        },
        clientSequence: 1,
        clientTimeMs: 0
      },
      40_100
    );

    const recovered = recoverRoomAuthority(room, playerId, 40_200);

    expect(recovered.snapshot.tick).toBeGreaterThanOrEqual(afterHit.tick);
    expect(recovered.snapshot.boss.hp).toBeLessThan(GAME_LIMITS.boss.maxHp);
  });

  it("updates wallet profile data without blocking room play", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "WALLET",
      nowUnixMs: 50_000
    });
    const playerId = room.snapshot.players[0].id;
    const wallet = "11111111111111111111111111111111";

    const updated = updateRoomProfile(room, {
      playerId,
      wallet
    });

    expect(updated.snapshot.players[0].wallet).toBe(wallet);

    const cleared = updateRoomProfile(room, {
      playerId,
      wallet: null
    });

    expect(cleared.snapshot.players[0].wallet).toBeUndefined();
  });
});

describe("SOL-003 room settlement summaries", () => {
  it("builds a bounded settlement summary from a terminal room", () => {
    const room = createRoomAuthority(
      {
        ...hostProfile,
        wallet: hostWallet
      },
      {
        roomCode: "SETTLE",
        nowUnixMs: 70_000
      }
    );
    joinRoomAuthority(
      room,
      {
        ...guestProfile,
        wallet: guestWallet
      },
      70_100
    );
    room.snapshot.status = "victory";
    room.snapshot.boss.hp = 0;
    room.snapshot.elapsedSeconds = 88;

    const summary = createRoomSettlementSummary(
      room,
      room.snapshot.players[0].id,
      hostWallet
    );

    expect(summary.result).toBe("victory");
    expect(summary.contributions).toHaveLength(2);
    expect(summary.contributions[0].wallet).toBe(hostWallet);
  });

  it("rejects settlement before terminal status or missing wallets", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "NOWALT",
      nowUnixMs: 80_000
    });

    expect(() =>
      createRoomSettlementSummary(room, room.snapshot.players[0].id, hostWallet)
    ).toThrow(RoomAuthorityError);

    room.snapshot.status = "timeout";
    room.snapshot.elapsedSeconds = GAME_LIMITS.raid.durationSeconds;

    expect(() =>
      createRoomSettlementSummary(room, room.snapshot.players[0].id, hostWallet)
    ).toThrow(RoomAuthorityError);
  });

  it("marks a terminal room settled after a successful submission", () => {
    const room = createRoomAuthority(
      {
        ...hostProfile,
        wallet: hostWallet
      },
      {
        roomCode: "DONE88",
        nowUnixMs: 90_000
      }
    );
    room.snapshot.status = "timeout";
    room.snapshot.elapsedSeconds = GAME_LIMITS.raid.durationSeconds;
    const summary = createRoomSettlementSummary(room, room.snapshot.players[0].id, hostWallet);

    const settlement = markRoomSettlement(room, {
      status: "local_verified",
      summary,
      settlementRecordPda: room.authority.settlementRecordPda,
      message: "Local settlement summary verified."
    });

    expect(settlement.status).toBe("local_verified");
    expect(room.snapshot.status).toBe("settled");
  });
});
