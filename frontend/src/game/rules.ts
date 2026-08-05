import {
  BOSS_ATTACK_COOLDOWNS_MS,
  BOSS_ATTACK_KINDS,
  GAME_LIMITS,
  PLAYER_ATTACK_COOLDOWNS_MS,
  type AttackEvent,
  type BossAttackKind,
  type BossPhase,
  type BossStrategy,
  type DamageType,
  type PlayerAttackKind,
  type PlayerClass,
  type PlayerContribution,
  type Position,
  type RaidStatus,
  type RaidSnapshot
} from "@/game/schemas";

export type RuleFailureReason =
  | "raid_not_active"
  | "player_not_found"
  | "player_downed"
  | "boss_defeated"
  | "cooldown"
  | "out_of_range"
  | "no_target";

export type PlayerAttackResult = {
  snapshot: RaidSnapshot;
  applied: boolean;
  damage: number;
  reason?: RuleFailureReason;
};

export type BossAttackResult = {
  snapshot: RaidSnapshot;
  applied: boolean;
  kind?: BossAttackKind;
  damage: number;
  targetPlayerId?: string;
  reason?: RuleFailureReason;
};

export type PlayerAttackDefinition = {
  damage: number;
  range: number;
  radius: number;
  cooldownMs: number;
  damageType: DamageType;
  indicatorDurationMs: number;
};

export type BossAttackDefinition = {
  damage: number;
  range: number;
  radius: number;
  cooldownMs: number;
  indicatorDurationMs: number;
  shieldDurationMs?: number;
};

export const TERMINAL_RAID_STATUSES = ["victory", "defeat", "timeout", "settled"] as const;

export const PLAYER_ATTACK_DEFINITIONS: Record<
  PlayerClass,
  Record<PlayerAttackKind, PlayerAttackDefinition>
> = {
  warrior: {
    normal: {
      damage: 34,
      range: 92,
      radius: 34,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.warrior.normal,
      damageType: "melee",
      indicatorDurationMs: 180
    },
    special: {
      damage: 112,
      range: 122,
      radius: 54,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.warrior.special,
      damageType: "melee",
      indicatorDurationMs: 300
    }
  },
  ranger: {
    normal: {
      damage: 24,
      range: 430,
      radius: 18,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.ranger.normal,
      damageType: "ranged",
      indicatorDurationMs: 220
    },
    special: {
      damage: 78,
      range: 500,
      radius: 88,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.ranger.special,
      damageType: "ranged",
      indicatorDurationMs: 420
    }
  },
  mage: {
    normal: {
      damage: 38,
      range: 320,
      radius: 28,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.mage.normal,
      damageType: "magic",
      indicatorDurationMs: 260
    },
    special: {
      damage: 118,
      range: 280,
      radius: 116,
      cooldownMs: PLAYER_ATTACK_COOLDOWNS_MS.mage.special,
      damageType: "magic",
      indicatorDurationMs: 520
    }
  }
};

export const BOSS_ATTACK_DEFINITIONS: Record<BossAttackKind, BossAttackDefinition> = {
  cleave: {
    damage: 11,
    range: 132,
    radius: 86,
    cooldownMs: BOSS_ATTACK_COOLDOWNS_MS.cleave,
    indicatorDurationMs: 320
  },
  ground_slam: {
    damage: 17,
    range: 280,
    radius: 156,
    cooldownMs: BOSS_ATTACK_COOLDOWNS_MS.ground_slam,
    indicatorDurationMs: 560
  },
  leap: {
    damage: 14,
    range: 560,
    radius: 92,
    cooldownMs: BOSS_ATTACK_COOLDOWNS_MS.leap,
    indicatorDurationMs: 480
  },
  arcane_shield: {
    damage: 0,
    range: 0,
    radius: 138,
    cooldownMs: BOSS_ATTACK_COOLDOWNS_MS.arcane_shield,
    indicatorDurationMs: 720,
    shieldDurationMs: 4_000
  },
  marked_strike: {
    damage: 23,
    range: 420,
    radius: 42,
    cooldownMs: BOSS_ATTACK_COOLDOWNS_MS.marked_strike,
    indicatorDurationMs: 520
  }
};

export const BOSS_STRATEGY_ATTACK_PRIORITY = {
  area_denial: ["ground_slam", "cleave", "marked_strike", "leap", "arcane_shield"],
  leap_to_ranged: ["leap", "marked_strike", "cleave", "ground_slam", "arcane_shield"],
  magic_resistance: ["arcane_shield", "marked_strike", "cleave", "ground_slam", "leap"],
  focus_healer: ["marked_strike", "leap", "cleave", "ground_slam", "arcane_shield"],
  melee_retaliation: ["cleave", "ground_slam", "marked_strike", "leap", "arcane_shield"]
} as const satisfies Record<BossStrategy, readonly BossAttackKind[]>;

