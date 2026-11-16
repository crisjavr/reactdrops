import { afterEach, expect, test } from 'vitest';
import {
  bouncyPower4,
  createGlassSlabLogoRenderer,
  glassSlabLogoColorPresets,
  glassSlabLogoDefaults,
  glassSlabLogoMarks,
  normalizeGlassSlabLogo,
  type GlassSlabLogoRenderer,
  type GlassSlabLogoTuning,
} from '../packages/components/src/glass-slab-logo/glass-slab-logo-renderer';
import {
  INLAY_DEPTH,
  INLAY_SIZE,
  recommendSlabCount,
  sliceLogo,
  type LogoCoverage,
} from '../packages/components/src/glass-slab-logo/glass-slab-logo-slices';

const mounted: { canvas: HTMLCanvasElement; renderer: GlassSlabLogoRenderer }[] = [];
afterEach(() => {
  for (const { canvas, renderer } of mounted.splice(0)) {
    renderer.dispose();
    canvas.remove();
  }
});

/** A coverage mask drawn by a predicate over a width x height grid. */
function mask(width: number, height: number, inside: (x: number, y: number) => boolean) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
  return { data, width, height } satisfies LogoCoverage;
}

const options = { slabs: 10, phase: 0.5, band: 0, minPieceSlabs: 7, minSpan: 0.3, bridge: 0.12 };

test('a ring becomes one disc per row at its top and bottom and two through its hole', () => {
  const ring = mask(200, 200, (x, y) => {
    const r = Math.hypot(x - 100, y - 100);
    return r <= 98 && r >= 45;
  });
  const layout = sliceLogo(ring, options);
  expect(layout.rows).toHaveLength(10);
  // Rows are sorted bottom to top and evenly spaced over the logo height.
  for (let k = 1; k < layout.rows.length; k++)
    expect(layout.rows[k].y - layout.rows[k - 1].y).toBeCloseTo(layout.pitch, 5);
  const counts = layout.rows.map((row) => row.spans.length);
  expect(counts[0]).toBe(1);
  expect(counts[9]).toBe(1);
  expect(counts[5]).toBe(2);
  // Each disc is as wide as the ring at that height.
  const middle = layout.rows[5];
  const y = 100 - middle.y * 200;
  const outer = Math.sqrt(98 ** 2 - (y - 100) ** 2);
  const inner = Math.sqrt(45 ** 2 - (y - 100) ** 2);
  expect(middle.spans[0].a * 200).toBeCloseTo((outer - inner) / 2, 0);
});

test('a small detached piece gets its own finer stack of discs', () => {
  // A tall body and a small dot above it, a tenth of the height.
  const logo = mask(
    200,
    300,
    (x, y) => (y > 60 && Math.abs(x - 100) < 70) || Math.hypot(x - 100, y - 20) < 15,
  );
  const layout = sliceLogo(logo, { ...options, slabs: 15 });
  const dotRows = layout.rows.filter((row) => row.pitch < layout.pitch * 0.9);
  expect(dotRows.length).toBeGreaterThanOrEqual(7);
  for (const row of dotRows) expect(row.spans).toHaveLength(1);
});

test('an emblem whose openings would splinter into slivers is cut from its outline with the openings left as gaps', () => {
  // A disc with a grid of thin bars inside: cutting the bars would give rows
  // of slivers, so each disc spans the whole outline and the openings are
  // cut out of its glass.
  const slit = (x: number) => Math.floor(x) % 12 < 5;
  const emblem = mask(200, 200, (x, y) => {
    if (Math.hypot(x - 100, y - 100) > 95) return false;
    return !(Math.abs(x - 100) < 60 && Math.abs(y - 100) < 60 && slit(x));
  });
  const layout = sliceLogo(emblem, options);
  expect(layout.rows).toHaveLength(10);
  for (const row of layout.rows) expect(row.spans).toHaveLength(1);
  expect(layout.inlay).toBeDefined();
  const { data, size, depth } = layout.inlay!;
  expect([size, depth]).toEqual([INLAY_SIZE, INLAY_DEPTH]);
  // Row 5 from the bottom, its middle line: [density, edge distance, ...].
  const middle = (5 * depth + (depth >> 1)) * size;
  const texel = (x: number) => (middle + Math.floor(((x + 0.5) * size) / 200)) * 4;
  expect(slit(100)).toBe(true);
  expect(data[texel(98) + 1]).toBeGreaterThan(0);
  expect(slit(104)).toBe(false);
  expect(data[texel(104) + 1]).toBeLessThan(0);
  expect(data[texel(30) + 1]).toBeLessThan(-0.02);
  expect(data[texel(30)]).toBeCloseTo(1, 5);
});

