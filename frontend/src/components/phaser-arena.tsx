"use client";

import { useEffect, useRef, useState } from "react";
import {
  GAME_LIMITS,
  RaidSnapshotSchema,
  type BossStrategy,
  type PlayerAttackKind,
  type Position,
  type RaidSnapshot
} from "@/game/schemas";
import { createLocalRaidSnapshot } from "@/game/rules";

type ArenaStatus = "loading" | "ready" | "error";

type PhaserArenaProps = {
  snapshot: RaidSnapshot | null;
  localPlayerId: string | null;
  interactive?: boolean;
  onMove?: (direction: Position) => void;
  onAttack?: (kind: PlayerAttackKind) => void;
};

const SNAPSHOT_EVENT = "magicraid:snapshot";
const SEND_MOVE_EVERY_MS = 90;
const INTERPOLATION_ALPHA = 0.22;
const STRATEGY_VISUALS = {
  area_denial: {
    color: 0xf97316
  },
  leap_to_ranged: {
    color: 0x14b8a6
  },
  magic_resistance: {
    color: 0x8b5cf6
  },
  focus_healer: {
    color: 0xf43f5e
  },
  melee_retaliation: {
    color: 0xfbbf24
  }
} as const satisfies Record<BossStrategy, { color: number }>;

export function PhaserArena({
  snapshot,
  localPlayerId,
  interactive = true,
  onMove,
  onAttack
}: PhaserArenaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onMoveRef = useRef(onMove);
  const onAttackRef = useRef(onAttack);
  const initialSnapshotRef = useRef(snapshot);
  const localPlayerIdRef = useRef(localPlayerId);
  const interactiveRef = useRef(interactive);
  const [status, setStatus] = useState<ArenaStatus>("loading");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    onAttackRef.current = onAttack;
  }, [onAttack]);

  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SNAPSHOT_EVENT, {
        detail: {
          snapshot,
          localPlayerId,
          interactive
        }
      })
    );
  }, [interactive, localPlayerId, snapshot]);

  useEffect(() => {
    let active = true;
    let game: Phaser.Game | undefined;

    async function bootArena() {
      if (!containerRef.current) {
        return;
      }

      setStatus("loading");

      try {
        const Phaser = await import("phaser");

        if (!active || !containerRef.current) {
          return;
        }

        class RaidArenaScene extends Phaser.Scene {
          private graphics?: Phaser.GameObjects.Graphics;
          private keys?: {
            up: Phaser.Input.Keyboard.Key;
            down: Phaser.Input.Keyboard.Key;
            left: Phaser.Input.Keyboard.Key;
            right: Phaser.Input.Keyboard.Key;
            w: Phaser.Input.Keyboard.Key;
            a: Phaser.Input.Keyboard.Key;
            s: Phaser.Input.Keyboard.Key;
            d: Phaser.Input.Keyboard.Key;
            space: Phaser.Input.Keyboard.Key;
            shift: Phaser.Input.Keyboard.Key;
          };
          private renderSnapshot = cloneSnapshot(
            initialSnapshotRef.current ?? createLocalRaidSnapshot()
          );
          private targetSnapshot = cloneSnapshot(
            initialSnapshotRef.current ?? createLocalRaidSnapshot()
          );
          private sceneLocalPlayerId = localPlayerIdRef.current;
          private sceneInteractive = interactiveRef.current;
          private lastMoveSentAtMs = 0;
          private externalSnapshot?: (event: Event) => void;

          constructor() {
            super("raid-arena");
          }

          create() {
            this.graphics = this.add.graphics();
            const keyboard = this.input.keyboard;

            if (!keyboard) {
              setStatus("error");
              return;
            }

            keyboard.addCapture([
              Phaser.Input.Keyboard.KeyCodes.SPACE,
              Phaser.Input.Keyboard.KeyCodes.SHIFT
            ]);

            this.keys = {
              up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
              down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
              left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
              right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
              w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
              a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
              s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
              d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
              space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
              shift: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
            };

            this.input.on("pointerdown", () => {
              if (this.sceneInteractive) {
                onAttackRef.current?.("normal");
              }
            });

            this.externalSnapshot = (event: Event) => {
              const detail = (
                event as CustomEvent<{
                  snapshot: RaidSnapshot | null;
                  localPlayerId: string | null;
                  interactive: boolean;
                }>
              ).detail;

              this.sceneLocalPlayerId = detail.localPlayerId;
              this.sceneInteractive = detail.interactive;
              if (detail.snapshot) {
                this.targetSnapshot = cloneSnapshot(detail.snapshot);
              }
            };
            window.addEventListener(SNAPSHOT_EVENT, this.externalSnapshot);
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
              if (this.externalSnapshot) {
                window.removeEventListener(SNAPSHOT_EVENT, this.externalSnapshot);
              }
            });
          }

          update(time: number) {
            if (!this.graphics || !this.keys) {
              return;
            }

            if (this.sceneInteractive && this.targetSnapshot.status === "active") {
              this.sendMovementIntent(time);

              if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
                onAttackRef.current?.("normal");
              }

              if (Phaser.Input.Keyboard.JustDown(this.keys.shift)) {
                onAttackRef.current?.("special");
              }
            }

            this.renderSnapshot = interpolateSnapshot(
              this.renderSnapshot,
              this.targetSnapshot
            );
            this.draw();
          }

          private sendMovementIntent(time: number) {
            if (!this.keys || !this.sceneLocalPlayerId || time - this.lastMoveSentAtMs < SEND_MOVE_EVERY_MS) {
              return;
            }

            const direction = {
              x: 0,
              y: 0
            };

            if (this.keys.left.isDown || this.keys.a.isDown) direction.x -= 1;
            if (this.keys.right.isDown || this.keys.d.isDown) direction.x += 1;
            if (this.keys.up.isDown || this.keys.w.isDown) direction.y -= 1;
            if (this.keys.down.isDown || this.keys.s.isDown) direction.y += 1;

            if (direction.x === 0 && direction.y === 0) {
              return;
            }

            const length = Math.max(1, Math.hypot(direction.x, direction.y));
            this.lastMoveSentAtMs = time;
            onMoveRef.current?.({
              x: direction.x / length,
              y: direction.y / length
            });
          }

          private draw() {
            if (!this.graphics) {
              return;
            }

            const graphics = this.graphics;
            const snapshotToDraw = this.renderSnapshot;
            graphics.clear();
            drawArena(graphics, snapshotToDraw);

            for (const attack of snapshotToDraw.attacks) {
              if (attack.expiresAtMs >= snapshotToDraw.serverTimeMs) {
                drawAttack(graphics, attack, snapshotToDraw);
              }
            }

            drawBoss(graphics, snapshotToDraw);
            for (const player of snapshotToDraw.players) {
              drawPlayer(graphics, player, player.id === this.sceneLocalPlayerId);
            }
          }
        }

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: GAME_LIMITS.arena.width,
          height: GAME_LIMITS.arena.height,
          backgroundColor: "#07111f",
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
          },
          scene: RaidArenaScene
        });

        setStatus("ready");
      } catch {
        if (active) {
          setStatus("error");
        }
      }
    }

    void bootArena();

    return () => {
      active = false;
      game?.destroy(true);
    };
  }, [retryNonce]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-background">
      <div ref={containerRef} className="magicraid-arena absolute inset-0" />
      {status === "loading" ? (
        <div className="absolute inset-0 grid place-items-center bg-background/90">
          <div className="h-24 w-56 rounded-md bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-background/95 p-4 text-center">
          <div>
            <p className="text-sm font-medium">Arena failed to load.</p>
            <button
              type="button"
              onClick={() => setRetryNonce((current) => current + 1)}
              className="mt-3 min-h-10 rounded-md border border-border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {!snapshot ? (
        <div className="absolute inset-0 grid place-items-center bg-background/75 p-4 text-center">
          <p className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground">
            Create or join a room.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function cloneSnapshot(snapshot: RaidSnapshot): RaidSnapshot {
  return RaidSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
}

function interpolateSnapshot(
  current: RaidSnapshot,
  target: RaidSnapshot
): RaidSnapshot {
  const next = cloneSnapshot(target);

  next.players = target.players.map((targetPlayer) => {
    const currentPlayer = current.players.find((player) => player.id === targetPlayer.id);
    if (!currentPlayer) {
      return targetPlayer;
    }

    return {
      ...targetPlayer,
      position: lerpPosition(currentPlayer.position, targetPlayer.position)
    };
  });

  next.boss = {
    ...target.boss,
    position: lerpPosition(current.boss.position, target.boss.position)
  };

  return next;
}

function lerpPosition(current: Position, target: Position): Position {
  return {
    x: current.x + (target.x - current.x) * INTERPOLATION_ALPHA,
    y: current.y + (target.y - current.y) * INTERPOLATION_ALPHA
  };
}

function drawArena(graphics: Phaser.GameObjects.Graphics, snapshot: RaidSnapshot) {
  graphics.fillStyle(0x07111f, 1);
  graphics.fillRect(0, 0, GAME_LIMITS.arena.width, GAME_LIMITS.arena.height);
  graphics.lineStyle(1, 0x24364f, 0.42);

  for (let x = 80; x < GAME_LIMITS.arena.width; x += 80) {
    graphics.lineBetween(x, 0, x, GAME_LIMITS.arena.height);
  }

  for (let y = 80; y < GAME_LIMITS.arena.height; y += 80) {
    graphics.lineBetween(0, y, GAME_LIMITS.arena.width, y);
  }

  graphics.lineStyle(3, 0x6ee7d8, 0.5);
  graphics.strokeRect(18, 18, GAME_LIMITS.arena.width - 36, GAME_LIMITS.arena.height - 36);
  drawStrategyTell(graphics, snapshot);
}

function drawStrategyTell(graphics: Phaser.GameObjects.Graphics, snapshot: RaidSnapshot) {
  const color = STRATEGY_VISUALS[snapshot.boss.strategy].color;
  const boss = snapshot.boss;

  if (snapshot.boss.strategy === "area_denial") {
    const center = centroid(snapshot.players);
    graphics.fillStyle(color, 0.08);
    graphics.fillCircle(center.x, center.y, 216);
    graphics.lineStyle(4, color, 0.42);
    graphics.strokeCircle(center.x, center.y, 92);
    graphics.strokeCircle(center.x, center.y, 152);
    graphics.strokeCircle(center.x, center.y, 216);
    return;
  }

  if (snapshot.boss.strategy === "leap_to_ranged") {
    const target = farthestAlivePlayer(snapshot);
    if (!target) {
      return;
    }

    graphics.lineStyle(5, color, 0.62);
    graphics.lineBetween(boss.position.x, boss.position.y, target.position.x, target.position.y);
    graphics.fillStyle(color, 0.72);
    graphics.fillTriangle(
      target.position.x,
      target.position.y - 34,
      target.position.x - 26,
      target.position.y + 18,
      target.position.x + 26,
      target.position.y + 18
    );
    return;
  }

  if (snapshot.boss.strategy === "magic_resistance") {
    graphics.lineStyle(5, color, 0.55);
    graphics.strokeCircle(boss.position.x, boss.position.y, 96);
    graphics.strokeCircle(boss.position.x, boss.position.y, 118);
    graphics.lineStyle(3, color, 0.38);
    drawRadials(graphics, boss.position, 76, 128, 6);
    return;
  }

  if (snapshot.boss.strategy === "focus_healer") {
    const target = weakestAlivePlayer(snapshot);
    if (!target) {
      return;
    }

    graphics.lineStyle(4, color, 0.75);
    graphics.strokeCircle(target.position.x, target.position.y, 42);
    graphics.lineBetween(target.position.x - 58, target.position.y, target.position.x - 22, target.position.y);
    graphics.lineBetween(target.position.x + 22, target.position.y, target.position.x + 58, target.position.y);
    graphics.lineBetween(target.position.x, target.position.y - 58, target.position.x, target.position.y - 22);
    graphics.lineBetween(target.position.x, target.position.y + 22, target.position.x, target.position.y + 58);
    return;
  }

  graphics.lineStyle(5, color, 0.58);
  graphics.strokeCircle(boss.position.x, boss.position.y, 116);
  graphics.fillStyle(color, 0.46);
  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI * 2 * index) / 10;
    const inner = pointOnCircle(boss.position, angle, 86);
    const outer = pointOnCircle(boss.position, angle, 130);
    graphics.fillTriangle(
      inner.x,
      inner.y,
      pointOnCircle(boss.position, angle - 0.1, 108).x,
      pointOnCircle(boss.position, angle - 0.1, 108).y,
      outer.x,
      outer.y
    );
  }
}

