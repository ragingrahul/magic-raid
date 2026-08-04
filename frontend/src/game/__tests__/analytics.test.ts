import { describe, expect, it } from "vitest";
import { type RaidAnalyticsEvent } from "@/game/schemas";
import { summarizeRaidAnalytics } from "@/game/analytics";
import { createLocalRaidSnapshot } from "@/game/rules";

describe("AI-001 raid analytics summary", () => {
  it("detects clustered players and dominant ranged damage in the recent window", () => {
    const snapshot = createLocalRaidSnapshot("ranger");
    snapshot.serverTimeMs = 20_000;
    snapshot.players = [
      snapshot.players[0],
      {
        ...snapshot.players[0],
        id: "player-2",
        displayName: "Archer",
        class: "ranger",
        position: {
          x: snapshot.players[0].position.x + 40,
          y: snapshot.players[0].position.y + 30
        }
      },
      {
        ...snapshot.players[0],
        id: "player-3",
        displayName: "Guard",
        class: "warrior",
        position: {
          x: snapshot.players[0].position.x + 80,
          y: snapshot.players[0].position.y
        }
      }
    ];

    const events = [
      damageEvent("player-1", "ranger", "ranged", 120, 19_000),
      damageEvent("player-2", "ranger", "ranged", 110, 19_200),
      damageEvent("player-3", "warrior", "melee", 40, 19_300),
      damageEvent("player-3", "warrior", "melee", 200, 1_000)
    ];

    const analytics = summarizeRaidAnalytics(snapshot, events, {
      nowMs: 20_000,
      windowSeconds: 15
    });

    expect(analytics.signals.clusteredPlayers).toBe(true);
    expect(analytics.signals.rangedDominance).toBe(true);
    expect(analytics.dominantClass).toBe("ranger");
    expect(analytics.dominantDamageType).toBe("ranged");
    expect(analytics.damageByType.melee).toBe(40);
    expect(analytics.damageByClass.warrior).toBe(40);
  });

  it("detects magic, melee, and frequent healing signals deterministically", () => {
    const snapshot = createLocalRaidSnapshot("mage");
    snapshot.serverTimeMs = 10_000;

    const magic = summarizeRaidAnalytics(
      snapshot,
      [
        damageEvent("player-1", "mage", "magic", 180, 9_000),
        damageEvent("player-2", "warrior", "melee", 20, 9_100)
      ],
      { nowMs: 10_000 }
    );
    const melee = summarizeRaidAnalytics(
      snapshot,
      [
        damageEvent("player-1", "warrior", "melee", 160, 9_000),
        damageEvent("player-2", "mage", "magic", 20, 9_100)
      ],
      { nowMs: 10_000 }
    );
    const healing = summarizeRaidAnalytics(
      snapshot,
      [
        {
          type: "player_heal",
          atMs: 9_000,
          playerId: "player-1",
          amount: 24
        },
        {
          type: "player_heal",
          atMs: 9_500,
          playerId: "player-1",
          amount: 18
        }
      ],
      { nowMs: 10_000 }
    );

    expect(magic.signals.magicDominance).toBe(true);
    expect(melee.signals.meleeDominance).toBe(true);
    expect(healing.signals.frequentHealing).toBe(true);
    expect(healing.healingEvents).toBe(2);
  });
});

function damageEvent(
  playerId: string,
  playerClass: "warrior" | "ranger" | "mage",
  damageType: "melee" | "ranged" | "magic",
  damage: number,
  atMs: number
): RaidAnalyticsEvent {
  return {
    type: "player_damage",
    atMs,
    playerId,
    playerClass,
    damageType,
    damage
  };
}
