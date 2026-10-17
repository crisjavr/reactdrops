import { createTopographicGrain } from './topographic-grain';
import { createElevationField, traceContours, type Contour } from './topographic-field';
import type { TopographicConfig } from './topographic-renderer';

export type TopographicSurfaceFrame = {
  width: number;
  height: number;
  ratio: number;
  cosine: number;
  sine: number;
  elapsedSeconds: number;
  heightTexture: WebGLTexture | null;
  heightRevision: number;
  grid: readonly [number, number];
  extent: readonly [number, number];
  margin: number;
  config: TopographicConfig;
  line: readonly number[];
  accent: readonly number[];
  surface: readonly number[];
  shadow: readonly number[] | null;
  background: readonly number[];
  gradient: { count: number; data: Float32Array };
  /** Mouse effect strength (the `hover` prop); 0 disables it. */
  pointerLift: number;
  /**
   * The eased pointer in canvas CSS pixels from the top-left corner, packed as
   * (x, y, presence, unused); `pointerStampCount` is 1 while it is present.
   */
  pointerStamps: Float32Array;
  pointerStampCount: number;
  /** Mouse effect radius in CSS pixels. */
  pointerRadius: number;
  /** Current morphed altitude at a ground point (CSS pixels, y up from the centre). */
  altitudeAt: (x: number, y: number) => number;
};
/** Optional depth renderer supplied only by the standalone terrain component. */
export type TopographicSurfaceFactory = (gl: WebGL2RenderingContext) => {
  /** Optional native backing dimensions; logical DPR stays available for grain. */
  presentationSize?: (width: number, height: number, ratio: number) => readonly [number, number];
  draw: (frame: TopographicSurfaceFrame) => void;
  destroy: () => void;
};

/**
 * GLSL: spreads the terrain away from the pointer, like a finger pressed
 * into the map (negative strength draws it in). Heights never change, only
 * where the terrain is sampled; `warpJacobian` holds the exact derivative
 * for lit surfaces. Needs uStamps (x, y, presence), uStampCount and
 * uPointerRadius. The strength stays under 1, so the warp never folds.
 */
export const pointerWarpShader = `mat2 warpJacobian;
vec2 pointerWarp(vec2 point, float strength) {
  warpJacobian=mat2(1.);
  if(uStampCount==0||strength==0.) return point;
  vec2 toPointer=point-uStamps[0].xy;
  float spread=uPointerRadius*uPointerRadius, distance2=dot(toPointer,toPointer);
  // Beyond three radii the pointer moves the terrain by under 1e-4.
  if(distance2>9.*spread) return point;
  float weight=strength*uStamps[0].z*exp(-distance2/spread);
  warpJacobian=mat2(1.-weight)+outerProduct(toPointer,toPointer)*(2.*weight/spread);
  return point-weight*toPointer;
}
`;

