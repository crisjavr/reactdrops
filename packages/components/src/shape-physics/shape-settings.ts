import { solidKinds, solidPalette, type SolidKind } from './solid-shapes';

/** Real 3D tumbling volumes, or the same figures kept flat. */
export type ShapeDepth = '3d' | '2d';
/** Kept for compatibility: every value renders the projected solids. */
export type ShapeVariant = 'solids';
export type ShapeKind = 'mixed' | SolidKind;

export type ShapeSettings = {
  /** @deprecated Ignored; Shape Physics always renders projected solids. */
  variant: ShapeVariant;
  shape: ShapeKind;
  depth: ShapeDepth;
  faces: boolean;
  faceColor: string;
  followCursor: boolean;
  cursorFollowRatio: number;
  count: number;
  size: number;
  sizeVariation: number;
  spawnRate: number;
  appearanceDuration: number;
  gravity: number;
  wind: number;
  restitution: number;
  friction: number;
  damping: number;
  spin: number;
  seed: number;
  paused: boolean;
  interactive: boolean;
  colors: readonly string[];
  background: string;
};

export const shapeDefaults: ShapeSettings = {
  variant: 'solids',
  shape: 'mixed',
  depth: '3d',
  faces: true,
  faceColor: '#ffffff',
  followCursor: true,
  cursorFollowRatio: 0.4,
  count: 22,
  size: 50,
  sizeVariation: 0.15,
  spawnRate: 14,
  appearanceDuration: 0.55,
  gravity: 1600,
  wind: 0,
  restitution: 0.42,
  friction: 0.45,
  damping: 0,
  spin: 1,
  seed: 52490,
  paused: false,
  interactive: true,
  colors: solidPalette,
  background: 'var(--theme-background, Canvas)',
};

/** Hard ceiling for automatic figures; capacity usually stops much earlier. */
export const shapeMaxCount = 400;

export const shapeClamp = (n: number, lo: number, hi: number, fallback: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : fallback));

export function normalizeShapeSettings(input: ShapeSettings): ShapeSettings {
  return {
    ...input,
    variant: 'solids',
    shape:
      input.shape === 'mixed' || (solidKinds as readonly string[]).includes(input.shape)
        ? input.shape
        : 'mixed',
    depth: input.depth === '2d' ? '2d' : '3d',
    followCursor: input.followCursor !== false,
    cursorFollowRatio: shapeClamp(input.cursorFollowRatio, 0, 1, shapeDefaults.cursorFollowRatio),
    count: Math.round(shapeClamp(input.count, 0, shapeMaxCount, shapeDefaults.count)),
    size: shapeClamp(input.size, 8, 80, shapeDefaults.size),
    sizeVariation: shapeClamp(input.sizeVariation, 0, 0.8, shapeDefaults.sizeVariation),
    spawnRate: shapeClamp(input.spawnRate, 0.2, 30, shapeDefaults.spawnRate),
    appearanceDuration: shapeClamp(
      input.appearanceDuration,
      0,
      5,
      shapeDefaults.appearanceDuration,
    ),
    gravity: shapeClamp(input.gravity, -4000, 4000, shapeDefaults.gravity),
    wind: shapeClamp(input.wind, -600, 600, 0),
    restitution: shapeClamp(input.restitution, 0, 0.95, shapeDefaults.restitution),
    friction: shapeClamp(input.friction, 0, 1, shapeDefaults.friction),
    damping: shapeClamp(input.damping, 0, 5, shapeDefaults.damping),
    spin: shapeClamp(input.spin, 0, 4, shapeDefaults.spin),
    seed: Math.round(shapeClamp(input.seed, 0, 100000, shapeDefaults.seed)),
    colors: input.colors?.length ? input.colors.slice(0, 12) : shapeDefaults.colors,
  };
}

/** Small seeded generator (mulberry32) so a seed replays the same scene. */
export function shapeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
