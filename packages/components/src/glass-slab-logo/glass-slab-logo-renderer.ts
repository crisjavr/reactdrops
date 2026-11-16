import {
  DISPLAY_SHADER,
  ROW_BUCKETS,
  SLAB_HEADER_TEXELS,
  SLAB_TINT_TEXEL,
  VERTEX_SHADER,
  fragmentShader,
  shaderVariantKey,
  type GlassSlabShaderVariant,
} from './glass-slab-logo-shader';
import {
  glassSlabCutOptions,
  logoCoverage,
  recommendSlabCount,
  sliceLogo,
  MAX_SPANS_PER_ROW,
  MAX_ROWS,
  type GlassSlabLayout,
  type GlassSlabLogoRenderMode,
  type LogoCoverage,
} from './glass-slab-logo-slices';
import { soapBubbleFilmSize, soapBubbleFilmTable } from '../soap-bubble/soap-bubble-film';

export type GlassSlabLogoTuning = {
  /** Image URL of the logo. SVG or PNG with transparency works best. */
  logo: string;
  /** Number of rows across the logo, including rows used for detached details. */
  slabs: number;
  /** Select detailed cutouts, simple ellipses, or let the logo choose. */
  renderMode: GlassSlabLogoRenderMode;
  /** Where each disc samples the logo inside its band, 0 (top) to 1 (bottom). */
  phase: number;
  /**
   * How much of its slice each disc covers: 0 the logo's width along the cut
   * line, 1 the widest part of the slice.
   */
  band: number;
  /** Detached pieces (a leaf, a dot) get at least this many discs of their own. */
  minPieceSlabs: number;
  /** Glass thickness as a share of the logo height. */
  thickness: number;
  /** Front-to-back radius of a disc as a share of the spacing between discs. */
  depth: number;
  /** Degrees the camera sits below the logo center, looking up at the stack. */
  elevation: number;
  /** Camera distance in logo heights. Closer exaggerates the perspective. */
  distance: number;
  /**
   * 0 keeps the camera's sensor upright (verticals stay parallel, like a shift
   * lens); 1 tilts the whole camera up at the logo, so the discs open up more
   * gradually toward the top. The stack is built so the logo keeps its shape.
   */
  keystone: number;
  /** Index of refraction of the glass. */
  ior: number;
  /** Brightness of the studio lights reflected in the polished glass. */
  reflectivity: number;
  /** Transmit the backdrop through the polished faces. */
  clearGlass: boolean;
  /** Body tint and thin-film finish from the Bubble UI iPhone dock. */
  oilFinish: 'none' | 'light' | 'dark';
  /** Absorption multiplier: 1 shows each color through one disc thickness. */
  density: number;
  /**
   * Glass tints from the top of the logo to the bottom, evenly spaced (2 to 6).
   * Each is the color of light through one disc thickness.
   */
  colors: string[];
  /**
   * Page color behind the logo. "transparent" keeps the glass and leaves an
   * alpha channel for the gaps and the softer parts of each disc.
   */
  backgroundColor: string;
  /** Color of the lit card behind the glass. White matches a white page; on dark pages it backlights the glass. */
  lightColor: string;
  /** Brightness of the light from the backdrop. Above 1 it saturates like a backlit photo. */
  exposure: number;
  /**
   * Brightness of the studio around the backdrop, relative to white. Dark
   * surroundings outline the glass with dark edges, like product shots on a
   * white card; bright surroundings make the edges glow on dark pages.
   */
  ambient: number;
  /** Size of the lit backdrop relative to the view. Smaller darkens more of each edge. */
  backdropSize: number;
  /** Distance of the backdrop behind the logo, in logo heights. */
  backdropDistance: number;
  /** Lens opening in logo heights. Blurs the far edge of each disc; 0 keeps everything sharp. */
  aperture: number;
  /** Depth in focus, in disc depths: -1 is the near edge of each disc, 0 its middle. */
  focus: number;
  /** Logo size as a share of the container's shorter fitting side. */
  logoScale: number;
  /** Degrees the camera orbits toward the pointer. 0 keeps it still. */
  tilt: number;
  /**
   * Expand the discs from their centers when the logo first shows, in a wave
   * that climbs from the bottom row to the top with a soft power4 bounce.
   */
  intro: boolean;
  introDuration: number;
  /** Seconds before the entrance starts. */
  delay: number;
  /** Playback speed of the entrance. */
  speed: number;
  /** Rays per pixel once the image settles. More smooths thin edges and the lens blur. */
  samples: number;
  /** Optional pixel ratio limit. Null renders at the device pixel ratio. */
  maxDpr: number | null;
};

/** Demo silhouettes. Any image works. */
export const glassSlabLogoMarks = {
  apple: `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
  )}`,
  reactdrops: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 208">
      <path d="M.5 0 C.6667 0 .8333 0 1 0 C1 .1667 1 .3333 1 .5 C1 .6667 1 .8333 1 1 C.8333 1 .6667 1 .5 1 C.362 1 .232 .945 .146 .854 C.055 .768 0 .638 0 .5 C0 .362 .055 .232 .146 .146 C.232 .055 .362 0 .5 0 Z" transform="translate(0 108) scale(100)"/>
      <path d="M.5 0 C.6667 0 .8333 0 1 0 C1 .1667 1 .3333 1 .5 C1 .6667 1 .8333 1 1 C.8333 1 .6667 1 .5 1 C.362 1 .232 .945 .146 .854 C.055 .768 0 .638 0 .5 C0 .362 .055 .232 .146 .146 C.232 .055 .362 0 .5 0 Z" transform="scale(100)"/>
      <path d="M.5 0 C.6067 .1033 .7133 .2067 .82 .31 C.91 .4 .955 .5025 .955 .605 C.955 .7075 .91 .81 .82 .9 C.735 .9675 .6175 1.00125 .5 1.00125 C.3825 1.00125 .265 .9675 .18 .9 C.09 .81 .045 .7075 .045 .605 C.045 .5025 .09 .4 .18 .31 C.2867 .2067 .3933 .1033 .5 0 Z" transform="translate(108 108) scale(100)"/>
      <path d="M.5 0 C.5333 0 .5667 0 .6 0 C.821 0 1 .179 1 .4 C1 .6 1 .8 1 1 C.8333 1 .6667 1 .5 1 C.3333 1 .1667 1 0 1 C0 .8333 0 .6667 0 .5 C0 .3333 0 .1667 0 0 C.1667 0 .3333 0 .5 0 Z" transform="translate(108 0) scale(100)"/>
    </svg>`,
  )}`,
  drop: `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 120"><path fill="#000" d="M48 8C48 8 86 50 86 78A38 38 0 0 1 10 78C10 50 48 8 48 8Z"/><circle fill="#000" cx="88" cy="22" r="13"/></svg>',
  )}`,
  ring: `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#000" fill-rule="evenodd" d="M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92zm0 22a24 24 0 1 0 0 48a24 24 0 1 0 0-48z"/></svg>',
  )}`,
  bolt: `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 100"><path fill="#000" d="M40 0L4 58h24L20 100l40-62H34z"/></svg>',
  )}`,
};

const citrusTints = ['#f3ef3e', '#f1e409', '#c3d006', '#a1d512', '#48cf17', '#67ece0'];
const darkCitrus = {
  colors: ['#fff27b', '#fce854', '#d4e13b', '#a5e13e', '#58d849', '#69f3df'],
  backgroundColor: '#000000',
  lightColor: '#fffdf1',
  ambient: 0.18,
  exposure: 1.16,
  reflectivity: 0,
};

const oilBase = {
  lightColor: '#ffffff',
  ambient: 0.05,
  exposure: 1,
  reflectivity: 1.3,
};

const clearGlassOptics = { ior: 1.1, reflectivity: 1.6 };