function drawAttack(
  graphics: Phaser.GameObjects.Graphics,
  attack: RaidSnapshot["attacks"][number],
  snapshot: RaidSnapshot
) {
  if (attack.source === "player") {
    graphics.lineStyle(3, 0xfbbf24, 0.8);
    graphics.strokeCircle(attack.origin.x, attack.origin.y, attack.radius);
    graphics.lineStyle(2, 0xfbbf24, 0.55);
    graphics.lineBetween(
      attack.origin.x,
      attack.origin.y,
      snapshot.boss.position.x,
      snapshot.boss.position.y
    );
    return;
  }

  const color = attack.kind === "arcane_shield" ? 0x8b5cf6 : 0xef4444;
  graphics.fillStyle(color, 0.18);
  graphics.fillCircle(attack.origin.x, attack.origin.y, attack.radius);
  graphics.lineStyle(3, color, 0.7);
  graphics.strokeCircle(attack.origin.x, attack.origin.y, attack.radius);
}

function drawBoss(graphics: Phaser.GameObjects.Graphics, snapshot: RaidSnapshot) {
  const { boss } = snapshot;
  const phaseColor =
    boss.phase === "phase_3" ? 0xef4444 : boss.phase === "phase_2" ? 0xf59e0b : 0x8b5cf6;
  const strategyColor = STRATEGY_VISUALS[boss.strategy].color;

  graphics.fillStyle(strategyColor, 0.12);
  graphics.fillCircle(boss.position.x, boss.position.y, 86);
  graphics.lineStyle(4, strategyColor, 0.68);
  graphics.strokeCircle(boss.position.x, boss.position.y, 72);
  graphics.fillStyle(0x111827, 1);
  graphics.fillCircle(boss.position.x, boss.position.y, 66);
  graphics.fillStyle(phaseColor, 0.9);
  graphics.fillCircle(boss.position.x, boss.position.y, 50);
  graphics.fillStyle(0x020617, 0.72);
  graphics.fillCircle(boss.position.x - 18, boss.position.y - 12, 10);
  graphics.fillCircle(boss.position.x + 18, boss.position.y - 12, 10);
  graphics.lineStyle(6, 0x020617, 0.8);
  graphics.lineBetween(
    boss.position.x - 28,
    boss.position.y + 20,
    boss.position.x + 28,
    boss.position.y + 20
  );

  if (boss.activeShieldUntilMs !== undefined && boss.activeShieldUntilMs > snapshot.serverTimeMs) {
    graphics.lineStyle(6, 0xa78bfa, 0.75);
    graphics.strokeCircle(boss.position.x, boss.position.y, 78);
  }

  drawCanvasHpBar(
    graphics,
    boss.position.x - 96,
    boss.position.y - 98,
    192,
    12,
    boss.hp,
    boss.maxHp,
    0xef4444
  );
}

