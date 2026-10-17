import { normalizeShapeSettings, shapeRandom, type ShapeSettings } from './shape-settings';
import {
  createSolidSprite,
  isSolidKind,
  partsDistance,
  solidColorIndex,
  solidEyes,
  solidEyesVisible,
  solidKinds,
  solidShape,
  tracePart,
  type SolidKind,
  type SolidSprite,
} from './solid-shapes';
import {
  attachSolidShape,
  createSolidBody,
  createSolidWorld,
  flatten,
  partProfile,
  setSolidRadius,
  updateSolidTransform,
  type SolidBody,
} from './solid-world';

type Figure = SolidBody & {
  kind: SolidKind;
  colorIndex: number;
  variation: number;
  idleX: number;
  idleY: number;
  follow: number;
  blinkPeriod: number;
  blinkPhase: number;
  /** Seconds since a manual birth; drives the pop-in growth. */
  age: number;
  /** Eye outlines computed once per frame (unit body space) and their state. */
  eyes: Float64Array;
  eyeCount: number;
  eyeVisible: number;
  eyeState: Float64Array;
  /** World boxes last painted: body [0..3] and eyes [4..7]; NaN when none. */
  painted: Float64Array;
  /** Pose last painted: x, y, angle, growth. */
  pose: Float64Array;
};

/** Fraction of the container a settled random pile of these solids can fill. */
const packing = 0.8;
const stepRate = 60;
const blinkLength = 0.16;

