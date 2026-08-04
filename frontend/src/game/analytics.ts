import {
  GAME_LIMITS,
  RaidAnalyticsEventSchema,
  RaidAnalyticsSummarySchema,
  type DamageType,
  type PlayerClass,
  type RaidAnalyticsEvent,
  type RaidAnalyticsSummary,
  type RaidSnapshot
} from "@/game/schemas";

export type RaidAnalyticsOptions = {
  nowMs?: number;
  windowSeconds?: number;
};

const EMPTY_DAMAGE_BY_CLASS = {
  warrior: 0,
  ranger: 0,
  mage: 0
} as const satisfies Record<PlayerClass, number>;

const EMPTY_DAMAGE_BY_TYPE = {
  melee: 0,
  ranged: 0,
  magic: 0
} as const satisfies Record<DamageType, number>;

const DOMINANCE_THRESHOLD = 0.45;
const CLUSTER_DISTANCE = 260;
const FREQUENT_HEALING_EVENTS = 2;

export function summarizeRaidAnalytics(
  snapshot: RaidSnapshot,
  events: readonly RaidAnalyticsEvent[] = [],
  options: RaidAnalyticsOptions = {}
): RaidAnalyticsSummary {
  const nowMs = options.nowMs ?? snapshot.serverTimeMs;
  const windowSeconds = Math.min(
    GAME_LIMITS.raid.maxRecentWindowSeconds,
    Math.max(1, options.windowSeconds ?? GAME_LIMITS.raid.maxRecentWindowSeconds)
  );
  const windowStartMs = Math.max(0, nowMs - windowSeconds * 1000);
  const recentEvents = events
    .map((event) => RaidAnalyticsEventSchema.parse(event))
    .filter((event) => event.atMs >= windowStartMs && event.atMs <= nowMs);
  const damageByClass = { ...EMPTY_DAMAGE_BY_CLASS };
  const damageByType = { ...EMPTY_DAMAGE_BY_TYPE };
  let healingEvents = 0;

  for (const event of recentEvents) {
    if (event.type === "player_damage") {
      damageByClass[event.playerClass] += event.damage;
      damageByType[event.damageType] += event.damage;
    } else if (event.type === "player_heal") {
      healingEvents += 1;
    }
  }

  const totalDamage = sumValues(damageByType);
  const dominantClass = chooseDominantKey(damageByClass, totalDamage);
  const dominantDamageType = chooseDominantKey(damageByType, totalDamage);
  const averagePairwiseDistance = calculateAveragePairwiseDistance(snapshot);
  const clusterScore =
    snapshot.players.length < 2
      ? 0
      : clamp(1 - averagePairwiseDistance / CLUSTER_DISTANCE, 0, 1);

  return RaidAnalyticsSummarySchema.parse({
    raidId: snapshot.raidId,
    generatedAtMs: nowMs,
    windowSeconds,
    playerCount: snapshot.players.length,
    clusterScore,
    averagePairwiseDistance,
    damageByClass,
    damageByType,
    healingEvents,
    downedPlayers: snapshot.players.filter((player) => player.status === "downed").length,
    bossPhase: snapshot.boss.phase,
    currentStrategy: snapshot.boss.strategy,
    timeRemainingSeconds: Math.max(
      0,
      GAME_LIMITS.raid.durationSeconds - snapshot.elapsedSeconds
    ),
    dominantClass,
    dominantDamageType,
    signals: {
      clusteredPlayers: clusterScore >= 0.62,
      rangedDominance:
        dominantDamageType === "ranged" &&
        damageByType.ranged >= totalDamage * DOMINANCE_THRESHOLD,
      magicDominance:
        dominantDamageType === "magic" &&
        damageByType.magic >= totalDamage * DOMINANCE_THRESHOLD,
      frequentHealing: healingEvents >= FREQUENT_HEALING_EVENTS,
      meleeDominance:
        dominantDamageType === "melee" &&
        damageByType.melee >= totalDamage * DOMINANCE_THRESHOLD
    }
  });
}

export function pruneAnalyticsEvents(
  events: readonly RaidAnalyticsEvent[],
  nowMs: number
): RaidAnalyticsEvent[] {
  const oldestAllowedMs =
    nowMs - GAME_LIMITS.raid.maxRecentWindowSeconds * 1000 - 1_000;

  return events
    .filter((event) => event.atMs >= oldestAllowedMs)
    .slice(-GAME_LIMITS.attacks.maxActiveAttacks * 4);
}

function calculateAveragePairwiseDistance(snapshot: RaidSnapshot): number {
  const alivePlayers = snapshot.players.filter((player) => player.status === "alive");
  if (alivePlayers.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let pairs = 0;

  for (let outer = 0; outer < alivePlayers.length; outer += 1) {
    for (let inner = outer + 1; inner < alivePlayers.length; inner += 1) {
      totalDistance += Math.hypot(
        alivePlayers[outer].position.x - alivePlayers[inner].position.x,
        alivePlayers[outer].position.y - alivePlayers[inner].position.y
      );
      pairs += 1;
    }
  }

  return clamp(totalDistance / Math.max(1, pairs), 0, GAME_LIMITS.arena.width);
}

function chooseDominantKey<T extends string>(
  values: Record<T, number>,
  total: number
): T | null {
  if (total <= 0) {
    return null;
  }

  const [winner, amount] = Object.entries(values).sort(
    (first, second) => Number(second[1]) - Number(first[1])
  )[0] as [T, number];

  return amount >= total * DOMINANCE_THRESHOLD ? winner : null;
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