export const BOSS_PHASE_COOLDOWN_MULTIPLIER = {
  phase_1: 1,
  phase_2: 0.82,
  phase_3: 0.68
} as const satisfies Record<BossPhase, number>;

export const MAGIC_SHIELD_DAMAGE_MULTIPLIER = 0.5;

const PLAYER_ID = "player-1";
const BOSS_ID = "boss-1";

export function createBossAttackReadyAtMs(readyAtMs = 1_200): Record<BossAttackKind, number> {
  return {
    cleave: readyAtMs,
    ground_slam: readyAtMs + 900,
    leap: readyAtMs + 1_600,
    arcane_shield: readyAtMs + 2_200,
    marked_strike: readyAtMs + 2_800
  };
}

export function createLocalRaidSnapshot(
  playerClass: PlayerClass = "warrior",
  strategy: BossStrategy = "area_denial"
): RaidSnapshot {
  return {
    raidId: "local-raid",
    roomCode: "RAID42",
    status: "active",
    tick: 0,
    serverTimeMs: 0,
    elapsedSeconds: 0,
    players: [
      {
        id: PLAYER_ID,
        displayName: "Raider",
        class: playerClass,
        status: "alive",
        hp: GAME_LIMITS.player.maxHp,
        maxHp: GAME_LIMITS.player.maxHp,
        position: {
          x: 260,
          y: GAME_LIMITS.arena.height / 2
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
      }
    ],
    boss: {
      id: BOSS_ID,
      hp: GAME_LIMITS.boss.maxHp,
      maxHp: GAME_LIMITS.boss.maxHp,
      phase: "phase_1",
      strategy,
      position: {
        x: GAME_LIMITS.arena.width * 0.66,
        y: GAME_LIMITS.arena.height / 2
      },
      attackReadyAtMs: createBossAttackReadyAtMs(),
      nextAttackReadyAtMs: 1_200
    },
    attacks: []
  };
}

export function getBossPhase(
  hp: number,
  maxHp: number = GAME_LIMITS.boss.maxHp
): BossPhase {
  const hpPercent = maxHp === 0 ? 0 : hp / maxHp;

  if (hpPercent <= GAME_LIMITS.boss.phaseThreeHpPercent) {
    return "phase_3";
  }

  if (hpPercent <= GAME_LIMITS.boss.phaseTwoHpPercent) {
    return "phase_2";
  }

  return "phase_1";
}

export function movePlayer(
  snapshot: RaidSnapshot,
  playerId: string,
  direction: Position,
  deltaMs: number
): RaidSnapshot {
  const next = cloneSnapshot(snapshot);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player || player.status !== "alive" || next.status !== "active") {
    return next;
  }

  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return next;
  }

  const normalized = {
    x: direction.x / Math.max(1, length),
    y: direction.y / Math.max(1, length)
  };
  const deltaSeconds = Math.max(0, deltaMs) / 1000;

  player.position = {
    x: clamp(
      player.position.x + normalized.x * player.moveSpeed * deltaSeconds,
      0,
      GAME_LIMITS.arena.width
    ),
    y: clamp(
      player.position.y + normalized.y * player.moveSpeed * deltaSeconds,
      0,
      GAME_LIMITS.arena.height
    )
  };
  player.facingRadians = Math.atan2(normalized.y, normalized.x);

  return advanceClock(next, deltaMs);
}