export function createSolidEngine(
  canvas: HTMLCanvasElement,
  initial: ShapeSettings,
  onSizeLimitChange?: (maximum: number) => void,
  onFullChange?: (full: boolean) => void,
) {
  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement;
  if (!ctx || !host) return null;
  const normalize = normalizeShapeSettings;
  let settings = normalize(initial);
  let colors: string[] = [];
  let background = '#fff',
    faceColor = '#fff';
  const resolveColors = () => {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    host.appendChild(probe);
    const resolve = (value: string, fallback: string) => {
      probe.style.color = fallback;
      if (CSS.supports('color', value)) probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const next = settings.colors.map((value) => resolve(value, '#3c82f6'));
    background = resolve(settings.background, 'Canvas');
    faceColor = resolve(settings.faceColor, '#ffffff');
    if (next.join() !== colors.join()) sprites.clear();
    colors = next;
    probe.remove();
  };
  const sprites = new Map<string, SolidSprite>();
  const world = createSolidWorld();
  const figures = world.bodies as Figure[];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let random = shapeRandom(settings.seed);
  let width = 0,
    height = 0,
    ratio = 1,
    frame = 0,
    timer = 0,
    last = 0,
    accumulator = 0,
    clock = 0,
    birthClock = 0,
    automaticBirths = 0,
    nextId = 1,
    costAverage = 0,
    costFrames = 0;
  let visible = false,
    disposed = false,
    stopped = false,
    full = false,
    dirty = true,
    lowPower = false;
  let bag: SolidKind[] = [];
  let planned: { kind: SolidKind; variation: number; color: number } | null = null;
  let notifiedSize = -1,
    notifiedFull: boolean | null = null;

  // ---- Capacity --------------------------------------------------------

  const radiusFor = (variation: number) => settings.size * (1 - variation * settings.sizeVariation);
  const usedArea = () => {
    let area = 0;
    for (const f of figures) if (!f.leaving) area += f.shape.area * f.radius * f.radius;
    return area;
  };
  const capacity = () => width * height * packing;
  /** Spawning side: 1 falls in from the top, -1 rises from the bottom, 0 appears inside. */
  const side = () => (settings.gravity > 20 ? 1 : settings.gravity < -20 ? -1 : 0);

  // Color variants of each solid take turns, so every default color shows up.
  const colorTurns = new Map<SolidKind, number>();
  const plan = () => {
    const kind = nextKind();
    const turn = colorTurns.get(kind) ?? Math.floor(random() * 6);
    colorTurns.set(kind, turn + 1);
    return { kind, variation: random(), color: turn };
  };
  const nextKind = (): SolidKind => {
    if (settings.shape !== 'mixed') return isSolidKind(settings.shape) ? settings.shape : 'circle';
    if (!bag.length) {
      bag = [...solidKinds];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };

  const columns = new Float64Array(2048);
  const windowRoom = new Float64Array(2048);
  const deque = new Int32Array(2048);
  /**
   * Finds where a figure can fall in. Columns record how far the open side
   * reaches before hitting a figure; a sliding-window minimum gives the room
   * for the figure's width at every position. Deeper lanes are preferred, so
   * the pile rises evenly and fills the container completely.
   */
  function findLane(kind: SolidKind, radius: number) {
    const shape = solidShape(kind);
    const direction = side();
    const widthPx = (shape.right - shape.left) * radius * 1.04,
      heightPx = (shape.bottom - shape.top) * radius;
    if (widthPx > width || heightPx > height) return null;
    const cell = Math.max(4, Math.min(24, settings.size * 0.25));
    const count = Math.min(columns.length, Math.ceil(width / cell));
    columns.fill(height, 0, count);
    // Exact silhouettes: round tops leave usable room beside their crest.
    for (const f of figures) {
      if (f.leaving) continue;
      const from = Math.max(0, Math.floor(f.minX / cell)),
        to = Math.min(count - 1, Math.floor(f.maxX / cell));
      for (let c = from; c <= to; c++) {
        let room = columns[c];
        for (const part of f.parts)
          for (const x of [c * cell, (c + 0.5) * cell, (c + 1) * cell]) {
            const y = partProfile(part, x, direction);
            if (Number.isNaN(y)) continue;
            const r = direction === -1 ? height - y : y;
            if (r < room) room = r;
          }
        columns[c] = room;
      }
    }
    const span = Math.min(count, Math.ceil(widthPx / cell));
    // Monotonic deque sliding-window minimum.
    let head = 0,
      tail = 0,
      windows = 0;
    for (let c = 0; c < count; c++) {
      while (tail > head && columns[deque[tail - 1]] >= columns[c]) tail--;
      deque[tail++] = c;
      if (deque[head] <= c - span) head++;
      if (c >= span - 1) windowRoom[windows++] = columns[deque[head]];
    }
    const need = heightPx + 4;
    let total = 0;
    for (let s = 0; s < windows; s++)
      if (windowRoom[s] >= need) total += windowRoom[s] - need + cell;
    if (!total) return null;
    let pick = random() * total,
      start = 0;
    for (let s = 0; s < windows; s++) {
      if (windowRoom[s] < need) continue;
      pick -= windowRoom[s] - need + cell;
      start = s;
      if (pick <= 0) break;
    }
    const slack = Math.max(0, span * cell - widthPx);
    const left = Math.min(width - widthPx, start * cell + random() * slack);
    const x = left - shape.left * radius * 1.02;
    const y = direction === -1 ? height - shape.top * radius + 1 : -shape.bottom * radius - 1;
    return { x, y };
  }

  function makeFigure(kind: SolidKind, variation: number, color: number, x: number, y: number) {
    const shape = solidShape(kind);
    const radius = radiusFor(variation);
    const body = createSolidBody(nextId++, shape, radius, x, y) as Figure;
    const look = random() * Math.PI * 2,
      reach = 0.2 + random() * 0.6;
    Object.assign(body, {
      kind,
      colorIndex: solidColorIndex(kind, color, colors.length),
      variation,
      idleX: Math.cos(look) * reach,
      idleY: Math.sin(look) * reach,
      follow: random(),
      blinkPeriod: 2.8 + random() * 4,
      blinkPhase: random() * 7,
      age: 0,
      eyes: new Float64Array(128),
      eyeCount: 0,
      eyeVisible: 0,
      eyeState: new Float64Array(5).fill(NaN),
      painted: new Float64Array(8).fill(NaN),
      pose: new Float64Array(4).fill(NaN),
    });
    return body;
  }

  /** Admits the next planned figure at a free lane. */
  function spawn(force = false) {
    if (!width || !height) return false;
    planned ??= plan();
    const used = usedArea();
    const shape = solidShape(planned.kind);
    // Try the planned size, then the smallest allowed size to fill the gaps.
    for (const variation of settings.sizeVariation > 0 ? [planned.variation, 1] : [0]) {
      const radius = radiusFor(variation);
      if (used + shape.area * radius * radius > capacity()) continue;
      const direction = side();
      let x = 0,
        y = 0;
      if (direction) {
        const lane = findLane(planned.kind, radius);
        if (!lane) continue;
        ({ x, y } = lane);
      } else {
        const probe = makeFigure(planned.kind, variation, planned.color, 0, 0);
        nextId--;
        let found = false;
        for (let attempt = 0; attempt < 24 && !found; attempt++) {
          probe.x = radius + random() * Math.max(0, width - radius * 2);
          probe.y = radius + random() * Math.max(0, height - radius * 2);
          found = !world.overlaps(probe);
        }
        if (!found) continue;
        ({ x, y } = probe);
      }
      const figure = makeFigure(planned.kind, variation, planned.color, x, y);
      figure.vx = (random() - 0.5) * 40;
      figure.vy = direction * 60;
      figure.w = (random() - 0.5) * settings.spin * 2;
      // Falling volumes tumble in 3D until something supports them.
      if (settings.depth !== '2d') {
        figure.pitchRate = (random() - 0.5) * settings.spin * 7;
        figure.yawRate = (random() - 0.5) * settings.spin * 7;
      }
      figure.angle = (random() - 0.5) * 0.5;
      figure.entered = direction === 0;
      world.add(figure);
      planned = null;
      full = false;
      dirty = true;
      refreshLimits();
      return true;
    }
    if (force) refreshLimits();
    return false;
  }

  /** Manual creation at a point: only where a full-size figure fits right now. */
  function spawnAt(x: number, y: number) {
    planned ??= plan();
    const radius = radiusFor(planned.variation);
    const shape = solidShape(planned.kind);
    if (usedArea() + shape.area * radius * radius > capacity()) return false;
    const figure = makeFigure(planned.kind, planned.variation, planned.color, x, y);
    figure.entered = true;
    if (world.overlaps(figure)) {
      nextId--;
      return false;
    }
    figure.growth =
      settings.appearanceDuration > 0 && !motion.matches && !settings.paused ? 0.02 : 1;
    setSolidRadius(figure, figure.radius);
    world.add(figure);
    planned = null;
    dirty = true;
    refreshLimits();
    return true;
  }

  /** Releases the figures nearest the open side until the pile fits again. */
  function relieveOverflow() {
    let used = usedArea();
    const limit = capacity();
    if (used <= limit) return;
    const direction = side() || 1;
    const ordered = figures
      .filter((f) => !f.leaving)
      .sort((a, b) => (direction === 1 ? a.minY - b.minY : b.maxY - a.maxY));
    for (const f of ordered) {
      if (used <= limit) break;
      f.leaving = 1e-6;
      used -= f.shape.area * f.radius * f.radius;
    }
    world.wakeAll();
  }

  function refreshLimits() {
    if (!width || !height) return;
    const used = usedArea();
    const room = capacity();
    let largest = 80;
    // The largest figure must fit the host in both directions.
    for (const kind of solidKinds) {
      const shape = solidShape(kind);
      largest = Math.min(
        largest,
        width / (shape.right - shape.left) / 1.05,
        height / (shape.bottom - shape.top) / 1.05,
      );
    }
    if (used > 0) largest = Math.min(largest, settings.size * Math.sqrt(room / used));
    const maximum = Math.max(Math.min(settings.size, 8), Math.floor(largest * 10) / 10);
    const smallest = radiusFor(settings.sizeVariation > 0 ? 1 : 0);
    const nothingFits = used + Math.PI * 0.9 * smallest * smallest > room;
    if (nothingFits) full = true;
    canvas.dataset.shapeMaxSize = String(maximum);
    canvas.dataset.shapeFull = String(full);
    canvas.dataset.shapeCount = String(figures.length);
    if (maximum !== notifiedSize) {
      notifiedSize = maximum;
      onSizeLimitChange?.(maximum);
    }
    if (full !== notifiedFull) {
      notifiedFull = full;
      onFullChange?.(full);
    }
  }

  // ---- Gaze --------------------------------------------------------------

  let gazePointer: Pick<PointerEvent, 'clientX' | 'clientY'> | null = null;
  let gazeTarget: { x: number; y: number } | null = null;
  let gaze: { x: number; y: number; weight: number } | null = null;
  const point = (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * height,
    };
  };
  const refreshGaze = () => {
    gazeTarget = gazePointer ? point(gazePointer) : null;
    if (settings.followCursor && gazeTarget && (!gaze || settings.paused || motion.matches))
      gaze = { ...gazeTarget, weight: 1 };
    dirty = true;
  };
  const gazeSettled = () =>
    !gaze ||
    (gazeTarget !== null &&
      Math.abs(gaze.x - gazeTarget.x) < 0.3 &&
      Math.abs(gaze.y - gazeTarget.y) < 0.3 &&
      gaze.weight > 0.995);
  function easeGaze(elapsed: number) {
    if (settings.followCursor && gazeTarget) {
      gaze ??= { ...gazeTarget, weight: 1 };
      const blend = 1 - Math.exp(-10 * elapsed);
      gaze.x += (gazeTarget.x - gaze.x) * blend;
      gaze.y += (gazeTarget.y - gaze.y) * blend;
      gaze.weight += (1 - gaze.weight) * blend;
    } else if (gaze) {
      gaze.weight *= Math.exp(-8 * elapsed);
      if (gaze.weight < 0.002) gaze = null;
    }
  }

  // ---- Painting ----------------------------------------------------------

  function sprite(f: Figure) {
    const pixels = f.radius * ratio;
    // Quarter-octave buckets: at most ~19% downscaling, few bitmaps.
    const bucket = Math.ceil(Math.log2(Math.max(2, pixels)) * 4);
    const key = `${f.kind}|${f.colorIndex}|${bucket}`;
    let image = sprites.get(key);
    if (!image) {
      image = createSolidSprite(
        f.shape,
        colors[f.colorIndex % colors.length] ?? '#3c82f6',
        2 ** (bucket / 4),
      );
      sprites.set(key, image);
    }
    return image;
  }
  const blink = (f: Figure) => {
    const local = (clock + f.blinkPhase) % f.blinkPeriod;
    return local < blinkLength ? Math.sin((Math.PI * local) / blinkLength) : 0;
  };

  type Region = { x0: number; y0: number; x1: number; y1: number };
  const outside = (f: Figure, r: Region | null) =>
    r !== null && (f.maxX < r.x0 || f.minX > r.x1 || f.maxY < r.y0 || f.minY > r.y1);
  const boxOf = (b: Float64Array, o: number): Region => ({
    x0: b[o],
    y0: b[o + 1],
    x1: b[o + 2],
    y1: b[o + 3],
  });
  /** Regions to repaint next frame (figures that were removed). */
  const pending: Region[] = [];

  /** Paints everything, or only what overlaps `region` (clipped). */
  function draw(region: Region | null = null) {
    if (!region) dirty = false;
    if (!width || !height) return;
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (region) {
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(region.x0, region.y0, region.x1 - region.x0, region.y1 - region.y0);
      ctx!.clip();
    }
    ctx!.fillStyle = background;
    if (region) ctx!.fillRect(region.x0, region.y0, region.x1 - region.x0, region.y1 - region.y0);
    else ctx!.fillRect(0, 0, width, height);
    for (const f of figures) {
      if (outside(f, region)) continue;
      const scale = f.radius * f.growth;
      if (scale < 0.5) continue;
      const cos = Math.cos(f.angle) * ratio,
        sin = Math.sin(f.angle) * ratio;
      if (f.turned) {
        // A volume turned in 3D: fill its current projected silhouette.
        ctx!.setTransform(
          cos * scale,
          sin * scale,
          -sin * scale,
          cos * scale,
          f.x * ratio,
          f.y * ratio,
        );
        ctx!.beginPath();
        for (const part of f.paint) tracePart(ctx!, part, 1);
        ctx!.fillStyle = colors[f.colorIndex % colors.length] ?? '#3c82f6';
        ctx!.fill();
        continue;
      }
      const image = sprite(f);
      ctx!.setTransform(cos, sin, -sin, cos, f.x * ratio, f.y * ratio);
      const extent = image.extent * scale;
      ctx!.drawImage(image.image, -extent, -extent, extent * 2, extent * 2);
    }
    if (settings.faces) paintEyes(region);
    if (region) ctx!.restore();
  }

  /**
   * Computes every figure's eyes once per frame. Returns whether the eyes of
   * `f` changed since they were last painted.
   */
  function updateEyes(f: Figure) {
    const scale = f.radius * f.growth;
    let lookX = f.idleX,
      lookY = f.idleY;
    const follow = settings.followCursor && gaze ? gaze : null;
    if (follow && f.follow < settings.cursorFollowRatio) {
      const cos = Math.cos(f.angle),
        sin = Math.sin(f.angle);
      const dx = follow.x - f.x,
        dy = follow.y - f.y;
      const lx = dx * cos + dy * sin,
        ly = dy * cos - dx * sin;
      const distance = Math.hypot(lx, ly) || 1;
      const strength = Math.min(1, distance / (Math.max(1, scale) * 2.6));
      const weight = follow.weight ?? 1;
      lookX += ((lx / distance) * strength - lookX) * weight;
      lookY += ((ly / distance) * strength - lookY) * weight;
    }
    const open = 1 - 0.92 * blink(f);
    const state = f.eyeState;
    const changed =
      Math.abs(state[0] - lookX) > 1e-4 ||
      Math.abs(state[1] - lookY) > 1e-4 ||
      Math.abs(state[2] - open) > 1e-4 ||
      state[3] !== f.pitch ||
      state[4] !== f.yaw;
    if (!changed) return false;
    state[0] = lookX;
    state[1] = lookY;
    state[2] = open;
    state[3] = f.pitch;
    state[4] = f.yaw;
    f.eyeCount = solidEyes(f.shape, lookX, lookY, open, f.eyes, f.turned ? f.rotation : null);
    f.eyeVisible = solidEyesVisible;
    return true;
  }

  /** World box of a figure's visible eyes. */
  function eyeBox(f: Figure, out: Float64Array) {
    const scale = f.radius * f.growth,
      cos = Math.cos(f.angle),
      sin = Math.sin(f.angle);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const n = f.eyeCount;
    for (let e = 0; e < 2; e++) {
      if (!(f.eyeVisible & (1 << e))) continue;
      for (let i = 0; i < n; i++) {
        const k = (e * n + i) * 2,
          px = f.eyes[k] * scale,
          py = f.eyes[k + 1] * scale;
        const x = f.x + px * cos - py * sin,
          y = f.y + px * sin + py * cos;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    out[4] = x0 - 2;
    out[5] = y0 - 2;
    out[6] = x1 + 2;
    out[7] = y1 + 2;
    if (x0 === Infinity) out[4] = out[5] = out[6] = out[7] = NaN;
  }

  function paintEyes(region: Region | null) {
    // One path for every eye in the scene: coordinates are transformed when
    // they are added, so a single fill paints them all.
    ctx!.beginPath();
    for (const f of figures) {
      const scale = f.radius * f.growth;
      if (scale < 4 || !f.eyeVisible || outside(f, region)) continue;
      const cos = Math.cos(f.angle),
        sin = Math.sin(f.angle);
      const c = cos * ratio * scale,
        s = sin * ratio * scale;
      ctx!.setTransform(c, s, -s, c, f.x * ratio, f.y * ratio);
      const n = f.eyeCount;
      for (let e = 0; e < 2; e++) {
        if (!(f.eyeVisible & (1 << e))) continue;
        const base = e * n * 2;
        ctx!.moveTo(f.eyes[base], f.eyes[base + 1]);
        for (let i = 1; i < n; i++) ctx!.lineTo(f.eyes[base + i * 2], f.eyes[base + i * 2 + 1]);
        ctx!.closePath();
      }
    }
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.fillStyle = faceColor;
    ctx!.fill();
  }

  /**
   * Dirty-region painting. Only the boxes of figures that moved (where they
   * were and where they are) and of eyes that changed (cursor, blinks) are
   * repainted, each clipped to device pixels. When those regions cover most
   * of the canvas, one full repaint is cheaper.
   */
  const box = new Float64Array(8);
  function render(full: boolean) {
    if (!width || !height) return;
    const regions: Region[] = pending.splice(0);
    const add = (r: Region) => {
      if (Number.isNaN(r.x0)) return;
      regions.push(r);
    };
    for (const f of figures) {
      const eyesChanged = settings.faces && updateEyes(f);
      box[0] = f.minX - 2;
      box[1] = f.minY - 2;
      box[2] = f.maxX + 2;
      box[3] = f.maxY + 2;
      const p = f.painted,
        q = f.pose;
      // Only a visible change of pose repaints: an awake but still body
      // (settling below a pixel) leaves its region alone.
      const moved =
        Number.isNaN(p[0]) ||
        Math.abs(q[0] - f.x) > 0.04 ||
        Math.abs(q[1] - f.y) > 0.04 ||
        Math.abs(q[2] - f.angle) > 0.0008 ||
        q[3] !== f.growth ||
        f.turned;
      if (moved) {
        q[0] = f.x;
        q[1] = f.y;
        q[2] = f.angle;
        q[3] = f.growth;
      }
      if (!moved && !full) {
        // Same pose: keep the painted body box; only eyes may need a repaint.
        box[0] = p[0];
        box[1] = p[1];
        box[2] = p[2];
        box[3] = p[3];
      }
      if (settings.faces && (eyesChanged || moved || full)) eyeBox(f, box);
      else {
        box[4] = p[4];
        box[5] = p[5];
        box[6] = p[6];
        box[7] = p[7];
      }
      if (!full) {
        if (moved) {
          add(boxOf(p, 0));
          add(boxOf(box, 0));
        } else if (eyesChanged) {
          add(boxOf(p, 4));
          add(boxOf(box, 4));
        }
      }
      p.set(box);
    }
    if (full || dirty) {
      draw();
      return;
    }
    if (!regions.length) return;
    // Merge overlapping boxes, then snap to device pixels.
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < regions.length && !merged; i++)
        for (let j = i + 1; j < regions.length; j++) {
          const a = regions[i],
            b = regions[j];
          if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) continue;
          a.x0 = Math.min(a.x0, b.x0);
          a.y0 = Math.min(a.y0, b.y0);
          a.x1 = Math.max(a.x1, b.x1);
          a.y1 = Math.max(a.y1, b.y1);
          regions.splice(j, 1);
          merged = true;
          break;
        }
    }
    let area = 0;
    for (const r of regions) {
      r.x0 = Math.max(0, Math.floor(r.x0 * ratio) / ratio);
      r.y0 = Math.max(0, Math.floor(r.y0 * ratio) / ratio);
      r.x1 = Math.min(width, Math.ceil(r.x1 * ratio) / ratio);
      r.y1 = Math.min(height, Math.ceil(r.y1 * ratio) / ratio);
      area += Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
    }
    if (area > width * height * 0.55) {
      draw();
      return;
    }
    for (const r of regions) if (r.x1 > r.x0 && r.y1 > r.y0) draw(r);
  }

  // ---- Loop --------------------------------------------------------------

  const running = () => !settings.paused && !motion.matches;
  const canRun = () => !disposed && visible && !document.hidden;
  const emitting = () =>
    running() && !stopped && !full && automaticBirths < settings.count && settings.count > 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = timer = 0;
    last = 0;
    accumulator = 0;
  };
  const wake = () => {
    if (!canRun()) return;
    clearTimeout(timer);
    timer = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  };

  function advance(elapsed: number) {
    clock += elapsed;
    // Automatic emission at the configured rate; a blocked admission retries
    // shortly instead of searching every frame.
    if (emitting()) {
      birthClock += elapsed;
      const interval = 1 / settings.spawnRate;
      while (birthClock >= interval && automaticBirths < settings.count) {
        if (!spawn()) {
          birthClock = interval - 0.12;
          if (!world.awakeCount) {
            full = true;
            refreshLimits();
          }
          break;
        }
        automaticBirths++;
        canvas.dataset.shapeEmitted = String(automaticBirths);
        birthClock -= interval;
      }
    } else birthClock = 0;
    // Growth of manual births and fade-out of released figures.
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      if (f.leaving) {
        f.leaving += elapsed;
        f.growth = Math.max(0, 1 - f.leaving / 0.28);
        if (f.growth <= 0) {
          world.remove(f);
          if (!Number.isNaN(f.painted[0])) pending.push(boxOf(f.painted, 0));
          refreshLimits();
          continue;
        }
        setSolidRadius(f, f.radius);
        world.wake(f);
      } else if (f.growth < 1) {
        f.age += elapsed;
        const t = Math.min(1, f.age / Math.max(0.01, settings.appearanceDuration));
        f.growth = Math.max(0.02, 1 - (1 - t) ** 3);
        setSolidRadius(f, f.radius);
        world.wake(f);
      }
      // A figure that never managed to fall in (lane closed above it) leaves.
      if (!f.entered && !f.leaving) {
        f.outside += elapsed;
        if (f.outside > 2.5) {
          f.leaving = 1e-6;
          refreshLimits();
        }
      }
    }
    accumulator += elapsed;
    const dt = 1 / stepRate;
    let steps = 0;
    while (accumulator >= dt && steps < 3) {
      world.step(dt, settings);
      accumulator -= dt;
      steps++;
    }
    if (steps === 3) accumulator = 0;
  }

  function busy() {
    if (world.dragging) return true;
    if (!gazeSettled()) return true;
    if (!running()) return false;
    if (world.awakeCount || emitting()) return true;
    for (const f of figures) if (f.leaving || f.growth < 1 || blink(f) > 0) return true;
    return false;
  }

  function tick(now: number) {
    frame = 0;
    if (!canRun()) {
      last = 0;
      return;
    }
    const started = performance.now();
    const elapsed = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (running()) advance(elapsed);
    easeGaze(elapsed);
    render(false);
    adapt(elapsed * 1000, performance.now() - started);
    if (busy()) {
      frame = requestAnimationFrame(tick);
      return;
    }
    // Idle: nothing moves. Sleep until the next blink instead of spinning rAF.
    last = 0;
    if (!running() || !settings.faces || !figures.length) return;
    let delay = Infinity;
    for (const f of figures) {
      const local = (clock + f.blinkPhase) % f.blinkPeriod;
      delay = Math.min(delay, f.blinkPeriod - local);
    }
    const resumeAt = performance.now();
    timer = window.setTimeout(
      () => {
        timer = 0;
        clock += (performance.now() - resumeAt) / 1000 - 1 / 60;
        wake();
      },
      Math.max(16, delay * 1000 - 16),
    );
  }

  /**
   * Low-power devices: if busy frames stay slow (frame interval includes the
   * browser's rasterization, not just our script), drop to 1x pixels.
   */
  function adapt(interval: number, cost: number) {
    if (lowPower || ratio <= 1 || !world.awakeCount) return;
    costAverage += Math.max(interval, cost);
    if (++costFrames < 40) return;
    if (costAverage / costFrames > 24) {
      lowPower = true;
      measure();
    }
    costAverage = costFrames = 0;
  }

  // ---- Lifecycle -------------------------------------------------------

  function prefill() {
    // Reduced motion: settle the whole pile synchronously within a budget,
    // then show a still image.
    const deadline = performance.now() + 300;
    const dt = 1 / stepRate;
    for (let i = 0; i < 2400 && performance.now() < deadline; i++) {
      if (!stopped && !full && automaticBirths < settings.count && i % 4 === 0) {
        if (spawn()) automaticBirths++;
        else if (!world.awakeCount) full = true;
      }
      world.step(dt, settings);
      if ((full || automaticBirths >= settings.count) && !world.awakeCount) break;
    }
    for (const f of figures) {
      f.growth = 1;
      setSolidRadius(f, f.radius);
    }
    refreshLimits();
  }

  function reset() {
    stop();
    world.clear();
    random = shapeRandom(settings.seed);
    bag = [];
    colorTurns.clear();
    planned = null;
    nextId = 1;
    automaticBirths = 0;
    birthClock = 1 / settings.spawnRate;
    stopped = false;
    full = false;
    clock = 0;
    canvas.dataset.shapeEmitted = '0';
    if (motion.matches) prefill();
    refreshLimits();
    dirty = true;
    render(true);
    wake();
  }

  function measure() {
    const nextWidth = host!.clientWidth,
      nextHeight = host!.clientHeight;
    if (!nextWidth || !nextHeight) {
      stop();
      return;
    }
    const nextRatio = lowPower ? 1 : Math.min(devicePixelRatio || 1, 2);
    if (nextRatio !== ratio) sprites.clear();
    ratio = nextRatio;
    if (width && height && (width !== nextWidth || height !== nextHeight)) {
      for (const f of figures) {
        f.x = (f.x / width) * nextWidth;
        f.y = (f.y / height) * nextHeight;
        updateSolidTransform(f);
      }
      if (gaze) {
        gaze.x = (gaze.x / width) * nextWidth;
        gaze.y = (gaze.y / height) * nextHeight;
      }
      world.wakeAll();
    }
    width = nextWidth;
    height = nextHeight;
    world.setBounds(width, height, side());
    canvas.dataset.shapeRatio = String(ratio);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    full = false;
    relieveOverflow();
    refreshLimits();
    refreshGaze();
    if (motion.matches && figures.length < settings.count && !stopped) prefill();
    render(true);
    wake();
  }

  // ---- Input -------------------------------------------------------------

  let pointer: {
    id: number;
    figure: Figure | null;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null = null;
  const pick = (x: number, y: number) => {
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      if (f.leaving) continue;
      const scale = f.radius * f.growth;
      const dx = x - f.x,
        dy = y - f.y;
      if (dx * dx + dy * dy > (f.shape.bound3 * scale) ** 2) continue;
      const cos = Math.cos(f.angle),
        sin = Math.sin(f.angle);
      if (
        partsDistance(f.paint, (dx * cos + dy * sin) / scale, (dy * cos - dx * sin) / scale) <= 0.03
      )
        return f;
    }
    return null;
  };
  const down = (event: PointerEvent) => {
    if (!settings.interactive || pointer || event.button !== 0) return;
    const p = point(event);
    const figure = pick(p.x, p.y);
    pointer = { id: event.pointerId, figure, ...p, ox: 0, oy: 0, moved: false };
    if (figure) {
      pointer.ox = p.x - figure.x;
      pointer.oy = p.y - figure.y;
      if (running()) world.grab(figure, p.x, p.y);
      canvas.dataset.dragging = 'true';
    }
    canvas.setPointerCapture(event.pointerId);
    wake();
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const p = point(event);
    if (Math.hypot(p.x - pointer.x, p.y - pointer.y) > 3) pointer.moved = true;
    const f = pointer.figure;
    if (f) {
      if (running()) world.drag(p.x, p.y);
      else {
        // Paused or static: move the figure directly without simulating.
        f.x = Math.max(0, Math.min(width, p.x - pointer.ox));
        f.y = Math.max(0, Math.min(height, p.y - pointer.oy));
        updateSolidTransform(f);
        dirty = true;
        render(true);
      }
    }
    wake();
  };
  const release = () => {
    const held = pointer;
    pointer = null;
    world.release();
    if (held && canvas.hasPointerCapture(held.id)) canvas.releasePointerCapture(held.id);
    canvas.dataset.dragging = 'false';
  };
  const up = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.figure && !pointer.moved && event.type === 'pointerup') {
      const p = point(event);
      spawnAt(p.x, p.y);
    }
    release();
    full = false;
    refreshLimits();
    dirty = true;
    if (!running()) render(true);
    wake();
  };

  const trackGaze = (event: PointerEvent) => {
    if (disposed || !['mouse', 'pen'].includes(event.pointerType)) return;
    gazePointer = { clientX: event.clientX, clientY: event.clientY };
    refreshGaze();
    if (!settings.followCursor) return;
    if (!running()) render(true);
    wake();
  };
  const leaveWindow = (event: PointerEvent) => {
    if (event.relatedTarget !== null || !['mouse', 'pen'].includes(event.pointerType)) return;
    gazePointer = gazeTarget = null;
    if (motion.matches || !settings.followCursor) gaze = null;
    dirty = true;
    if (!running()) render(true);
    wake();
  };
  const scrollGaze = () => {
    if (!gazePointer) return;
    refreshGaze();
    if (!running()) render(true);
    wake();
  };
  const visibility = () => {
    gazePointer = gazeTarget = null;
    release();
    stop();
    dirty = true;
    render(true);
    wake();
  };
  const preference = () => {
    stop();
    reset();
  };

  // ---- Theme -------------------------------------------------------------

  let themeFrame = 0;
  const syncTheme = () => {
    cancelAnimationFrame(themeFrame);
    themeFrame = requestAnimationFrame(() => {
      themeFrame = 0;
      if (disposed) return;
      resolveColors();
      render(true);
    });
  };
  const themeObserver = new MutationObserver(syncTheme);
  for (let ancestor: HTMLElement | null = host; ancestor; ancestor = ancestor.parentElement)
    themeObserver.observe(ancestor, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', syncTheme);
  const transitionEnd = (event: TransitionEvent) => {
    if (
      event.target instanceof Element &&
      event.target.contains(host) &&
      /^(--|color|background)/.test(event.propertyName)
    )
      syncTheme();
  };
  document.addEventListener('transitionend', transitionEnd, true);

  const events = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', up],
    ['pointercancel', up],
    ['lostpointercapture', up],
  ] as const;
  events.forEach(([name, handler]) => canvas.addEventListener(name, handler));
  const resize = new ResizeObserver(measure);
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) release();
    stop();
    wake();
  });
  intersection.observe(host);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', visibility);
  window.addEventListener('pointermove', trackGaze, { passive: true });
  window.addEventListener('pointerout', leaveWindow, { passive: true });
  window.addEventListener('scroll', scrollGaze, { passive: true, capture: true });
  motion.addEventListener('change', preference);

  resolveColors();
  measure();
  reset();

  return {
    reset,
    add() {
      if (motion.matches || settings.paused) {
        const placed = spawnAt(width * (0.15 + random() * 0.7), height * (0.1 + random() * 0.5));
        if (placed) render(true);
        return placed;
      }
      const placed = spawn(true);
      wake();
      return placed;
    },
    clear() {
      release();
      world.clear();
      stopped = true;
      full = false;
      refreshLimits();
      render(true);
    },
    shake() {
      if (motion.matches) return;
      world.wakeAll();
      for (const f of figures) {
        f.vx += (random() - 0.5) * 450;
        f.vy -= Math.sign(settings.gravity || 1) * (170 + random() * 200);
        f.w += (random() - 0.5) * 8;
      }
      wake();
    },
    update(next: ShapeSettings) {
      const previous = settings;
      settings = normalize(next);
      if (figures.length && settings.size > previous.size && notifiedSize > 0)
        settings.size = Math.min(settings.size, Math.max(previous.size, notifiedSize));
      resolveColors();
      if (!settings.followCursor) gaze = null;
      else refreshGaze();
      if (!settings.interactive) release();
      canvas.dataset.interactive = String(settings.interactive);
      if (settings.seed !== previous.seed) {
        reset();
        return;
      }
      world.setBounds(width, height, side());
      const shapeChanged = settings.shape !== previous.shape;
      for (const f of figures) {
        if (shapeChanged && settings.shape !== 'mixed') {
          const kind = isSolidKind(settings.shape) ? settings.shape : 'circle';
          if (kind !== f.kind) {
            f.kind = kind;
            attachSolidShape(f, solidShape(kind));
          }
        }
        f.colorIndex = f.colorIndex % Math.max(1, colors.length);
        setSolidRadius(f, radiusFor(f.variation));
        updateSolidTransform(f);
      }
      if (shapeChanged) bag = [];
      // Flat mode: every figure returns to its flat silhouette right away.
      if (settings.depth === '2d')
        for (const f of figures) {
          flatten(f);
          updateSolidTransform(f);
        }
      planned = null;
      world.wakeAll();
      full = false;
      relieveOverflow();
      refreshLimits();
      if (motion.matches && !stopped && automaticBirths < settings.count) prefill();
      dirty = true;
      render(true);
      if (settings.paused) stop();
      wake();
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(themeFrame);
      themeObserver.disconnect();
      scheme.removeEventListener('change', syncTheme);
      document.removeEventListener('transitionend', transitionEnd, true);
      release();
      stop();
      resize.disconnect();
      intersection.disconnect();
      events.forEach(([name, handler]) => canvas.removeEventListener(name, handler));
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', visibility);
      window.removeEventListener('pointermove', trackGaze);
      window.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('scroll', scrollGaze, true);
      motion.removeEventListener('change', preference);
      world.clear();
      sprites.clear();
    },
  };
}