test('a detailed emblem suggests more cuts while explicit counts stay exact', () => {
  const emblem = mask(200, 200, (x, y) => {
    if (Math.hypot(x - 100, y - 100) > 95) return false;
    const wave = 12 * Math.sin(y / 11);
    const stripe = Math.floor(x + wave) % 15 < 6;
    return !(Math.abs(x - 100) < 65 && Math.abs(y - 100) < 68 && stripe);
  });
  const recommended = recommendSlabCount(emblem);
  expect(recommended).toBeGreaterThan(17);
  expect(recommended).toBeLessThanOrEqual(20);
  const layout = sliceLogo(emblem, options);
  expect(layout.rows).toHaveLength(options.slabs);
  expect(layout.inlay).toBeDefined();
  expect(sliceLogo(emblem, { ...options, slabs: recommended }).rows).toHaveLength(recommended);
  expect(sliceLogo(emblem, { ...options, slabs: 34 }).rows).toHaveLength(34);
});

test('thin strokes get a higher recommendation even with a simple outline', () => {
  const thick = mask(200, 200, (x) => x < 30);
  const thin = mask(200, 200, (x) => x < 5);
  const extraThin = mask(200, 200, (x) => x < 3);
  expect(recommendSlabCount(thick)).toBe(17);
  expect(recommendSlabCount(thin)).toBe(19);
  expect(recommendSlabCount(extraThin)).toBe(20);
});

test('cuts skip empty bands when the requested count spans separated regions', () => {
  const separated = mask(200, 200, (x, y) => x < 80 && (y < 20 || y > 170));
  const layout = sliceLogo(separated, { ...options, slabs: 17, minPieceSlabs: 1 });
  expect(layout.rows).toHaveLength(17);
  expect(layout.rows.every(({ spans }) => spans.length > 0)).toBe(true);
  expect(layout.rows.some(({ y }) => y > 0.4)).toBe(true);
  expect(layout.rows.some(({ y }) => y < -0.35)).toBe(true);
});

test('white parts of a colored logo are gaps in the glass', () => {
  const disc = mask(200, 200, (x, y) => Math.hypot(x - 100, y - 100) <= 95);
  const white = new Uint8Array(200 * 200);
  for (let i = 0; i < white.length; i++) white[i] = i % 200 >= 120 && i % 200 < 160 ? 255 : 0;
  const layout = sliceLogo({ ...disc, white }, options);
  for (const row of layout.rows) expect(row.spans).toHaveLength(1);
  expect(layout.inlay).toBeDefined();
  const { data, size, depth } = layout.inlay!;
  const middle = (5 * depth + (depth >> 1)) * size;
  const distance = (x: number) => data[(middle + Math.floor(((x + 0.5) * size) / 200)) * 4 + 1];
  expect(distance(140)).toBeGreaterThan(0);
  expect(distance(60)).toBeLessThan(0);
});

test('a badge whose design runs out through its edge is cut from its full outline', () => {
  // Stripes split the disc into bars that reach its rim: the logo's own cut
  // would be rows of slivers, so the stack takes the disc's convex outline.
  const badge = mask(
    200,
    200,
    (x, y) => Math.hypot(x - 100, y - 100) <= 95 && Math.floor(x) % 14 >= 5,
  );
  const layout = sliceLogo(badge, options);
  expect(layout.rows).toHaveLength(10);
  for (const row of layout.rows) expect(row.spans).toHaveLength(1);
  const middle = layout.rows[5];
  expect(middle.spans[0].a * 200).toBeGreaterThan(85);
  expect(layout.inlay).toBeDefined();
});

test('adding a row keeps the outline when the spacing crosses the stroke width', () => {
  const badge = mask(
    200,
    196,
    (x, y) => Math.hypot(x - 100, y - 98) <= 94 && Math.floor(x) % 14 >= 7,
  );
  for (const slabs of [27, 28]) {
    const layout = sliceLogo(badge, { ...options, slabs, phase: 0.75 });
    expect(layout.rows).toHaveLength(slabs);
    expect(layout.inlay).toBeDefined();
    expect(layout.rows.every(({ spans }) => spans.length === 1)).toBe(true);
  }
});