export function applyPlayerAttack(
  snapshot: RaidSnapshot,
  playerId: string,
  attack: PlayerAttackKind,
  nowMs: number
): PlayerAttackResult {
  const next = cloneSnapshot(snapshot);

  if (next.status !== "active") {
    return { snapshot: next, applied: false, damage: 0, reason: "raid_not_active" };
  }

  if (next.boss.hp === 0) {
    return { snapshot: next, applied: false, damage: 0, reason: "boss_defeated" };
  }

  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return { snapshot: next, applied: false, damage: 0, reason: "player_not_found" };
  }

  if (player.status !== "alive") {
    return { snapshot: next, applied: false, damage: 0, reason: "player_downed" };
  }

  const readyAtMs = attack === "normal" ? player.normalAttackReadyAtMs : player.specialReadyAtMs;
  if (nowMs < readyAtMs) {
    return { snapshot: next, applied: false, damage: 0, reason: "cooldown" };
  }

  const definition = PLAYER_ATTACK_DEFINITIONS[player.class][attack];
  if (distance(player.position, next.boss.position) > definition.range) {
    return { snapshot: next, applied: false, damage: 0, reason: "out_of_range" };
  }

  const shieldedMagic =
    definition.damageType === "magic" &&
    next.boss.activeShieldUntilMs !== undefined &&
    nowMs < next.boss.activeShieldUntilMs;
  const proposedDamage = shieldedMagic
    ? Math.floor(definition.damage * MAGIC_SHIELD_DAMAGE_MULTIPLIER)
    : definition.damage;
  const damage = Math.min(
    Math.min(proposedDamage, GAME_LIMITS.attacks.maxHitDamage),
    next.boss.hp
  );

  next.boss.hp -= damage;
  next.boss.phase = getBossPhase(next.boss.hp, next.boss.maxHp);
  player.contribution = addContributionDamage(player.contribution, damage);

  if (attack === "normal") {
    player.normalAttackReadyAtMs = nowMs + definition.cooldownMs;
  } else {
    player.specialReadyAtMs = nowMs + definition.cooldownMs;
  }

  next.attacks = appendAttackEvent(next, {
    id: `attack-${next.tick + 1}-${playerId}-${attack}`,
    sourceId: playerId,
    source: "player",
    kind: attack,
    damageType: definition.damageType,
    damage,
    radius: definition.radius,
    origin: player.position,
    target: {
      targetType: "boss"
    },
    startedAtMs: nowMs,
    expiresAtMs: nowMs + definition.indicatorDurationMs
  });

  if (next.boss.hp === 0) {
    next.status = "victory";
  }

  return { snapshot: tick(next, nowMs), applied: true, damage };
}

export function advanceBoss(snapshot: RaidSnapshot, nowMs: number): BossAttackResult {
  const phased = cloneSnapshot(snapshot);
  phased.boss.phase = getBossPhase(phased.boss.hp, phased.boss.maxHp);

  const kind = chooseBossAttack(phased, nowMs);
  if (!kind) {
    return { snapshot: pruneExpiredAttacks(tick(phased, nowMs), nowMs), applied: false, damage: 0 };
  }

  return applyBossAttack(phased, kind, nowMs);
}

export function applyBossAttack(
  snapshot: RaidSnapshot,
  kind: BossAttackKind,
  nowMs: number
): BossAttackResult {
  const next = cloneSnapshot(snapshot);

  if (next.status !== "active") {
    return { snapshot: next, applied: false, damage: 0, reason: "raid_not_active" };
  }

  if (next.boss.hp === 0) {
    return { snapshot: next, applied: false, damage: 0, reason: "boss_defeated" };
  }

  if (nowMs < next.boss.attackReadyAtMs[kind]) {
    return { snapshot: next, applied: false, damage: 0, reason: "cooldown" };
  }

  const definition = BOSS_ATTACK_DEFINITIONS[kind];
  const target = chooseBossTarget(next, kind);

  if (kind !== "arcane_shield" && !target) {
    return { snapshot: next, applied: false, damage: 0, reason: "no_target" };
  }

  const eventOrigin = { ...next.boss.position };
  let damage = 0;
  let targetPlayerId: string | undefined;

  if (kind === "arcane_shield") {
    next.boss.activeShieldUntilMs = nowMs + (definition.shieldDurationMs ?? 0);
  } else if (target) {
    targetPlayerId = target.id;

    if (kind === "leap") {
      next.boss.position = pointToward(target.position, next.boss.position, 86);
    }

    const attackCenter = kind === "ground_slam" ? centroid(next.players) : target.position;
    const targets =
      kind === "ground_slam"
        ? next.players.filter((player) => distance(player.position, attackCenter) <= definition.radius)
        : [target];

    for (const player of targets) {
      if (player.status !== "alive") {
        continue;
      }

      const canHit =
        kind === "marked_strike" ||
        distance(next.boss.position, player.position) <= Math.max(definition.range, definition.radius);

      if (!canHit) {
        continue;
      }

      const dealt = Math.min(definition.damage, player.hp);
      player.hp -= dealt;
      damage += dealt;

      if (player.hp === 0) {
        player.status = "downed";
      }
    }
  }

  const cooldownMs = Math.round(
    definition.cooldownMs * BOSS_PHASE_COOLDOWN_MULTIPLIER[next.boss.phase]
  );
  next.boss.attackReadyAtMs[kind] = nowMs + cooldownMs;
  next.boss.nextAttackReadyAtMs = Math.min(
    ...BOSS_ATTACK_KINDS.map((attackKind) => next.boss.attackReadyAtMs[attackKind])
  );

  next.attacks = appendAttackEvent(next, {
    id: `boss-${next.tick + 1}-${kind}`,
    sourceId: next.boss.id,
    source: "boss",
    kind,
    damage,
    radius: definition.radius,
    origin: eventOrigin,
    target:
      kind === "arcane_shield"
        ? { targetType: "boss" }
        : targetPlayerId
          ? { targetType: "player", playerId: targetPlayerId }
          : { targetType: "position", position: next.boss.position },
    startedAtMs: nowMs,
    expiresAtMs: nowMs + definition.indicatorDurationMs
  });

  if (next.players.every((player) => player.status === "downed")) {
    next.status = "defeat";
  }

  return {
    snapshot: pruneExpiredAttacks(tick(next, nowMs), nowMs),
    applied: true,
    kind,
    damage,
    targetPlayerId
  };
}