export const glassSlabLogoColorPresets = {
  citrus: {
    colors: citrusTints,
    backgroundColor: '#ffffff',
    lightColor: '#ffffff',
    ambient: 0.05,
    exposure: 1.18,
    reflectivity: 0,
  },
  ocean: {
    colors: ['#a8ecff', '#62c6ff', '#3f8cff', '#5a5cff', '#9a6bff'],
    backgroundColor: '#ffffff',
    lightColor: '#ffffff',
    ambient: 0.05,
    exposure: 1.18,
    reflectivity: 0,
  },
  sunset: {
    colors: ['#ffe45c', '#ffc23c', '#ff8a3d', '#ff5a5a', '#ff4fa3'],
    backgroundColor: '#ffffff',
    lightColor: '#ffffff',
    ambient: 0.05,
    exposure: 1.18,
    reflectivity: 0,
  },
  citrusDark: darkCitrus,
  oceanDark: {
    colors: ['#abedff', '#6acfff', '#659bff', '#8285ff', '#bd97ff'],
    backgroundColor: '#000000',
    lightColor: '#edf4ff',
    ambient: 0.22,
    exposure: 1.24,
    reflectivity: 0,
  },
  sunsetDark: {
    colors: ['#ffe894', '#ffcb71', '#ff9b68', '#ff7586', '#ff84c5'],
    backgroundColor: '#000000',
    lightColor: '#fff2ed',
    ambient: 0.18,
    exposure: 1.16,
    reflectivity: 0,
  },
  clear: {
    ...clearGlassOptics,
    colors: ['#ffffff', '#f1f3f5'],
    backgroundColor: '#ffffff',
    lightColor: '#ffffff',
    ambient: 0.27,
    exposure: 0.89,
  },
  clearDark: {
    ...clearGlassOptics,
    clearGlass: true,
    colors: ['#ffffff', '#f7f9fb'],
    backgroundColor: '#000000',
    lightColor: '#f1f5f9',
    ambient: 0.045,
    exposure: 1,
  },
  oil: {
    ...oilBase,
    colors: ['#ffffff', '#ffffff'],
    backgroundColor: '#ffffff',
    oilFinish: 'light',
  },
  oilDark: {
    ...oilBase,
    colors: ['#141414', '#141414'],
    backgroundColor: '#000000',
    oilFinish: 'dark',
  },
  night: darkCitrus,
} satisfies Record<
  string,
  Pick<
    GlassSlabLogoTuning,
    'colors' | 'backgroundColor' | 'lightColor' | 'ambient' | 'exposure' | 'reflectivity'
  > &
    Partial<Pick<GlassSlabLogoTuning, 'oilFinish' | 'clearGlass' | 'ior'>>
>;

// Left and right extremities, front rim and tip heights measured in the
// resting reference image, followed by the disc's position in the tint ramp.
const appleRims = [
  [319, 347, 63.9, 68.6, 0.02],
  [284.3, 347, 71.7, 83.9, 0.065],
  [263.8, 342.5, 90.1, 104.3, 0.12],
  [247.5, 333.6, 111.1, 126.6, 0.16],
  [237.4, 318.2, 134.9, 149.6, 0.2],
  [232.8, 294, 158.2, 168.7, 0.21],
  [232.7, 262.8, 177.6, 181.6, 0.16],
  [86.1, 228, 199.2, 219.6, 0],
  [255.2, 412, 197, 220.8, 0],
  [55.8, 439.8, 216.9, 245.4, 0.045],
  [35.4, 405.3, 248.2, 275.1, 0.18],
  [26.4, 389.5, 280.2, 304.6, 0.27],
  [23.1, 381.7, 311.9, 333.3, 0.4],
  [21.7, 384.5, 343.2, 362.6, 0.52],
  [25, 394.8, 374.6, 392.5, 0.64],
  [31.2, 414.2, 405.7, 422.3, 0.76],
  [41, 453.2, 436.6, 452.2, 0.79],
  [55.2, 442.3, 470.8, 482.6, 0.807],
  [69.7, 425.7, 504.8, 512.7, 0.902],
  [91.1, 406, 538.3, 543.2, 0.949],
  [119.6, 218.6, 571.8, 573.7, 1],
  [279.2, 378.2, 571.7, 573.8, 1],
];

export const glassSlabLogoDefaults: GlassSlabLogoTuning = {
  logo: glassSlabLogoMarks.apple,
  slabs: appleRims.length,
  renderMode: 'auto',
  phase: 0.75,
  band: 0,
  minPieceSlabs: 7,
  thickness: 0.008,
  depth: 0.5,
  elevation: 47,
  distance: 0.6,
  keystone: 0,
  ior: 1.42,
  density: 1,
  clearGlass: false,
  oilFinish: 'none',
  ...glassSlabLogoColorPresets.citrus,
  backdropSize: 1.3,
  backdropDistance: 4,
  aperture: 0,
  focus: -1,
  logoScale: 0.73,
  tilt: 3,
  intro: true,
  introDuration: 1.6,
  delay: 0,
  speed: 1,
  samples: 48,
  maxDpr: null,
};

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
const hex = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function normalizeGlassSlabLogo(value: Partial<GlassSlabLogoTuning>): GlassSlabLogoTuning {
  const d = glassSlabLogoDefaults;
  return {
    logo: typeof value.logo === 'string' && value.logo ? value.logo : d.logo,
    slabs: Math.round(finite(value.slabs, d.slabs, 3, MAX_ROWS)),
    renderMode:
      value.renderMode === 'detailed' || value.renderMode === 'ellipses'
        ? value.renderMode
        : d.renderMode,
    phase: finite(value.phase, d.phase, 0, 1),
    band: finite(value.band, d.band, 0, 1),
    minPieceSlabs: Math.round(finite(value.minPieceSlabs, d.minPieceSlabs, 1, 24)),
    thickness: finite(value.thickness, d.thickness, 0.001, 0.05),
    depth: finite(value.depth, d.depth, 0.05, 6),
    elevation: finite(value.elevation, d.elevation, 0, 60),
    distance: finite(value.distance, d.distance, 0.5, 20),
    keystone: finite(value.keystone, d.keystone, 0, 1),
    ior: finite(value.ior, d.ior, 1.05, 2.4),
    reflectivity: finite(value.reflectivity, d.reflectivity, 0, 2),
    clearGlass: value.clearGlass === true,
    oilFinish: value.oilFinish === 'light' || value.oilFinish === 'dark' ? value.oilFinish : 'none',
    density: finite(value.density, d.density, 0, 8),
    colors:
      Array.isArray(value.colors) && value.colors.length >= 2
        ? value.colors.slice(0, 6).map((color, i) => hex(color, d.colors[i] ?? d.colors[0]))
        : d.colors,
    backgroundColor:
      value.backgroundColor === 'transparent'
        ? 'transparent'
        : hex(value.backgroundColor, d.backgroundColor),
    lightColor: hex(value.lightColor, d.lightColor),
    exposure: finite(value.exposure, d.exposure, 0.1, 6),
    ambient: finite(value.ambient, d.ambient, 0, 3),
    backdropSize: finite(value.backdropSize, d.backdropSize, 1, 10),
    backdropDistance: finite(value.backdropDistance, d.backdropDistance, 0.05, 40),
    aperture: finite(value.aperture, d.aperture, 0, 0.5),
    focus: finite(value.focus, d.focus, -3, 3),
    logoScale: finite(value.logoScale, d.logoScale, 0.1, 1),
    tilt: finite(value.tilt, d.tilt, 0, 20),
    intro: typeof value.intro === 'boolean' ? value.intro : d.intro,
    introDuration: finite(value.introDuration, d.introDuration, 0.1, 10),
    delay: finite(value.delay, d.delay, 0, 30),
    speed: finite(value.speed, d.speed, 0.1, 4),
    samples: Math.round(finite(value.samples, d.samples, 1, 256)),
    maxDpr:
      typeof value.maxDpr === 'number' && Number.isFinite(value.maxDpr)
        ? Math.min(4, Math.max(0.5, value.maxDpr))
        : d.maxDpr,
  };
}

const encodeSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.min(1, c) ** (1 / 2.4) - 0.055;

const srgbToLinear = (hexColor: string) => {
  const n = parseInt(hexColor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
};

function smoothstep(low: number, high: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Glass tint at a height through the logo, 0 at the top and 1 at the bottom. */
function tintAt(t: number, stops: Vec3[]) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return stops[i].map((c, j) => c + (stops[i + 1][j] - c) * s) as [number, number, number];
}

/**
 * power4.out with a soft overshoot: rises fast, passes 1 by about 8% around
 * the middle and settles back with zero speed.
 */
export const bouncyPower4 = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 4 * (1 - 4.3 * x);
};

/** Inverse of the matrix whose columns are a, b, c, as column-major floats. */
function invert3(a: number[], b: number[], c: number[]) {
  const [a0, a1, a2] = a,
    [b0, b1, b2] = b,
    [c0, c1, c2] = c;
  const det = a0 * (b1 * c2 - b2 * c1) - b0 * (a1 * c2 - a2 * c1) + c0 * (a1 * b2 - a2 * b1);
  const k = 1 / (det || 1e-9);
  // Rows of the inverse, written column-major for WebGL.
  const r0 = [(b1 * c2 - b2 * c1) * k, (c0 * b2 - b0 * c2) * k, (b0 * c1 - c0 * b1) * k];
  const r1 = [(c1 * a2 - a1 * c2) * k, (a0 * c2 - c0 * a2) * k, (c0 * a1 - a0 * c1) * k];
  const r2 = [(a1 * b2 - b1 * a2) * k, (b0 * a2 - a0 * b2) * k, (a0 * b1 - b0 * a1) * k];
  return new Float32Array([r0[0], r1[0], r2[0], r0[1], r1[1], r2[1], r0[2], r1[2], r2[2]]);
}

type Vec3 = [number, number, number];
export type GlassSlabCamera = { position: Vec3; forward: Vec3; right: Vec3; up: Vec3 };

/** Where the camera sees a world point, in picture units (the logo's units). */
function pictureOf(camera: GlassSlabCamera, point: Vec3): [number, number] {
  const m = invert3(camera.forward, camera.right, camera.up);
  const v = point.map((c, i) => c - camera.position[i]);
  const depth = m[0] * v[0] + m[3] * v[1] + m[6] * v[2];
  const x = m[1] * v[0] + m[4] * v[1] + m[7] * v[2];
  const y = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
  return [x / depth, y / depth];
}

/**
 * Pinhole camera below and in front of the logo, aimed at its center. Rays
 * leave along forward + right * x + up * y for a point (x, y) of the picture.
 */
export function glassSlabCamera(
  tuning: Pick<GlassSlabLogoTuning, 'distance' | 'elevation' | 'keystone'>,
  yaw = 0,
  pitchOffset = 0,
): GlassSlabCamera {
  const D = tuning.distance;
  const elevation = Math.max(0, Math.min(1.3, (tuning.elevation * Math.PI) / 180 + pitchOffset));
  const position: Vec3 = [D * Math.sin(yaw), -D * Math.tan(elevation), -D * Math.cos(yaw)];
  const forward = position.map((c) => -c) as Vec3;
  const reach = Math.hypot(...forward);
  const f = forward.map((c) => c / reach);
  const across = Math.hypot(f[2], f[0]);
  const right: Vec3 = [f[2] / across, 0, -f[0] / across];
  // The tilted up vector is perpendicular to the view; 0 keystone keeps it upright.
  const tilted = [
    f[1] * right[2] - f[2] * right[1],
    f[2] * right[0] - f[0] * right[2],
    f[0] * right[1] - f[1] * right[0],
  ];
  const k = tuning.keystone;
  const raw = [tilted[0] * k, tilted[1] * k + (1 - k), tilted[2] * k];
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  return { position, forward, right, up: raw.map((c) => c / length) as Vec3 };
}

/**
 * Where a disc row must sit in space so that, seen from the resting camera,
 * its base lands on the logo row at picture height t: world height, the
 * horizontal scale at that height, and the world spacing per picture unit.
 */
function anamorphicRow(camera: GlassSlabCamera, t: number) {
  const [, h, D] = camera.forward;
  const [, uy, uz] = camera.up;
  const depth = Math.max(D + t * uz, D * 0.05);
  return {
    y: (D * (h + t * uy)) / depth - h,
    scale: D / depth,
    stretch: (D * (uy * D - h * uz)) / (depth * depth),
  };
}

function referenceAppleLayout(count: number): GlassSlabLayout {
  const [, cameraHeight, distance] = glassSlabCamera(glassSlabLogoDefaults).forward;
  const imageHeight = 518;
  // The measured rims use the original spacing for their camera focus and depth.
  const pitch = 1 / 17;
  const measured = appleRims.map(([left, right, front, tip, tint]) => {
    const frontY = (319 - front + 1) / imageHeight;
    const tipY = (319 - tip) / imageHeight;
    const center = ((left + right) / 2 - 240) / imageHeight;
    const radius = (right - left) / 2 / imageHeight;
    // Invert the pinhole projection for a horizontal ellipse. Its widest
    // points project slightly in front of its world-space center.
    const depthRatio = (frontY - tipY) / (cameraHeight + frontY);
    const scale = 1 - depthRatio ** 2;
    return {
      y: tipY - (cameraHeight + tipY) * depthRatio ** 2,
      pitch,
      tint,
      spans: [
        {
          x: center * scale,
          a: Math.sqrt(scale * (radius ** 2 - (center * depthRatio) ** 2)),
          halfDepth: depthRatio * distance,
        },
      ],
    };
  });
  const resample = (source: typeof measured, length: number) => {
    if (source.length === length) return source;
    const depthScale = Math.min(1, source.length / length);
    return Array.from({ length }, (_, i) => {
      const position =
        length === 1 ? (source.length - 1) / 2 : (i / (length - 1)) * (source.length - 1);
      const index = Math.min(Math.floor(position), source.length - 2);
      const low = source[index];
      const high = source[index + 1];
      const blend = (a: number, b: number) => a + (b - a) * (position - index);
      return {
        y: blend(low.y, high.y),
        pitch,
        tint: blend(low.tint, high.tint),
        spans: [
          {
            x: blend(low.spans[0].x, high.spans[0].x),
            a: blend(low.spans[0].a, high.spans[0].a),
            halfDepth: depthScale * blend(low.spans[0].halfDepth, high.spans[0].halfDepth),
          },
        ],
      };
    });
  };
  const pairedRows = (pair: typeof measured, length: number) => {
    if (length === 2) return pair;
    if (length === 0) return [];
    const [left, right] = pair;
    return [
      {
        y: (left.y + right.y) / 2,
        pitch,
        tint: (left.tint + right.tint) / 2,
        spans: [...left.spans, ...right.spans],
      },
    ];
  };
  // Resample the leaf and body separately. The shoulder and bottom pairs
  // can share a row at low counts without bridging their horizontal gaps.
  const shoulders = count >= 14 ? 2 : count >= 5 ? 1 : 0;
  const feet = count >= 16 ? 2 : count >= 7 ? 1 : 0;
  const main = count - shoulders - feet;
  const leaf = Math.round((7 * main) / 18);
  const rows = [
    ...resample(measured.slice(0, 7), leaf),
    ...pairedRows(measured.slice(7, 9), shoulders),
    ...resample(measured.slice(9, -2), main - leaf),
    ...pairedRows(measured.slice(-2), feet),
  ];
  rows.sort((a, b) => a.y - b.y);
  return { rows, pitch, width: (453.2 - 21.7) / imageHeight };
}