test('selecting a render method switches the geometry at the same row count', () => {
  const badge = mask(
    200,
    196,
    (x, y) => Math.hypot(x - 100, y - 98) <= 94 && Math.floor(x) % 14 >= 7,
  );
  const settings = { ...options, slabs: 28, phase: 0.75 };
  const detailed = sliceLogo(badge, { ...settings, renderMode: 'detailed' });
  const ellipses = sliceLogo(badge, { ...settings, renderMode: 'ellipses' });
  expect(detailed.rows).toHaveLength(28);
  expect(ellipses.rows).toHaveLength(28);
  expect(detailed.inlay).toBeDefined();
  expect(detailed.rows.every(({ spans }) => spans.length === 1)).toBe(true);
  expect(ellipses.inlay).toBeUndefined();
  expect(ellipses.rows.some(({ spans }) => spans.length > 1)).toBe(true);
  expect(sliceLogo(badge, { ...settings, renderMode: 'detailed' }).inlay).toBe(detailed.inlay);
});

test('a two-tone logo inlays its lighter color and a single-color logo has none', () => {
  const disc = mask(200, 200, (x, y) => Math.hypot(x - 100, y - 100) <= 95);
  const plain = sliceLogo({ ...disc, tone: new Uint8Array(200 * 200).fill(85) }, options);
  expect(plain.inlay).toBeUndefined();
  const tone = new Uint8Array(200 * 200);
  for (let i = 0; i < tone.length; i++) tone[i] = i % 200 < 100 ? 85 : 0;
  const twoTone = sliceLogo({ ...disc, tone }, options);
  expect(twoTone.inlay).toBeDefined();
  expect(twoTone.rows.map((row) => row.spans.length)).toEqual(
    plain.rows.map((row) => row.spans.length),
  );
});

test('specks get one disc each instead of a stack of their own', () => {
  const dots = [30, 60, 90, 110, 140, 170];
  const logo = mask(
    200,
    300,
    (x, y) =>
      (y > 60 && Math.abs(x - 100) < 70) || dots.some((dx) => Math.hypot(x - dx, y - 20) < 6),
  );
  const layout = sliceLogo(logo, { ...options, slabs: 15 });
  const dotRows = layout.rows.filter((row) => row.y > 0.5 - 40 / 300);
  expect(dotRows).toHaveLength(dots.length);
  for (const row of dotRows) {
    expect(row.spans).toHaveLength(1);
    expect(row.spans[0].a * 300).toBeCloseTo(6, 0);
  }
});

test('a small accent between the main cuts gets its own disc', () => {
  const logo = mask(
    200,
    300,
    (x, y) => (y > 60 && Math.abs(x - 100) < 70) || (x >= 28 && x < 30 && y >= 20 && y < 23),
  );
  const layout = sliceLogo(logo, { ...options, slabs: 15 });
  expect(layout.rows).toHaveLength(15);
  const accents = layout.rows.filter((row) => row.y > 0.5 - 40 / 300);
  expect(accents).toHaveLength(1);
  expect(accents[0].spans[0].a * 300).toBeCloseTo(1, 0);
});

test('the intro ease rises like power4.out, overshoots a little and settles at 1', () => {
  expect(bouncyPower4(0)).toBe(0);
  expect(bouncyPower4(1)).toBe(1);
  // Faster than power4.out at the start.
  expect(bouncyPower4(0.1)).toBeGreaterThan(1 - 0.9 ** 4);
  const peak = Math.max(...Array.from({ length: 101 }, (_, i) => bouncyPower4(i / 100)));
  expect(peak).toBeGreaterThan(1.05);
  expect(peak).toBeLessThan(1.12);
  expect(bouncyPower4(0.98)).toBeCloseTo(1, 3);
});

test('normalizes options and keeps colors as an evenly spaced list', () => {
  const tuning = normalizeGlassSlabLogo({
    slabs: 400,
    colors: ['#ff0000', 'nope', '#00ff00'],
    backgroundColor: 'transparent',
    samples: 0,
  });
  expect(tuning.slabs).toBe(64);
  expect(tuning.colors).toEqual(['#ff0000', glassSlabLogoDefaults.colors[1], '#00ff00']);
  expect(tuning.backgroundColor).toBe('transparent');
  expect(tuning.samples).toBe(1);
});