const vertex = `#version 300 es
layout(location=0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }`;
const fragment = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler2DArray;
uniform sampler2D uHeight, uGrain;
uniform sampler2DArray uCuts;
uniform vec2 uGrid, uExtent, uCanvasSize;
uniform float uGrainAmount;
uniform float uGradientDiffusion;
uniform float uMargin, uRatio, uCosine, uSine, uDensity, uWidth, uOpacity;
uniform float uDashLength, uDashGap;
uniform vec4 uStamps[1];
uniform highp int uStampCount;
uniform float uPointerRadius, uPointerLift, uHoverTime;
uniform highp int uHoverEffect;
uniform vec2 uPointerDrag;
uniform int uStyle, uLevelOffset, uLayers[41], uGradientEnabled, uGradientStops;
uniform vec3 uLineColor, uAccentColor, uGradientColors[8];
out vec4 color;
vec4 weights(float t) {
  float t2=t*t, t3=t2*t;
  return vec4(1.-3.*t+3.*t2-t3, 4.-6.*t2+3.*t3, 1.+3.*t+3.*t2-3.*t3, t3)/6.;
}
// Four hardware bilinear taps evaluate a tensor cubic B-spline exactly.
// The height and its first two spatial derivatives stay continuous at cells.
vec3 surface(vec2 uv) {
  vec2 p=uv*(uGrid-1.), cell=floor(p), f=fract(p);
  vec4 x=weights(f.x), y=weights(f.y);
  vec2 gx=vec2(x.x+x.y,x.z+x.w), gy=vec2(y.x+y.y,y.z+y.w);
  vec2 px=cell.x+vec2(-1.+x.y/gx.x,1.+x.w/gx.y);
  vec2 py=cell.y+vec2(-1.+y.y/gy.x,1.+y.w/gy.y);
  vec3 a=texture(uHeight,(vec2(px.x,py.x)+.5)/uGrid).rgb;
  vec3 b=texture(uHeight,(vec2(px.y,py.x)+.5)/uGrid).rgb;
  vec3 c=texture(uHeight,(vec2(px.x,py.y)+.5)/uGrid).rgb;
  vec3 d=texture(uHeight,(vec2(px.y,py.y)+.5)/uGrid).rgb;
  return mix(mix(a,b,gx.y),mix(c,d,gx.y),gy.y);
}
// Reconstruct the material phase smoothly too; bilinear derivatives would
// make cut strength flicker at atlas texel boundaries during deformation.
vec2 cutPhase(vec2 uv, float layer) {
  vec2 grid=vec2(textureSize(uCuts,0).xy), p=uv*grid-.5;
  vec2 cell=floor(p), f=fract(p);
  vec4 x=weights(f.x), y=weights(f.y);
  vec2 gx=vec2(x.x+x.y,x.z+x.w), gy=vec2(y.x+y.y,y.z+y.w);
  vec2 px=cell.x+vec2(-1.+x.y/gx.x,1.+x.w/gx.y);
  vec2 py=cell.y+vec2(-1.+y.y/gy.x,1.+y.w/gy.y);
  vec2 a=texture(uCuts,vec3((vec2(px.x,py.x)+.5)/grid,layer)).rg;
  vec2 b=texture(uCuts,vec3((vec2(px.y,py.x)+.5)/grid,layer)).rg;
  vec2 c=texture(uCuts,vec3((vec2(px.x,py.y)+.5)/grid,layer)).rg;
  vec2 d=texture(uCuts,vec3((vec2(px.y,py.y)+.5)/grid,layer)).rg;
  return mix(mix(a,b,gx.y),mix(c,d,gx.y),gy.y)*2.-1.;
}
vec3 elevationColor(float height) {
  float intervals=float(uGradientStops-1);
  if (uGradientDiffusion<=0.) {
    float position=height*intervals;
    int segment=min(int(floor(position)),uGradientStops-2);
    return mix(uGradientColors[segment],uGradientColors[segment+1],
      smoothstep(0.,1.,position-float(segment)));
  }
  // Widen transitions in elevation space. Their overlapping weights blend
  // neighboring colors while retaining the exact terrain and contour height.
  float halfWidth=(1.+3.*uGradientDiffusion)/intervals*.5;
  vec3 terrain=uGradientColors[0];
  for (int i=0; i<7; i++) {
    if (i>=uGradientStops-1) break;
    float center=(float(i)+.5)/intervals;
    terrain+=(uGradientColors[i+1]-uGradientColors[i])
      *smoothstep(center-halfWidth,center+halfWidth,height);
  }
  return terrain;
}
void main() {
  // Canvas coordinates are top-down; the cached terrain covers overscan too.
  vec2 pixels=vec2(gl_FragCoord.x/uRatio, (uExtent.y-2.*uMargin)-gl_FragCoord.y/uRatio);
  // The pointer reshapes the contours; heights and colors follow. Every
  // effect fades with distance and none can fold the terrain over itself.
  float raise=0.;
  if(uStampCount>0) {
    vec2 toPointer=pixels-uStamps[0].xy;
    float spread=uPointerRadius*uPointerRadius, distance2=dot(toPointer,toPointer);
    if(distance2<9.*spread) {
      float weight=uStamps[0].z*exp(-distance2/spread);
      if(uHoverEffect==1) {
        // Swirl: rotate about the pointer. Distances are kept, so no folds.
        float angle=uPointerLift*2.*weight, c=cos(angle), s=sin(angle);
        pixels=uStamps[0].xy+mat2(c,s,-s,c)*toPointer;
      } else if(uHoverEffect==2) {
        // Ripple: waves travel outward; small amplitude per wavelength.
        float distance=sqrt(distance2);
        float wave=sin(6.2831853*distance/(uPointerRadius*.6)-uHoverTime*4.);
        pixels-=uPointerLift*.09*uPointerRadius*wave*weight*toPointer/max(distance,.001);
      } else if(uHoverEffect==3) {
        // Rings: a hill under the pointer adds concentric contours.
        raise=uPointerLift*weight;
      } else if(uHoverEffect==4) {
        // Drag: contours follow the pointer's motion, then settle back.
        pixels-=weight*uPointerDrag;
      } else {
        // Spread: contours move away from the pointer.
        pixels-=uPointerLift*weight*toPointer;
      }
    }
  }
  vec2 uv=(pixels+uMargin)/uExtent;
  vec3 h=surface(uv);
  float altitude=h.x+h.y*uCosine+h.z*uSine+raise;
  float elevation=(altitude-.037)*uDensity;
  float level=floor(elevation+.5);
  vec2 slope=vec2(dFdx(elevation),dFdy(elevation));
  float gradient=max(length(slope),.00001);
  float distance=abs(elevation-level)/gradient;
  bool major=mod(abs(level),4.)<.5;
  float width=uWidth*uRatio;
  float ink=1.-smoothstep(max(0.,width*.5-.6),width*.5+.6,distance);
  bool broken=uStyle==2 || (uStyle==1 && major);
  if (broken) {
    int index=clamp(int(level)+uLevelOffset,0,40);
    int layer=uLayers[index];
    float period=uDashLength+uDashGap;
    float arc;
    vec2 arcGradient;
    float phaseQuality=1.;
    if (layer>=0) {
      vec2 phase=cutPhase(uv,float(layer));
      arc=atan(phase.y,phase.x)*period/6.28318530718;
      // Differentiate the complex phase, avoiding atan's wrap discontinuity.
      vec2 dx=dFdx(phase), dy=dFdy(phase);
      arcGradient=vec2(phase.x*dx.y-phase.y*dx.x,phase.x*dy.y-phase.y*dy.x)
        *period/(6.28318530718*max(dot(phase,phase),.001));
      phaseQuality=smoothstep(.15,.5,length(phase));
    } else {
      // New summit levels inherit a fixed material cut pattern as they emerge.
      arc=pixels.x*.70710678+pixels.y*.70710678;
      arcGradient=vec2(.70710678,-.70710678)/uRatio;
    }
    vec2 tangent=vec2(-slope.y,slope.x)/gradient;
    float materialSpeed=abs(dot(arcGradient,tangent))*uRatio;
    // A collapsed rest-coordinate projection must never stretch a small gap
    // into an empty summit arc. Fade unreliable cuts into a continuous stroke.
    // Both gates are spatial and continuous: no clock or moving dash offset.
    float cutStrength=phaseQuality*smoothstep(.45,.75,materialSpeed)
      *(1.-smoothstep(1.6,2.4,materialSpeed));
    float dashDistance=abs(mod(arc+period*.5,period)-period*.5);
    float aa=.55*max(materialSpeed,.7)/uRatio;
    float dash=1.-smoothstep(uDashLength*.5-aa,uDashLength*.5+aa,dashDistance);
    ink*=mix(1.,dash,cutStrength);
  }
  float alpha=ink*uOpacity;
  vec3 pigment=major?uAccentColor:uLineColor;
  float fleck=uGrainAmount>0.?texture(uGrain,gl_FragCoord.xy/uCanvasSize).r:0.;
  float grain=uGrainAmount*fleck;
  float white=uGrainAmount*.7*fleck*fleck*(1.-alpha);
  // The same stationary mote exposure textures the color and the contour ink.
  // Coverage still comes from the smooth elevation field, without a CSS mask.
  if (uGradientEnabled==1) {
    // The same altitude creates the color and the contour. Fixed elevation
    // bounds preserve the palette when density changes, without auto exposure.
    float height=clamp((altitude+.65)/1.3,0.,1.);
    vec3 terrain=elevationColor(height);
    terrain=mix(terrain,vec3(1.),uGrainAmount*.7*fleck*fleck);
    color=vec4(mix(terrain,pigment*(1.-grain*.4),alpha),1.);
  } else {
    color=vec4(pigment*(1.-grain*.4)*alpha+vec3(white),alpha+white);
  }
}`;

const finite = (value: number, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

/** Fixed material arclength coordinates, extended along rest-contour normals.
 * The atlas never depends on animation time: cuts cannot orbit the contours.
 */
function createCutAtlas(
  curves: Contour[],
  width: number,
  height: number,
  period: number,
  style: string,
) {
  const columns = Math.max(32, Math.min(384, Math.ceil(width / 3)));
  const rows = Math.max(32, Math.min(384, Math.ceil(height / 3)));
  const groups = new Map<number, Contour[]>();
  if (style !== 'solid')
    for (const curve of curves) {
      if (style === 'mixed' && curve.level % 4 !== 0) continue;
      const group = groups.get(curve.level) ?? [];
      group.push(curve);
      groups.set(curve.level, group);
    }
  const layerLevels = [...groups.keys()];
  const layers = Math.max(1, layerLevels.length),
    area = columns * rows;
  const data = new Uint8Array(area * layers * 2);
  for (let layer = 0; layer < layerLevels.length; layer++) {
    const owners = new Int32Array(area).fill(-1);
    const seeds: { x: number; y: number; cosine: number; sine: number }[] = [];
    for (const curve of groups.get(layerLevels[layer])!) {
      let arc = 0;
      const edges = curve.points.length - (curve.closed ? 0 : 1);
      for (let edge = 0; edge < edges; edge++) {
        const a = curve.points[edge],
          b = curve.points[(edge + 1) % curve.points.length];
        const length = Math.hypot(b.x - a.x, b.y - a.y),
          count = Math.max(1, Math.ceil(length / 2));
        for (let sample = 0; sample < count; sample++) {
          const t = sample / count,
            x = ((a.x + (b.x - a.x) * t) / width) * (columns - 1),
            y = ((a.y + (b.y - a.y) * t) / height) * (rows - 1);
          const phase = ((arc + length * t) / period) * Math.PI * 2;
          const id = seeds.length;
          seeds.push({ x, y, cosine: Math.cos(phase), sine: Math.sin(phase) });
          const px = Math.max(0, Math.min(columns - 1, Math.round(x))),
            py = Math.max(0, Math.min(rows - 1, Math.round(y))),
            cell = py * columns + px;
          const previous = owners[cell];
          if (
            previous < 0 ||
            (seeds[previous].x - px) ** 2 + (seeds[previous].y - py) ** 2 >
              (x - px) ** 2 + (y - py) ** 2
          )
            owners[cell] = id;
        }
        arc += length;
      }
    }
    // Two Euclidean nearest-seed sweeps extend each cut into the surrounding
    // slope. Complex phase storage interpolates safely across arclength wraps.
    for (let pass = 0; pass < 2; pass++)
      for (const forward of [true, false]) {
        for (let step = 0; step < area; step++) {
          const cell = forward ? step : area - 1 - step,
            x = cell % columns,
            y = Math.floor(cell / columns);
          let best = owners[cell],
            distance = best < 0 ? Infinity : (seeds[best].x - x) ** 2 + (seeds[best].y - y) ** 2;
          const direction = forward ? -1 : 1;
          for (let neighbor = 0; neighbor < 4; neighbor++) {
            const dx = neighbor === 1 ? 0 : neighbor === 3 ? -direction : direction;
            const dy = neighbor === 0 ? 0 : direction;
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) continue;
            const candidate = owners[ny * columns + nx];
            if (candidate < 0) continue;
            const seed = seeds[candidate],
              next = (seed.x - x) ** 2 + (seed.y - y) ** 2;
            if (next < distance) {
              best = candidate;
              distance = next;
            }
          }
          owners[cell] = best;
        }
      }
    for (let cell = 0; cell < area; cell++) {
      const seed = seeds[owners[cell]];
      data[(layer * area + cell) * 2] = seed ? Math.round((seed.cosine * 0.5 + 0.5) * 255) : 255;
      data[(layer * area + cell) * 2 + 1] = seed ? Math.round((seed.sine * 0.5 + 0.5) * 255) : 128;
    }
  }
  return { columns, rows, layers, layerLevels, data };
}

export function createTopographicSurface(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initial: TopographicConfig,
  surfaceFactory?: TopographicSurfaceFactory,
) {
  const threeDimensional = !!surfaceFactory;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    // The compositor retains a paused 3D canvas without an extra preserved
    // drawing buffer. Keep the flat renderer's existing readback behavior.
    preserveDrawingBuffer: !threeDimensional,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  let config = initial,
    width = 0,
    height = 0,
    ratio = 1,
    time = 0,
    elapsedSeconds = 0,
    last = 0,
    frame = 0;
  let visible = true,
    destroyed = false,
    lost = false;
  let curves: Contour[] = [];
  let spanX = 1,
    spanY = 1,
    margin = 0;
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null;
  let heightTexture: WebGLTexture | null = null,
    cutTexture: WebGLTexture | null = null;
  let grainCache: ReturnType<typeof createTopographicGrain> | null = null;
  let terraces: ReturnType<TopographicSurfaceFactory> | null = null;
  let terrainFrame: TopographicSurfaceFrame | null = null;
  let gridColumns = 1,
    gridRows = 1;
  let heightRevision = 0;
  // CPU copy of the height modes (3D only), to place the pointer on the terrain.
  let heightData: Float32Array | null = null,
    frameCosine = 0,
    frameSine = 0;
  const altitudeAt = (x: number, y: number) => {
    if (!heightData || gridColumns < 2 || gridRows < 2) return 0;
    const gx = Math.min(
        gridColumns - 1,
        Math.max(0, ((x + width / 2 + margin) / spanX) * (gridColumns - 1)),
      ),
      gy = Math.min(
        gridRows - 1,
        Math.max(0, ((height / 2 - y + margin) / spanY) * (gridRows - 1)),
      ),
      x0 = Math.min(gridColumns - 2, Math.floor(gx)),
      y0 = Math.min(gridRows - 2, Math.floor(gy)),
      fx = gx - x0,
      fy = gy - y0;
    const at = (column: number, row: number) => {
      const index = (row * gridColumns + column) * 4;
      return (
        heightData![index] +
        heightData![index + 1] * frameCosine +
        heightData![index + 2] * frameSine
      );
    };
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx,
      bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
  let shaders: WebGLShader[] = [];
  let locations: Record<string, WebGLUniformLocation | null> = {};
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  // Pointer hover: the hill eases toward the pointer and
  // fades in and out, independent of the flow's own clock and pause state.
  let pointerX = 0,
    pointerY = 0,
    targetX = 0,
    targetY = 0,
    presence = 0,
    velocityX = 0,
    velocityY = 0,
    presenceVelocity = 0,
    inside = false,
    hoverLast = 0,
    hoverTime = 0;
  const stamps = new Float32Array(4);
  const fadeSeconds = () => finite(config.hoverFade ?? 0.8, 0.05, 5, 0.8);
  /** Packs the eased pointer; returns 1 while it is present, else 0. */
  const packStamps = () => {
    if (hoverAmount() === 0 || presence <= 0.003) return 0;
    stamps[0] = pointerX;
    stamps[1] = pointerY;
    stamps[2] = presence;
    stamps[3] = 0;
    return 1;
  };
  // Push strength: positive pushes the terrain away, negative pulls it in.
  // Under 1 so the warp can never fold the terrain over itself.
  const hoverAmount = () => finite(config.hover ?? 0, -1.5, 0.9, 0);
  const hoverRadius = () => finite(config.hoverRadius ?? 200, 20, 1200, 200);
  const hoverEffects = ['spread', 'swirl', 'ripple', 'rings', 'drag'] as const;
  const hoverEffect = () =>
    hoverEffects.includes(config.hoverEffect as (typeof hoverEffects)[number])
      ? (config.hoverEffect as (typeof hoverEffects)[number])
      : 'rings';
  const following = () =>
    hoverAmount() !== 0 &&
    !destroyed &&
    !lost &&
    visible &&
    !document.hidden &&
    width > 0 &&
    height > 0 &&
    !media.matches &&
    (Math.abs(presence - (inside ? 1 : 0)) + Math.abs(presenceVelocity) > 0.002 ||
      Math.abs(targetX - pointerX) + Math.abs(targetY - pointerY) > 0.2 ||
      Math.abs(velocityX) + Math.abs(velocityY) > 2 ||
      // Ripples keep travelling while the pointer is present.
      (!threeDimensional && hoverEffect() === 'ripple' && presence > 0.003));
  // Exact critically damped spring step: eases in and out without overshoot
  // and stays stable at any frame rate. Returns [position, velocity].
  const spring = (
    position: number,
    velocity: number,
    target: number,
    time: number,
    delta: number,
  ) => {
    const omega = 2 / time,
      offset = position - target,
      decay = Math.exp(-omega * delta),
      carried = (velocity + omega * offset) * delta;
    return [target + (offset + carried) * decay, (velocity - omega * carried) * decay] as const;
  };
  const follow = (now: number) => {
    const delta = hoverLast ? Math.min(0.1, Math.max(0, (now - hoverLast) / 1000)) : 0;
    hoverLast = now;
    if (!delta) return;
    hoverTime += delta;
    const glide = finite(config.hoverFollow ?? 0.16, 0.01, 2, 0.16),
      // Fade is the exit only: the time to settle back to the untouched
      // terrain after leaving (the spring is ~96% there after 2.5 time
      // constants). Entering builds the effect at the follow pace.
      fade = fadeSeconds() / 2.5;
    [pointerX, velocityX] = spring(pointerX, velocityX, targetX, glide, delta);
    [pointerY, velocityY] = spring(pointerY, velocityY, targetY, glide, delta);
    [presence, presenceVelocity] = spring(
      presence,
      presenceVelocity,
      inside ? 1 : 0,
      inside ? glide : fade,
      delta,
    );
    presence = Math.min(1, Math.max(0, presence));
  };
  // Literal palette values cannot change with theme/inherited CSS. Reuse them
  // across terrain camera/material edits; dynamic CSS colors still resolve.
  const literalColor = (value: string | undefined) =>
    typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
  const fixedPalette = (value: TopographicConfig) =>
    [
      value.lineColor,
      value.accentColor,
      value.surfaceColor ?? '#f4f3f0',
      value.backgroundColor,
      value.shadowColor ?? '#000000',
    ]
      .concat(value.gradientColors ?? [])
      .every(literalColor);
  const color = (value: string, fallback: string) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.hidden = true;
    host.append(probe);
    const css = probe.style.color ? getComputedStyle(probe).color : fallback;
    probe.remove();
    const pixel = document.createElement('canvas');
    pixel.width = pixel.height = 1;
    const context = pixel.getContext('2d');
    if (context) {
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), (v) => v / 255);
    }
    return [0, 0, 0];
  };
  let line = color(config.lineColor, '#000000'),
    accent = color(config.accentColor, '#000000');
  let shadow = config.shadowColor === undefined ? null : color(config.shadowColor, '#000000');
  let surfaceColor = color(config.surfaceColor ?? '#f4f3f0', '#f4f3f0'),
    background = color(config.backgroundColor ?? getComputedStyle(host).backgroundColor, '#ffffff');
  const resolveGradient = () => {
    const colors = config.gradientColors?.slice(0, 8) ?? [];
    const data = new Float32Array(24);
    colors.forEach((value, index) => data.set(color(value, '#000000'), index * 3));
    return { count: colors.length >= 2 ? colors.length : 0, data };
  };
  let gradientColors = resolveGradient();
  const unchangedGradient = (next: TopographicConfig, previous: TopographicConfig) => {
    const colors = next.gradientColors ?? [],
      before = previous.gradientColors ?? [],
      count = Math.min(8, colors.length);
    if (count !== Math.min(8, before.length)) return false;
    for (let index = 0; index < count; index++)
      if (!literalColor(colors[index]) || colors[index] !== before[index]) return false;
    return true;
  };
  const release = () => {
    terraces?.destroy();
    terraces = null;
    grainCache?.destroy();
    grainCache = null;
    for (const shader of shaders) gl.deleteShader(shader);
    shaders = [];
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(heightTexture);
    gl.deleteTexture(cutTexture);
  };
  const initialize = () => {
    buffer = gl.createBuffer();
    heightTexture = gl.createTexture();
    if (!buffer || !heightTexture) throw new Error('Topographic surface resources unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // Terrain has its own program and no contour cut atlas. Only the shared
    // height texture and grain fullscreen buffer are needed in this path.
    if (!threeDimensional) {
      program = gl.createProgram();
      cutTexture = gl.createTexture();
      if (!program || !cutTexture) throw new Error('Topographic surface resources unavailable');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Topographic shader unavailable');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? 'Topographic shader compilation failed');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'Topographic program linking failed');
      gl.useProgram(program);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      locations = {};
      for (const name of [
        'uHeight',
        'uGrain',
        'uCanvasSize',
        'uGrainAmount',
        'uCuts',
        'uGrid',
        'uExtent',
        'uMargin',
        'uRatio',
        'uCosine',
        'uSine',
        'uDensity',
        'uWidth',
        'uOpacity',
        'uDashLength',
        'uDashGap',
        'uStyle',
        'uLevelOffset',
        'uLayers[0]',
        'uLineColor',
        'uAccentColor',
        'uGradientEnabled',
        'uGradientStops',
        'uGradientDiffusion',
        'uGradientColors[0]',
        'uStamps[0]',
        'uStampCount',
        'uPointerRadius',
        'uPointerLift',
        'uHoverTime',
        'uHoverEffect',
        'uPointerDrag',
      ])
        locations[name] = gl.getUniformLocation(program, name);
      gl.uniform1i(locations.uHeight, 0);
      gl.uniform1i(locations.uGrain, 2);
      gl.uniform1i(locations.uCuts, 1);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    grainCache = createTopographicGrain(gl, vertex, buffer);
  };
  const cuts = () => {
    if (threeDimensional) return;
    const atlas = createCutAtlas(
      curves,
      spanX,
      spanY,
      finite(config.dashLength, 1, 50, 7) + finite(config.dashGap, 1, 50, 8),
      config.lineStyle,
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, cutTexture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RG8,
      atlas.columns,
      atlas.rows,
      atlas.layers,
      0,
      gl.RG,
      gl.UNSIGNED_BYTE,
      atlas.data,
    );
    const levels = new Int32Array(41).fill(-1),
      offset = Math.ceil(finite(config.density, 2, 20, 5));
    atlas.layerLevels.forEach((level, layer) => {
      levels[level + offset] = layer;
    });
    gl.uniform1iv(locations['uLayers[0]'], levels);
    gl.uniform1i(locations.uLevelOffset, offset);
  };
  const rebuild = () => {
    if (!threeDimensional) gl.useProgram(program);
    const scale = finite(config.scale, 80, 1200, 480),
      density = finite(config.density, 2, 20, 5),
      distortion = finite(config.distortion, 0, 3, 2.4);
    // Bound actual visible camera rays across all supported camera settings.
    // The seeded unit-gradient field, morph modes and terrace quantization
    // keep |height| below 2, so maximum relief can move either way by 480 px.
    // Using a fixed bound also avoids camera edits resampling the height cache.
    if (threeDimensional) {
      const diagonal = Math.hypot(width, height),
        distance = diagonal * 4 + 240 * 4,
        cosine = 0.5,
        sine = Math.sqrt(3) / 2,
        screenX = width / (2 * 0.6),
        screenY = height / (2 * 0.6),
        relief = 240 * 2,
        denominator = cosine * distance - screenY * sine,
        forward =
          (screenY * distance + relief * (sine * distance + screenY * cosine)) / denominator,
        side = (screenX * (cosine * distance + relief)) / denominator,
        // Arbitrary camera rotation fits within this circular ground footprint.
        cameraMargin = Math.hypot(side, forward) - Math.min(width, height) * 0.5 + 32;
      margin = Math.max(scale * 0.45, diagonal * 2.5, cameraMargin);
    } else margin = scale * 0.45;
    spanX = width + 2 * margin;
    spanY = height + 2 * margin;
    const cell = Math.max(
      4,
      Math.sqrt((spanX * spanY) / (threeDimensional ? 100000 : 60000)),
      Math.max(spanX, spanY) / 510,
    );
    const columns = Math.ceil(spanX / cell) + 3,
      rows = Math.ceil(spanY / cell) + 3;
    gridColumns = columns;
    gridRows = rows;
    if (terrainFrame) {
      terrainFrame.grid = [columns, rows];
      terrainFrame.extent = [spanX, spanY];
      terrainFrame.margin = margin;
    }
    const field = threeDimensional ? null : new Float32Array(columns * rows),
      data = new Float32Array(columns * rows * 4),
      sample = createElevationField(config.seed);
    const seed = ((((Math.round(config.seed) * 0.61803398875) % 1) + 1) % 1) * Math.PI * 2;
    const amount = 0.13 + 0.02 * distortion;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const px = ((x / (columns - 1)) * spanX - margin) / scale,
          py = ((y / (rows - 1)) * spanY - margin) / scale,
          index = y * columns + x;
        const altitude = sample(px, py, 0, distortion);
        if (field) field[index] = altitude;
        data[index * 4] = altitude;
        // Stationary scalar height modes. The texture coordinates never move:
        // altitude changes locally, including summit and saddle heights.
        data[index * 4 + 1] =
          amount * 0.8 * Math.sin(0.85 * px - 0.4 * py + seed) * Math.cos(0.7 * py + seed * 0.6);
        data[index * 4 + 2] =
          amount *
          1.15 *
          Math.cos(0.65 * px + 0.8 * py + seed * 0.8) *
          Math.sin(0.9 * py - 0.35 * px + seed + 1.1);
        data[index * 4 + 3] = 1;
      }
    curves = field ? traceContours(field, columns, rows, spanX, spanY, density) : [];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTexture);
    const filter = threeDimensional ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Explicit 3D texel reads need no float-linear extension or half-float rounding.
    const internal =
      threeDimensional || gl.getExtension('OES_texture_float_linear') ? gl.RGBA32F : gl.RGBA16F;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, columns, rows, 0, gl.RGBA, gl.FLOAT, data);
    heightData = threeDimensional ? data : null;
    heightRevision++;
    if (!threeDimensional) {
      gl.uniform2f(locations.uGrid, columns, rows);
      gl.uniform2f(locations.uExtent, spanX, spanY);
      gl.uniform1f(locations.uMargin, margin);
      cuts();
    }
  };
  const draw = () => {
    if (!width || !height || destroyed || lost) return;
    const grain = finite(config.grain ?? 0, 0, 1, 0);
    // The presentation backing can be smaller than the original DPR. Retain
    // the original photographic grain samples and their CSS-pixel footprint.
    grainCache?.prepare(
      threeDimensional ? Math.max(1, Math.round(width * ratio)) : canvas.width,
      threeDimensional ? Math.max(1, Math.round(height * ratio)) : canvas.height,
      ratio,
      config.seed,
      grain > 0,
    );
    const pace = (0.18 + 0.27 * Math.log2(1 + Math.max(width, height) / 320)) / 0.63,
      phase = time * pace * 0.1;
    if (surfaceFactory) {
      terraces ??= surfaceFactory(gl);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, heightTexture);
      terrainFrame ??= {
        width,
        height,
        ratio,
        cosine: 0,
        sine: 0,
        elapsedSeconds: 0,
        heightTexture,
        heightRevision,
        grid: [gridColumns, gridRows],
        extent: [spanX, spanY],
        margin,
        config,
        line,
        accent,
        surface: surfaceColor,
        shadow,
        background,
        gradient: gradientColors,
        pointerLift: 0,
        pointerStamps: stamps,
        pointerStampCount: 0,
        pointerRadius: 200,
        altitudeAt,
      };
      // Reuse the private synchronous draw descriptor during animation.
      // Height-cache dimensions only change when rebuild updates the tuples.
      terrainFrame.width = width;
      terrainFrame.height = height;
      terrainFrame.ratio = ratio;
      terrainFrame.cosine = frameCosine = Math.cos(phase) - 1;
      terrainFrame.sine = frameSine = Math.sin(phase);
      terrainFrame.elapsedSeconds = elapsedSeconds;
      terrainFrame.heightTexture = heightTexture;
      terrainFrame.heightRevision = heightRevision;
      terrainFrame.config = config;
      terrainFrame.line = line;
      terrainFrame.accent = accent;
      terrainFrame.surface = surfaceColor;
      terrainFrame.shadow = shadow;
      terrainFrame.background = background;
      terrainFrame.gradient = gradientColors;
      terrainFrame.pointerLift = hoverAmount();
      terrainFrame.pointerStampCount = packStamps();
      terrainFrame.pointerRadius = hoverRadius();
      terraces.draw(terrainFrame);
      return;
    }
    gl.useProgram(program);
    gl.uniform2f(locations.uCanvasSize, canvas.width, canvas.height);
    gl.uniform1f(locations.uGrainAmount, grain);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(locations.uCosine, Math.cos(phase) - 1);
    gl.uniform1f(locations.uSine, Math.sin(phase));
    gl.uniform1f(locations.uRatio, ratio);
    gl.uniform1f(locations.uDensity, finite(config.density, 2, 20, 5));
    gl.uniform1f(locations.uWidth, finite(config.lineWidth, 0.25, 5, 1));
    gl.uniform1f(locations.uOpacity, finite(config.opacity, 0, 1, 1));
    gl.uniform1f(locations.uDashLength, finite(config.dashLength, 1, 50, 7));
    gl.uniform1f(locations.uDashGap, finite(config.dashGap, 1, 50, 8));
    const stampCount = packStamps();
    gl.uniform1i(locations.uStampCount, stampCount);
    if (stampCount) {
      gl.uniform4fv(locations['uStamps[0]'], stamps, 0, stampCount * 4);
      gl.uniform1f(locations.uPointerRadius, hoverRadius());
      gl.uniform1f(locations.uPointerLift, hoverAmount());
      gl.uniform1i(locations.uHoverEffect, hoverEffects.indexOf(hoverEffect()));
      gl.uniform1f(locations.uHoverTime, hoverTime);
      // Drag offset from the eased pointer velocity, capped below the
      // fold limit (about 1.16 radii for a Gaussian).
      const radius = hoverRadius(),
        dragX = velocityX * hoverAmount() * 0.12,
        dragY = velocityY * hoverAmount() * 0.12,
        dragScale = Math.min(1, (radius * 0.8) / Math.max(1e-6, Math.hypot(dragX, dragY)));
      gl.uniform2f(locations.uPointerDrag, dragX * dragScale, dragY * dragScale);
    }
    gl.uniform1i(
      locations.uStyle,
      config.lineStyle === 'dashed' ? 2 : config.lineStyle === 'mixed' ? 1 : 0,
    );
    gl.uniform3fv(locations.uLineColor, line);
    gl.uniform3fv(locations.uAccentColor, accent);
    gl.uniform1i(locations.uGradientEnabled, gradientColors.count >= 2 ? 1 : 0);
    gl.uniform1i(locations.uGradientStops, gradientColors.count);
    gl.uniform1f(locations.uGradientDiffusion, finite(config.gradientDiffusion ?? 0, 0, 1, 0));
    if (gradientColors.count >= 2)
      gl.uniform3fv(locations['uGradientColors[0]'], gradientColors.data);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const animate = () =>
    !destroyed &&
    !lost &&
    visible &&
    !document.hidden &&
    !media.matches &&
    !config.paused &&
    config.speed > 0 &&
    width > 0 &&
    height > 0;
  const tick = (now: number) => {
    frame = 0;
    const playing = animate(),
      hovering = following();
    if (!playing && !hovering) {
      last = 0;
      hoverLast = 0;
      return;
    }
    if (playing) {
      if (last) {
        const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
        time += delta * finite(config.speed, 0, 4, 1.5);
        elapsedSeconds += delta;
      }
      last = now;
    } else last = 0;
    if (hovering) follow(now);
    else hoverLast = 0;
    draw();
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (animate() || following()) {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      hoverLast = 0;
    }
  };
  const onPointer = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    targetX = event.clientX - box.left;
    targetY = event.clientY - box.top;
    // Entering after the hill has faded starts it at the pointer, not
    // sweeping in from where the pointer last left.
    if (!inside && presence < 0.05) {
      pointerX = targetX;
      pointerY = targetY;
      velocityX = velocityY = 0;
    }
    inside = true;
    if (media.matches) {
      pointerX = targetX;
      pointerY = targetY;
      velocityX = velocityY = 0;
      presence = 1;
      presenceVelocity = 0;
      if (!lost) draw();
    }
    sync();
  };
  const onLeave = () => {
    inside = false;
    if (media.matches) {
      presence = 0;
      presenceVelocity = 0;
      if (!lost) draw();
    }
    sync();
  };
  const resize = () => {
    const changed = width !== host.clientWidth || height !== host.clientHeight,
      previousRatio = ratio;
    width = host.clientWidth;
    height = host.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 2);
    let pixelsWide = Math.max(1, Math.round(width * ratio)),
      pixelsHigh = Math.max(1, Math.round(height * ratio));
    if (surfaceFactory && width && height) {
      if (lost) {
        sync();
        return;
      }
      terraces ??= surfaceFactory(gl);
      const presentation = terraces.presentationSize?.(width, height, ratio);
      if (presentation) [pixelsWide, pixelsHigh] = presentation;
    }
    if (
      threeDimensional &&
      !changed &&
      ratio === previousRatio &&
      canvas.width === pixelsWide &&
      canvas.height === pixelsHigh &&
      gridColumns > 1
    ) {
      sync();
      return;
    }
    if (!threeDimensional || canvas.width !== pixelsWide) canvas.width = pixelsWide;
    if (!threeDimensional || canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
    if (width && height && !lost) {
      if (changed || gridColumns <= 1) rebuild();
      draw();
    }
    sync();
  };
  const onMotion = () => {
    draw();
    sync();
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    terraces?.destroy();
    terraces = null;
    sync();
  };
  const onRestored = () => {
    lost = false;
    initialize();
    if (threeDimensional) {
      // A restored context needs its native backing and a new field even
      // when host dimensions and DPR equal their values before the loss.
      gridColumns = 1;
      resize();
    } else {
      rebuild();
      draw();
      sync();
    }
  };
  try {
    initialize();
  } catch (error) {
    release();
    throw error;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
  intersection?.observe(host);
  media.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  host.addEventListener('pointermove', onPointer);
  host.addEventListener('pointerdown', onPointer);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointercancel', onLeave);
  resize();
  return {
    update(next: TopographicConfig) {
      if (threeDimensional && next === config && fixedPalette(next)) return;
      const previous = config;
      const geometry =
        next.seed !== config.seed ||
        next.scale !== config.scale ||
        (next.density !== config.density && !surfaceFactory) ||
        next.distortion !== config.distortion;
      const pattern =
        next.lineStyle !== config.lineStyle ||
        next.dashLength !== config.dashLength ||
        next.dashGap !== config.dashGap;
      config = next;
      if (
        !threeDimensional ||
        config.lineColor !== previous.lineColor ||
        !literalColor(config.lineColor)
      )
        line = color(config.lineColor, '#000000');
      if (
        !threeDimensional ||
        config.accentColor !== previous.accentColor ||
        !literalColor(config.accentColor)
      )
        accent = color(config.accentColor, '#000000');
      if (
        !threeDimensional ||
        config.surfaceColor !== previous.surfaceColor ||
        !literalColor(config.surfaceColor ?? '#f4f3f0')
      )
        surfaceColor = color(config.surfaceColor ?? '#f4f3f0', '#f4f3f0');
      if (
        config.shadowColor !== previous.shadowColor ||
        (config.shadowColor !== undefined && !literalColor(config.shadowColor))
      )
        shadow = config.shadowColor === undefined ? null : color(config.shadowColor, '#000000');
      if (
        !threeDimensional ||
        config.backgroundColor !== previous.backgroundColor ||
        !literalColor(config.backgroundColor)
      )
        background = color(
          config.backgroundColor ?? getComputedStyle(host).backgroundColor,
          '#ffffff',
        );
      if (!threeDimensional || !unchangedGradient(config, previous))
        gradientColors = resolveGradient();
      if (!lost) {
        if (!threeDimensional) gl.useProgram(program);
        if (geometry) rebuild();
        else if (pattern) cuts();
        draw();
      }
      sync();
    },
    reset() {
      time = 0;
      elapsedSeconds = 0;
      last = 0;
      draw();
      sync();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection?.disconnect();
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      host.removeEventListener('pointermove', onPointer);
      host.removeEventListener('pointerdown', onPointer);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointercancel', onLeave);
      release();
      curves = [];
      canvas.width = canvas.height = 1;
    },
  };
}
