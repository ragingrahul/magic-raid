"use client";

import { useEffect, useRef, useState } from "react";
import {
  BOSS_STRATEGIES,
  GAME_LIMITS,
  PLAYER_CLASSES,
  type BossStrategy,
  type PlayerAttackKind,
  type PlayerClass,
  type RaidSnapshot
} from "@/game/schemas";
import {
  advanceBoss,
  applyPlayerAttack,
  createLocalRaidSnapshot,
  movePlayer
} from "@/game/rules";

type ArenaStatus = "loading" | "ready" | "error";

type ArenaHud = {
  status: RaidSnapshot["status"];
  bossHp: number;
  bossMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  phase: RaidSnapshot["boss"]["phase"];
  strategy: BossStrategy;
  damage: number;
};

const PLAYER_ID = "player-1";
const ATTACK_EVENT = "magicraid:attack";

const initialHud: ArenaHud = {
  status: "active",
  bossHp: GAME_LIMITS.boss.maxHp,
  bossMaxHp: GAME_LIMITS.boss.maxHp,
  playerHp: GAME_LIMITS.player.maxHp,
  playerMaxHp: GAME_LIMITS.player.maxHp,
  phase: "phase_1",
  strategy: "area_denial",
  damage: 0
};

export function PhaserArena() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ArenaStatus>("loading");
  const [selectedClass, setSelectedClass] = useState<PlayerClass>("warrior");
  const [selectedStrategy, setSelectedStrategy] = useState<BossStrategy>("area_denial");
  const [retryNonce, setRetryNonce] = useState(0);
  const [hud, setHud] = useState<ArenaHud>(initialHud);

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
          private snapshot = createLocalRaidSnapshot(selectedClass, selectedStrategy);
          private hudLastUpdatedAtMs = 0;
          private externalAttack?: (event: Event) => void;

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
              this.attack("normal", this.game.loop.now);
            });

            this.externalAttack = (event: Event) => {
              const detail = (event as CustomEvent<{ kind: PlayerAttackKind }>).detail;
              if (detail?.kind) {
                this.attack(detail.kind, this.game.loop.now);
              }
            };
            window.addEventListener(ATTACK_EVENT, this.externalAttack);
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
              if (this.externalAttack) {
                window.removeEventListener(ATTACK_EVENT, this.externalAttack);
              }
            });

            this.publishHud(true);
          }

          update(time: number, delta: number) {
            if (!this.graphics || !this.keys) {
              return;
            }

            if (this.snapshot.status === "active") {
              this.move(delta);

              if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
                this.attack("normal", time);
              }

              if (Phaser.Input.Keyboard.JustDown(this.keys.shift)) {
                this.attack("special", time);
              }

              this.snapshot = advanceBoss(this.snapshot, time).snapshot;
            }

            this.draw(time);
            this.publishHud(false);
          }

          private move(delta: number) {
            if (!this.keys) {
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

            if (direction.x !== 0 || direction.y !== 0) {
              this.snapshot = movePlayer(this.snapshot, PLAYER_ID, direction, delta);
            }
          }

          private attack(kind: PlayerAttackKind, nowMs: number) {
            const result = applyPlayerAttack(this.snapshot, PLAYER_ID, kind, nowMs);
            this.snapshot = result.snapshot;
            this.publishHud(true);
          }

          private draw(nowMs: number) {
            if (!this.graphics) {
              return;
            }

            const graphics = this.graphics;
            graphics.clear();
            drawArena(graphics);

            for (const attack of this.snapshot.attacks) {
              if (attack.expiresAtMs >= nowMs) {
                drawAttack(graphics, attack);
              }
            }

            drawBoss(graphics, this.snapshot, nowMs);
            for (const player of this.snapshot.players) {
              drawPlayer(graphics, player);
            }
          }

          private publishHud(force: boolean) {
            const nowMs = this.game.loop.now;
            if (!force && nowMs - this.hudLastUpdatedAtMs < 120) {
              return;
            }

            const player = this.snapshot.players[0];
            this.hudLastUpdatedAtMs = nowMs;
            setHud({
              status: this.snapshot.status,
              bossHp: this.snapshot.boss.hp,
              bossMaxHp: this.snapshot.boss.maxHp,
              playerHp: player.hp,
              playerMaxHp: player.maxHp,
              phase: this.snapshot.boss.phase,
              strategy: this.snapshot.boss.strategy,
              damage: player.contribution.damage
            });
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
  }, [selectedClass, selectedStrategy, retryNonce]);

  function sendAttack(kind: PlayerAttackKind) {
    window.dispatchEvent(
      new CustomEvent(ATTACK_EVENT, {
        detail: {
          kind
        }
      })
    );
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Player class">
          {PLAYER_CLASSES.map((playerClass) => (
            <button
              key={playerClass}
              type="button"
              onClick={() => setSelectedClass(playerClass)}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selectedClass === playerClass
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-card-foreground hover:bg-muted"
              }`}
            >
              {playerClass}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => sendAttack("normal")}
            disabled={status !== "ready" || hud.status !== "active"}
            className="min-h-10 rounded-md border border-border bg-card px-3 text-sm font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Strike
          </button>
          <button
            type="button"
            onClick={() => sendAttack("special")}
            disabled={status !== "ready" || hud.status !== "active"}
            className="min-h-10 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Special
          </button>
        </div>
      </div>

      <div className="grid gap-3">
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
        </div>

        <aside className="rounded-md border border-border bg-card p-3 text-card-foreground">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
            <HudBar label="Boss" value={hud.bossHp} max={hud.bossMaxHp} />
            <HudBar label="Raider" value={hud.playerHp} max={hud.playerMaxHp} />

            <div className="grid grid-cols-2 gap-2 text-sm">
              <HudStat label="Phase" value={hud.phase.replace("_", " ")} />
              <HudStat label="Status" value={hud.status} />
              <HudStat label="Damage" value={hud.damage.toString()} />
              <HudStat label="Class" value={selectedClass} />
            </div>

            <label className="grid gap-1 text-sm font-medium md:col-span-3">
              <span>Strategy</span>
              <select
                value={selectedStrategy}
                onChange={(event) => setSelectedStrategy(event.target.value as BossStrategy)}
                className="min-h-10 rounded-md border border-border bg-background px-2 text-sm capitalize focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {BOSS_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

function HudBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-sm bg-muted">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}

function drawArena(graphics: Phaser.GameObjects.Graphics) {
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
}

function drawAttack(graphics: Phaser.GameObjects.Graphics, attack: RaidSnapshot["attacks"][number]) {
  if (attack.source === "player") {
    graphics.lineStyle(3, 0xfbbf24, 0.8);
    graphics.strokeCircle(attack.origin.x, attack.origin.y, attack.radius);
    graphics.lineStyle(2, 0xfbbf24, 0.55);
    graphics.lineBetween(
      attack.origin.x,
      attack.origin.y,
      GAME_LIMITS.arena.width * 0.66,
      GAME_LIMITS.arena.height / 2
    );
    return;
  }

  const color = attack.kind === "arcane_shield" ? 0x8b5cf6 : 0xef4444;
  graphics.fillStyle(color, 0.18);
  graphics.fillCircle(attack.origin.x, attack.origin.y, attack.radius);
  graphics.lineStyle(3, color, 0.7);
  graphics.strokeCircle(attack.origin.x, attack.origin.y, attack.radius);
}

function drawBoss(graphics: Phaser.GameObjects.Graphics, snapshot: RaidSnapshot, nowMs: number) {
  const { boss } = snapshot;
  const phaseColor =
    boss.phase === "phase_3" ? 0xef4444 : boss.phase === "phase_2" ? 0xf59e0b : 0x8b5cf6;

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

  if (boss.activeShieldUntilMs !== undefined && boss.activeShieldUntilMs > nowMs) {
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

function drawPlayer(graphics: Phaser.GameObjects.Graphics, player: RaidSnapshot["players"][number]) {
  const color =
    player.class === "warrior" ? 0xdc2626 : player.class === "ranger" ? 0x10b981 : 0x38bdf8;

  graphics.fillStyle(0x020617, 0.72);
  graphics.fillEllipse(player.position.x, player.position.y + 16, 46, 18);
  graphics.fillStyle(color, player.status === "alive" ? 1 : 0.45);
  graphics.fillCircle(player.position.x, player.position.y, 22);
  graphics.lineStyle(3, 0xf8fafc, 0.85);
  graphics.strokeCircle(player.position.x, player.position.y, 22);

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