async function mount(overrides: Partial<GlassSlabLogoTuning> = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:240px;height:240px';
  document.body.append(canvas);
  const tuning = normalizeGlassSlabLogo({
    ...glassSlabLogoDefaults,
    intro: false,
    tilt: 0,
    samples: 4,
    maxDpr: 1,
    ...overrides,
  });
  let ready!: () => void;
  const loaded = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const renderer = createGlassSlabLogoRenderer(canvas, tuning, { onReady: ready })!;
  expect(renderer).not.toBeNull();
  mounted.push({ canvas, renderer });
  await loaded;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return canvas;
}

function pixels(canvas: HTMLCanvasElement) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height).data;
}

test('keeps the Sunset leaf colors stable when Apple gains one body row', async () => {
  const settings = {
    ...glassSlabLogoColorPresets.sunset,
    intro: false,
    tilt: 0,
    samples: 4,
    maxDpr: 1,
  };
  const canvas = await mount({ ...settings, slabs: 22 });
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  renderer.renderFrame(2, 4);
  const before = pixels(canvas);

  renderer.update(normalizeGlassSlabLogo({ ...settings, slabs: 23 }));
  renderer.renderFrame(2, 4);
  const after = pixels(canvas);

  let covered = 0;
  let colorDifference = 0;
  const leafEnd = Math.floor(canvas.height * 0.32) * canvas.width * 4;
  for (let i = 0; i < leafEnd; i += 4) {
    if (Math.min(before[i + 2], after[i + 2]) >= 230) continue;
    covered++;
    for (let channel = 0; channel < 3; channel++) {
      colorDifference += Math.abs(before[i + channel] - after[i + channel]);
    }
  }
  expect(covered).toBeGreaterThan(100);
  expect(colorDifference / (covered * 3)).toBeLessThan(4);
});

test('keeps the demo resolution when its miniature is scaled and its controls change', async () => {
  const canvas = await mount();
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  const size = [canvas.width, canvas.height];
  canvas.style.transform = 'scale(0.35)';
  expect(canvas.getBoundingClientRect().width).toBeLessThan(canvas.clientWidth);

  renderer.update(
    normalizeGlassSlabLogo({ intro: false, tilt: 0, samples: 4, maxDpr: 1, density: 1.2 }),
  );
  expect([canvas.width, canvas.height]).toEqual(size);

  canvas.style.transform = '';
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect([canvas.width, canvas.height]).toEqual(size);
});

test('renders tinted glass over the background and leaves the corners clear', async () => {
  const canvas = await mount({ logo: glassSlabLogoMarks.ring });
  const data = pixels(canvas);
  const at = (x: number, y: number) => {
    const i = (y * canvas.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  expect(at(4, 4)).toEqual([255, 255, 255]);
  // Somewhere on the ring the glass filters out blue, as the yellow-green tints do.
  let tinted = 0;
  for (let y = 0; y < canvas.height; y += 4)
    for (let x = 0; x < canvas.width; x += 4) {
      const [r, g, b] = at(x, y);
      if (g > 120 && b < g * 0.5 && r + g > 300) tinted++;
    }
  expect(tinted).toBeGreaterThan(50);
});

test('keeps the bright preset rims tinted on the ReactDrops silhouette', async () => {
  const canvas = await mount({ logo: glassSlabLogoMarks.reactdrops });
  const data = pixels(canvas);
  let tinted = 0;
  let nearlyBlack = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 230) tinted++;
    if (Math.max(data[i], data[i + 1], data[i + 2]) < 80) nearlyBlack++;
  }
  expect(tinted).toBeGreaterThan(1000);
  expect(nearlyBlack).toBeLessThan(8);
});