export function chooseBossAttack(
  snapshot: RaidSnapshot,
  nowMs: number
): BossAttackKind | undefined {
  if (snapshot.status !== "active" || snapshot.boss.hp === 0) {
    return undefined;
  }

  const phase = getBossPhase(snapshot.boss.hp, snapshot.boss.maxHp);
  const phasePriority =
    phase === "phase_3"
      ? (["marked_strike", "cleave", "ground_slam"] as const)
      : phase === "phase_2"
        ? (["leap", "ground_slam"] as const)
        : ([] as const);
  const strategyPriority = BOSS_STRATEGY_ATTACK_PRIORITY[snapshot.boss.strategy];
  const orderedKinds = [...phasePriority, ...strategyPriority, ...BOSS_ATTACK_KINDS];
  const uniqueKinds = orderedKinds.filter(
    (kind, index) => orderedKinds.indexOf(kind) === index
  );

  return uniqueKinds.find(
    (kind) =>
      nowMs >= snapshot.boss.attackReadyAtMs[kind] &&
      canBossUseAttack(snapshot, kind, nowMs)
  );
}

export function setBossStrategy(
  snapshot: RaidSnapshot,
  strategy: BossStrategy
): RaidSnapshot {
  const next = cloneSnapshot(snapshot);
  if (next.status !== "active") {
    return next;
  }

  next.boss.strategy = strategy;
  return next;
}

export function isTerminalRaidStatus(status: RaidStatus): boolean {
  return TERMINAL_RAID_STATUSES.includes(status as (typeof TERMINAL_RAID_STATUSES)[number]);
}

export function distance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function cloneSnapshot(snapshot: RaidSnapshot): RaidSnapshot {
  return {
    ...snapshot,
    players: snapshot.players.map((player) => ({
      ...player,
      position: { ...player.position },
      contribution: { ...player.contribution }
    })),
    boss: {
      ...snapshot.boss,
      position: { ...snapshot.boss.position },
      attackReadyAtMs: { ...snapshot.boss.attackReadyAtMs }
    },
    attacks: snapshot.attacks.map((attack) => ({
      ...attack,
      origin: { ...attack.origin },
      target:
        attack.target.targetType === "position"
          ? {
              targetType: "position",
              position: { ...attack.target.position }
            }
          : { ...attack.target }
    }))
  };
}

function tick(snapshot: RaidSnapshot, nowMs: number): RaidSnapshot {
  snapshot.serverTimeMs = nowMs;
  snapshot.elapsedSeconds = Math.min(
    GAME_LIMITS.raid.durationSeconds,
    Math.floor(nowMs / 1000)
  );
  snapshot.tick = Math.min(GAME_LIMITS.networking.maxSnapshotTick, snapshot.tick + 1);

  if (snapshot.status === "active" && snapshot.elapsedSeconds >= GAME_LIMITS.raid.durationSeconds) {
    snapshot.status = "timeout";
  }

  if (isTerminalRaidStatus(snapshot.status)) {
    finalizeContributionScores(snapshot);
  }

  return snapshot;
}

function advanceClock(snapshot: RaidSnapshot, deltaMs: number): RaidSnapshot {
  return tick(snapshot, snapshot.serverTimeMs + Math.max(0, deltaMs));
}

function addContributionDamage(
  contribution: PlayerContribution,
  damage: number
): PlayerContribution {
  const nextDamage = Math.min(
    GAME_LIMITS.scoring.maxComponent,
    contribution.damage + damage
  );
  const total = Math.min(
    GAME_LIMITS.scoring.maxTotal,
    nextDamage + contribution.support + contribution.survival + contribution.objective
  );

  return {
    ...contribution,
    damage: nextDamage,
    total
  };
}

