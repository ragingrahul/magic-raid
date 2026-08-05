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
import {
  ARENA_PROP_PATHS,
  BOSS_TIER_BY_PHASE,
  CLASS_HERO,
  FACING_ROW,
  HERO_ANIMATIONS,
  ORC_ANIMATIONS,
  ORC_FRAME_SIZE,
  ORC_ROWS,
  heroAnimKey,
  heroFramePath,
  heroFrameTextureKey,
  orcAnimKey,
  orcSheetPath,
  orcTextureKey,
  type FacingRow,
  type HeroAnimKey,
  type HeroId,
  type OrcAnimKey,
  type OrcTier
} from "@/game/sprites";

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
const MOVEMENT_EPSILON = 0.4;
const BOSS_SCALE = 2.2;
const PLAYER_SCALE = 0.6;
const LOCAL_PLAYER_SCALE = 0.68;
const HEROES: HeroId[] = ["knight", "mage", "rogue"];
const HERO_ANIM_KEYS: HeroAnimKey[] = ["idle", "walk", "attack", "hurt", "death"];
const ORC_TIERS: OrcTier[] = ["orc1", "orc2", "orc3"];
const ORC_ANIM_KEYS: OrcAnimKey[] = ["idle", "walk", "run", "attack", "hurt", "death"];
const ARENA_PROP_POSITIONS: Position[] = [
  { x: 60, y: 60 },
  { x: 1220, y: 60 },
  { x: 60, y: 660 },
  { x: 1220, y: 660 },
  { x: 640, y: 35 },
  { x: 640, y: 685 },
  { x: 35, y: 360 },
  { x: 1245, y: 360 },
  { x: 150, y: 600 }
];
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
          private floorGraphics?: Phaser.GameObjects.Graphics;
          private fxGraphics?: Phaser.GameObjects.Graphics;
          private bossSprite?: Phaser.GameObjects.Sprite;
          private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
          private bossFacingRow: FacingRow = FACING_ROW.down;
          private bossLastAttackId: string | null = null;
          private bossLastHp: number = GAME_LIMITS.boss.maxHp;
          private previousBossPosition?: Position;
          private previousPlayerPositions = new Map<string, Position>();
          private playerLastAttackId = new Map<string, string>();
          private playerLastHp = new Map<string, number>();
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

          preload() {
            for (const hero of HEROES) {
              for (const anim of HERO_ANIM_KEYS) {
                const config = HERO_ANIMATIONS[hero][anim];
                for (const frame of config.frames) {
                  this.load.image(
                    heroFrameTextureKey(hero, anim, frame),
                    heroFramePath(hero, anim, frame)
                  );
                }
              }
            }

            for (const tier of ORC_TIERS) {
              for (const anim of ORC_ANIM_KEYS) {
                this.load.spritesheet(orcTextureKey(tier, anim), orcSheetPath(tier, anim), {
                  frameWidth: ORC_FRAME_SIZE,
                  frameHeight: ORC_FRAME_SIZE
                });
              }
            }

            ARENA_PROP_PATHS.forEach((path, index) => {
              this.load.image(`prop-${index}`, path);
            });
          }

          create() {
            this.floorGraphics = this.add.graphics().setDepth(-1000);
            this.fxGraphics = this.add.graphics().setDepth(1000);
            this.buildAnimations();
            this.spawnProps();

            const boss = this.renderSnapshot.boss;
            const bossTier = BOSS_TIER_BY_PHASE[boss.phase];
            this.bossSprite = this.add
              .sprite(boss.position.x, boss.position.y, orcTextureKey(bossTier, "idle"))
              .setScale(BOSS_SCALE);
            this.bossLastHp = boss.hp;

            for (const player of this.renderSnapshot.players) {
              this.createPlayerSprite(player);
            }

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
            if (!this.floorGraphics || !this.fxGraphics || !this.keys) {
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

          private buildAnimations() {
            for (const hero of HEROES) {
              for (const anim of HERO_ANIM_KEYS) {
                const key = heroAnimKey(hero, anim);
                if (this.anims.exists(key)) {
                  continue;
                }

                const config = HERO_ANIMATIONS[hero][anim];
                this.anims.create({
                  key,
                  frames: config.frames.map((frame) => ({
                    key: heroFrameTextureKey(hero, anim, frame)
                  })),
                  frameRate: config.frameRate,
                  repeat: config.repeat
                });
              }
            }

            for (const tier of ORC_TIERS) {
              for (const anim of ORC_ANIM_KEYS) {
                const textureKey = orcTextureKey(tier, anim);
                const texture = this.textures.get(textureKey);
                const cols = Math.round(texture.source[0].width / ORC_FRAME_SIZE);
                const { frameRate, repeat } = ORC_ANIMATIONS[anim];

                for (let row = 0; row < ORC_ROWS; row += 1) {
                  const key = `${orcAnimKey(tier, anim)}-row${row}`;
                  if (this.anims.exists(key)) {
                    continue;
                  }

                  const start = row * cols;
                  this.anims.create({
                    key,
                    frames: this.anims.generateFrameNumbers(textureKey, {
                      start,
                      end: start + cols - 1
                    }),
                    frameRate,
                    repeat
                  });
                }
              }
            }
          }

          private spawnProps() {
            ARENA_PROP_PATHS.forEach((_, index) => {
              const position = ARENA_PROP_POSITIONS[index % ARENA_PROP_POSITIONS.length];
              this.add.image(position.x, position.y, `prop-${index}`).setDepth(-500).setAlpha(0.92);
            });
          }

          private createPlayerSprite(player: RaidSnapshot["players"][number]) {
            const hero = CLASS_HERO[player.class];
            const idleFrames = HERO_ANIMATIONS[hero].idle.frames;
            const sprite = this.add.sprite(
              player.position.x,
              player.position.y,
              heroFrameTextureKey(hero, "idle", idleFrames[0])
            );
            sprite.setScale(
              player.id === this.sceneLocalPlayerId ? LOCAL_PLAYER_SCALE : PLAYER_SCALE
            );
            this.playerSprites.set(player.id, sprite);
            this.playerLastHp.set(player.id, player.hp);
            return sprite;
          }

          private draw() {
            if (!this.floorGraphics || !this.fxGraphics) {
              return;
            }

            const snapshotToDraw = this.renderSnapshot;

            this.floorGraphics.clear();
            drawArena(this.floorGraphics, snapshotToDraw);

            this.syncBossSprite(snapshotToDraw);
            this.syncPlayerSprites(snapshotToDraw);

            this.fxGraphics.clear();
            for (const attack of snapshotToDraw.attacks) {
              if (attack.expiresAtMs >= snapshotToDraw.serverTimeMs) {
                drawAttack(this.fxGraphics, attack, snapshotToDraw);
              }
            }

            drawCanvasHpBar(
              this.fxGraphics,
              snapshotToDraw.boss.position.x - 96,
              snapshotToDraw.boss.position.y - 98,
              192,
              12,
              snapshotToDraw.boss.hp,
              snapshotToDraw.boss.maxHp,
              0xef4444
            );

            for (const player of snapshotToDraw.players) {
              drawCanvasHpBar(
                this.fxGraphics,
                player.position.x - 30,
                player.position.y - 52,
                60,
                8,
                player.hp,
                player.maxHp,
                0x22c55e
              );
            }

            if (this.sceneLocalPlayerId) {
              const localPlayer = snapshotToDraw.players.find(
                (player) => player.id === this.sceneLocalPlayerId
              );
              if (localPlayer) {
                this.fxGraphics.fillStyle(0xe2a542, 0.95);
                this.fxGraphics.fillTriangle(
                  localPlayer.position.x - 8,
                  localPlayer.position.y - 68,
                  localPlayer.position.x + 8,
                  localPlayer.position.y - 68,
                  localPlayer.position.x,
                  localPlayer.position.y - 54
                );
              }
            }
          }

          private syncBossSprite(snapshot: RaidSnapshot) {
            if (!this.bossSprite) {
              return;
            }

            const boss = snapshot.boss;
            const tier = BOSS_TIER_BY_PHASE[boss.phase];
            this.bossSprite.setPosition(boss.position.x, boss.position.y);
            this.bossSprite.setDepth(boss.position.y);

            const previous = this.previousBossPosition;
            const dx = previous ? boss.position.x - previous.x : 0;
            const dy = previous ? boss.position.y - previous.y : 0;
            const moving = Math.hypot(dx, dy) > MOVEMENT_EPSILON;
            this.previousBossPosition = { x: boss.position.x, y: boss.position.y };

            if (moving) {
              this.bossFacingRow =
                Math.abs(dx) > Math.abs(dy)
                  ? dx < 0
                    ? FACING_ROW.left
                    : FACING_ROW.right
                  : dy < 0
                    ? FACING_ROW.up
                    : FACING_ROW.down;
            }

            const rowKey = (anim: OrcAnimKey) =>
              `${orcAnimKey(tier, anim)}-row${this.bossFacingRow}`;

            if (boss.hp <= 0) {
              this.bossSprite.play(rowKey("death"), true);
              return;
            }

            if (this.bossSprite.getData("busy")) {
              return;
            }

            const latestAttack = latestAttackFor(snapshot, boss.id, "boss");
            if (latestAttack && latestAttack.id !== this.bossLastAttackId) {
              this.bossLastAttackId = latestAttack.id;
              this.playOneShot(this.bossSprite, rowKey("attack"));
              return;
            }

            if (boss.hp < this.bossLastHp) {
              this.bossLastHp = boss.hp;
              this.playOneShot(this.bossSprite, rowKey("hurt"));
              return;
            }
            this.bossLastHp = boss.hp;

            this.bossSprite.play(rowKey(moving ? "walk" : "idle"), true);
          }

          private syncPlayerSprites(snapshot: RaidSnapshot) {
            const seen = new Set<string>();

            for (const player of snapshot.players) {
              seen.add(player.id);
              const sprite = this.playerSprites.get(player.id) ?? this.createPlayerSprite(player);
              const hero = CLASS_HERO[player.class];

              const previous = this.previousPlayerPositions.get(player.id);
              const dx = previous ? player.position.x - previous.x : 0;
              const dy = previous ? player.position.y - previous.y : 0;
              const moving = Math.hypot(dx, dy) > MOVEMENT_EPSILON;
              this.previousPlayerPositions.set(player.id, {
                x: player.position.x,
                y: player.position.y
              });

              sprite.setPosition(player.position.x, player.position.y);
              sprite.setDepth(player.position.y);
              sprite.setFlipX(Math.cos(player.facingRadians) < 0);
              sprite.setAlpha(player.status === "alive" ? 1 : 0.75);

              if (player.status !== "alive") {
                sprite.play(heroAnimKey(hero, "death"), true);
                continue;
              }

              if (sprite.getData("busy")) {
                continue;
              }

              const latestAttack = latestAttackFor(snapshot, player.id, "player");
              const lastAttackId = this.playerLastAttackId.get(player.id);
              if (latestAttack && latestAttack.id !== lastAttackId) {
                this.playerLastAttackId.set(player.id, latestAttack.id);
                this.playOneShot(sprite, heroAnimKey(hero, "attack"));
                continue;
              }

              const lastHp = this.playerLastHp.get(player.id) ?? player.hp;
              if (player.hp < lastHp) {
                this.playerLastHp.set(player.id, player.hp);
                this.playOneShot(sprite, heroAnimKey(hero, "hurt"));
                continue;
              }
              this.playerLastHp.set(player.id, player.hp);

              sprite.play(heroAnimKey(hero, moving ? "walk" : "idle"), true);
            }

            for (const [id, sprite] of this.playerSprites) {
              if (!seen.has(id)) {
                sprite.destroy();
                this.playerSprites.delete(id);
                this.playerLastAttackId.delete(id);
                this.playerLastHp.delete(id);
                this.previousPlayerPositions.delete(id);
              }
            }
          }

          private playOneShot(sprite: Phaser.GameObjects.Sprite, key: string) {
            sprite.play(key, true);
            sprite.setData("busy", true);
            sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
              sprite.setData("busy", false);
            });
          }
        }

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: GAME_LIMITS.arena.width,
          height: GAME_LIMITS.arena.height,
          backgroundColor: "#120d16",
          pixelArt: true,
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
    <div className="absolute inset-0 overflow-hidden bg-background">
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