test('bends the background through Clear Glass and leaves the gaps transparent', async () => {
  const canvas = await mount({
    ...glassSlabLogoColorPresets.clearDark,
    backgroundColor: 'transparent',
  });
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  const source = new Image();
  source.src = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<path fill="red" d="M0 0h240v120H0z"/><path fill="blue" d="M0 120h240v120H0z"/></svg>',
  )}`;
  await source.decode();
  renderer.setBackdrop({
    source,
    backgroundColor: '#000000',
    backgroundX: 0,
    backgroundY: 0,
    backgroundScale: 1,
    backgroundTint: '#000000',
    backgroundTintOpacity: 0,
  });
  renderer.renderFrame(2, 24);
  const data = pixels(canvas);
  let refracted = 0;
  for (let y = 0; y < canvas.height; y++) {
    if (Math.abs(y - canvas.height / 2) < 5) continue;
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const redMinusBlue = data[i] - data[i + 2];
      if (data[i + 3] > 200 && redMinusBlue * (y < canvas.height / 2 ? -1 : 1) > 45) refracted++;
    }
  }
  // The 1.1 preset bends the boundary less than an index near 1.5.
  expect(refracted).toBeGreaterThan(30);
  expect(data[3]).toBe(0);
});

test('color opacity replaces photo transmission with the selected tint only on glass', async () => {
  const canvas = await mount({
    ...glassSlabLogoColorPresets.clearDark,
    colors: ['#e04a60', '#e04a60'],
    backgroundColor: 'transparent',
    reflectivity: 0,
  });
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  const source = new Image();
  source.src = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse">' +
      '<path fill="white" d="M0 0h4v8H0z"/><path fill="#111111" d="M4 0h4v8H4z"/>' +
      '</pattern><path fill="url(#stripes)" d="M0 0h240v240H0z"/></svg>',
  )}`;
  await source.decode();
  const otherPhoto = new Image();
  otherPhoto.src = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="blue"/></svg>',
  )}`;
  await otherPhoto.decode();
  const backdrop = {
    backgroundColor: '#000000',
    backgroundX: 0,
    backgroundY: 0,
    backgroundScale: 1,
    backgroundTint: '#000000',
    backgroundTintOpacity: 0,
  };
  const sample = (colorOpacity: number, photo = source) => {
    renderer.setBackdrop({ ...backdrop, source: photo, colorOpacity });
    renderer.renderFrame(2, 8);
    return pixels(canvas);
  };
  const polished = sample(0);
  const partial = sample(0.5);
  const solid = sample(1);
  expect(solid.every((value, i) => i % 4 !== 3 || value === polished[i])).toBe(true);
  let blendedPixels = 0;
  for (let i = 0; i < solid.length; i += 4) {
    if (solid[i + 3] !== 255) continue;
    const r = solid[i];
    expect([r, solid[i + 1], solid[i + 2]]).toEqual([224, 74, 96]);
    if (partial[i] > Math.min(polished[i], r) && partial[i] < Math.max(polished[i], r))
      blendedPixels++;
  }
  expect(blendedPixels).toBeGreaterThan(1000);
  expect(sample(1, otherPhoto)).toEqual(solid);
  expect(sample(0)).toEqual(polished);
});

test('keeps the dark Clear Glass faces visible and translucent', async () => {
  const settings = { ...glassSlabLogoColorPresets.clearDark, ior: 1.42, reflectivity: 1.15 };
  const canvas = await mount(settings);
  const meanFaceChannel = (data: Uint8ClampedArray, channel: number) => {
    let sum = 0;
    let count = 0;
    for (let y = Math.round(0.48 * canvas.height); y < 0.56 * canvas.height; y++) {
      for (let x = Math.round(0.38 * canvas.width); x < 0.6 * canvas.width; x++) {
        sum += data[(y * canvas.width + x) * 4 + channel];
        count++;
      }
    }
    return sum / count;
  };
  const face = meanFaceChannel(pixels(canvas), 0);
  expect(face).toBeGreaterThan(32);
  expect(face).toBeLessThan(65);

  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  renderer.update(
    normalizeGlassSlabLogo({
      ...settings,
      backgroundColor: 'transparent',
      intro: false,
      tilt: 0,
      maxDpr: 1,
    }),
  );
  renderer.renderFrame(2, 16);
  const opacity = meanFaceChannel(pixels(canvas), 3);
  expect(opacity).toBeGreaterThan(8);
  expect(opacity).toBeLessThan(65);
});

test('Clear Glass reflects the colors that its rays reach in the backdrop', async () => {
  const settings = {
    ...glassSlabLogoColorPresets.clearDark,
    logo: glassSlabLogoMarks.ring,
    renderMode: 'detailed' as const,
    lightColor: '#000000',
    ambient: 0,
    intro: false,
    tilt: 0,
    maxDpr: 1,
  };
  const canvas = await mount(settings);
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  renderer.renderFrame(2, 16);
  // With every light source black, the glass has no reflection to show.
  expect(pixels(canvas).every((value, i) => i % 4 === 3 || value === 0)).toBe(true);

  const source = new Image();
  source.src = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<path fill="red" d="M0 0h120v240H0z"/><path fill="blue" d="M120 0h120v240H120z"/></svg>',
  )}`;
  await source.decode();
  renderer.setBackdrop({
    source,
    backgroundColor: '#000000',
    backgroundX: 0,
    backgroundY: 0,
    backgroundScale: 1,
    backgroundTint: '#000000',
    backgroundTintOpacity: 0,
  });
  renderer.renderFrame(2, 16);
  const lit = pixels(canvas);
  renderer.update(normalizeGlassSlabLogo({ ...settings, reflectivity: 0 }));
  renderer.renderFrame(2, 16);
  const transmitted = pixels(canvas);
  let red = 0;
  let blue = 0;
  for (let i = 0; i < lit.length; i += 4) {
    const reflectedRed = lit[i] - transmitted[i];
    const reflectedBlue = lit[i + 2] - transmitted[i + 2];
    if (reflectedRed > 3 && reflectedRed > reflectedBlue) red++;
    if (reflectedBlue > 3 && reflectedBlue > reflectedRed) blue++;
  }
  expect(red).toBeGreaterThan(30);
  expect(blue).toBeGreaterThan(30);
});