function drawPlayer(
  graphics: Phaser.GameObjects.Graphics,
  player: RaidSnapshot["players"][number],
  isLocalPlayer: boolean
) {
  const color =
    player.class === "warrior" ? 0xdc2626 : player.class === "ranger" ? 0x10b981 : 0x38bdf8;

  graphics.fillStyle(0x020617, 0.72);
  graphics.fillEllipse(player.position.x, player.position.y + 16, 46, 18);
  graphics.fillStyle(color, player.status === "alive" ? 1 : 0.45);
  graphics.fillCircle(player.position.x, player.position.y, isLocalPlayer ? 26 : 22);
  graphics.lineStyle(isLocalPlayer ? 4 : 3, isLocalPlayer ? 0xfbbf24 : 0xf8fafc, 0.88);
  graphics.strokeCircle(player.position.x, player.position.y, isLocalPlayer ? 26 : 22);

  if (player.class === "warrior") {
    graphics.fillStyle(0xfbbf24, 1);
    graphics.fillRect(player.position.x + 10, player.position.y - 18, 8, 36);
  } else if (player.class === "ranger") {
    graphics.lineStyle(4, 0xf8fafc, 0.9);
    graphics.lineBetween(
      player.position.x - 4,
      player.position.y - 24,
      player.position.x + 28,
      player.position.y
    );
    graphics.lineBetween(
      player.position.x - 4,
      player.position.y + 24,
      player.position.x + 28,
      player.position.y
    );
  } else {
    graphics.lineStyle(4, 0xf8fafc, 0.88);
    graphics.strokeCircle(player.position.x + 14, player.position.y - 14, 10);
  }

  drawCanvasHpBar(
    graphics,
    player.position.x - 30,
    player.position.y - 42,
    60,
    8,
    player.hp,
    player.maxHp,
    0x22c55e
  );
}