export async function recommendGlassSlabLogoDiscs(logo: string) {
  if (logo === glassSlabLogoMarks.apple) return appleRims.length;
  const coverage = await logoCoverage(logo);
  return coverage ? recommendSlabCount(coverage) : 17;
}

type Backdrop = {
  source: HTMLImageElement | HTMLVideoElement;
  backgroundColor: string;
  backgroundX: number;
  backgroundY: number;
  backgroundScale: number;
  backgroundTint: string;
  backgroundTintOpacity: number;
  colorOpacity?: number;
};

export type GlassSlabLogoRenderer = {
  update: (tuning: GlassSlabLogoTuning) => void;
  setBackdrop: (backdrop: Backdrop | null) => void;
  replay: () => void;
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
  renderFrame: (seconds: number, samples: number) => void;
  dispose: () => void;
};

type PixelRect = { x: number; y: number; w: number; h: number };

function unionRect(a: PixelRect | null, b: PixelRect | null): PixelRect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Rays per pixel in one frame once still; frames accumulate until `samples`. */
const SAMPLES_PER_FRAME = 2;
/**
 * The first still image holds as many rays as a moving frame. They are traced
 * a few per frame and shown together, so releasing the pointer never stalls
 * one frame on a large batch.
 */
const FIRST_STILL_BATCH = 4;
/** Pointer easing stops once the image would move less than this (device pixels). */
const POINTER_SNAP_PIXELS = 0.25;
/** Maximum balanced lens and subpixel samples per moving frame. */
const MOTION_SAMPLES = 12;
/** Approximate ray budget for the glass rectangle on a moving frame. */
const MOTION_RAY_BUDGET = 3_600_000;
/**
 * Frame pacing, in display frames and milliseconds: a frame that took this
 * many display intervals (and at least this long) lowers the rays per frame;
 * one back on time raises them again, up to the full budget.
 */
const SLOW_FRAME = [1.6, 18];
const FAST_FRAME = [1.25, 14];
let oilTable: Float32Array | undefined;