test('keeps the Oil body translucent while coloring the rim', async () => {
  const canvas = await mount({
    ...glassSlabLogoColorPresets.oilDark,
    backgroundColor: 'transparent',
  });
  const data = pixels(canvas);
  let tintedBody = 0;
  let iridescentRim = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = data.subarray(i, i + 4);
    if (Math.abs(a - 78) <= 1 && [r, g, b].every((channel) => Math.abs(channel - 20) <= 2))
      tintedBody++;
    if (a > 78 && Math.max(r, g, b) - Math.min(r, g, b) > 20) iridescentRim++;
  }
  expect(data[3]).toBe(0);
  expect(tintedBody).toBeGreaterThan(1000);
  expect(iridescentRim).toBeGreaterThan(100);
});

test('renders a deterministic frame with transparent gaps at the chosen export size', async () => {
  const canvas = document.createElement('canvas');
  const tuning = normalizeGlassSlabLogo({ backgroundColor: 'transparent', delay: 0.2, speed: 2 });
  let ready!: () => void;
  const loaded = new Promise<void>((resolve, reject) => {
    ready = resolve;
    const renderer = createGlassSlabLogoRenderer(canvas, tuning, {
      paused: true,
      exportSize: { width: 192, height: 128 },
      onReady: () => ready(),
      onFallback: () => reject(new Error('WebGL could not render the export.')),
    });
    if (!renderer) throw new Error('Could not initialize the export renderer.');
    mounted.push({ canvas, renderer });
  });
  await loaded;
  const renderer = mounted.find((item) => item.canvas === canvas)!.renderer;
  expect([canvas.width, canvas.height]).toEqual([192, 128]);
  const covered = (data: Uint8ClampedArray) =>
    data.filter((alpha, i) => i % 4 === 3 && alpha > 0).length;
  renderer.renderFrame(0.1, 8);
  expect(covered(pixels(canvas))).toBe(0);
  renderer.renderFrame(0.55, 8);
  const selected = pixels(canvas);
  expect(selected[3]).toBe(0);
  expect(covered(selected)).toBeGreaterThan(200);
  renderer.renderFrame(1.3, 8);
  expect(covered(pixels(canvas))).toBeGreaterThan(covered(selected));
  renderer.renderFrame(0.55, 8);
  expect(pixels(canvas)).toEqual(selected);

  renderer.update({ ...tuning, logoScale: 0.35 });
  renderer.renderFrame(0.1, 8);
  expect(covered(pixels(canvas))).toBe(0);

  renderer.update({ ...tuning, logoScale: 0.35, backgroundColor: '#ffffff' });
  renderer.renderFrame(0.1, 8);
  expect(pixels(canvas).every((channel) => channel === 255)).toBe(true);
});