function finalizeContributionScores(snapshot: RaidSnapshot) {
  const totalDamage = snapshot.players.reduce(
    (sum, player) => sum + player.contribution.damage,
    0
  );
  const bossDamageTaken = snapshot.boss.maxHp - snapshot.boss.hp;
  const objectiveProgress = snapshot.boss.maxHp === 0 ? 0 : bossDamageTaken / snapshot.boss.maxHp;

  for (const player of snapshot.players) {
    const damage = clampInteger(player.contribution.damage, 0, GAME_LIMITS.scoring.maxComponent);
    const damageShare = totalDamage === 0 ? 0 : damage / totalDamage;
    const hpRatio = player.maxHp === 0 ? 0 : player.hp / player.maxHp;
    const nearbyAllies = snapshot.players.filter(
      (otherPlayer) =>
        otherPlayer.id !== player.id &&
        otherPlayer.status === "alive" &&
        distance(player.position, otherPlayer.position) <= 220
    ).length;

    const support = clampInteger(
      Math.round(nearbyAllies * 850 + (1 - damageShare) * 1_500),
      0,
      GAME_LIMITS.scoring.maxComponent
    );
    const survival = clampInteger(
      player.status === "alive" ? Math.round(2_000 + hpRatio * 7_500) : 0,
      0,
      GAME_LIMITS.scoring.maxComponent
    );
    const objective = clampInteger(
      Math.round(
        objectiveProgress * 4_000 +
          (snapshot.status === "victory" ? 4_500 : snapshot.status === "timeout" ? 1_000 : 0) +
          damageShare * 1_500
      ),
      0,
      GAME_LIMITS.scoring.maxComponent
    );

    player.contribution = {
      damage,
      support,
      survival,
      objective,
      total: clampInteger(
        damage + support + survival + objective,
        0,
        GAME_LIMITS.scoring.maxTotal
      )
    };
  }
}

function appendAttackEvent(snapshot: RaidSnapshot, event: AttackEvent): AttackEvent[] {
  return [...snapshot.attacks, event].slice(-GAME_LIMITS.attacks.maxActiveAttacks);
}

function pruneExpiredAttacks(snapshot: RaidSnapshot, nowMs: number): RaidSnapshot {
  snapshot.attacks = snapshot.attacks.filter((attack) => attack.expiresAtMs >= nowMs);
  return snapshot;
}

function chooseBossTarget(
  snapshot: RaidSnapshot,
  kind: BossAttackKind
): RaidSnapshot["players"][number] | undefined {
  const alivePlayers = snapshot.players.filter((player) => player.status === "alive");
  if (alivePlayers.length === 0) {
    return undefined;
  }

  if (kind === "marked_strike") {
    return [...alivePlayers].sort((first, second) => first.hp - second.hp)[0];
  }

  if (kind === "leap") {
    return [...alivePlayers].sort(
      (first, second) =>
        distance(second.position, snapshot.boss.position) -
        distance(first.position, snapshot.boss.position)
    )[0];
  }

  return [...alivePlayers].sort(
    (first, second) =>
      distance(first.position, snapshot.boss.position) -
      distance(second.position, snapshot.boss.position)
  )[0];
}

function canBossUseAttack(
  snapshot: RaidSnapshot,
  kind: BossAttackKind,
  nowMs: number
): boolean {
  if (kind === "arcane_shield") {
    return snapshot.boss.activeShieldUntilMs === undefined || nowMs >= snapshot.boss.activeShieldUntilMs;
  }

  const target = chooseBossTarget(snapshot, kind);
  if (!target) {
    return false;
  }

  if (kind === "marked_strike" || kind === "ground_slam") {
    return true;
  }

  return distance(snapshot.boss.position, target.position) <= BOSS_ATTACK_DEFINITIONS[kind].range;
}

function centroid(players: RaidSnapshot["players"]): Position {
  const alivePlayers = players.filter((player) => player.status === "alive");
  const divisor = Math.max(1, alivePlayers.length);
  const total = alivePlayers.reduce(
    (sum, player) => ({
      x: sum.x + player.position.x,
      y: sum.y + player.position.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / divisor,
    y: total.y / divisor
  };
}

function pointToward(from: Position, to: Position, stopDistance: number): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));

  return {
    x: clamp(from.x + (dx / length) * stopDistance, 0, GAME_LIMITS.arena.width),
    y: clamp(from.y + (dy / length) * stopDistance, 0, GAME_LIMITS.arena.height)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}
