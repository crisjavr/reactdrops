import { MAX_SPANS_PER_ROW } from './glass-slab-logo-slices';
import { soapBubbleFilmMax } from '../soap-bubble/soap-bubble-film';

/** Height buckets in the row lookup table (it holds one more entry). */
export const ROW_BUCKETS = 256;
export const SLAB_TINT_TEXEL = 5;
export const SLAB_HEADER_TEXELS = SLAB_TINT_TEXEL + 1;

export const VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
void main() { gl_Position = vec4(corners[gl_VertexID], 0., 1.); }`;

/**
 * Ray traces a stack of glass discs. Every disc is a flat slab with polished,
 * fully rounded edges: the set of points within half its thickness of a flat
 * ellipse. The camera sits below the stack, so it sees the underside of each
 * disc and the near edge on top of it. Light from the backdrop is refracted
 * (Snell), split at every surface (Fresnel), trapped by total internal
 * reflection and absorbed along its path inside the glass (Beer-Lambert). A
 * tilt-shift thin lens gives the camera a real depth of field.
 *
 * Slab texture, one row per slab row, sorted bottom to top:
 *   texel 0: (height, disc count, half thickness, largest half depth)
 *   texel 1: (absorption per unit length rgb, inlay coordinate per unit x)
 *   texel 2: (lit face rgb, top haze weight)
 *   texel 3: (front rim rgb, reflection weight)
 *   texel 4: (logo x per world x over the logo width, logo y per world z,
 *             shrink of logo x per world z): where the resting camera sees
 *             a point of the disc in the logo, for the cut-out logo
 *   texel 5: (unlit palette tint rgb, unused)
 *   texel 6+j: (center x, half width, half depth, full width / current width)
 */
/**
 * Settings that switch whole code paths. Each combination compiles to its own
 * program with the unused paths removed, which keeps the tracer's register
 * use (and so its GPU occupancy) down to what the current look needs.
 */
export type GlassSlabShaderVariant = {
  hasMedia: boolean;
  oilMode: 0 | 1 | 2;
  clearGlass: boolean;
  calibratedApple: boolean;
  transparent: boolean;
  reflective: boolean;
  lens: boolean;
  /** The logo is cut out of each disc (uInlay): plates with gaps. */
  inlay: boolean;
  /** The accumulation target is 8-bit, so samples are averaged in sRGB. */
  encode: boolean;
};

export const shaderVariantKey = (v: GlassSlabShaderVariant) =>
  [
    v.hasMedia,
    v.oilMode,
    v.clearGlass,
    v.calibratedApple,
    v.transparent,
    v.reflective,
    v.lens,
    v.encode,
    v.inlay,
  ]
    .map(Number)
    .join('');

export const fragmentShader = (v: GlassSlabShaderVariant) => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define uHasMedia ${v.hasMedia}
${
  // The thin-film table amplifies the last bits of the film thickness, so the
  // oil finishes keep their runtime switch and the exact numerics it gives.
  v.oilMode === 0 ? '#define uOilMode 0' : 'uniform int uOilMode;'
}
#define uClearGlass ${v.clearGlass}
#define uCalibratedApple ${v.calibratedApple}
#define uTransparent ${v.transparent}
#define uEncode ${v.encode}
#define HAS_REFLECTIVITY ${v.reflective}
#define HAS_LENS ${v.lens}
#define HAS_INLAY ${v.inlay ? 1 : 0}

uniform sampler2D uSlabs;
uniform sampler2D uRowLookup;
#if HAS_INLAY
// The logo cut out of each disc: per slab row, lines from its front edge to
// its back edge across the logo width, holding the glass density (1 the main
// color), the signed distance to the glass's edge in logo heights and the
// direction away from the glass.
uniform sampler2D uInlay;
// Half the local thickness of the glass (logo heights), on the same grid.
uniform sampler2D uPlateWidth;
// Lines per row, logo width, unused, and the logo heights each row's lines
// span around the row's cut.
uniform vec4 uPlate;
#endif
uniform sampler2D uMedia;
uniform vec4 uMediaRect;
uniform vec4 uMediaTint;
uniform vec3 uMediaGround;
uniform float uColorOpacity;
uniform sampler2D uOilTable;
uniform float uOilTintAlpha;
uniform vec2 uRowRange;
uniform int uRows;
uniform float uSlack;
uniform float uRadiusMax;
uniform float uDepthMax;
uniform vec3 uCamera;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uCanvas;
uniform vec3 uView;
uniform float uIor;
uniform float uReflectivity;
uniform vec3 uBackground;
uniform vec3 uLight;
uniform vec3 uAmbient;
uniform mat3 uPicture;
uniform vec3 uBackdrop;
uniform float uFloorY;
uniform int uSamples;
uniform int uSampleOffset;
uniform bool uMotionSampling;
uniform float uAperture;
uniform vec2 uFocus;
out vec4 fragColor;

const int MAX_SPANS = ${MAX_SPANS_PER_ROW};
const int MAX_ROWS_PER_RAY = 24;
const int MAX_EVENTS = 4;
// Glass surfaces followed along the mirror image of the first surface. The
// tinted opaque looks only show the first one: a second changes no pixel by
// more than one level, while reflective, clear and transparent looks need it.
const int MIRROR_EVENTS = ${v.reflective || v.clearGlass || v.transparent ? 2 : 1};
// Cut-out plates stop after two bounces inside an edge: light trapped
// longer changes no pixel by more than three levels.
const int MAX_INTERNAL = ${v.inlay ? 2 : 8};

float gEllipse(vec2 p, vec2 ab) { vec2 q = p / ab; return dot(q, q) - 1.; }

// The intersection searches only need the sign of the rounded slab's
// distance. Compare squared lengths and multiply by the squared gradient
// to avoid taking a square root or dividing on each bisection step.
float slabField(vec3 p, vec2 ab, float r) {
  float g = gEllipse(p.xz, ab);
  float height = p.y * p.y - r * r;
  if (g <= 0.) return height;
  vec2 grad = 2. * p.xz / (ab * ab);
  return g * g + height * max(dot(grad, grad), 1e-18);
}

vec3 nSlab(vec3 p, vec2 ab, float r) {
  float g = gEllipse(p.xz, ab);
  if (g <= 0.) return vec3(0., p.y >= 0. ? 1. : -1., 0.);
  vec2 grad = 2. * p.xz / (ab * ab);
  float l = length(grad);
  vec2 n = l > 1e-9 ? grad / l : vec2(0., 1.);
  float e = g / max(l, 1e-9);
  return normalize(vec3(e * n.x, p.y, e * n.y));
}

// Ray against an infinite elliptic cylinder around y: entry and exit distances.
vec2 hitEllipse(vec3 o, vec3 d, vec2 ab) {
  vec2 oq = o.xz / ab, dq = d.xz / ab;
  float A = dot(dq, dq), B = dot(oq, dq), C = dot(oq, oq) - 1.;
  if (A < 1e-14) return C <= 0. ? vec2(-1e9, 1e9) : vec2(1e9, -1e9);
  float h = B * B - A * C;
  if (h < 0.) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2((-B - h) / A, (-B + h) / A);
}

float fresnel(float cosi, float eta) {
  cosi = clamp(cosi, 0., 1.);
  float sint2 = eta * eta * (1. - cosi * cosi);
  if (sint2 >= 1.) return 1.;
  float cost = sqrt(1. - sint2);
  float rs = (eta * cosi - cost) / (eta * cosi + cost);
  float rp = (cosi - eta * cost) / (cosi + eta * cost);
  return .5 * (rs * rs + rp * rp);
}

// Distance to where a ray from outside enters the slab, or -1.
float slabEnter(vec3 o, vec3 d, vec2 ab, float r) {
  float s0, s1;
  if (abs(d.y) < 1e-8) {
    if (abs(o.y) >= r) return -1.;
    s0 = 0.; s1 = 1e9;
  } else {
    float sa = (-r - o.y) / d.y, sb = (r - o.y) / d.y;
    s0 = min(sa, sb); s1 = max(sa, sb);
  }
  if (s1 <= 1e-6) return -1.;
  if (s0 > 1e-6 && gEllipse((o + d * s0).xz, ab) <= 0.) return s0;
  vec2 outer = hitEllipse(o, d, ab + r);
  float lo = max(max(s0, outer.x), 1e-6), hi = min(s1, outer.y);
  if (hi <= lo) return -1.;
  vec2 inner = hitEllipse(o, d, ab);
  if (inner.x > lo && inner.x < hi) hi = inner.x;
  else {
    // The ray can graze the rounded edge without reaching the flat part.
    float found = -1.;
    for (int i = 1; i <= 4; i++) {
      float s = mix(lo, hi, float(i) / 4.);
      if (slabField(o + d * s, ab, r) <= 0.) { found = s; break; }
    }
    if (found < 0.) return -1.;
    hi = found;
  }
  if (slabField(o + d * lo, ab, r) <= 0.) return lo;
  for (int i = 0; i < 8; i++) {
    float m = .5 * (lo + hi);
    if (slabField(o + d * m, ab, r) > 0.) lo = m; else hi = m;
  }
  return hi;
}

// Moves q (inside the slab) to the surface where the ray next meets air.
// Reflections between the two flat faces are folded analytically.
float slabExit(inout vec3 q, inout vec3 di, vec2 ab, float r, float cosCrit, out vec3 n) {
  float travelled = 0.;
  for (int pass = 0; pass < 4; pass++) {
    float sFace = abs(di.y) > 1e-8 ? ((di.y > 0. ? r : -r) - q.y) / di.y : 1e9;
    bool inside = gEllipse(q.xz, ab) <= 0.;
    // The ellipse is convex. A ray with both endpoints inside it can reach
    // the opposite face without intersecting the rounded rim.
    if (inside && abs(di.y) >= cosCrit && gEllipse((q + di * sFace).xz, ab) < -1e-5) {
      q += di * sFace;
      n = vec3(0., di.y > 0. ? 1. : -1., 0.);
      return travelled + sFace;
    }
    vec2 inner = hitEllipse(q, di, ab);
    if (inside) {
      float sOut = max(inner.y, 0.);
      if (sFace <= sOut) {
        if (abs(di.y) >= cosCrit) {
          q += di * sFace;
          travelled += sFace;
          n = vec3(0., di.y > 0. ? 1. : -1., 0.);
          return travelled;
        }
        float u = (q.y + r) + sOut * di.y;
        float m = mod(u, 4. * r);
        q = vec3(q.x + di.x * sOut, (m <= 2. * r ? m : 4. * r - m) - r, q.z + di.z * sOut);
        if (m > 2. * r) di.y = -di.y;
      } else {
        q += di * sOut;
      }
      travelled += sOut;
      q.xz += di.xz * 1e-6;
      travelled += 1e-6;
      continue;
    }
    vec2 outer = hitEllipse(q, di, ab + r);
    float hiT = max(min(sFace, outer.y), 1e-6);
    float sIn = inner.x > 1e-7 ? inner.x : 1e9;
    float lim = min(sIn, hiT);
    float lo = 0., hi = -1.;
    for (int i = 1; i <= 4; i++) {
      float s = lim * float(i) / 4.;
      if (slabField(q + di * s, ab, r) >= 0.) { hi = s; break; }
      lo = s;
    }
    if (hi > 0.) {
      for (int i = 0; i < 8; i++) {
        float m = .5 * (lo + hi);
        if (slabField(q + di * m, ab, r) >= 0.) hi = m; else lo = m;
      }
      q += di * hi;
      n = nSlab(q, ab, r);
      return travelled + hi;
    }
    if (sIn < hiT) {
      q += di * (sIn + 1e-6);
      travelled += sIn + 1e-6;
      continue;
    }
    q += di * hiT;
    n = nSlab(q, ab, r);
    return travelled + hiT;
  }
  n = nSlab(q, ab, r);
  return travelled;
}

#if HAS_INLAY
// A disc with the logo cut out of it: the points within half its thickness
// of the flat region where both its ellipse and the logo's glass are.
// perUnit, kY and kX project a point of the plate to the logo as the resting
// camera sees it, so the glass is cut exactly where the logo is from there.
struct Plate { int row; float centerX; float stretch; float perUnit; float kY; float kX; };

// Glass density, signed distance (logo heights) and the direction away from
// the glass at a point of the plate, in coordinates relative to its center
// (x across, y front to back).
vec2 plateUV(Plate p, vec2 q) {
  float x = p.centerX + q.x * p.stretch;
  float z = q.y * p.stretch;
  float u = x * p.perUnit * (1. - z * p.kX) + .5;
  float line = clamp((z * p.kY / uPlate.w + .5) * uPlate.x, .5, uPlate.x - .5);
  return vec2(u, (float(p.row) * uPlate.x + line) / (float(uRows) * uPlate.x));
}

vec4 plateSample(Plate p, vec2 q) {
  // An explicit level: implicit derivatives in these divergent loops would
  // keep helper lanes tracing.
  return textureLod(uInlay, plateUV(p, q), 0.);
}

// World units per logo height, the shorter of the two directions, so a
// distance in the logo never overstates the distance on the plate.
float plateUnit(Plate p) {
  return min(1. / (p.perUnit * uPlate.y), 1. / p.kY) / p.stretch;
}

// The outward direction of the glass's edge in world space.
vec2 plateOutward(Plate p, vec4 sample_) {
  vec2 n = vec2(sample_.z * p.perUnit * uPlate.y, sample_.w * p.kY);
  return dot(n, n) > 1e-12 ? normalize(n) : vec2(0., -1.);
}

// Distance to the edge of the logo's glass in world units, never more than
// the true distance, so it can be marched.
float plateEdge(Plate p, vec2 q) {
  return plateSample(p, q).y * plateUnit(p);
}

// Where a cut meets a disc's front or back edge the two edges blend (smooth
// maximum), so the glass ends in rounded corners instead of slivers and
// points, as a cutter would leave it. The corner radius follows the piece's
// own thickness: broad pieces round generously, thin lines stay intact.
float plateMeet(float ellipse, float cut, float r, Plate p, vec2 q, out float cutWeight) {
  float kMax = 12. * r;
  float apart = abs(ellipse - cut);
  cutWeight = cut > ellipse ? 1. : 0.;
  if (apart >= kMax) return max(ellipse, cut);
  float halfWidth = textureLod(uPlateWidth, plateUV(p, q), 0.).r / (p.perUnit * uPlate.y * p.stretch);
  float k = clamp(1.4 * halfWidth, 4. * r, kMax);
  float h = max(k - apart, 0.) / k;
  cutWeight = mix(.5 * h, 1. - .5 * h, cutWeight);
  return max(ellipse, cut) + .25 * k * h * h;
}

float plateMeet(float ellipse, float cut, float r, Plate p, vec2 q) {
  float cutWeight;
  return plateMeet(ellipse, cut, r, p, q, cutWeight);
}

// Distance from the edge of the flat region: the ellipse, and the glass
// shrunk by the rounding radius.
// Cut edges are polished like the discs' own rims: a full round, half the
// glass thickness wide (the profile width in half-thicknesses). Wider
// roll-offs were tried; they blur thin lines and show the plates behind.
const float PLATE_BEVEL = 1.;
float plateCut(float edge, float r) {
  return (edge + PLATE_BEVEL * r) / PLATE_BEVEL;
}

float flatEdge(vec2 q, vec2 ab, float r, Plate p) {
  vec2 grad = 2. * q / (ab * ab);
  float ellipse = gEllipse(q, ab) / max(length(grad), 1e-9);
  return plateMeet(ellipse, plateCut(plateEdge(p, q), r), r, p, q);
}

float plateField(vec3 p, vec2 ab, float r, Plate pl) {
  float height = p.y * p.y - r * r;
  vec2 grad = 2. * p.xz / (ab * ab);
  float ellipse = gEllipse(p.xz, ab) / max(length(grad), 1e-9);
  // Clear of the ellipse's rounded rim: no need to read the logo.
  if (ellipse > 0. && ellipse * ellipse + height > 0.) return 1.;
  float d = plateMeet(ellipse, plateCut(plateEdge(pl, p.xz), r), r, pl, p.xz);
  return d <= 0. ? height : d * d + height;
}

vec3 plateNormal(vec3 p, vec2 ab, float r, Plate pl, bool roundedJoin) {
  vec2 grad = 2. * p.xz / (ab * ab);
  float ellipse = gEllipse(p.xz, ab) / max(length(grad), 1e-9);
  vec4 sample_ = plateSample(pl, p.xz);
  float cut = plateCut(sample_.y * plateUnit(pl), r);
  float cutWeight;
  float d = plateMeet(ellipse, cut, r, pl, p.xz, cutWeight);
  if (d <= 0.) return vec3(0., p.y >= 0. ? 1. : -1., 0.);
  // Across a polished cut the surface turns over the profile's width.
  vec2 n;
  if (roundedJoin && cutWeight > 0. && cutWeight < 1.) {
    n = mix(normalize(grad), plateOutward(pl, sample_) / PLATE_BEVEL, cutWeight);
  } else {
    n = cut > ellipse ? plateOutward(pl, sample_) / PLATE_BEVEL : normalize(grad);
  }
  return normalize(vec3(d * n.x, p.y, d * n.y));
}

// Distance to where a ray from outside enters the plate, or -1, and the
// logo's sample there. The plate is thin, so a few samples across its
// thickness find the first glass.
float plateEnter(vec3 o, vec3 d, vec2 ab, float r, Plate pl, out vec4 at) {
  float s0, s1;
  if (abs(d.y) < 1e-8) {
    if (abs(o.y) >= r) return -1.;
    s0 = 0.; s1 = 1e9;
  } else {
    float sa = (-r - o.y) / d.y, sb = (r - o.y) / d.y;
    s0 = min(sa, sb); s1 = max(sa, sb);
  }
  if (s1 <= 1e-6) return -1.;
  vec2 outer = hitEllipse(o, d, ab + r);
  float lo = max(max(s0, outer.x), 1e-6), hi = min(s1, outer.y);
  if (hi <= lo) return -1.;
  float scale = plateUnit(pl);
  // Skip the gaps: the distance field is a lower bound, so the ray can move
  // that far across them without meeting glass.
  float speed = max(length(d.xz), 1e-9);
  for (int i = 0; i < 6; i++) {
    at = plateSample(pl, (o + d * lo).xz);
    float gap = at.y * scale;
    if (gap <= .05 * r) break;
    float next = lo + gap / speed;
    if (next >= hi) return -1.;
    // The rounded-face test below needs the sample at lo, even when the
    // march uses all of its steps.
    if (i == 5) break;
    lo = next;
  }
  // Deep in the glass where the ray meets the face: that is the hit.
  vec3 p = o + d * lo;
  vec2 grad = 2. * p.xz / (ab * ab);
  float ellipse = gEllipse(p.xz, ab) / max(length(grad), 1e-9);
  float flat_ = plateMeet(ellipse, plateCut(at.y * scale, r), r, pl, p.xz);
  if ((flat_ <= 0. ? p.y * p.y - r * r : flat_ * flat_ + p.y * p.y - r * r) <= 0.) return lo;
  float found = -1.;
  float start = lo;
  for (int i = 1; i <= 6; i++) {
    float s = mix(start, hi, float(i) / 6.);
    if (plateField(o + d * s, ab, r, pl) <= 0.) { found = s; break; }
    lo = s;
  }
  if (found < 0.) return -1.;
  float hiS = found;
  for (int i = 0; i < 7; i++) {
    float m = .5 * (lo + hiS);
    if (plateField(o + d * m, ab, r, pl) > 0.) lo = m; else hiS = m;
  }
  at = plateSample(pl, (o + d * hiS).xz);
  return hiS;
}

// How far a ray inside the flat region travels before it leaves it at a cut
// edge (the ellipse is the limit). Newton steps toward the edge along its
// direction, then a secant step across it; a ray moving along an edge falls
// back to steps no longer than the distance to it.
float plateLeave(vec3 q, vec3 di, Plate pl, float r, float limit, vec4 first) {
  float speed = max(length(di.xz), 1e-6);
  float scale = plateUnit(pl);
  float s = 0., previousS = 0., previousD = 0.;
  for (int i = 0; i < 6; i++) {
    vec4 here = i == 0 ? first : plateSample(pl, (q + di * s).xz);
    float d = here.y * scale + PLATE_BEVEL * r;
    if (d >= 0.) {
      if (i == 0) return 0.;
      return min(previousS + (s - previousS) * -previousD / max(d - previousD, 1e-12), limit);
    }
    float k = dot(plateOutward(pl, here), di.xz);
    previousS = s;
    previousD = d;
    s += k > .3 * speed ? 1.05 * -d / k : max(-d, .2 * r) / speed;
    if (s >= limit) return limit;
  }
  return min(s, limit);
}

// slabExit for a plate: the same folding between the faces, ending at the
// ellipse or at the first cut edge.
// first is the logo's sample at q when the caller has it (its y > 1e8 when
// not).
float plateExit(inout vec3 q, inout vec3 di, vec2 ab, float r, float cosCrit, Plate pl, vec4 first, out vec3 n) {
  float travelled = 0.;
  float scale = plateUnit(pl);
  for (int pass = 0; pass < 4; pass++) {
    float sFace = abs(di.y) > 1e-8 ? ((di.y > 0. ? r : -r) - q.y) / di.y : 1e9;
    // One sample of the logo here serves the inside test, the search for
    // the next cut edge and the rim.
    vec4 here = pass == 0 && first.y < 1e8 ? first : plateSample(pl, q.xz);
    float edge = here.y * scale;
    float cut = plateCut(edge, r);
    vec2 grad = 2. * q.xz / (ab * ab);
    float ellipse = gEllipse(q.xz, ab) / max(length(grad), 1e-9);
    bool inside = plateMeet(ellipse, cut, r, pl, q.xz) <= 0.;
    vec3 face = q + di * sFace;
    // The glass reaches farther from here than the ray travels to the face:
    // only the ellipse can stop it.
    bool clear = -(edge + PLATE_BEVEL * r) > length(face.xz - q.xz);
    if (inside && abs(di.y) >= cosCrit &&
        (clear ? gEllipse(face.xz, ab) < -1e-5 : flatEdge(face.xz, ab, r, pl) < -1e-5)) {
      q += di * sFace;
      n = vec3(0., di.y > 0. ? 1. : -1., 0.);
      return travelled + sFace;
    }
    vec2 inner = hitEllipse(q, di, ab);
    if (inside) {
      float sOut = plateLeave(q, di, pl, r, max(inner.y, 0.), here);
      if (sFace <= sOut) {
        if (abs(di.y) >= cosCrit) {
          q += di * sFace;
          travelled += sFace;
          n = vec3(0., di.y > 0. ? 1. : -1., 0.);
          return travelled;
        }
        float u = (q.y + r) + sOut * di.y;
        float m = mod(u, 4. * r);
        q = vec3(q.x + di.x * sOut, (m <= 2. * r ? m : 4. * r - m) - r, q.z + di.z * sOut);
        if (m > 2. * r) di.y = -di.y;
      } else {
        q += di * sOut;
      }
      travelled += sOut;
      q.xz += di.xz * 1e-6;
      travelled += 1e-6;
      continue;
    }
    // On the rounded rim. Where a cut edge bounds the glass, the edge is
    // straight within the rounding width, so the polished rim is an
    // elliptic cylinder around it and the exit is a quadratic (in the
    // profile's scale, where it is round).
    if (cut > ellipse) {
      vec2 out2 = plateOutward(pl, here);
      float k = dot(out2, di.xz) / PLATE_BEVEL;
      float A = k * k + di.y * di.y;
      float B = 2. * (cut * k + q.y * di.y);
      float C = cut * cut + q.y * q.y - r * r;
      float sRim = (-B + sqrt(max(B * B - 4. * A * C, 0.))) / (2. * max(A, 1e-12));
      if (k < 0. && -cut / k < sRim) {
        // Back over the flat region before reaching the rim.
        float sBack = -cut / k + 1e-6;
        q += di * sBack;
        travelled += sBack;
        continue;
      }
      sRim = max(sRim, 0.);
      q += di * sRim;
      float f = max(cut + k * sRim, 0.) / PLATE_BEVEL;
      n = normalize(vec3(f * out2.x, q.y, f * out2.y));
      return travelled + sRim;
    }
    vec2 outer = hitEllipse(q, di, ab + r);
    float hiT = max(min(sFace, outer.y), 1e-6);
    float sIn = inner.x > 1e-7 ? inner.x : 1e9;
    float lim = min(sIn, hiT);
    float lo = 0., hi = -1.;
    for (int i = 1; i <= 4; i++) {
      float s = lim * float(i) / 4.;
      if (slabField(q + di * s, ab, r) >= 0.) { hi = s; break; }
      lo = s;
    }
    if (hi > 0.) {
      for (int i = 0; i < 8; i++) {
        float m = .5 * (lo + hi);
        if (slabField(q + di * m, ab, r) >= 0.) hi = m; else lo = m;
      }
      q += di * hi;
      n = nSlab(q, ab, r);
      return travelled + hi;
    }
    if (sIn < hiT) {
      q += di * (sIn + 1e-6);
      travelled += sIn + 1e-6;
      continue;
    }
    q += di * hiT;
    n = nSlab(q, ab, r);
    return travelled + hiT;
  }
  // A grazing ray can finish the exit search where the cut and ellipse
  // overlap. Follow the rounded surface here so the next reflected rim
  // stays connected across the tip.
  n = plateNormal(q, ab, r, pl, uClearGlass);
  return travelled;
}
#endif

// A lit card fills the view behind the sculpture and a dark studio floor
// lies below it; everything else is the surrounding studio. Light reaches the
// camera from whichever of the two a ray meets first. Light refracted far off
// axis (through the edges) misses the card and carries the surroundings.
vec3 environment(vec3 o, vec3 d) {
  if (d.z <= 1e-4) return uAmbient;
  float toCard = (uBackdrop.x - o.z) / d.z;
  if (d.y < 0. && (uFloorY - o.y) / d.y < toCard) return uAmbient;
  vec3 p = o + d * toCard;
  vec3 q = uPicture * (p - uCamera);
  if (q.x <= 1e-6) return uAmbient;
  vec2 at = abs(q.yz / q.x) / uBackdrop.yz;
  return mix(uAmbient, uLight, 1. - smoothstep(.85, 1., max(at.x, at.y)));
}

vec3 mediaSrgbAt(vec2 screen) {
  vec2 uv = (clamp(screen, 0., 1.) - uMediaRect.xy) / uMediaRect.zw;
  vec4 media = textureLod(uMedia, uv, 0.);
  if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) media.a = 0.;
  return mix(mix(uMediaGround, media.rgb, media.a), uMediaTint.rgb, uMediaTint.a);
}

vec3 decodeSrgb(vec3 c) {
  return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c));
}

vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0., 1.);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
}

vec3 mediaAt(vec2 screen) {
  if (uOilMode == 0) return decodeSrgb(mediaSrgbAt(screen));
  // The dock blurs the page under its film by two CSS pixels.
  vec2 stepUv = vec2(2.) / uCanvas;
  vec3 blurred = mediaSrgbAt(screen + stepUv) + mediaSrgbAt(screen - stepUv)
    + mediaSrgbAt(screen + vec2(stepUv.x, -stepUv.y))
    + mediaSrgbAt(screen + vec2(-stepUv.x, stepUv.y));
  return decodeSrgb(blurred * .25);
}

vec3 oilRim(vec2 face, float depth, float cosI) {
  float inset = 1. - length(face);
  float rim = 1. - smoothstep(.01, .15, inset);
  float reflection = (uReflectivity / 1.3) * rim;
  float grazing = pow(1. - cosI, 2.);
  float edgeLight = .55 + .45 * smoothstep(-.6, .65, -.45 * face.x - .85 * depth);
  vec3 light = vec3(.9, .95, 1.) * (.08 + .20 * grazing) * edgeLight;
  if (uOilMode == 2) {
    // Bubble Liquid uses 480 nm, drainage .35 and an .83 oil opacity. Map
    // the film to each disc and sample the same spectral reflectance table.
    float below = clamp(.5 + .5 * depth, 0., 1.);
    float drainage = mix(1., .18 + 1.9 * pow(below, 1.6), .35);
    float wave = .17 * sin(3.1 * face.x + 1.7 * depth) + .07 * sin(5. * face.x - 4. * depth);
    float thickness = 480. * drainage * (1. + wave);
    vec2 cells = vec2(textureSize(uOilTable, 0));
    vec2 uv = (vec2(thickness / ${soapBubbleFilmMax.toFixed(1)}, cosI) * (cells - 1.) + .5) / cells;
    vec3 film = textureLod(uOilTable, uv, 0.).rgb;
    float grey = dot(film, vec3(.2126, .7152, .0722));
    light += (film - grey) * (2. * .83) * (.65 + grazing);
  }
  return max(vec3(0.), light * reflection);
}

vec4 oilGlass(vec3 behind, vec3 rim, vec3 tint) {
  // The dock's CSS tint composites above brightness(.84), saturation(1.48)
  // and blur(2px). Its light theme uses white and brightness(1.08).
  bool dark = uOilMode == 2;
  float tintAlpha = uHasMedia ? mix(uOilTintAlpha, 1., uColorOpacity) : uOilTintAlpha;
  float reflected = max(rim.r, max(rim.g, rim.b));
  float loss = clamp(reflected * (dark ? .55 : 1.9), 0., 1.);
  vec3 highlight = rim * (dark ? 1. : .65);
  if (uTransparent && !uHasMedia) {
    float alpha = tintAlpha + (1. - tintAlpha) * loss;
    return vec4((tint * tintAlpha * (1. - loss) + highlight) / max(alpha, 1e-6), alpha);
  }
  vec3 srgb = encodeSrgb(behind);
  float grey = dot(srgb, vec3(.213, .715, .072));
  srgb = clamp((grey + (srgb - grey) * 1.48) * (dark ? .84 : 1.08), 0., 1.);
  return vec4(decodeSrgb(mix(srgb, encodeSrgb(tint), tintAlpha)) * (1. - loss) + highlight, 1.);
}

// Project the ray leaving the stack onto the background plane. The same
// projection puts an unrefracted ray back at its original screen position.
bool backdropUv(vec3 o, vec3 d, out vec2 uv) {
  if (d.z <= 1e-4) return false;
  float distance = max(0., (.25 * uBackdrop.x - o.z) / d.z);
  vec3 q = uPicture * (o + distance * d - uCamera);
  if (q.x <= 1e-6) return false;
  uv = .5 + q.yz / (q.x * uCanvas * uView.x);
  return true;
}

vec3 transmittedMedia(vec3 o, vec3 d) {
  vec2 uv;
  return backdropUv(o, d, uv) ? mediaAt(uv) : uAmbient;
}

// A rectangular studio light projected onto the rounded glass by its
// reflected direction. The falloff softens the diffuser's edges.
float studioPanel(vec3 d, vec3 axis, vec3 right, vec2 size) {
  float facing = dot(d, axis);
  if (facing <= .05) return 0.;
  vec3 up = cross(axis, right);
  vec2 uv = abs(vec2(dot(d, right), dot(d, up))) / (facing * size);
  return 1. - smoothstep(.68, 1., max(uv.x, uv.y));
}

float studioGlint(vec3 d) {
  vec3 key = normalize(vec3(-.13, .23, -.97));
  vec3 strip = normalize(vec3(.63, -.54, -.56));
  vec3 fill = normalize(vec3(-.24, -.80, .55));
  return 16. * studioPanel(d, key, normalize(cross(vec3(0., 1., 0.), key)), vec2(.78, .43))
    + 6. * studioPanel(d, strip, normalize(cross(vec3(0., 1., 0.), strip)), vec2(.18, .52))
    + .30 * studioPanel(d, fill, normalize(cross(vec3(0., 1., 0.), fill)), vec2(.62, .26));
}

vec3 clearReflection(vec3 o, vec3 d) {
  if (uHasMedia && o.z < .25 * uBackdrop.x) {
    vec2 uv;
    if (backdropUv(o, d, uv) && all(greaterThanEqual(uv, vec2(0.))) && all(lessThanEqual(uv, vec2(1.))))
      return mediaAt(uv);
  }
  return uAmbient;
}

struct Hit {
  float s; vec3 center; vec2 ab; float r; int row;
#if HAS_INLAY
  // The logo's slice is cut into the glass: it grows with the disc in the
  // intro (stretch), and perUnit maps world x across the logo.
  float stretch; float perUnit; float kY; float kX;
  // The logo's sample where the ray enters: density, edge distance, edge
  // direction. It decides most exits and the tint without another read.
  vec4 entry;
#endif
};


// Row heights are bucketed: entry b is the first row at or above the start of
// bucket b, so one fetch brackets the rows a ray can reach (rows are sorted
// bottom to top). The bracket may hold a row or two extra; they are skipped.
int rowBucket(float y) {
  float b = clamp(floor((y - uRowRange.x) * uRowRange.y), 0., ${ROW_BUCKETS - 1}.);
  return int(b);
}

bool nearestSlab(vec3 o, vec3 d, out Hit h) {
  float s0 = 0., s1 = 1e3;
  if (abs(d.z) > 1e-7) {
    float sa = (-uDepthMax - o.z) / d.z, sb = (uDepthMax - o.z) / d.z;
    s0 = max(min(sa, sb), 0.);
    s1 = min(max(sa, sb), 1e3);
  } else if (abs(o.z) > uDepthMax) return false;
  if (s1 <= s0) return false;
  float ya = o.y + d.y * s0, yb = o.y + d.y * s1;
  // A row can only meet the ray within one slab radius of this interval.
  // Keep the wider bracket for stacks where the traversal limit can apply.
  float slack = uRows <= MAX_ROWS_PER_RAY ? uRadiusMax + 1e-5 : uSlack;
  int k0 = int(texelFetch(uRowLookup, ivec2(rowBucket(min(ya, yb) - slack), 0), 0).r + .5);
  int k1 = int(texelFetch(uRowLookup, ivec2(rowBucket(max(ya, yb) + slack) + 1, 0), 0).r + .5) - 1;
  if (k1 < k0) return false;
  bool up = d.y >= 0.;
  float best = 1e9;
  for (int i = 0; i < MAX_ROWS_PER_RAY; i++) {
    if (i > k1 - k0) break;
    int k = up ? k0 + i : k1 - i;
    vec4 head = texelFetch(uSlabs, ivec2(0, k), 0);
    int count = int(head.y + .5);
    if (count == 0) continue;
    float y = head.x, r = head.z, ta, tb;
    if (abs(d.y) < 1e-8) {
      if (abs(o.y - y) > r) continue;
      ta = s0; tb = s1;
    } else {
      ta = (y - r - o.y) / d.y;
      tb = (y + r - o.y) / d.y;
      if (ta > tb) { float t = ta; ta = tb; tb = t; }
    }
    if (ta > best) break;
    if (tb < 1e-6) continue;
    ta = max(ta, 0.);
    // Skip rows whose discs the ray passes in front of or behind.
    float za = o.z + d.z * ta, zb = o.z + d.z * tb;
    if (min(za, zb) > head.w || max(za, zb) < -head.w) continue;
    float xa = o.x + d.x * ta, xb = o.x + d.x * tb;
    float xl = min(xa, xb), xr = max(xa, xb);
#if HAS_INLAY
    vec4 mapping = vec4(-1.);
#endif
    for (int j = 0; j < MAX_SPANS; j++) {
      if (j >= count) break;
      vec4 span = texelFetch(uSlabs, ivec2(${SLAB_HEADER_TEXELS} + j, k), 0);
      if (span.x - span.y > xr) break;
      if (span.x + span.y < xl) continue;
      if (min(za, zb) > span.z + r || max(za, zb) < -span.z - r) continue;
      vec3 c = vec3(span.x, y, 0.);
      vec2 ab = max(span.yz - r, vec2(1e-4));
#if HAS_INLAY
      if (mapping.x < 0.) mapping = texelFetch(uSlabs, ivec2(4, k), 0);
      vec4 at;
      float s = plateEnter(o - c, d, ab, r, Plate(k, span.x, span.w, mapping.x, mapping.y, mapping.z), at);
#else
      float s = slabEnter(o - c, d, ab, r);
#endif
      if (s > 0. && s < best) {
        best = s;
        h.center = c;
        h.ab = ab;
        h.r = r;
        h.row = k;
#if HAS_INLAY
        h.stretch = span.w;
        h.perUnit = mapping.x;
        h.kY = mapping.y;
        h.kX = mapping.z;
        h.entry = at;
#endif
      }
    }
  }
  h.s = best;
  return best < 1e8;
}

// Follows the light that reaches the camera along d. The first glass surface
// splits it: the transmitted part continues through the stack, and its mirror
// image is traced too, so the underside of each disc reflects the disc below
// it (color) or, past that disc, the studio (a pale haze toward the far edge).
vec4 trace(vec3 o, vec3 d, vec3 flatBackdrop) {
  vec3 radiance = vec3(0.);
  vec3 transmitted = vec3(0.);
  vec3 transmittance = vec3(0.);
  float cosCrit = sqrt(max(0., 1. - 1. / (uIor * uIor)));
  vec3 mirrorOrigin = vec3(0.), mirrorDir = vec3(0.), mirrorWeight = vec3(0.);
  bool mirrored = false;
  float rearHaze = 0.;
  vec3 softLight = vec3(0.);
  float softLightWeight = 0.;
  float glint = 0.;
  float opacity = 1.;
  vec3 filmRim = vec3(0.);
  vec3 filmTint = vec3(0.);
  vec3 oilBehind = flatBackdrop;
  float colorOpacity = uHasMedia ? uColorOpacity : 0.;
  vec3 solidTint = vec3(0.);
  for (int pass = 0; pass < 2; pass++) {
    vec3 throughput = vec3(1.);
    if (pass == 1) {
      if (!mirrored || uOilMode != 0 || (uClearGlass && uReflectivity <= 0.)) break;
      o = mirrorOrigin;
      d = mirrorDir;
      throughput = mirrorWeight;
    }
    bool open = true;
    for (int event = 0; event < MAX_EVENTS; event++) {
      if (pass == 1 && event == MIRROR_EVENTS) break;
      Hit h;
      if (!nearestSlab(o, d, h)) {
        if (pass == 0 && event == 0) return vec4(uBackground, uTransparent ? 0. : 1.);
        break;
      }
      vec3 hitPoint = o + d * h.s;
      vec3 q = hitPoint - h.center;
#if HAS_INLAY
      Plate plate = Plate(h.row, h.center.x, h.stretch, h.perUnit, h.kY, h.kX);
      vec3 n = plateNormal(q, h.ab, h.r, plate, false);
#else
      vec3 n = nSlab(q, h.ab, h.r);
#endif
      float F = fresnel(-dot(d, n), 1. / uIor);
      vec3 bounce = reflect(d, n);
      if (pass == 0 && event == 0) {
        if (uOilMode == 0 && colorOpacity > 0.)
          solidTint = texelFetch(uSlabs, ivec2(${SLAB_TINT_TEXEL}, h.row), 0).rgb;
        mirrored = true;
        mirrorOrigin = hitPoint + n * 1e-5;
        mirrorDir = bounce;
        mirrorWeight = throughput * F;
        vec2 face = q.xz / (h.ab + h.r);
        float across = abs(face.x);
        float chord = sqrt(max(.025, 1. - across * across));
        float depth = face.y / chord;
        if (uOilMode != 0) {
          filmRim = oilRim(face, depth, clamp(-dot(d, n), 1e-4, 1.));
          filmTint = texelFetch(uSlabs, ivec2(2, h.row), 0).rgb;
#if HAS_INLAY
          filmTint = pow(filmTint, vec3(h.entry.x));
#endif
          if (!uHasMedia) return oilGlass(flatBackdrop, filmRim, filmTint);
        } else if (uClearGlass && !uHasMedia) {
          // Neutral reflection across the glass, strongest where the
          // curved edge meets the view at grazing angles.
          float bevel = smoothstep(.82, 1., length(face));
          float front = 1. - smoothstep(-1., -.40, depth);
          glint = F * (.44 + .24 * front + .15 * bevel) * uReflectivity;
        } else if (!uClearGlass) {
          // A broad fill through the face and a deeper tint through the
          // polished front rim. The ray-traced light still carries the
          // reflections of adjacent discs and the shape of the light card.
          float side = smoothstep(.24, .85, across);
          float rimWidth = clamp(.004 / (h.ab.y + h.r), .12, .36) * mix(1., .58, side);
          float rim = 1. - smoothstep(-1., -1. + rimWidth, depth);
          vec4 faceLight = texelFetch(uSlabs, ivec2(2, h.row), 0);
          vec4 rimLight = texelFetch(uSlabs, ivec2(3, h.row), 0);
#if HAS_INLAY
          {
            // A cut edge facing the camera is a polished front rim too: the
            // light crosses the glass along it and takes the deeper tint.
            vec4 here = h.entry;
            float cut = here.y * plateUnit(plate);
            float front = smoothstep(.15, .75, -plateOutward(plate, here).y);
            rim = max(rim, front * smoothstep(-1.15 * PLATE_BEVEL * h.r, -.2 * PLATE_BEVEL * h.r, cut));
          }
          {
            // The face and rim tints are the card's light through the glass:
            // scale their absorption with the design's density.
            float density = h.entry.x;
            float bottom = 1. - smoothstep(-.49, -.34, h.center.y);
            vec3 clearFace = max(min(uLight, vec3(1.)), vec3(1e-5));
            vec3 clearRim = max(uLight * (.29 + .47 * bottom), vec3(1e-5));
            faceLight.rgb = clearFace * pow(clamp(faceLight.rgb / clearFace, 1e-4, 1.), vec3(density));
            rimLight.rgb = clearRim * pow(clamp(rimLight.rgb / clearRim, 1e-4, 1.), vec3(density));
          }
#endif
          vec3 edge = mix(rimLight.rgb, faceLight.rgb, side * .21);
          softLight = mix(faceLight.rgb, edge, rim);
          softLightWeight = mix(mix(.75, .53, rimLight.a), .94, rim);
          if (HAS_REFLECTIVITY) {
            float clear = clamp(uReflectivity, 0., 1.);
            softLightWeight *= mix(1., .08, clear);
            // A broad reflected strip remains visible along the front bevel
            // on a dark set, even outside the main softbox's narrower image.
            float backdrop = dot(uBackground, vec3(.2126, .7152, .0722));
            float darkSet = 1. - smoothstep(.03, .55, backdrop);
            float strip = rim * (.12 + .24 * smoothstep(-.1, .95, -bounce.z)) * darkSet;
            glint = (F * studioGlint(bounce) + strip) * uReflectivity;
            opacity = mix(1., clamp(.13 + .44 * rim + F + glint, 0., 1.), clear);
          }
          // The far face catches diffuse light from the backdrop as it turns
          // away from the viewer. The polished front edge stays sharp.
          rearHaze = smoothstep(mix(.46, .56, faceLight.a), 1.05, depth) * mix(.91, .84, faceLight.a);
          // The narrower chord at either tip catches more diffuse light.
          rearHaze = max(rearHaze, smoothstep(.72, 1., across) * (1. - rim) * .34);
        }
      } else {
        vec3 reflectedScene = uClearGlass ? clearReflection(hitPoint, bounce) * uReflectivity : environment(hitPoint, bounce);
        radiance += throughput * F * reflectedScene;
        if (pass == 0 && HAS_REFLECTIVITY && uOilMode == 0 && (!uClearGlass || !uHasMedia)) {
          // Wide discs spread the image of the next rim over a longer arc.
          // Redirect more light at that bevel to keep its contour legible.
          float widthWeight = smoothstep(.035, .20, h.ab.x);
          float bevel = smoothstep(.84, .985, length(q.xz / (h.ab + h.r)));
          float edgeReflection = .32 * widthWeight * bevel * min(1., uReflectivity);
          if (uClearGlass) radiance += throughput * edgeReflection * uLight * .26;
          throughput *= 1. - edgeReflection;
        }
      }
      throughput *= 1. - F;
      vec3 di = refract(d, n, 1. / uIor);
      if (dot(di, di) < 1e-6) { open = false; break; }
      q -= n * 1e-6;
      float path = 0.;
#if HAS_INLAY
      if (pass == 1 && (!uClearGlass || !uHasMedia || abs(n.y) > .999)) {
        // The mirror image only needs the color of the plate it meets: light
        // crosses a thin flat plate and leaves parallel to where it entered.
        path = 2. * h.r / max(abs(di.y), .2);
        throughput *= 1. - fresnel(abs(di.y), uIor);
        o = hitPoint + d * (path * 1.0001);
      } else
#endif
      for (int bounceIndex = 0; bounceIndex <= MAX_INTERNAL; bounceIndex++) {
        vec3 exitNormal;
#if HAS_INLAY
        path += plateExit(q, di, h.ab, h.r, cosCrit, plate, bounceIndex == 0 ? h.entry : vec4(1e9), exitNormal);
#else
        path += slabExit(q, di, h.ab, h.r, cosCrit, exitNormal);
#endif
        vec3 out_ = refract(di, -exitNormal, uIor);
        if (dot(out_, out_) < 1e-6 && bounceIndex < MAX_INTERNAL) {
          di = reflect(di, exitNormal);
          q -= exitNormal * 1e-6;
          continue;
        }
        // Light still trapped after the last bounce leaves along the edge it reached.
        if (dot(out_, out_) < 1e-6) out_ = normalize(di + exitNormal);
        else throughput *= 1. - fresnel(dot(di, exitNormal), uIor);
        d = out_;
        o = q + h.center + d * 1e-5;
        break;
      }
#if HAS_INLAY
      // The glass's density where the light entered (the plate is thin).
      vec3 sigma = texelFetch(uSlabs, ivec2(1, h.row), 0).rgb * h.entry.x;
#else
      vec3 sigma = texelFetch(uSlabs, ivec2(1, h.row), 0).rgb;
#endif
      throughput *= exp(-sigma * path);
      // Light this dim cannot change the pixel any more.
      if (max(throughput.r, max(throughput.g, throughput.b)) < .004) { open = false; break; }
    }
    if (open && uClearGlass) {
      if (pass == 0) {
        transmittance = throughput;
        transmitted = throughput * (uHasMedia ? transmittedMedia(o, d) : uBackground);
      } else {
        radiance += throughput * clearReflection(o, d) * uReflectivity;
      }
    } else if (open) {
      bool refractsMedia = uHasMedia && (HAS_REFLECTIVITY || uOilMode != 0);
      vec3 scene = refractsMedia && pass == 0 ? transmittedMedia(o, d) : environment(o, d);
      if (uOilMode != 0 && uHasMedia && pass == 0)
        oilBehind = mix(flatBackdrop, scene, clamp(throughput.r * 1.2, 0., 1.));
      radiance += throughput * scene;
    }
  }
  if (uOilMode != 0) return oilGlass(oilBehind, filmRim, filmTint);
  if (uClearGlass) {
    vec3 reflected = radiance + uLight * glint;
    if (uHasMedia || !uTransparent) return vec4(mix(transmitted, solidTint, colorOpacity) + reflected, 1.);
    // A transparent export carries the reflected light and transmission loss.
    // Background displacement is baked only when the source image is present.
    float loss = 1. - dot(transmittance, vec3(.2126, .7152, .0722));
    float alpha = max(loss, max(reflected.r, max(reflected.g, reflected.b)));
    return vec4(reflected / max(alpha, 1e-6), alpha);
  }
  vec3 glass = mix(radiance, softLight, softLightWeight) + glint;
  if (uHasMedia) {
    vec3 composite = HAS_REFLECTIVITY
      ? mix(glass, flatBackdrop, rearHaze)
      : flatBackdrop * mix(clamp(glass, 0., 1.), vec3(1.), rearHaze);
    return vec4(mix(composite, solidTint + glint, colorOpacity), 1.);
  }
  if (uTransparent) return vec4(glass, mirrored ? (1. - rearHaze) * opacity : 0.);
  return vec4(mix(glass, uBackground, rearHaze), 1.);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Opposite pairs cover equal-area lens rings and cancel the subpixel offset.
// Sharing the pattern across pixels keeps a short batch free of pixel noise.
vec4 motionSample(int i) {
  int pairs = uSamples / 2;
  if (i == pairs * 2) return vec4(.5, .5, 0., 0.);
  float ring = float(i / 2) + .5;
  float opposite = float(i % 2);
  vec2 pixel = fract(ring * vec2(.75487767, .56984029)) - .5;
  float angle = fract(ring * .61803399 + .5 * opposite);
  return vec4(.5 + pixel * (1. - 2. * opposite), ring / float(pairs), angle);
}

// Every four rays cover all four quadrants. The same prefix is used while
// moving and at rest, so a thin reflection cannot lose a strip of samples
// when the preview switches between the two.
vec2 clearGlassJitter(int index) {
  vec2 quadrant = vec2(float(index % 2), float((index / 2) % 2));
  vec2 offset = fract(vec2(.75, .25) + .5 * quadrant.yx
    + float(index / 4) * vec2(.61803399, .41421356));
  return .5 * (quadrant + offset) - .5;
}

void main() {
  vec4 sum = vec4(0.);
  vec3 flatBackdrop = uHasMedia ? mediaAt(gl_FragCoord.xy / uCanvas) : uBackground;
  // Per-pixel Cranley-Patterson rotation of a 4D low-discrepancy (R4) sequence:
  // two dimensions place the sample in the pixel, two place it on the lens.
  vec4 shift = vec4(0.);
  // A shared sequence keeps the film and sharp backgrounds from turning into grain.
  if (!uMotionSampling && !uHasMedia && !uClearGlass && uOilMode == 0) {
    shift = vec4(hash12(gl_FragCoord.xy), hash12(gl_FragCoord.xy + 17.), hash12(gl_FragCoord.xy + 41.), hash12(gl_FragCoord.xy + 73.));
  }
  const vec4 R4 = vec4(.8566748838545029, .7338918566271260, .6287067210378086, .5385972572236101);
  for (int i = 0; i < 64; i++) {
    if (i >= uSamples) break;
    vec4 u = uMotionSampling ? motionSample(i) : fract(float(i + uSampleOffset) * R4 + shift);
    vec2 jitter = uClearGlass ? clearGlassJitter(i + uSampleOffset) : u.xy - .5;
    vec2 p = (gl_FragCoord.xy + jitter - .5 * uCanvas) * uView.x + uView.yz;
    vec3 dir = normalize(uForward + uRight * p.x + uUp * p.y);
    vec3 origin = uCamera;
    if (HAS_LENS) {
      // Tilt-shift thin lens: rays through the aperture meet again on the
      // plane z = uFocus.x + uFocus.y * y, through the near edges of the discs.
      vec3 axis = normalize(uForward);
      float focus = uFocus.x;
      if (uCalibratedApple) {
        // The smaller leaf discs sit closer to the midplane of the stack.
        focus *= mix(1., .3, smoothstep(.225, .27, p.y));
      }
      vec3 focal = uCamera + dir * ((focus + uFocus.y * uCamera.y - uCamera.z) / (dir.z - uFocus.y * dir.y));
      float radius = sqrt(u.z) * uAperture;
      float angle = u.w * 6.2831853;
      origin = uCamera + (uRight * cos(angle) + normalize(cross(axis, uRight)) * sin(angle)) * radius;
      dir = normalize(focal - origin);
    }
    vec4 ray = clamp(trace(origin, dir, flatBackdrop), 0., 1.);
    sum += vec4(ray.rgb * ray.a, ray.a);
  }
  vec4 color = sum / float(uSamples);
  if (uEncode && color.a > 0.) color.rgb = encodeSrgb(color.rgb / color.a) * color.a;
  fragColor = color;
}`;

/** Shows the running average of all accumulated samples. */
export const DISPLAY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uAccumulation;
uniform bool uEncode;
out vec4 fragColor;
vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0., 1.);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
}
void main() {
  vec4 c = texelFetch(uAccumulation, ivec2(gl_FragCoord.xy), 0);
  vec3 rgb = c.a > 0. ? c.rgb / c.a : vec3(0.);
  fragColor = vec4(uEncode ? encodeSrgb(rgb) : rgb, c.a);
}`;