function drawCanvasHpBar(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  max: number,
  color: number
) {
  const percent = max === 0 ? 0 : value / max;
  graphics.fillStyle(0x020617, 0.85);
  graphics.fillRect(x, y, width, height);
  graphics.fillStyle(color, 0.95);
  graphics.fillRect(x, y, width * percent, height);
  graphics.lineStyle(1, 0xf8fafc, 0.55);
  graphics.strokeRect(x, y, width, height);
}

function farthestAlivePlayer(snapshot: RaidSnapshot): RaidSnapshot["players"][number] | undefined {
  return [...snapshot.players]
    .filter((player) => player.status === "alive")
    .sort(
      (first, second) =>
        distance(second.position, snapshot.boss.position) -
        distance(first.position, snapshot.boss.position)
    )[0];
}

function weakestAlivePlayer(snapshot: RaidSnapshot): RaidSnapshot["players"][number] | undefined {
  return [...snapshot.players]
    .filter((player) => player.status === "alive")
    .sort(
      (first, second) =>
        first.hp / Math.max(1, first.maxHp) - second.hp / Math.max(1, second.maxHp)
    )[0];
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

function drawRadials(
  graphics: Phaser.GameObjects.Graphics,
  center: Position,
  innerRadius: number,
  outerRadius: number,
  count: number
) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const inner = pointOnCircle(center, angle, innerRadius);
    const outer = pointOnCircle(center, angle, outerRadius);
    graphics.lineBetween(inner.x, inner.y, outer.x, outer.y);
  }
}

function pointOnCircle(center: Position, angle: number, radius: number): Position {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

function distance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