export function createGlassSlabLogoRenderer(
  canvas: HTMLCanvasElement,
  initial: GlassSlabLogoTuning,
  {
    onReady,
    onLogoReady,
    onFallback,
    paused = false,
    exportSize,
  }: {
    onReady?: () => void;
    onLogoReady?: (logo: string) => void;
    onFallback?: () => void;
    paused?: boolean;
    exportSize?: { width: number; height: number };
  } = {},
): GlassSlabLogoRenderer | null {
  const win = canvas.ownerDocument.defaultView ?? window;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    onFallback?.();
    return null;
  }
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
    return shader;
  };
  const link = (fragment: string) => {
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
    return program;
  };
  // Samples average in linear light on a half-float target when the GPU can
  // render to one; otherwise in 8-bit sRGB, which still settles cleanly.
  const linear = !!gl.getExtension('EXT_color_buffer_float');
  // One tracer per combination of code paths, compiled when first needed.
  const tracers = new Map<string, WebGLProgram>();
  const tracerFor = (variant: GlassSlabShaderVariant) => {
    const key = shaderVariantKey(variant);
    let program = tracers.get(key);
    if (!program) tracers.set(key, (program = link(fragmentShader(variant))));
    return program;
  };
  const usesAppleReference = (t: GlassSlabLogoTuning) =>
    t.logo === glassSlabLogoMarks.apple &&
    t.renderMode !== 'detailed' &&
    t.phase === glassSlabLogoDefaults.phase &&
    t.band === glassSlabLogoDefaults.band &&
    t.minPieceSlabs === glassSlabLogoDefaults.minPieceSlabs;
  const variantOf = (t: GlassSlabLogoTuning, apple: boolean, media: boolean, inlay = false) =>
    ({
      hasMedia: media,
      oilMode: t.oilFinish === 'dark' ? 2 : t.oilFinish === 'light' ? 1 : 0,
      clearGlass: t.clearGlass && t.oilFinish === 'none',
      calibratedApple: apple,
      transparent: t.backgroundColor === 'transparent',
      reflective: t.reflectivity > 0,
      lens: t.aperture > 0,
      encode: !linear,
      inlay,
    }) satisfies GlassSlabShaderVariant;
  let tracer: WebGLProgram, display: WebGLProgram;
  try {
    display = link(DISPLAY_SHADER);
    // Compile the program the first frame will use, so a failure falls back now.
    tracer = tracerFor(variantOf(initial, usesAppleReference(initial), false));
  } catch (error) {
    console.error(error);
    onFallback?.();
    return null;
  }
  const locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const at = (program: WebGLProgram, name: string) => {
    let table = locations.get(program);
    if (!table) locations.set(program, (table = new Map()));
    if (!table.has(name)) table.set(name, gl.getUniformLocation(program, name));
    return table.get(name)!;
  };
  const uniform = (name: string) => at(tracer, name);
  const vao = gl.createVertexArray();
  const makeTexture = (filter: number = gl.NEAREST) => {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };
  const slabTexture = makeTexture();
  const rowLookupTexture = makeTexture();
  const rowLookup = new Float32Array(ROW_BUCKETS + 1);
  let rowRange = [0, 1];
  const accumulation = makeTexture();
  const mediaTexture = makeTexture();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const oilTexture = makeTexture();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  let oilUploaded = false;
  // Keep the current and previous cuts resident when the disc slider reverses.
  const plateTextures = new Map<
    NonNullable<GlassSlabLayout['inlay']>,
    { design: WebGLTexture; width: WebGLTexture }
  >();
  const clearPlateTextures = () => {
    for (const textures of plateTextures.values()) {
      gl.deleteTexture(textures.design);
      gl.deleteTexture(textures.width);
    }
    plateTextures.clear();
  };
  const framebuffer = gl.createFramebuffer();
  let backdrop: Backdrop | null = null;
  let backdropKey = '';
  let mediaUrl = '';
  let mediaTime = -1;
  let mediaWidth = 0;
  let mediaHeight = 0;
  let textureWidth = 1;
  let textureHeight = 1;
  let mediaPlaying = false;
  let mediaDirty = false;
  let mediaAvailable = false;
  let failedSource: { element: Backdrop['source']; url: string } | null = null;
  const maxTextureSize: number = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const texelsPerRow = SLAB_HEADER_TEXELS + MAX_SPANS_PER_ROW;
  let tuning = initial;
  let coverage: { logo: string; mask: LogoCoverage } | null = null;
  let layout: GlassSlabLayout | null = null;
  let calibratedApple = false;
  let layoutKey = '';
  let requestedLogo = '';
  let presentedLogo = '';
  let rowData = new Float32Array(0);
  let allocatedRows = -1;
  let reach = { depth: 0, pitch: 0, radius: 0 };
  // Box around the finished sculpture (with the intro overshoot), in world units.
  let bounds = { x0: 0, x1: 0, y0: 0, y1: 0, z: 0 };
  let disposed = false,
    ready = false,
    visible = true,
    frame = 0;
  let width = 0,
    height = 0;
  let accumulationRect: PixelRect | null = null;
  let displayDirtyRect: PixelRect | null = null;
  let accumulationBackground: string | undefined;
  // Samples averaged since the last change to the image.
  let accumulated = 0;
  let geometryDirty = true;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let time = paused || motion.matches || !tuning.intro ? Infinity : 0;
  let playing = !paused && !motion.matches;
  let previousTime: number | null = null;
  let shownProgress = -1;
  let exportSamples = 0;
  let priorMotion = false;
  // The first still image after motion is still being traced off screen.
  let holdPartial = false;
  // Share of the full ray budget per frame. Logos with many cut edges cost
  // more per ray; following the measured frame time keeps motion smooth on
  // any GPU, and the still image reaches the same quality a few frames later.
  let load = 1;
  // A frame that ran late caps the load just under where it happened; the
  // cap lifts slowly, so pacing settles below the limit instead of probing
  // it (with vsync an on-time frame cannot show how much room is left).
  let loadCap = 1;
  let lastFrameAt = 0;
  // The display's frame interval: the shortest recent time between frames.
  let displayInterval = 1000;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const progressAt = (seconds: number) =>
    tuning.intro
      ? Math.min(1, Math.max(0, ((seconds - tuning.delay) * tuning.speed) / tuning.introDuration))
      : 1;

  // Camera distance is measured against the logo's larger side, so wide
  // wordmarks get the same gentle perspective as square marks.
  const lens = () => ({
    ...tuning,
    distance: tuning.distance * Math.max(1, layout?.width ?? 1),
  });

  const relayout = () => {
    if (coverage?.logo !== requestedLogo) return;
    const key = [
      requestedLogo,
      tuning.slabs,
      tuning.renderMode,
      tuning.phase,
      tuning.band,
      tuning.minPieceSlabs,
    ].join();
    if (key === layoutKey) return;
    layoutKey = key;
    // Keep the measured profile and tint ramp as the disc count changes.
    // Other changes to the cut use the same slicer as uploaded images.
    calibratedApple = usesAppleReference({ ...tuning, logo: requestedLogo });
    layout = calibratedApple
      ? referenceAppleLayout(tuning.slabs)
      : sliceLogo(
          coverage.mask,
          glassSlabCutOptions({
            slabs: tuning.slabs,
            renderMode: tuning.renderMode,
            phase: tuning.phase,
            band: tuning.band,
            minPieceSlabs: tuning.minPieceSlabs,
          }),
        );
    rowData = new Float32Array(layout.rows.length * texelsPerRow * 4);
    geometryDirty = true;
  };

  const uploadPlates = () => {
    const inlay = layout?.inlay;
    if (!inlay) return;
    const cached = plateTextures.get(inlay);
    if (cached) {
      plateTextures.delete(inlay);
      plateTextures.set(inlay, cached);
      return;
    }
    if (plateTextures.size === 2) {
      for (const [old, textures] of plateTextures) {
        gl.deleteTexture(textures.design);
        gl.deleteTexture(textures.width);
        plateTextures.delete(old);
        break;
      }
    }
    const { size, depth, data } = inlay;
    const textureHeight = data.length / (size * 4);
    // Preserve the original cut-out field and its local corner widths.
    const design = makeTexture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, textureHeight, 0, gl.RGBA, gl.FLOAT, data);
    const width = makeTexture(gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R16F,
      size,
      textureHeight,
      0,
      gl.RED,
      gl.FLOAT,
      inlay.widths,
    );
    plateTextures.set(inlay, { design, width });
  };

  /**
   * Writes every disc for one moment of the intro: its height, rounded-edge
   * radius, absorption, center, half width and half depth. Discs expand from
   * their centers, bottom row first, in a wave that climbs to the top.
   */
  const upload = (progress: number) => {
    if (!layout) return;
    const r = tuning.thickness / 2;
    const rows = layout.rows;
    const palette = geometryDirty ? tuning.colors.map(srgbToLinear) : null;
    const card = geometryDirty
      ? srgbToLinear(tuning.lightColor).map((c) => c * tuning.exposure)
      : null;
    const lowest = rows[0]?.y ?? 0;
    const span = Math.max((rows[rows.length - 1]?.y ?? 0) - lowest, 1e-6);
    const resting = glassSlabCamera(lens());
    reach = { depth: 0, pitch: 0, radius: 0 };
    bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z: 0 };
    let previousY = -Infinity;
    rows.forEach((row, k) => {
      const place = anamorphicRow(resting, row.y);
      const pitch = row.pitch * place.stretch;
      const base = k * texelsPerRow * 4;
      // The wave reaches the top row after 55% of the intro; each disc then
      // takes the remaining 45% to expand.
      const delay = ((row.y - lowest) / span) * 0.55;
      const raw = Math.min(1, Math.max(0, (progress - delay) / 0.45));
      const grow = bouncyPower4(raw);
      // Each row of the sculpture is scaled uniformly with its width (rows
      // farther from the camera are bigger), so discs keep their proportions.
      const radius = r * place.scale;
      rowData[base] = place.y;
      rowData[base + 1] = grow > 0.02 ? row.spans.length : 0;
      rowData[base + 2] = radius;
      rowData[base + 3] = radius;
      // Inlay coordinate per unit of x: rows are scaled by place.scale.
      rowData[base + 7] = 1 / (place.scale * layout!.width);
      if (layout!.inlay) {
        // Where the resting camera sees a point of this row's discs in the
        // logo: x across, and how far down the logo it moves (and how much
        // x shrinks) per unit of depth away from the camera.
        const e = 1e-3;
        const near = pictureOf(resting, [1, place.y, -e]);
        const at = pictureOf(resting, [1, place.y, 0]);
        const far = pictureOf(resting, [1, place.y, e]);
        rowData[base + 16] = at[0] / layout!.width;
        rowData[base + 17] = Math.max((near[1] - far[1]) / (2 * e), 1e-4);
        rowData[base + 18] = (near[0] - far[0]) / (2 * e) / at[0];
      }
      if (palette && card) {
        const tint = tintAt(row.tint ?? 0.5 - row.y, palette);
        // Each disc in a row shares the same illumination. Store its face and
        // rim tints once and leave the view-dependent blend to the tracer.
        const y = rowData[base];
        const top = smoothstep(0.22, 0.27, y);
        const bottom = 1 - smoothstep(-0.49, -0.34, y);
        const upperShade = top * (1 - smoothstep(0.28, 0.46, y));
        rowData[base + 11] = top;
        rowData[base + 15] = smoothstep(0.08, 0.15, y) * (1 - top);
        for (let c = 0; c < 3; c++) {
          rowData[base + 4 * SLAB_TINT_TEXEL + c] = tint[c];
          if (tuning.oilFinish !== 'none') {
            // Oil tints the transmitted image as a translucent surface layer.
            rowData[base + 4 + c] = 0;
            rowData[base + 8 + c] = tint[c];
            continue;
          }
          rowData[base + 4 + c] =
            (-Math.log(Math.max(tint[c], 1e-4)) / (2 * radius)) * tuning.density;
          const absorption =
            rowData[base + 4 + c] * (2 * rowData[base + 2]) * (1 + 0.27 * upperShade);
          rowData[base + 8 + c] = Math.min(1, card[c] * Math.exp(-absorption));
          const rim = card[c] * Math.exp(-absorption * (2 - 0.8 * bottom));
          rowData[base + 12 + c] = rim * (0.29 + 0.47 * bottom);
        }
      }
      row.spans.forEach((span, j) => {
        const o = base + (SLAB_HEADER_TEXELS + j) * 4;
        const fullA = Math.max(span.a * place.scale, radius * 1.05);
        const depth =
          span.halfDepth === undefined
            ? tuning.depth * row.pitch
            : span.halfDepth * (tuning.depth / glassSlabLogoDefaults.depth);
        const fullB = Math.max(Math.min(fullA, depth * place.scale), radius * 1.05);
        const a = Math.max(fullA * grow, radius * 1.05);
        const b = Math.max(fullB * grow, radius * 1.05);
        rowData[o] = span.x * place.scale;
        rowData[o + 1] = a;
        rowData[o + 2] = b;
        rowData[o + 3] = fullA / a;
        rowData[base + 3] = Math.max(rowData[base + 3], b + radius);
        reach.depth = Math.max(reach.depth, b, fullB * 1.08);
        bounds.x0 = Math.min(bounds.x0, span.x * place.scale - fullA * 1.08);
        bounds.x1 = Math.max(bounds.x1, span.x * place.scale + fullA * 1.08);
      });
      reach.radius = Math.max(reach.radius, radius);
      bounds.y0 = Math.min(bounds.y0, place.y - radius);
      bounds.y1 = Math.max(bounds.y1, place.y + radius);
      if (previousY > -Infinity) reach.pitch = Math.max(reach.pitch, place.y - previousY);
      previousY = place.y;
    });
    bounds.z = reach.depth + reach.radius;
    if (geometryDirty) uploadPlates();
    if (geometryDirty) {
      // Lookup from height to the first row at or above it. The intro
      // expands the rows in place, so their heights only change with tuning.
      const yMin = (rowData[0] ?? 0) - 1e-4;
      const yMax = (rowData[(rows.length - 1) * texelsPerRow * 4] ?? 0) + 1e-4;
      const perUnit = ROW_BUCKETS / Math.max(yMax - yMin, 1e-6);
      rowRange = [yMin, perUnit];
      for (let b = 0, k = 0; b <= ROW_BUCKETS; b++) {
        const start = yMin + b / perUnit;
        while (k < rows.length && rowData[k * texelsPerRow * 4] < start) k++;
        rowLookup[b] = k;
      }
      gl.bindTexture(gl.TEXTURE_2D, rowLookupTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, ROW_BUCKETS + 1, 1, 0, gl.RED, gl.FLOAT, rowLookup);
    }
    gl.bindTexture(gl.TEXTURE_2D, slabTexture);
    if (rows.length === allocatedRows) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        texelsPerRow,
        rows.length,
        gl.RGBA,
        gl.FLOAT,
        rowData,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        texelsPerRow,
        rows.length,
        0,
        gl.RGBA,
        gl.FLOAT,
        rowData,
      );
      allocatedRows = rows.length;
    }
    shownProgress = progress;
    geometryDirty = false;
  };

  /**
   * Pixel rectangle that can show glass, from the sculpture's box projected
   * through each camera pose. Everything outside it is plain background and
   * is never traced. The orbit's rectangle (all reachable poses) budgets the
   * rays of moving frames so their count stays stable through an orbit; the
   * current pose's rectangle bounds the pixels actually traced.
   */
  const rects = new Map<string, PixelRect>();
  const glassRect = (unitsPerPixel: number, poses: [number, number][]) => {
    const key = [
      width,
      height,
      unitsPerPixel,
      tuning.aperture,
      lens().distance,
      tuning.elevation,
      tuning.keystone,
      bounds.x0,
      bounds.x1,
      bounds.y0,
      bounds.y1,
      bounds.z,
      ...poses.flat(),
    ].join();
    let rect = rects.get(key);
    if (!rect) {
      if (rects.size > 64) rects.clear();
      rects.set(key, (rect = projectGlassRect(unitsPerPixel, poses)));
    }
    return rect;
  };
  const orbitPoses = (tiltScale: number) => {
    const poses: [number, number][] = [];
    for (const yaw of [-1, 0, 1])
      for (const pitch of [-1, 0, 1]) poses.push([yaw * tiltScale, pitch * tiltScale * 0.6]);
    return poses;
  };
  const projectGlassRect = (unitsPerPixel: number, poses: [number, number][]) => {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const [yaw, pitch] of poses) {
      const view = glassSlabCamera(lens(), yaw, pitch);
      const inverse = invert3(view.forward, view.right, view.up);
      for (const x of [bounds.x0, bounds.x1])
        for (const y of [bounds.y0, bounds.y1])
          for (const z of [-bounds.z, bounds.z]) {
            const v = [x - view.position[0], y - view.position[1], z - view.position[2]];
            const q0 = inverse[0] * v[0] + inverse[3] * v[1] + inverse[6] * v[2];
            const q1 = inverse[1] * v[0] + inverse[4] * v[1] + inverse[7] * v[2];
            const q2 = inverse[2] * v[0] + inverse[5] * v[1] + inverse[8] * v[2];
            if (q0 <= 1e-6) return { x: 0, y: 0, w: width, h: height };
            const px = q1 / q0 / unitsPerPixel + width / 2;
            const py = q2 / q0 / unitsPerPixel + height / 2;
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            y0 = Math.min(y0, py);
            y1 = Math.max(y1, py);
          }
    }
    const margin = 4 + (tuning.aperture / unitsPerPixel) * 0.15;
    const left = Math.max(0, Math.floor(x0 - margin));
    const bottom = Math.max(0, Math.floor(y0 - margin));
    const right = Math.min(width, Math.ceil(x1 + margin));
    const top = Math.min(height, Math.ceil(y1 + margin));
    return { x: left, y: bottom, w: Math.max(0, right - left), h: Math.max(0, top - bottom) };
  };

  type Batch = {
    /** Share of the new samples in the running average; 1 replaces it. */
    blend: number;
    samples: number;
    sampleOffset: number;
    motionSampling?: boolean;
    /** Start from plain background. */
    clear?: boolean;
  };

  /** Traces one batch of rays per pixel and folds it into the running average. */
  const traceBatch = ({
    blend,
    samples,
    sampleOffset,
    motionSampling = false,
    clear = false,
  }: Batch) => {
    if (!layout) return 0;
    const fit = Math.min(width / Math.max(layout.width, 1e-3), height) * tuning.logoScale;
    const unitsPerPixel = 1 / fit;
    const tiltScale = motion.matches ? 0 : (tuning.tilt * Math.PI) / 180;
    const view = glassSlabCamera(lens(), pointer.x * tiltScale, -pointer.y * tiltScale * 0.6);
    const transparent = tuning.backgroundColor === 'transparent';
    const background = transparent ? [0, 0, 0] : srgbToLinear(tuning.backgroundColor);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, oilTexture);
    if (tuning.oilFinish === 'dark' && !oilUploaded) {
      oilTable ??= soapBubbleFilmTable();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        ...soapBubbleFilmSize,
        0,
        gl.RGBA,
        gl.FLOAT,
        oilTable,
      );
      oilUploaded = true;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, mediaTexture);
    if (backdrop && mediaDirty) {
      const { source } = backdrop;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try {
        if (textureWidth === mediaWidth && textureHeight === mediaHeight) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
          textureWidth = mediaWidth;
          textureHeight = mediaHeight;
        }
        mediaAvailable = true;
      } catch {
        // An external image or video may display in the DOM while disallowing
        // pixel access. Keep that background and use the studio lighting.
        failedSource = { element: source, url: source.currentSrc };
        mediaAvailable = false;
      } finally {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        mediaDirty = false;
      }
    }
    // Pick the program after the backdrop upload, which decides whether the
    // refracted image is available.
    const inlay = layout.inlay;
    const variant = variantOf(tuning, calibratedApple, !!(backdrop && mediaAvailable), !!inlay);
    tracer = tracerFor(variant);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    if (clear) {
      // A fresh image starts as plain background; only the glass is traced.
      const shown = linear ? background : background.map(encodeSrgb);
      gl.clearColor(shown[0], shown[1], shown[2], transparent ? 0 : 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // The previous silhouette was erased too. Preserve the rest of the
      // canvas only when its already-presented background is still valid.
      displayDirtyRect =
        accumulationBackground === tuning.backgroundColor
          ? unionRect(displayDirtyRect, accumulationRect)
          : { x: 0, y: 0, w: width, h: height };
      accumulationBackground = tuning.backgroundColor;
      accumulationRect = null;
    }
    const rect = glassRect(unitsPerPixel, [[pointer.x * tiltScale, -pointer.y * tiltScale * 0.6]]);
    let count = samples;
    if (motionSampling) {
      // Budget against all reachable poses so an orbit keeps a stable sample count.
      const orbit = glassRect(unitsPerPixel, orbitPoses(tiltScale));
      const pixels = Math.max(1, orbit.w * orbit.h);
      const fullBudget = Math.max(4, 2 * Math.floor(MOTION_RAY_BUDGET / (2 * pixels)));
      const pacedBudget = load >= 1 ? fullBudget : Math.max(1, Math.round(fullBudget * load));
      count = Math.min(samples, pacedBudget);
    }
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, rect.y, rect.w, rect.h);
    gl.useProgram(tracer);
    gl.bindVertexArray(vao);
    gl.uniform1i(uniform('uMedia'), 2);
    gl.uniform1i(uniform('uOilTable'), 3);
    gl.uniform1f(uniform('uOilTintAlpha'), Math.min(1, 0.38 * 0.8 * tuning.density));
    if (backdrop && mediaAvailable) {
      const cover =
        Math.max(width / mediaWidth, height / mediaHeight) *
        finite(backdrop.backgroundScale, 1, 1, 3);
      const w = (cover * mediaWidth) / width;
      const h = (cover * mediaHeight) / height;
      const colorOpacity =
        backdrop.source instanceof HTMLImageElement ? finite(backdrop.colorOpacity, 0, 0, 1) : 0;
      gl.uniform1f(uniform('uColorOpacity'), colorOpacity);
      gl.uniform4f(
        uniform('uMediaRect'),
        (1 - w) / 2 + finite(backdrop.backgroundX, 0, -100, 100) / 100,
        (1 - h) / 2 - finite(backdrop.backgroundY, 0, -100, 100) / 100,
        w,
        h,
      );
      const tint = srgbToLinear(hex(backdrop.backgroundTint, '#000000')).map(encodeSrgb);
      const ground = srgbToLinear(hex(backdrop.backgroundColor, '#000000')).map(encodeSrgb);
      gl.uniform4f(
        uniform('uMediaTint'),
        tint[0],
        tint[1],
        tint[2],
        finite(backdrop.backgroundTintOpacity, 0, 0, 1),
      );
      gl.uniform3f(uniform('uMediaGround'), ground[0], ground[1], ground[2]);
    }
    if (inlay) {
      const textures = plateTextures.get(inlay)!;
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, textures.design);
      gl.uniform1i(uniform('uInlay'), 4);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, textures.width);
      gl.uniform1i(uniform('uPlateWidth'), 5);
      gl.uniform4f(uniform('uPlate'), inlay.depth, layout.width, 2 * tuning.depth, inlay.span);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rowLookupTexture);
    gl.uniform1i(uniform('uRowLookup'), 1);
    gl.uniform2f(uniform('uRowRange'), rowRange[0], rowRange[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slabTexture);
    gl.uniform1i(uniform('uSlabs'), 0);
    gl.uniform1i(uniform('uRows'), layout.rows.length);
    gl.uniform1f(uniform('uSlack'), reach.radius + Math.max(reach.pitch, layout.pitch) * 0.5);
    gl.uniform1f(uniform('uRadiusMax'), reach.radius);
    gl.uniform1f(uniform('uDepthMax'), reach.depth + reach.radius);
    gl.uniform3f(uniform('uCamera'), ...view.position);
    gl.uniform3f(uniform('uForward'), ...view.forward);
    gl.uniform3f(uniform('uRight'), ...view.right);
    gl.uniform3f(uniform('uUp'), ...view.up);
    gl.uniform2f(uniform('uCanvas'), width, height);
    gl.uniform3f(uniform('uView'), unitsPerPixel, 0, 0);
    gl.uniform1f(uniform('uIor'), tuning.ior);
    gl.uniform1f(uniform('uReflectivity'), tuning.reflectivity);
    gl.uniform3f(uniform('uBackground'), background[0], background[1], background[2]);
    const card = srgbToLinear(tuning.lightColor).map((c) => c * tuning.exposure);
    gl.uniform3f(uniform('uLight'), card[0], card[1], card[2]);
    const studio = tuning.ambient * tuning.exposure;
    gl.uniform3f(uniform('uAmbient'), studio, studio, studio);
    // Inverse of [forward right up]: maps a point seen from the camera back to
    // (depth, depth * x, depth * y) in picture units.
    gl.uniformMatrix3fv(uniform('uPicture'), false, invert3(view.forward, view.right, view.up));
    // The floor sits below the sculpture by half its height.
    gl.uniform1f(uniform('uFloorY'), bounds.y0 - 0.5 * (bounds.y1 - bounds.y0));
    gl.uniform3f(
      uniform('uBackdrop'),
      tuning.backdropDistance,
      (width / 2) * unitsPerPixel * tuning.backdropSize,
      (height / 2) * unitsPerPixel * tuning.backdropSize,
    );
    gl.uniform1i(
      uniform('uOilMode'),
      tuning.oilFinish === 'dark' ? 2 : tuning.oilFinish === 'light' ? 1 : 0,
    );
    gl.uniform1i(uniform('uSamples'), count);
    gl.uniform1i(uniform('uSampleOffset'), sampleOffset);
    gl.uniform1i(uniform('uMotionSampling'), motionSampling ? 1 : 0);
    gl.uniform1f(uniform('uAperture'), tuning.aperture);
    // Focus plane through the near edges of the bottom and top discs.
    const resting = glassSlabCamera(lens());
    const low = anamorphicRow(resting, -0.5);
    const high = anamorphicRow(resting, 0.5);
    const focusLow = tuning.focus * tuning.depth * layout.pitch * low.scale;
    const focusHigh = tuning.focus * tuning.depth * layout.pitch * high.scale;
    const tiltFocus = (focusHigh - focusLow) / Math.max(high.y - low.y, 1e-3);
    gl.uniform2f(uniform('uFocus'), focusLow - tiltFocus * low.y, tiltFocus);
    if (blend < 1) {
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, blend);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    }
    if (rect.w > 0 && rect.h > 0) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      accumulationRect = unionRect(accumulationRect, rect);
      displayDirtyRect = unionRect(displayDirtyRect, rect);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return count;
  };

  /** Shows the running average on the canvas. */
  const present = () => {
    const rect = displayDirtyRect;
    if (!rect) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, rect.y, rect.w, rect.h);
    gl.useProgram(display);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumulation);
    gl.uniform1i(at(display, 'uAccumulation'), 0);
    gl.uniform1i(at(display, 'uEncode'), linear ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    displayDirtyRect = null;
  };

  /** One moving frame (orbit, intro, playing video): a fresh balanced batch. */
  const traceMoving = () =>
    traceBatch({
      blend: 1,
      samples: Math.min(MOTION_SAMPLES, tuning.samples),
      sampleOffset: 0,
      motionSampling: true,
      clear: true,
    });

  const settlePointer = () => {
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    // Stop easing once the remaining orbit would move the image by a fraction
    // of a pixel; rendering those frames costs full moving frames for nothing.
    const fit = layout
      ? Math.min(width / Math.max(layout.width, 1e-3), height) * tuning.logoScale
      : 0;
    const pixelsPerUnit = ((tuning.tilt * Math.PI) / 180) * fit;
    const left = Math.max(Math.abs(pointer.tx - pointer.x), Math.abs(pointer.ty - pointer.y));
    const moving = left * pixelsPerUnit > POINTER_SNAP_PIXELS;
    if (!moving) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || !layout || !width || !height) return;
    if (lastFrameAt) {
      const between = now - lastFrameAt;
      displayInterval = Math.min(displayInterval * 1.01, Math.max(between, 4));
      if (between > Math.max(SLOW_FRAME[0] * displayInterval, SLOW_FRAME[1])) {
        loadCap = Math.max(0.2, load * 0.92);
        load = Math.max(0.2, load * 0.8);
      } else if (between < Math.max(FAST_FRAME[0] * displayInterval, FAST_FRAME[1])) {
        loadCap = Math.min(1, loadCap * 1.001);
        load = Math.min(loadCap, load * 1.08);
      }
    }
    lastFrameAt = 0;
    const advancing = playing && !motion.matches && progressAt(time) < 1;
    if (advancing && previousTime !== null) time += Math.max(0, now - previousTime) / 1000;
    previousTime = advancing ? now : null;
    const progress = progressAt(time);
    const moving = settlePointer();
    const animating = advancing && progress > 0 && progress < 1;
    if (geometryDirty || progress !== shownProgress) upload(progress);
    if (moving || animating || (mediaPlaying && (mediaDirty || accumulated === 0))) {
      accumulated = traceMoving();
      priorMotion = true;
      present();
    } else {
      // After motion the last moving frame stays on screen until the first
      // still image is complete; other restarts show each batch at once.
      if (priorMotion) {
        accumulated = 0;
        holdPartial = true;
      }
      priorMotion = false;
      if (accumulated < tuning.samples) {
        const first = Math.min(MOTION_SAMPLES, tuning.samples);
        const batch = Math.max(
          1,
          Math.round((accumulated < first ? FIRST_STILL_BATCH : SAMPLES_PER_FRAME) * load),
        );
        const limit = accumulated < first ? first : tuning.samples;
        const samples = Math.min(batch, limit - accumulated);
        traceBatch({
          blend: samples / (accumulated + samples),
          samples,
          sampleOffset: accumulated,
          clear: accumulated === 0,
        });
        accumulated += samples;
        if (accumulated >= first) holdPartial = false;
        if (!holdPartial) present();
      }
    }
    if (!ready) {
      ready = true;
      onReady?.();
    }
    if (coverage?.logo === requestedLogo && presentedLogo !== requestedLogo) {
      presentedLogo = requestedLogo;
      onLogoReady?.(presentedLogo);
    }
    if (moving || advancing || (!mediaPlaying && accumulated < tuning.samples)) {
      frame = win.requestAnimationFrame(tick);
      lastFrameAt = now;
    }
  };
  const invalidate = (restart = true) => {
    if (restart) {
      accumulated = 0;
      holdPartial = false;
    }
    if (!exportSize && !frame && !disposed) frame = win.requestAnimationFrame(tick);
  };

  const loadLogo = () => {
    if (tuning.logo === requestedLogo) return;
    requestedLogo = tuning.logo;
    const src = requestedLogo;
    void logoCoverage(src).then((result) => {
      if (disposed || src !== requestedLogo) return;
      if (!result) {
        onFallback?.();
        return;
      }
      clearPlateTextures();
      coverage = { logo: src, mask: result };
      layoutKey = '';
      relayout();
      if (exportSize && !ready) {
        ready = true;
        onReady?.();
      }
      invalidate();
    });
  };

  const resize = () => {
    // The floating preview scales the canvas with a transform. Size the
    // backing buffer from the layout so it stays sharp when the demo returns.
    const style = win.getComputedStyle(canvas);
    const cssWidth = Number.parseFloat(style.width) || canvas.clientWidth;
    const cssHeight = Number.parseFloat(style.height) || canvas.clientHeight;
    const deviceDpr = win.devicePixelRatio || 1;
    const dpr = Math.min(deviceDpr, tuning.maxDpr ?? deviceDpr);
    const nextWidth = exportSize?.width ?? Math.max(1, Math.round(cssWidth * dpr));
    const nextHeight = exportSize?.height ?? Math.max(1, Math.round(cssHeight * dpr));
    if (nextWidth === width && nextHeight === height) return;
    width = canvas.width = nextWidth;
    height = canvas.height = nextHeight;
    accumulationRect = displayDirtyRect = null;
    accumulationBackground = undefined;
    gl.bindTexture(gl.TEXTURE_2D, accumulation);
    if (linear)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accumulation, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    invalidate();
  };
  const resizeObserver = exportSize ? null : new win.ResizeObserver(resize);
  resizeObserver?.observe(canvas);
  if (!exportSize) win.addEventListener('resize', resize);
  const intersection = exportSize
    ? null
    : new win.IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        previousTime = null;
        if (visible) invalidate(false);
      });
  intersection?.observe(canvas);

  const host = canvas.parentElement ?? canvas;
  const onPointerMove = (event: PointerEvent) => {
    if (!tuning.tilt || motion.matches) return;
    const rect = host.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    pointer.ty = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    invalidate(false);
  };
  const onPointerLeave = () => {
    pointer.tx = 0;
    pointer.ty = 0;
    invalidate(false);
  };
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerleave', onPointerLeave);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onFallback?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  const onMotionChange = () => {
    if (motion.matches && playing) time = Infinity;
    previousTime = null;
    invalidate();
  };
  motion.addEventListener?.('change', onMotionChange);

  resize();
  loadLogo();

  return {
    update(next) {
      tuning = next;
      geometryDirty = true;
      loadLogo();
      relayout();
      resize();
      invalidate();
    },
    setBackdrop(next) {
      const source = next?.source;
      const isVideo = source instanceof HTMLVideoElement;
      const url = source?.currentSrc ?? '';
      const sw = isVideo ? source.videoWidth : (source?.naturalWidth ?? 0);
      const sh = isVideo ? source.videoHeight : (source?.naturalHeight ?? 0);
      const decoded = isVideo ? source.readyState >= 2 : source?.complete;
      const usable =
        decoded &&
        sw > 0 &&
        sh > 0 &&
        sw <= maxTextureSize &&
        sh <= maxTextureSize &&
        !(failedSource?.element === source && failedSource?.url === url);
      if (!usable || !next || !source) {
        if (!backdrop) return;
        backdrop = null;
        backdropKey = '';
        mediaPlaying = mediaDirty = mediaAvailable = false;
      } else {
        const playing = isVideo && !source.paused && !exportSize;
        const time = isVideo ? source.currentTime : -1;
        const key = JSON.stringify([
          next.backgroundColor,
          next.backgroundX,
          next.backgroundY,
          next.backgroundScale,
          next.backgroundTint,
          next.backgroundTintOpacity,
          next.colorOpacity,
        ]);
        const changed =
          source !== backdrop?.source ||
          url !== mediaUrl ||
          time !== mediaTime ||
          sw !== mediaWidth ||
          sh !== mediaHeight;
        if (!changed && key === backdropKey && playing === mediaPlaying) return;
        mediaDirty ||= changed;
        backdrop = next;
        backdropKey = key;
        mediaUrl = url;
        mediaTime = time;
        mediaWidth = sw;
        mediaHeight = sh;
        mediaPlaying = playing;
      }
      exportSamples = 0;
      invalidate();
    },
    replay() {
      time = motion.matches ? Infinity : 0;
      playing = true;
      previousTime = null;
      invalidate();
    },
    seek(seconds) {
      time = Math.max(0, seconds);
      playing = false;
      previousTime = null;
      invalidate();
    },
    pause() {
      playing = false;
      previousTime = null;
      invalidate();
    },
    play() {
      playing = true;
      previousTime = null;
      invalidate(false);
    },
    renderFrame(seconds, samples) {
      if (!ready || !layout || disposed || gl.isContextLost())
        throw new Error('The logo renderer is unavailable.');
      const progress = progressAt(seconds);
      const count = Math.min(256, Math.max(1, Math.round(samples)));
      if (exportSize && !geometryDirty && progress === shownProgress && exportSamples === count)
        return;
      if (geometryDirty || progress !== shownProgress) upload(progress);
      for (let offset = 0; offset < count;) {
        const batch = Math.min(16, count - offset);
        traceBatch({
          blend: batch / (offset + batch),
          samples: batch,
          sampleOffset: offset,
          clear: offset === 0,
        });
        offset += batch;
      }
      present();
      exportSamples = count;
    },
    dispose() {
      disposed = true;
      if (frame) win.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      win.removeEventListener('resize', resize);
      intersection?.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      motion.removeEventListener?.('change', onMotionChange);
      for (const program of tracers.values()) gl.deleteProgram(program);
      gl.deleteProgram(display);
      gl.deleteTexture(slabTexture);
      gl.deleteTexture(rowLookupTexture);
      gl.deleteTexture(accumulation);
      gl.deleteTexture(mediaTexture);
      gl.deleteTexture(oilTexture);
      clearPlateTextures();
      gl.deleteFramebuffer(framebuffer);
      gl.deleteVertexArray(vao);
    },
  };
}
