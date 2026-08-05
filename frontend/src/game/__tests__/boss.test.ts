import { describe, expect, it } from "vitest";
import { GAME_LIMITS } from "@/game/schemas";
import {
  advanceBoss,
  applyBossAttack,
  applyPlayerAttack,
  BOSS_ATTACK_DEFINITIONS,
  chooseBossAttack,
  createLocalRaidSnapshot,
  getBossPhase,
  MAGIC_SHIELD_DAMAGE_MULTIPLIER,
  PLAYER_ATTACK_DEFINITIONS,
  setBossStrategy
} from "@/game/rules";

const PLAYER_ID = "player-1";

describe("GAME-004 boss phases and attacks", () => {
  it("derives three deterministic HP-based boss phases", () => {
    expect(getBossPhase(GAME_LIMITS.boss.maxHp)).toBe("phase_1");
    expect(getBossPhase(Math.floor(GAME_LIMITS.boss.maxHp * 0.66))).toBe("phase_2");
    expect(getBossPhase(Math.floor(GAME_LIMITS.boss.maxHp * 0.33))).toBe("phase_3");
    expect(getBossPhase(0)).toBe("phase_3");
  });

  it("lets strategy influence attack preference without changing damage constants", () => {
    const snapshot = createLocalRaidSnapshot("mage");
    snapshot.boss.attackReadyAtMs = {
      cleave: 0,
      ground_slam: 0,
      leap: 0,
      arcane_shield: 0,
      marked_strike: 0
    };

    const areaDenial = setBossStrategy(snapshot, "area_denial");
    const magicResistance = setBossStrategy(snapshot, "magic_resistance");

    expect(chooseBossAttack(areaDenial, 2_000)).toBe("ground_slam");
    expect(chooseBossAttack(magicResistance, 2_000)).toBe("arcane_shield");
    expect(BOSS_ATTACK_DEFINITIONS.ground_slam.damage).toBe(17);
    expect(BOSS_ATTACK_DEFINITIONS.arcane_shield.damage).toBe(0);
  });

  it("applies cleave damage and phase-adjusted cooldowns", () => {
    const snapshot = createLocalRaidSnapshot("warrior");
    snapshot.boss.hp = 300;
    snapshot.boss.phase = "phase_3";
    snapshot.boss.attackReadyAtMs.cleave = 0;
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - 80,
      y: snapshot.boss.position.y
    };

    const result = applyBossAttack(snapshot, "cleave", 5_000);

    expect(result).toMatchObject({
      applied: true,
      kind: "cleave",
      damage: BOSS_ATTACK_DEFINITIONS.cleave.damage,
      targetPlayerId: PLAYER_ID
    });
    expect(result.snapshot.players[0].hp).toBe(
      GAME_LIMITS.player.maxHp - BOSS_ATTACK_DEFINITIONS.cleave.damage
    );
    expect(result.snapshot.boss.attackReadyAtMs.cleave).toBe(
      5_000 + Math.round(BOSS_ATTACK_DEFINITIONS.cleave.cooldownMs * 0.68)
    );
  });

  it("supports all required boss attacks through deterministic application", () => {
    const attackKinds = [
      "cleave",
      "ground_slam",
      "leap",
      "arcane_shield",
      "marked_strike"
    ] as const;

    for (const kind of attackKinds) {
      const snapshot = createLocalRaidSnapshot("ranger");
      snapshot.boss.attackReadyAtMs[kind] = 0;
      snapshot.players[0].position = {
        x: snapshot.boss.position.x - 90,
        y: snapshot.boss.position.y
      };

      const result = applyBossAttack(snapshot, kind, 3_000);

      expect(result.applied).toBe(true);
      expect(result.snapshot.attacks[0]).toMatchObject({
        source: "boss",
        kind
      });
    }
  });

  it("uses arcane shield as a deterministic magic resistance effect", () => {
    const snapshot = createLocalRaidSnapshot("mage", "magic_resistance");
    snapshot.boss.attackReadyAtMs.arcane_shield = 0;
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - PLAYER_ATTACK_DEFINITIONS.mage.special.range + 8,
      y: snapshot.boss.position.y
    };

    const shielded = applyBossAttack(snapshot, "arcane_shield", 1_000);
    const playerAttack = applyPlayerAttack(shielded.snapshot, PLAYER_ID, "special", 1_100);

    expect(shielded.snapshot.boss.activeShieldUntilMs).toBeGreaterThan(1_100);
    expect(playerAttack.damage).toBe(
      Math.floor(
        PLAYER_ATTACK_DEFINITIONS.mage.special.damage * MAGIC_SHIELD_DAMAGE_MULTIPLIER
      )
    );
  });

  it("advances boss behaviour using strategy, phase, and cooldown readiness", () => {
    const snapshot = createLocalRaidSnapshot("ranger", "leap_to_ranged");
    snapshot.boss.hp = Math.floor(GAME_LIMITS.boss.maxHp * 0.5);
    snapshot.boss.attackReadyAtMs = {
      cleave: 10_000,
      ground_slam: 10_000,
      leap: 0,
      arcane_shield: 10_000,
      marked_strike: 10_000
    };
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - 420,
      y: snapshot.boss.position.y
    };

    const result = advanceBoss(snapshot, 2_000);

    expect(result).toMatchObject({
      applied: true,
      kind: "leap"
    });
    expect(result.snapshot.boss.phase).toBe("phase_2");
  });
});
