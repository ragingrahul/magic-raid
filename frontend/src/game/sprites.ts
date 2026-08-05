import type { BossPhase, PlayerClass } from "@/game/schemas";

const HEROES_ROOT =
  "/craftpix-891165-assassin-mage-viking-free-pixel-art-game-heroes/PNG";
const ORC_ROOT = "/craftpix-net-363992-free-top-down-orc-game-character-pixel-art/PNG";
const UNDEAD_ROOT = "/craftpix-net-695666-free-undead-tileset-top-down-pixel-art/PNG";

export type HeroId = "knight" | "mage" | "rogue";
export type HeroAnimKey = "idle" | "walk" | "attack" | "hurt" | "death";
export type OrcTier = "orc1" | "orc2" | "orc3";
export type OrcAnimKey = "idle" | "walk" | "run" | "attack" | "hurt" | "death";
/** Row order inside every orc spritesheet (4 rows x 64px), confirmed visually. */
export type FacingRow = 0 | 1 | 2 | 3;
export const FACING_ROW = { down: 0, up: 1, left: 2, right: 3 } as const;

export const CLASS_HERO: Record<PlayerClass, HeroId> = {
  warrior: "knight",
  ranger: "rogue",
  mage: "mage"
};

const HERO_FOLDER: Record<HeroId, string> = {
  knight: "Knight",
  mage: "Mage",
  rogue: "Rogue"
};

export const CLASS_PORTRAIT: Record<PlayerClass, string> = {
  warrior: `${HEROES_ROOT}/Knight/knight.png`,
  ranger: `${HEROES_ROOT}/Rogue/rogue.png`,
  mage: `${HEROES_ROOT}/Mage/mage.png`
};

export const HERO_FRAME_SIZE = 128;
/** All hero art faces right by default; mirror with flipX to face left. */
export const HERO_DEFAULT_FACING_RIGHT = true;

type HeroAnimationConfig = {
  animFolder: string;
  filePrefix: string;
  frames: number[];
  frameRate: number;
  repeat: number;
};

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let value = start; value <= end; value += 1) {
    out.push(value);
  }
  return out;
}

// Frame numbers enumerated directly from the files on disk under
// frontend/public/craftpix-891165-.../PNG/<Hero>/<Anim>/ — filenames are not a
// uniform range (some start at 0, Rogue/Idle skips 11, Rogue/Attack is capitalized).
export const HERO_ANIMATIONS: Record<HeroId, Record<HeroAnimKey, HeroAnimationConfig>> = {
  knight: {
    idle: { animFolder: "Idle", filePrefix: "idle", frames: range(1, 12), frameRate: 8, repeat: -1 },
    walk: { animFolder: "Walk", filePrefix: "walk", frames: range(1, 6), frameRate: 12, repeat: -1 },
    attack: { animFolder: "Attack", filePrefix: "attack", frames: range(0, 4), frameRate: 16, repeat: 0 },
    hurt: { animFolder: "Hurt", filePrefix: "hurt", frames: range(1, 4), frameRate: 12, repeat: 0 },
    death: { animFolder: "Death", filePrefix: "death", frames: range(1, 10), frameRate: 10, repeat: 0 }
  },
  mage: {
    idle: { animFolder: "Idle", filePrefix: "idle", frames: range(1, 14), frameRate: 8, repeat: -1 },
    walk: { animFolder: "Walk", filePrefix: "walk", frames: range(1, 6), frameRate: 12, repeat: -1 },
    attack: { animFolder: "Attack", filePrefix: "attack", frames: range(1, 7), frameRate: 14, repeat: 0 },
    hurt: { animFolder: "Hurt", filePrefix: "hurt", frames: range(1, 4), frameRate: 12, repeat: 0 },
    death: { animFolder: "Death", filePrefix: "death", frames: range(1, 10), frameRate: 10, repeat: 0 }
  },
  rogue: {
    idle: {
      animFolder: "Idle",
      filePrefix: "idle",
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18],
      frameRate: 8,
      repeat: -1
    },
    walk: { animFolder: "Walk", filePrefix: "walk", frames: range(1, 6), frameRate: 12, repeat: -1 },
    attack: { animFolder: "Attack", filePrefix: "Attack", frames: range(1, 7), frameRate: 16, repeat: 0 },
    hurt: { animFolder: "Hurt", filePrefix: "hurt", frames: range(1, 4), frameRate: 12, repeat: 0 },
    death: { animFolder: "Death", filePrefix: "death", frames: range(1, 10), frameRate: 10, repeat: 0 }
  }
};

export function heroFramePath(hero: HeroId, anim: HeroAnimKey, frame: number) {
  const config = HERO_ANIMATIONS[hero][anim];
  return `${HEROES_ROOT}/${HERO_FOLDER[hero]}/${config.animFolder}/${config.filePrefix}${frame}.png`;
}

export function heroFrameTextureKey(hero: HeroId, anim: HeroAnimKey, frame: number) {
  return `hero-${hero}-${anim}-${frame}`;
}

export function heroAnimKey(hero: HeroId, anim: HeroAnimKey) {
  return `hero-${hero}-${anim}`;
}

export const BOSS_TIER_BY_PHASE: Record<BossPhase, OrcTier> = {
  phase_1: "orc1",
  phase_2: "orc2",
  phase_3: "orc3"
};

export const ORC_FRAME_SIZE = 64;
export const ORC_ROWS = 4;

type OrcAnimationConfig = {
  frameRate: number;
  repeat: number;
};

// Column counts vary per animation (confirmed identical across orc1/orc2/orc3
// via sheet pixel width / ORC_FRAME_SIZE); Phaser derives columns itself from
// the spritesheet + frameWidth, so only playback config lives here.
export const ORC_ANIMATIONS: Record<OrcAnimKey, OrcAnimationConfig> = {
  idle: { frameRate: 6, repeat: -1 },
  walk: { frameRate: 10, repeat: -1 },
  run: { frameRate: 14, repeat: -1 },
  attack: { frameRate: 14, repeat: 0 },
  hurt: { frameRate: 12, repeat: 0 },
  death: { frameRate: 8, repeat: 0 }
};

export function orcSheetPath(tier: OrcTier, anim: OrcAnimKey) {
  const folder = tier === "orc1" ? "Orc1" : tier === "orc2" ? "Orc2" : "Orc3";
  return `${ORC_ROOT}/${folder}/With_shadow/${tier}_${anim}_with_shadow.png`;
}

export function orcTextureKey(tier: OrcTier, anim: OrcAnimKey) {
  return `boss-${tier}-${anim}`;
}

export function orcAnimKey(tier: OrcTier, anim: OrcAnimKey) {
  return `boss-anim-${tier}-${anim}`;
}

export const ARENA_PROP_PATHS = [
  `${UNDEAD_ROOT}/Objects_separately/Tree_shadow1_1.png`,
  `${UNDEAD_ROOT}/Objects_separately/Tree_shadow3_1.png`,
  `${UNDEAD_ROOT}/Objects_separately/Grave_shadow2_8.png`,
  `${UNDEAD_ROOT}/Objects_separately/Grave_shadow2_9.png`,
  `${UNDEAD_ROOT}/Objects_separately/Bones_shadow1_8.png`,
  `${UNDEAD_ROOT}/Objects_separately/Bones_shadow2_11.png`,
  `${UNDEAD_ROOT}/Objects_separately/Crystal_shadow1_1.png`,
  `${UNDEAD_ROOT}/Objects_separately/Crystal_shadow3_2.png`,
  `${UNDEAD_ROOT}/Objects_separately/Ruin_shadow2_1.png`
];
