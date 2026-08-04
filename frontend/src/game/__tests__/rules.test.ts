import { describe, expect, it } from "vitest";
import { GAME_LIMITS, type PlayerAttackKind, type PlayerClass } from "@/game/schemas";
import {
  applyPlayerAttack,
  createLocalRaidSnapshot,
  distance,
  movePlayer,
  PLAYER_ATTACK_DEFINITIONS
} from "@/game/rules";

const PLAYER_ID = "player-1";

describe("GAME-002 movement and authoritative snapshots", () => {
  it("moves the player and clamps movement to arena bounds", () => {
    const snapshot = createLocalRaidSnapshot("warrior");
    snapshot.players[0].position = {
      x: 4,
      y: 4
    };

    const moved = movePlayer(
      snapshot,
      PLAYER_ID,
      {
        x: -1,
        y: -1
      },
      2_000
    );

    expect(moved.players[0].position).toEqual({
      x: 0,
      y: 0
    });
    expect(moved.tick).toBe(snapshot.tick + 1);
    expect(snapshot.players[0].position).toEqual({
      x: 4,
      y: 4
    });
  });

  it("keeps the visual client contract as snapshots instead of scene-owned state", () => {
    const snapshot = createLocalRaidSnapshot("ranger");

    expect(snapshot.players[0]).toMatchObject({
      id: PLAYER_ID,
      class: "ranger",
      status: "alive"
    });
    expect(snapshot.boss).toMatchObject({
      id: "boss-1",
      hp: GAME_LIMITS.boss.maxHp,
      phase: "phase_1",
      strategy: "area_denial"
    });
    expect(snapshot.boss.attackReadyAtMs).toHaveProperty("ground_slam");
  });
});

describe("GAME-003 class attacks and specials", () => {
  it.each([
    ["warrior", "normal"],
    ["warrior", "special"],
    ["ranger", "normal"],
    ["ranger", "special"],
    ["mage", "normal"],
    ["mage", "special"]
  ] satisfies Array<[PlayerClass, PlayerAttackKind]>)(
    "applies deterministic %s %s damage and cooldowns",
    (playerClass, attack) => {
      const snapshot = createLocalRaidSnapshot(playerClass);
      const definition = PLAYER_ATTACK_DEFINITIONS[playerClass][attack];
      snapshot.players[0].position = {
        x: snapshot.boss.position.x - definition.range + 8,
        y: snapshot.boss.position.y
      };

      const result = applyPlayerAttack(snapshot, PLAYER_ID, attack, 1_000);
      const updatedPlayer = result.snapshot.players[0];
      const readyAtMs =
        attack === "normal"
          ? updatedPlayer.normalAttackReadyAtMs
          : updatedPlayer.specialReadyAtMs;

      expect(result.applied).toBe(true);
      expect(result.damage).toBe(definition.damage);
      expect(result.snapshot.boss.hp).toBe(GAME_LIMITS.boss.maxHp - definition.damage);
      expect(readyAtMs).toBe(1_000 + definition.cooldownMs);
      expect(result.snapshot.attacks[0]).toMatchObject({
        source: "player",
        kind: attack,
        damageType: definition.damageType,
        damage: definition.damage
      });
    }
  );

  it("enforces attack cooldowns and range bounds", () => {
    const snapshot = createLocalRaidSnapshot("warrior");
    snapshot.players[0].position = {
      x: snapshot.boss.position.x - PLAYER_ATTACK_DEFINITIONS.warrior.normal.range + 4,
      y: snapshot.boss.position.y
    };

    const first = applyPlayerAttack(snapshot, PLAYER_ID, "normal", 1_000);
    const second = applyPlayerAttack(first.snapshot, PLAYER_ID, "normal", 1_001);

    expect(first.applied).toBe(true);
    expect(second).toMatchObject({
      applied: false,
      reason: "cooldown",
      damage: 0
    });

    const farAway = createLocalRaidSnapshot("warrior");
    farAway.players[0].position = {
      x: 0,
      y: 0
    };

    const outOfRange = applyPlayerAttack(farAway, PLAYER_ID, "special", 10_000);

    expect(distance(farAway.players[0].position, farAway.boss.position)).toBeGreaterThan(
      PLAYER_ATTACK_DEFINITIONS.warrior.special.range
    );
    expect(outOfRange).toMatchObject({
      applied: false,
      reason: "out_of_range",
      damage: 0
    });
  });
});
