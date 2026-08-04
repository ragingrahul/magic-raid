import { describe, expect, it } from "vitest";
import { GAME_LIMITS } from "@/game/schemas";
import {
  applyBossAttack,
  applyPlayerAttack,
  createLocalRaidSnapshot,
  movePlayer,
  PLAYER_ATTACK_DEFINITIONS,
  setBossStrategy
} from "@/game/rules";

const PLAYER_ID = "player-1";

describe("GAME-005 contribution scoring and terminal states", () => {
  it("finalizes bounded damage, survival, support, and objective scores on victory", () => {
    const snapshot = createLocalRaidSnapshot("mage");
    snapshot.boss.hp = PLAYER_ATTACK_DEFINITIONS.mage.special.damage;
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - PLAYER_ATTACK_DEFINITIONS.mage.special.range + 8,
      y: snapshot.boss.position.y
    };

    const result = applyPlayerAttack(snapshot, PLAYER_ID, "special", 5_000);
    const contribution = result.snapshot.players[0].contribution;

    expect(result.snapshot.status).toBe("victory");
    expect(contribution.damage).toBe(PLAYER_ATTACK_DEFINITIONS.mage.special.damage);
    expect(contribution.support).toBeGreaterThanOrEqual(0);
    expect(contribution.survival).toBeGreaterThan(0);
    expect(contribution.objective).toBeGreaterThan(0);
    expect(contribution.total).toBe(
      contribution.damage + contribution.support + contribution.survival + contribution.objective
    );
    expect(contribution.total).toBeLessThanOrEqual(GAME_LIMITS.scoring.maxTotal);
  });

  it("reaches defeat when all players are downed", () => {
    const snapshot = createLocalRaidSnapshot("warrior");
    snapshot.players[0].hp = 1;
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - 40,
      y: snapshot.boss.position.y
    };
    snapshot.boss.attackReadyAtMs.cleave = 0;

    const result = applyBossAttack(snapshot, "cleave", 1_000);

    expect(result.snapshot.status).toBe("defeat");
    expect(result.snapshot.players[0]).toMatchObject({
      hp: 0,
      status: "downed"
    });
    expect(result.snapshot.players[0].contribution.survival).toBe(0);
  });

  it("reaches timeout at the raid duration limit", () => {
    const snapshot = createLocalRaidSnapshot("ranger");

    const result = movePlayer(
      snapshot,
      PLAYER_ID,
      {
        x: 1,
        y: 0
      },
      GAME_LIMITS.raid.durationSeconds * 1000
    );

    expect(result.status).toBe("timeout");
    expect(result.elapsedSeconds).toBe(GAME_LIMITS.raid.durationSeconds);
    expect(result.players[0].contribution.objective).toBeGreaterThan(0);
  });

  it("does not allow normal gameplay helpers to change finalized raid state", () => {
    const snapshot = createLocalRaidSnapshot("mage");
    snapshot.boss.hp = PLAYER_ATTACK_DEFINITIONS.mage.normal.damage;
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - PLAYER_ATTACK_DEFINITIONS.mage.normal.range + 8,
      y: snapshot.boss.position.y
    };

    const victory = applyPlayerAttack(snapshot, PLAYER_ID, "normal", 1_000).snapshot;
    const afterStrategy = setBossStrategy(victory, "magic_resistance");
    const afterBoss = applyBossAttack(victory, "marked_strike", 2_000);

    expect(victory.status).toBe("victory");
    expect(afterStrategy.boss.strategy).toBe(victory.boss.strategy);
    expect(afterBoss).toMatchObject({
      applied: false,
      reason: "raid_not_active"
    });
    expect(afterBoss.snapshot.status).toBe("victory");
  });
});