function latestAttackFor(
  snapshot: RaidSnapshot,
  sourceId: string,
  source: "player" | "boss"
): RaidSnapshot["attacks"][number] | undefined {
  let latest: RaidSnapshot["attacks"][number] | undefined;

  for (const attack of snapshot.attacks) {
    if (attack.source !== source || attack.sourceId !== sourceId) {
      continue;
    }

    if (!latest || attack.startedAtMs > latest.startedAtMs) {
      latest = attack;
    }
  }

  return latest;
}

function drawArena(graphics: Phaser.GameObjects.Graphics, snapshot: RaidSnapshot) {
  const { width, height } = GAME_LIMITS.arena;

  graphics.fillStyle(0x120d16, 1);
  graphics.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const glowSteps = 6;
  for (let step = glowSteps; step > 0; step -= 1) {
    const radius = (Math.max(width, height) * 0.55 * step) / glowSteps;
    graphics.fillStyle(0x3a2410, 0.06);
    graphics.fillCircle(centerX, centerY, radius);
  }

  graphics.lineStyle(1, 0x3a2c22, 0.22);
  for (let x = 80; x < width; x += 80) {
    graphics.lineBetween(x, 0, x, height);
  }

  for (let y = 80; y < height; y += 80) {
    graphics.lineBetween(0, y, width, y);
  }

  graphics.lineStyle(4, 0xd9a441, 0.55);
  graphics.strokeRect(18, 18, width - 36, height - 36);
  graphics.lineStyle(1, 0xd9a441, 0.28);
  graphics.strokeRect(26, 26, width - 52, height - 52);

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
