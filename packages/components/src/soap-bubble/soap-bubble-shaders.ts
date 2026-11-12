// Soap film optics. Lengths in the fragment shader are bubble radii unless a
// name says otherwise; film thickness is in nanometres. The viewer looks down
// -z, the page lies on a plane behind the bubble and y points up.

export const soapBubbleSpectralSamples = 16;
/** Thickest film in the lookup table, nm; thicker films have washed out to white. */
export const soapBubbleFilmMax = 3000;
/** Lookup table size: thickness samples × incidence samples. */
export const soapBubbleFilmSize = [768, 48] as const;
/** The baked noise repeats every this many units, in this many texels. */
export const soapBubbleNoisePeriod = 8;
export const soapBubbleNoiseSize = 64;

export const soapBubbleVertex = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const soapBubbleFragment = /* glsl */ `#version 300 es
precision highp float;

#define FILM_MAX ${soapBubbleFilmMax.toFixed(1)}
#define NOISE_PERIOD ${soapBubbleNoisePeriod.toFixed(1)}
#define PI 3.14159265

uniform vec2 uResolution;      // drawing buffer, device pixels
uniform vec2 uCenter;          // bubble centre, device pixels from the bottom left
uniform float uRadius;         // short half side, device pixels
uniform vec2 uExtent;          // half size in radii (x >= 1 for a pill)
uniform float uCorner;         // corner radius in radii (1 is fully round)
uniform float uBevel;          // glass bevel width in radii; 0 leaves a flat face
uniform float uLensWidth;      // width of the rim lens in radii; 0 follows the bevel
uniform float uLensClear;      // how far the tint clears over the rim lens
uniform float uBackdropBlur;   // transmitted blur in radii
uniform vec4 uModeBasis;       // l=2 amplitude × (cos, sin) of twice its angle, l=3 × thrice its
uniform vec2 uSquash;          // press squash and stretch
uniform float uPressScale;    // native press swell, independent of glyph size
uniform vec4 uJoin0;           // nearby button centre xy and half size zw, in radii
uniform vec4 uJoin1;
uniform vec4 uJoin2;
uniform vec4 uJoin3;
uniform vec4 uJoinCorners;
uniform vec4 uJoinAmounts;     // smooth-union radius; zero disables the contact
uniform vec4 uJoinTint0;
uniform vec4 uJoinTint1;
uniform vec4 uJoinTint2;
uniform vec4 uJoinTint3;
uniform float uTime;
uniform float uFlow;           // film flow clock
uniform float uThickness;
uniform float uIridescence;
uniform float uOilOpacity;
uniform float uDrainage;
uniform float uSwirl;
uniform float uFilmScale;      // size of the film's colour bands
uniform float uReflectivity;
uniform float uMirage;
uniform float uSeeThrough;     // share of the covered bubbles seen through the film
uniform float uCoveredBend;    // how far they bend, relative to the backdrop's refraction
uniform bool uHasCovered;
uniform sampler2D uCovered;    // what lies on the backdrop, premultiplied: its text, images and bubbles
uniform sampler2D uGround;     // the backdrop with nothing on it
uniform float uFloorLight;
uniform float uReach;         // radius of the reflected surroundings, in radii
uniform float uRefraction;
uniform float uGlass;          // 0 soap film, 1 liquid glass
uniform float uDispersion;
uniform float uSeed;
uniform int uEnvironment;      // 0 studio, 1 window, 2 sky, 3 soft
uniform mat3 uEnvRotation;
// Interference reflectance precomputed over thickness (x, 0 to FILM_MAX nm)
// and the cosine of incidence (y): the spectral integral costs one lookup.
uniform sampler2D uFilmTable;
uniform mediump sampler3D uNoise;
uniform float uOilCoverage;    // share of the film that shows oil colours
uniform float uOilEdge;        // device px from the rim the oil reaches; 0 is everywhere
uniform float uOilLarge;       // 0 for small controls, 1 for large panels and bars
uniform float uClearCenter;    // where the oil fades, also drop the reflected haze
uniform vec4 uTint;            // CSS colour and opacity, applied under the film
uniform vec4 uPaper;           // the plain colour of a page with no captured backdrop
uniform vec4 uSoapColor;       // film palette; resolved from tint when auto
uniform bool uCustomSoapPalette;
uniform vec4 uSoapPaletteRed;
uniform vec4 uSoapPaletteGold;
uniform vec4 uSoapPaletteGreen;
uniform vec4 uSoapPaletteCyan;
uniform vec4 uSoapPaletteBlue;
uniform vec4 uSoapPaletteViolet;
uniform vec4 uSoapShadeColor;  // darker faces, inner reflection and shade
uniform vec4 uSoapHighlightColor; // reflected room, bevel and window light
uniform bool uLightTheme;      // keep the original oil rendering in dark themes
uniform bool uWindowLight;     // the intro's window, along the top edge
uniform float uSpark;          // which small glint this bubble's window has, 0–1
uniform float uWindowSize;     // thickness of the window and its glint, 1 as drawn
uniform float uWindowIntensity;// brightness of the window and its twin
uniform int uWindowStyle;      // 0 runs along the edge, 1 the intro's bean as it first was
uniform float uWindowLength;   // how far the window runs, 1 as drawn
uniform float uWindowMargin;   // how far in from the edge it sits, 1 as drawn
uniform float uWindowBend;     // how closely it follows a long shape's curve, 0 straight to 1 the edge
uniform float uTopLength;      // how far the overhead light's highlight runs, 1 as drawn
uniform float uTopTail;        // how its far end thins to a point or stays blunt, 1 as drawn
uniform float uTopFade;        // how long the overhead light's highlight along a top edge fades
uniform float uWindowGradient; // how much the window fades towards its right end, 0.24 as drawn
uniform float uWindowWidth;    // thickness of the window band alone, 1 as drawn
uniform float uWindowHead;     // thickness of its thick left end against the rest, 1 as drawn
uniform float uWindowTail;     // thickness of its far end: low is pointed, high is blunt
uniform int uGlintShape;       // 0 auto, 1 dot, 2 dash, 3 pair, 4 none
uniform float uGlintSize;
uniform float uGlintIntensity;
uniform vec2 uGlintOffset;     // along the window and inwards, 0 as drawn
uniform bool uWindowTwin;      // the window's inverted twin on the far wall
uniform int uTwinShape;        // 0 arc, 1 crescent, 2 streak, 3 dot, 4 mirror
uniform bool uKeyLight;        // the room's key light (window, softbox or sun)
uniform bool uBottomShade;     // soft band on the far, lower wall
uniform vec4 uShadeColor;      // its straight RGBA colour; alpha below 0 follows the theme
uniform float uOilFade;        // 0–1 clears the middle of large panels, above 1 also narrows the rim band

uniform sampler2D uBackdrop;
uniform bool uHasBackdrop;
uniform vec2 uBackdropOrigin;  // bubble centre in backdrop UV
uniform vec2 uBackdropScale;   // one radius in backdrop UV
uniform vec2 uBackdropSize;    // texels

// A flat coloured layer under the bubble, such as a switch or slider track,
// in radii around the bubble centre: centre, half size, corner radius and the
// x where the fill ends. Thumbs refract it like any other backdrop.
uniform bool uHasLayer;
uniform vec4 uLayerRect;       // centre xy, half size zw
uniform float uLayerCorner;
uniform float uLayerFill;
uniform vec4 uLayerTrack;      // straight RGBA
uniform vec4 uLayerFrom;
uniform vec4 uLayerTo;


out vec4 outColor;

const float WATER = 1.333;

// ---------------------------------------------------------------- noise

// Gradient noise in [-1, 1], baked into a tiling 3D texture that repeats
// every NOISE_PERIOD units: one lookup instead of eight hashed gradients.
float noise(vec3 p) {
  return textureLod(uNoise, p / NOISE_PERIOD, 0.0).r * 2.0 - 1.0;
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 3; i++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + vec3(1.7, -3.1, 2.3);
    amplitude *= 0.5;
  }
  return sum;
}

vec3 rotateY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

// ---------------------------------------------------------------- film

// Thickness of the film at a point of the shell. Gravity drains water to the
// bottom, so the cap thins towards black film while the base stays thick and
// pale. Marangoni flow stirs the film into swirls that drift around the
// vertical axis and rise as thin patches.
float filmThickness(vec3 p, float scale, float seed) {
  float t = uFlow;
  float below = clamp(0.5 - 0.5 * p.y, 0.0, 1.0);
  float profile = mix(1.0, 0.18 + 1.9 * pow(below, 1.6), uDrainage);
  vec3 q = rotateY(p, t * 0.11 + seed) * (1.35 / uFilmScale) + vec3(seed * 3.1, -t * 0.06, uSeed);
  vec3 warp = vec3(noise(q + vec3(0.0, t * 0.05, 0.0)), noise(q + vec3(5.2, 1.3, -t * 0.04)),
                   noise(q + vec3(-3.7, 9.2, 2.8)));
  q += warp * (0.45 + 1.1 * uSwirl);
  // Bands stay roughly horizontal: gravity stratifies the film.
  float swirl = fbm(q * vec3(1.0, 1.0 + 1.6 * uDrainage, 1.0));
  float cells = noise(q * 3.1 + vec3(0.0, -t * 0.18, 0.0));
  float variation = swirl * (0.35 + 0.55 * uSwirl) + cells * 0.12 * uSwirl;
  return max(0.0, uThickness * scale * profile * (1.0 + variation));
}

// Reflectivity at a point of the shell. Turned up past its usual level it lifts
// the rim and its highlights: the flat face keeps its colour.
float reflectivityAt(float cosI) {
  return mix(min(uReflectivity, 1.3), uReflectivity, smoothstep(0.0, 0.2, 1.0 - cosI));
}

// Reflectance of the film in linear sRGB. oil (0–1) is how much of the
// interference shows at this point; elsewhere the film reflects without
// colour, like clear water between oil slicks.
vec3 film(float thickness, float cosI, float oil) {
  cosI = clamp(cosI, 1e-4, 1.0);
  float sin2 = 1.0 - cosI * cosI;
  float cosT = sqrt(max(0.0, 1.0 - sin2 / (WATER * WATER)));
  float rs = (cosI - WATER * cosT) / (cosI + WATER * cosT);
  float rp = (WATER * cosI - cosT) / (WATER * cosI + cosT);
  float rs2 = rs * rs, rp2 = rp * rp;
  vec2 cell = vec2(${soapBubbleFilmSize.join('.0, ')}.0);
  vec2 uv = (vec2(clamp(thickness / FILM_MAX, 0.0, 1.0), cosI) * (cell - 1.0) + 0.5) / cell;
  vec3 interference = textureLod(uFilmTable, uv, 0.0).rgb;
  float incoherent = 0.5 * (2.0 * rs2 / (1.0 + rs2) + 2.0 * rp2 / (1.0 + rp2));
  float strength = uIridescence * oil * uOilOpacity;
  vec3 colour = mix(vec3(incoherent), interference, clamp(strength, 0.0, 1.0));
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour = max(vec3(0.0), luma + (colour - luma) * max(1.0, strength));
  return min(colour * reflectivityAt(cosI), vec3(1.0));
}

// Where the oil colours show. Coverage below 1 leaves clear film between
// broad slicks the size of the film's bands.
float oilMask(vec3 p, float seed) {
  if (uOilCoverage >= 0.999) return 1.0;
  vec3 q = rotateY(p, uFlow * 0.05 + seed) * (0.9 / uFilmScale) + vec3(uSeed * 1.3, -uFlow * 0.03, seed);
  float n = 0.5 + 0.5 * (noise(q) * 0.7 + noise(q * 2.1 + 4.2) * 0.3);
  float edge = 1.0 - uOilCoverage;
  return smoothstep(edge - 0.12, edge + 0.12, n);
}

// ---------------------------------------------------------------- lighting

float roundedRect(vec2 p, vec2 halfSize, float r) {
  vec2 d = abs(p) - halfSize + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// How far the reflected direction turns across one device pixel. A light's
// image narrower than that falls between the pixels and breaks into dashes,
// so the panels below are filtered over this width.
float rayFootprint = 0.0;

// A light panel seen in direction dir: axis is where it hangs, its plane is
// spanned by right and up, size is the gnomonic half extent.
float panel(vec3 dir, vec3 axis, vec2 size, float panes, float soft, float tail) {
  float facing = dot(dir, axis);
  if (facing <= 0.05) return 0.0;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
  vec3 up = cross(axis, right);
  vec2 q = vec2(dot(dir, right), dot(dir, up)) / facing;
  // soft draws the panel's ends out sideways into a long, gentle falloff,
  // for diffusers whose light fades away; its top and bottom stay crisp.
  vec2 reach = size + vec2(soft * 0.6, 0.0);
  // tail narrows (below 1) or widens (above 1) the panel towards its ends,
  // so the highlight it lays along a top edge thins to a point or stays blunt.
  float taper = clamp((abs(q.x) - size.x * 0.3) / max(reach.x - size.x * 0.3, 1e-4), 0.0, 1.0);
  reach.y *= mix(1.0, tail, taper);
  float edge = roundedRect(q, reach, min(size.x, reach.y) * 0.18);
  // The panel filtered over a pixel's footprint: a trapezoid across its short
  // side, so an image thinner than a pixel dims instead of breaking up. It
  // keeps its light, and the footprint is capped so a grazing rim stays lit.
  float blur = clamp(rayFootprint * 0.75 / facing, 0.02, 0.5);
  float shortSide = max(min(reach.x, reach.y), 1e-4);
  float ramp = clamp((blur - edge) / (2.0 * min(blur, shortSide)), 0.0, 1.0);
  float body = ramp * ramp * (3.0 - 2.0 * ramp) * min(1.0, shortSide / blur);
  if (soft > 0.0) {
    float beyond = clamp((abs(q.x) - (size.x - soft * 0.6)) / (soft * 1.2), 0.0, 1.0);
    body *= 1.0 - beyond * beyond * (3.0 - 2.0 * beyond);
  }
  if (panes > 0.0) {
    // Window bars between the panes.
    vec2 cell = (0.5 - abs(fract(q / size * panes * 0.5) - 0.5)) * size * 2.0 / panes;
    float barBlur = max(0.005, blur * 0.25);
    float bars = smoothstep(0.017 - barBlur, 0.017 + barBlur, min(cell.x, cell.y));
    body *= mix(1.0, bars, step(edge, -0.03));
    // Daylight is brighter towards the top of the window.
    body *= 0.75 + 0.35 * clamp(q.y / size.y, -1.0, 1.0);
  } else {
    body *= 0.85 + 0.15 * smoothstep(0.0, -0.25, edge);
  }
  return body;
}

// Radiance of the surroundings. Directions with z > 0 point at the room in
// front of the screen, where the lights are; z < 0 points behind the bubble.
vec3 environment(vec3 dir) {
  dir = uEnvRotation * dir;
  float up = dir.y;
  if (uEnvironment == 2) {
    vec3 zenith = vec3(0.12, 0.32, 0.85);
    vec3 horizon = vec3(0.78, 0.86, 0.98);
    vec3 ground = vec3(0.16, 0.2, 0.12);
    vec3 sky = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.55));
    vec3 colour = up > 0.0 ? sky : mix(horizon * 0.55, ground, smoothstep(0.0, 0.25, -up));
    vec3 sun = normalize(vec3(-0.55, 0.62, 0.56));
    float s = max(dot(dir, sun), 0.0);
    if (uKeyLight) colour += vec3(1.0, 0.92, 0.78) * (pow(s, 900.0) * 40.0 + pow(s, 24.0) * 0.6);
    // Soft clouds.
    float cloud = smoothstep(0.1, 0.6, fbm(vec3(dir.xz / max(up, 0.08) * 0.9, 3.0)) + 0.1);
    colour = mix(colour, vec3(1.15), cloud * 0.55 * smoothstep(0.02, 0.2, up));
    return colour;
  }
  vec3 colour;
  if (uEnvironment == 3) {
    // A bright, diffuse room for light interfaces: pale walls and floor as
    // light as the page, so no dark line traces the lower rim, and a soft key
    // panel overhead.
    colour = mix(vec3(0.86, 0.87, 0.9), vec3(1.0, 1.0, 1.02), smoothstep(-0.7, 0.6, up));
    // The overhead panel is a broad diffuser: its light fades out towards
    // its border, so the long highlight it lays along a top edge does too.
    colour += vec3(1.4) * panel(dir, normalize(vec3(-0.3, 0.75, 0.6)), vec2(0.5 * uTopLength, 0.32), 0.0, uTopFade, uTopTail);
    // The mirror inner reflection turns this highlight round too, fainter,
    // along the bottom edge.
    if (uWindowLight && uWindowTwin && uTwinShape == 4)
      colour += vec3(0.6) * panel(dir, normalize(vec3(0.3, -0.75, 0.6)), vec2(0.5 * uTopLength, 0.32), 0.0, uTopFade, uTopTail);
    colour += vec3(0.5, 0.55, 0.65) * panel(dir, normalize(vec3(0.8, 0.1, 0.5)), vec2(0.08, 0.6), 0.0, 0.0, 1.0);
    // The bright window and its small companion that give bubbles their
    // crisp white highlights: radiant enough that even a thin film's few
    // percent of reflectance clips to white, with oil colours at the edges.
    if (uKeyLight) colour += vec3(48.0) * panel(dir, normalize(vec3(-0.6, 0.6, 0.53)), vec2(0.22, 0.16), 2.0, 0.0, 1.0);
    colour += vec3(28.0) * panel(dir, normalize(vec3(0.5, -0.38, 0.78)), vec2(0.08, 0.06), 0.0, 0.0, 1.0);
    return colour;
  }
  if (uEnvironment == 1) {
    // A bright room with one large window.
    colour = mix(vec3(0.22, 0.2, 0.19), vec3(0.42, 0.42, 0.44), smoothstep(-0.6, 0.8, up));
    colour = mix(colour, vec3(0.12, 0.1, 0.09), smoothstep(-0.1, -0.6, up));
    if (uKeyLight) colour += vec3(2.8, 2.95, 3.2) * panel(dir, normalize(vec3(-0.46, 0.4, 0.79)), vec2(0.36, 0.46), 2.0, 0.0, 1.0);
    colour += vec3(0.9, 0.85, 0.8) * panel(dir, normalize(vec3(0.82, 0.05, 0.35)), vec2(0.22, 0.6), 0.0, 0.0, 1.0);
    return colour;
  }
  // Studio: dark cyclorama, a large key softbox, a strip light and a kicker.
  colour = mix(vec3(0.018, 0.02, 0.026), vec3(0.06, 0.065, 0.08), smoothstep(-0.8, 0.9, up));
  if (uKeyLight) colour += vec3(4.0) * panel(dir, normalize(vec3(-0.5, 0.48, 0.72)), vec2(0.3, 0.24), 0.0, 0.0, 1.0);
  if (uKeyLight && uWindowLight && uWindowTwin && uTwinShape == 4)
    colour += vec3(1.6) * panel(dir, normalize(vec3(0.5, -0.48, 0.72)), vec2(0.3, 0.24), 0.0, 0.0, 1.0);
  colour += vec3(1.8, 1.9, 2.05) * panel(dir, normalize(vec3(0.7, 0.05, 0.71)), vec2(0.06, 0.55), 0.0, 0.0, 1.0);
  colour += uFloorLight * vec3(0.45, 0.5, 0.6) * panel(dir, normalize(vec3(0.1, -0.8, 0.3)), vec2(0.7, 0.2), 0.0, 0.0, 1.0);
  return colour;
}

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

// Recolour an optical contribution without flattening its light/dark detail.
// A transparent palette is an exact no-op, preserving the original material.
vec3 soapPalette(vec3 source, vec4 palette) {
  float peak = max(max(source.r, source.g), source.b);
  return mix(source, toLinear(palette.rgb) * peak, palette.a);
}

// A soap film is a spectrum, not a painted fill. Grade its wavelengths with
// a gentle colour filter instead of replacing every pixel with the same hue.
// Even an opaque palette keeps every spectral channel and the moving bands.
vec3 soapSpectrum(vec3 source, vec4 palette) {
  if (palette.a <= 0.0) return source;
  vec3 colourFilter = mix(vec3(1.0), vec3(0.85) + 0.15 * toLinear(palette.rgb), palette.a);
  vec3 graded = source * colourFilter;
  float peak = max(max(source.r, source.g), source.b);
  float gradedPeak = max(max(graded.r, graded.g), graded.b);
  return graded * (peak / max(gradedPeak, 1e-5));
}

// Remap the existing spectral hue families, keeping the film's spatial
// bands and optical shading. Natural mode bypasses the palette exactly.
vec3 soapFilmPalette(vec3 source) {
  if (!uCustomSoapPalette) return soapSpectrum(source, uSoapColor);
  float peak = max(max(source.r, source.g), source.b);
  float low = min(min(source.r, source.g), source.b);
  float chroma = peak - low;
  if (chroma < 1e-5) return soapSpectrum(source, uSoapColor);
  float hue = source.r == peak ? (source.g - source.b) / chroma
            : source.g == peak ? 2.0 + (source.b - source.r) / chroma
            : 4.0 + (source.r - source.g) / chroma;
  hue = mod(hue + 6.0, 6.0);
  float t = fract(hue);
  vec4 palette = hue < 1.0 ? mix(uSoapPaletteRed, uSoapPaletteGold, t)
               : hue < 2.0 ? mix(uSoapPaletteGold, uSoapPaletteGreen, t)
               : hue < 3.0 ? mix(uSoapPaletteGreen, uSoapPaletteCyan, t)
               : hue < 4.0 ? mix(uSoapPaletteCyan, uSoapPaletteBlue, t)
               : hue < 5.0 ? mix(uSoapPaletteBlue, uSoapPaletteViolet, t)
               : mix(uSoapPaletteViolet, uSoapPaletteRed, t);
  vec3 chosen = toLinear(palette.rgb);
  vec3 mapped = mix(vec3(peak), chosen * peak, chroma / max(peak, 1e-5));
  return soapSpectrum(mix(source, mapped, palette.a), uSoapColor);
}

// What a ray from a point of the bubble sees. Rays heading into the page
// meet the things around the bubble, modelled as a dome of radius uReach
// standing on the page: a grazing reflection at the rim sees the page right
// behind it, and the reflection reaches further out towards the horizon.
// Texture lookups run after a per-pixel early exit, where implicit
// derivatives are undefined, so every lookup chooses its level explicitly:
// spread is how many radii of page one radius of shell sweeps over.
float backdropLod(float spread) {
  float texels = uBackdropScale.x * uBackdropSize.x / uRadius;
  return log2(max(texels * spread, 1.0));
}

vec3 radiance(vec3 origin, vec3 dir, float mirage, float spread) {
  vec3 room = environment(dir);
  if (!uHasBackdrop || dir.z > -0.005) return room;
  vec2 hit = origin.xy + dir.xy * uReach;
  vec2 uv = uBackdropOrigin + vec2(hit.x, -hit.y) * uBackdropScale;
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  vec2 edge = min(uv, 1.0 - uv);
  float fade = inside.x * inside.y * smoothstep(0.0, 0.03, min(edge.x, edge.y));
  // Grazing rays meet the page far away and at a shallow angle.
  fade *= smoothstep(0.0, 0.2, -dir.z) * min(mirage, 1.0);
  vec3 page = toLinear(textureLod(uBackdrop, clamp(uv, 0.0, 1.0), backdropLod(spread)).rgb) *
              max(mirage, 1.0);
  return mix(room, page, clamp(fade, 0.0, 1.0));
}

// The layer at a point, premultiplied.
vec4 layerAt(vec2 xy) {
  if (!uHasLayer) return vec4(0.0);
  vec2 local = xy - uLayerRect.xy;
  float r = min(uLayerCorner, min(uLayerRect.z, uLayerRect.w));
  float edge = 0.75 / uRadius;
  float track = roundedRect(local, uLayerRect.zw, r);
  vec4 colour = uLayerTrack;
  float left = uLayerRect.x - uLayerRect.z;
  float fillHalf = max(0.0, 0.5 * (uLayerFill - left));
  // The fill is a pill of its own that ends in a round cap.
  float fill = roundedRect(xy - vec2(left + fillHalf, uLayerRect.y), vec2(fillHalf, uLayerRect.w),
                           min(r, fillHalf));
  float along = clamp((xy.x - left) / max(2.0 * uLayerRect.z, 1e-4), 0.0, 1.0);
  vec4 tint = mix(uLayerFrom, uLayerTo, along);
  colour = mix(colour, tint, clamp(0.5 - fill / edge, 0.0, 1.0) * step(1e-4, fillHalf));
  float a = colour.a * clamp(0.5 - track / edge, 0.0, 1.0);
  return vec4(colour.rgb * a, a);
}

// The detail level for what is seen through the film. A wide blur starts from a
// coarser level, so that its nine samples smooth the image instead of showing
// nine copies of it.
float transmittedLod() {
  float blurTexels = uBackdropBlur * uBackdropScale.x * uBackdropSize.x;
  return max(backdropLod(1.0), log2(max(blurTexels, 1.0)));
}

vec3 transmittedSample(sampler2D image, vec2 uv) {
  float lod = transmittedLod();
  vec3 color = textureLod(image, clamp(uv, 0.0, 1.0), lod).rgb;
  if (uBackdropBlur < 1e-5) return toLinear(color);
  // Blur the full-resolution scene before the rim samples it. A coarse mip
  // level is a reduced image, not a blur: magnifying it at the rim exposes
  // its texel grid. This Gaussian-weighted kernel keeps the native detail.
  vec2 dx = vec2(uBackdropScale.x * uBackdropBlur, 0.0);
  vec2 dy = vec2(0.0, uBackdropScale.y * uBackdropBlur);
  color *= 0.25;
  color += 0.125 * (
    textureLod(image, clamp(uv + dx, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv - dx, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv + dy, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv - dy, 0.0, 1.0), lod).rgb);
  color += 0.0625 * (
    textureLod(image, clamp(uv + dx + dy, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv + dx - dy, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv - dx + dy, 0.0, 1.0), lod).rgb +
    textureLod(image, clamp(uv - dx - dy, 0.0, 1.0), lod).rgb);
  return toLinear(color);
}

// What lies on the backdrop, in linear light, with how much of it is there.
vec4 coveredSample(vec2 uv) {
  float lod = transmittedLod();
  vec4 color = textureLod(uCovered, clamp(uv, 0.0, 1.0), lod);
  if (uBackdropBlur >= 1e-5) {
    vec2 dx = vec2(uBackdropScale.x * uBackdropBlur, 0.0);
    vec2 dy = vec2(0.0, uBackdropScale.y * uBackdropBlur);
    color *= 0.25;
    color += 0.125 * (
      textureLod(uCovered, clamp(uv + dx, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv - dx, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv + dy, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv - dy, 0.0, 1.0), lod));
    color += 0.0625 * (
      textureLod(uCovered, clamp(uv + dx + dy, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv + dx - dy, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv - dx + dy, 0.0, 1.0), lod) +
      textureLod(uCovered, clamp(uv - dx - dy, 0.0, 1.0), lod));
  }
  return vec4(toLinear(color.rgb / max(color.a, 1e-4)), color.a);
}

vec3 pageThrough(vec2 xy) {
  vec2 uv = uBackdropOrigin + vec2(xy.x, -xy.y) * uBackdropScale;
  // See-through decides how much of what lies on the page shows, so the light
  // from behind is only the bare page then.
  if (uHasCovered) return transmittedSample(uGround, uv);
  return transmittedSample(uBackdrop, uv);
}

// What lies behind a point of the bubble, in linear light. Over a captured
// backdrop it is opaque; over the live page only the layer is known, so the
// result is premultiplied with the layer's coverage as alpha.
vec4 behindAt(vec2 xy) {
  vec4 layer = layerAt(xy);
  vec3 tint = layer.a > 0.0 ? toLinear(layer.rgb / layer.a) : vec3(0.0);
  if (uHasBackdrop) return vec4(mix(pageThrough(xy), tint, layer.a), 1.0);
  // On a page of a known colour the layer lies on that colour, so a thumb
  // taller than its track sees the paper past the track, not black.
  if (uPaper.a > 0.0) return vec4(mix(toLinear(uPaper.rgb), tint, layer.a), 1.0);
  return vec4(tint * layer.a, layer.a);
}

// ---------------------------------------------------------------- shape

// A point in the shape's rest frame, after undoing wobble and squash.
// The modes' cos(2(θ - a)) and cos(3(θ - b)) come from the direction's own
// double and triple angle, which need no atan or cos; at rest there is no
// wobble to undo.
vec2 restPoint(vec2 p) {
  float swell = uPressScale > 0.0 ? uPressScale : 1.0;
  p /= (uExtent + swell - 1.0) / uExtent;
  p /= uSquash;
  if (uModeBasis == vec4(0.0)) return p;
  vec2 d = p * inversesqrt(max(dot(p, p), 1e-30));
  vec2 d2 = vec2(d.x * d.x - d.y * d.y, 2.0 * d.x * d.y);
  vec2 d3 = vec2(d2.x * d.x - d2.y * d.y, d2.y * d.x + d2.x * d.y);
  float wobble = 1.0 + dot(d2, uModeBasis.xy) + dot(d3, uModeBasis.zw);
  return p / wobble;
}

/* CUSTOM_OUTLINE */

// Signed distance to the outline, in radii, after wobble and squash.
float ownOutline(vec2 p) {
  // Contacts use the same analytic geometry on both canvases. Independent
  // wobble modes would otherwise disagree about the position of the seam.
  if (any(greaterThan(uJoinAmounts, vec4(0.0)))) {
    float swell = uPressScale > 0.0 ? uPressScale : 1.0;
    return roundedRect(p, uExtent + swell - 1.0, clamp(uCorner, 0.0, 1.0) * swell);
  }
  return (/* OUTLINE_DISTANCE */ roundedRect(restPoint(p), uExtent, clamp(uCorner, 0.0, 1.0))) * (uPressScale > 0.0 ? uPressScale : 1.0);
}

float joinedDistance(float a, vec2 p, vec4 other, float corner, float amount) {
  if (amount <= 0.0) return a;
  float b = roundedRect(p - other.xy, other.zw, corner);
  float h = clamp(0.5 + 0.5 * (b - a) / amount, 0.0, 1.0);
  return mix(b, a, h) - amount * h * (1.0 - h);
}

float outline(vec2 p) {
  float d = ownOutline(p);
  d = joinedDistance(d, p, uJoin0, uJoinCorners.x, uJoinAmounts.x);
  d = joinedDistance(d, p, uJoin1, uJoinCorners.y, uJoinAmounts.y);
  d = joinedDistance(d, p, uJoin2, uJoinCorners.z, uJoinAmounts.z);
  return joinedDistance(d, p, uJoin3, uJoinCorners.w, uJoinAmounts.w);
}

// Each canvas paints its own half of a shared liquid neck. The partition
// never enters the SDF, so no glass bevel is drawn down the seam.
bool ownsContact(vec2 p) {
  float d = ownOutline(p);
  // A small opaque overlap covers the two canvases' different pixel grids.
  // Feathering both halves would composite two half-alphas and expose the
  // page as a light or dark hairline.
  float overlap = max(2.0 / uRadius, 0.06);
  if (uJoinAmounts.x > 0.0 && roundedRect(p - uJoin0.xy, uJoin0.zw, uJoinCorners.x) < d - overlap) return false;
  if (uJoinAmounts.y > 0.0 && roundedRect(p - uJoin1.xy, uJoin1.zw, uJoinCorners.y) < d - overlap) return false;
  if (uJoinAmounts.z > 0.0 && roundedRect(p - uJoin2.xy, uJoin2.zw, uJoinCorners.z) < d - overlap) return false;
  if (uJoinAmounts.w > 0.0 && roundedRect(p - uJoin3.xy, uJoin3.zw, uJoinCorners.w) < d - overlap) return false;
  return true;
}

vec4 contactTint(vec4 tint, vec2 p, vec4 other, float corner, float amount, vec4 otherTint) {
  if (amount <= 0.0) return tint;
  float a = ownOutline(p);
  float b = roundedRect(p - other.xy, other.zw, corner);
  float peer = clamp(0.5 - 0.5 * (b - a) / amount, 0.0, 1.0);
  // Transparent tint can contain white or black RGB depending on theme.
  // Mix premultiplied colour so that invisible RGB never paints a divider.
  float alpha = mix(tint.a, otherTint.a, peer);
  vec3 colour = mix(tint.rgb * tint.a, otherTint.rgb * otherTint.a, peer);
  return vec4(alpha > 1e-5 ? colour / alpha : vec3(0.0), alpha);
}

// A film stretched over a rounded frame bulges only as far in as its corner
// radius: a sphere for a circle, a pillow edge for a panel. Glass narrows
// that into a bevel.
float glassEdge(float width) {
  float soap = clamp(uCorner, 0.04, 1.0);
  return mix(soap, min(soap, clamp(width, 0.04, 1.0)), uGlass);
}

// No bevel means a face flat to the edge, however much of a film it still is.
float bevelWidth() {
  return uBevel > 0.0 ? glassEdge(uBevel) : 0.0;
}

float shellInset(float sdf) {
  float width = bevelWidth();
  return width > 1e-4 ? clamp(-sdf / width, 0.0, 1.0) : 1.0;
}

// Height of the shell across its edge, 0 at the rim and 1 where the face
// turns flat. A free film is a sphere (circular arc). Glass follows the
// squircle that liquid glass uses, flatter where it meets the face so the
// bevel reads thinner.
float profile(float x) {
  x = clamp(x, 0.0, 1.0);
  float circle = sqrt(max(0.0, 1.0 - (1.0 - x) * (1.0 - x)));
  float r = 1.0 - x;
  float squircle = sqrt(sqrt(max(0.0, 1.0 - r * r * r * r)));
  return mix(circle, squircle, uGlass);
}

float shellLift(float inset) {
  return bevelWidth() * profile(inset);
}

// Outward-facing normal of the shell: the profile's slope by central
// difference, turned into a tilt along the outline gradient.
vec3 shellNormal(float inset, vec2 gradient, float side) {
  float d = 0.002;
  float slope = (profile(inset + d) - profile(max(inset - d, 0.0))) / (inset + d - max(inset - d, 0.0));
  return normalize(vec3(gradient * slope, side));
}

// Blend the soap film towards a glass surface: Schlick Fresnel for n = 1.5
// carrying the film's colour variation as an oil coating.
vec3 surface(vec3 soap, float cosI) {
  if (uGlass <= 0.0) return soap;
  float fresnel = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
  float luma = dot(soap, vec3(0.2126, 0.7152, 0.0722));
  vec3 coated = max(vec3(0.0), fresnel * reflectivityAt(cosI) + (soap - luma) * 0.8);
  return min(mix(soap, coated, uGlass), vec3(1.0));
}

// The glint past the window, as a distance in its own units (about 0.09
// across): a dot, a short dash, a pair of dots, or none.
float glintShape(vec2 local, int shape) {
  if (shape == 1) return (length(local / vec2(0.09, 0.07)) - 1.0) * 0.07;
  if (shape == 2) {
    vec2 dash = vec2(clamp(local.x, -0.12, 0.08), 0.0);
    return length(local - dash) - mix(0.05, 0.03, (local.x + 0.12) / 0.2);
  }
  if (shape == 3) {
    vec2 second = local - vec2(0.15, 0.05);
    return min(length(local / vec2(0.07, 0.055)) - 1.0, length(second / vec2(0.045, 0.04)) - 1.0) * 0.05;
  }
  return 1.0;
}

// The window of the promo's intro bubbles, seen in a shape's top-left edge:
// a band with round ends set in from that edge and following it, with a
// small spark past its end. q is in radii, in the shape's rest frame; side
// is +1 for the window and -1 for its inverted twin on the far wall, which
// is seen through the film: blurred, without frame or glint.
// Returns its light and how far across the band the point lies.
vec2 windowLight(vec2 q, float rc, float pixel, float side) {
  // The mirror twin is the front window itself, turned round: it takes the
  // same shape, gradient and motion rather than the twin's blurred arc.
  bool twin = side < 0.0 && uTwinShape != 4;
  q *= side;
  // It follows the shape's own curve: an arc on a round bubble, a pill's
  // rounded end and then its top, a panel's corner.
  float depth = -roundedRect(q, uExtent, rc);
  float left = -uExtent.x;
  float straight = max(0.0, 2.0 * (uExtent.x - rc));
  // On a round bubble it spans the cartoon's arc, from 126 to 72 degrees.
  // On a long shape its tip reaches further round the rounded end, down
  // towards the left; a round bubble keeps the cartoon's arc.
  float elongated = clamp((uExtent.x / uExtent.y - 1.0) * 2.0, 0.0, 1.0);
  float from = left + mix(0.59, 0.5, elongated) * rc;
  float to = from + ((1.22 - 0.59) * rc + min(straight * 0.3, 1.2 * rc)) * uWindowLength;
  // Light moves along a glossy surface, not across it: as the room turns the
  // window slides along the edge, keeping to its curve, and draws in or out
  // a little; the twin, on the far wall, moves the other way.
  vec3 facing = uEnvRotation * vec3(0.0, 0.0, 1.0);
  float slide = -facing.x * 0.9 * rc * side;
  from += slide;
  to += slide;
  // The twin can take another shape: a thin crescent near the rim, a short
  // straight streak, or a soft dot.
  int style = twin ? uTwinShape : 0;
  // On a long shape the window keeps clear of the rim's curve: its depth is
  // partly measured from the straight top instead, so it bends less.
  float flatDepth = uExtent.y - q.y;
  float windowDepth = mix(depth, flatDepth, twin ? 0.0 : (1.0 - uWindowBend) * elongated);
  vec2 here = vec2(q.x, style == 2 ? flatDepth : windowDepth);
  float h = clamp((here.x - from) / max(to - from, 1e-4), 0.0, 1.0);
  // Set in a little further from the edge than the cartoon, for margin.
  float inward = facing.y * 0.15 * side;
  vec2 core = vec2(mix(from, to, h), (style == 1 ? 0.13 : twin ? 0.3 : 0.35 * uWindowMargin + inward) * rc);
  // Thick at the left, where it faces the light, thinner along the tail and
  // foreshortened at both ends, where the surface turns away.
  float ends = 1.0 - 0.25 * pow(abs(h * 2.0 - 1.0), 3.0);
  float halfWidth = (style == 1 ? 0.055 : style == 2 ? 0.07 : twin ? mix(0.17, 0.12, h)
      : mix(0.14 * uWindowHead, 0.1 * uWindowTail, h) * uWindowSize * uWindowWidth) * rc * ends;
  if (style == 3) {
    core = vec2(mix(from, to, 0.45), 0.3 * rc);
    halfWidth = 0.11 * rc;
  }
  float offset = length(here - core);
  float band = offset - halfWidth;
  // The small glint past the window. On auto it differs from bubble to
  // bubble: a dot, a short dash along the window, a pair of dots, or none.
  // Smaller than the cartoon's, so it does not read as a dot first.
  // A long control catches a streak on its upper rim. The round bubble's
  // inset spark would otherwise float in the input's text area.
  float sparkDepth = mix((0.4 + 0.15 * uGlintOffset.y) * rc,
                         max(pixel * 1.25, (0.04 + 0.04 * uGlintOffset.y) * rc), elongated);
  vec2 sparkAt = vec2(to + (0.22 + 0.3 * uGlintOffset.x) * rc, sparkDepth);
  float sparkScale = 0.75 * rc * uWindowSize * uGlintSize;
  int sparkShape = uGlintShape != 0 ? uGlintShape
      : elongated > 0.5 ? 2 : uSpark < 0.35 ? 1 : uSpark < 0.7 ? 2 : uSpark < 0.86 ? 3 : 4;
  float spark = glintShape((here - sparkAt) / sparkScale, sparkShape) * sparkScale;
  // Crisp towards the rim, where the surface turns away fast; melting
  // towards the middle of the face.
  float feather = max(pixel, (twin ? (style == 0 ? 0.09 : 0.05) : 0.03) * rc);
  float edge = feather * mix(1.0, 3.0, step(core.y, here.y));
  float shape = 1.0 - smoothstep(-edge, edge * 0.6, band);
  float across = clamp(offset / halfWidth, 0.0, 1.0);
  float glow = 1.0 - 0.28 * across * across;
  // A faint, soft frame bar part way along.
  float run = abs(h - 0.42) * (to - from) / rc;
  float bar = twin ? 1.0 : 1.0 - 0.15 * (1.0 - smoothstep(0.0, 0.05, run));
  // Towards its right end the window dims by the gradient: 0 keeps it even.
  float pane = shape * glow * bar * 0.92 * (1.0 - (twin ? 0.24 : uWindowGradient) * h);
  float glint = twin ? 0.0 : min(1.0, (1.0 - smoothstep(-feather * 0.6, feather * 0.6, spark)) * 0.6 * uGlintIntensity);
  return vec2(max(uWindowLight ? pane : 0.0, glint), across);
}

// The window as it first was: the intro's bean and its round glint, drawn
// on a dome so it slides with the room and rides the wobble. The drawing is
// the original's, unchanged; only the circle it was drawn on is wrapped
// round the shape's real outline: round the top-left rounding by angle and
// along a straight top by distance, so on a round bubble it is exactly the
// original and on a pill it bends with the pill. Returns its light and how
// far across the bean the point lies.
vec2 bubbleWindow(vec2 rest, float rc, float pixel) {
  vec2 corner = vec2(-(uExtent.x - rc), uExtent.y - rc);
  vec2 fromCorner = rest - corner;
  // Round the rounding: angle about its centre and depth in from its rim.
  float angle = atan(fromCorner.y, fromCorner.x);
  float depth = 1.0 - length(fromCorner) / rc;
  // Over the straight part of the top: distance along it stands for angle,
  // and depth is measured down from the top edge.
  if (rest.x > corner.x && rest.x < uExtent.x - rc) {
    // Held at the bottom once past the bean, so it never comes round again.
    angle = max(0.5 * PI - (rest.x - corner.x) / rc, -0.5 * PI);
    depth = (uExtent.y - rest.y) / rc;
  }
  vec2 curve = (1.0 - depth) * vec2(cos(angle), sin(angle));
  const float flatness = 0.6;
  vec2 tilt = curve * flatness;
  vec3 dome = vec3(tilt, sqrt(max(0.0, 1.0 - dot(tilt, tilt))));
  vec3 ray = uEnvRotation * reflect(vec3(0.0, 0.0, -1.0), dome);
  vec2 u = ray.xy / max(ray.z + 1.0, 0.05) / flatness;
  float px = pixel / rc;
  vec2 d = u - vec2(-0.05, -0.22);
  // Length opens the arch about its middle; margin draws it inwards.
  float span = 0.15 * PI * uWindowLength;
  float radius = 0.8 - 0.12 * (uWindowMargin - 1.0);
  float a = clamp(atan(d.y, d.x), 0.55 * PI - span, 0.55 * PI + span);
  float toward = (a - (0.55 * PI - span)) / max(2.0 * span, 1e-4);
  float thick = 0.17 * uWindowSize * uWindowWidth * mix(uWindowTail, uWindowHead, toward);
  float offset = length(d - radius * vec2(cos(a), sin(a)));
  float arch = offset - thick;
  // Its glint is the original dot unless another shape is chosen; distance
  // moves it on round the arch and height in towards the middle.
  float sparkScale = uWindowSize * uGlintSize;
  vec2 sparkAt = vec2(0.5 + 0.25 * uGlintOffset.x, 0.42 - 0.12 * uGlintOffset.y);
  vec2 s = (u - sparkAt) / sparkScale;
  s = mat2(cos(0.6), -sin(0.6), sin(0.6), cos(0.6)) * s;
  float spark = glintShape(s, uGlintShape == 0 ? 1 : uGlintShape) * sparkScale;
  float feather = max(px, 0.04);
  float head = (a - (0.55 * PI - span)) / max(2.0 * span, 1e-4);
  // Towards its right end it dims by the gradient: 0 keeps it even.
  float window = (1.0 - smoothstep(-feather, feather, arch)) * 0.96 * (1.0 - uWindowGradient * 1.04 * (1.0 - head));
  float glint = min(1.0, (1.0 - smoothstep(-feather * 0.6, feather * 0.6, spark)) * 0.85 * uGlintIntensity);
  // Only near the top-left, inside the outline.
  float inside = 1.0 - smoothstep(0.95, 1.05, length(curve));
  return vec2(max(uWindowLight ? window : 0.0, glint) * inside, clamp(offset / thick, 0.0, 1.0));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - uCenter) / uRadius;
  float pixel = 1.0 / uRadius;
  float sdf = outline(p);
  float coverage = clamp(0.5 - sdf / pixel, 0.0, 1.0);
  // Around the bubble only the layer is drawn, flat and unrefracted.
  vec4 outside = layerAt(p);
  if (coverage <= 0.0 || !ownsContact(p)) {
    outColor = outside;
    return;
  }
  // Where two rims become one surface, the old individual rims must stop
  // reflecting. Keep the real outer edge, but clear the internal bevel,
  // window and oil ring that would otherwise divide the liquid neck.
  float contactOptics = 1.0 - smoothstep(0.002, 0.06, ownOutline(p) - sdf)
    * smoothstep(0.01, 0.1, -sdf);
  vec2 e = vec2(pixel * 0.75, 0.0);
  vec2 gradient = vec2(outline(p + e.xy) - outline(p - e.xy), outline(p + e.yx) - outline(p - e.yx));
  gradient /= max(length(gradient), 1e-5);
  // The shell is the dome over the outline: an exact sphere for a circle.
  // Towards liquid glass the dome becomes a slab with a flat face and the
  // curvature gathers into a bevel around the edge.
  float inset = shellInset(sdf);
  float lift = shellLift(inset);
  vec3 front = shellNormal(inset, gradient, 1.0);
  vec3 back = vec3(front.xy, -front.z);
  vec3 frontPoint = vec3(p, lift);
  vec3 backPoint = vec3(p, -lift);
  vec3 view = vec3(0.0, 0.0, -1.0);
  float cosI = max(front.z, 0.0);

  // Film colour at both walls of the shell; glass trades the film for the
  // Fresnel reflectance of a solid surface, keeping the film's hues as an
  // oily coating when Oil film is up.
  // On large panels and bars the oil gathers near the rim and the middle
  // stays clear; small controls keep it all over.
  float band = uOilEdge / max(1.0, uOilFade);
  float rimOil = uOilEdge > 0.0
      ? mix(1.0, 1.0 - smoothstep(band * 0.5, band * 1.5, -sdf * uRadius),
            uOilLarge * min(uOilFade, 1.0))
      : 1.0;
  float frontOil = oilMask(frontPoint, 0.0) * rimOil * contactOptics;
  vec3 naturalSoap = film(filmThickness(frontPoint, 1.0, 0.0), cosI, frontOil);
  vec3 frontSoap = soapFilmPalette(naturalSoap);
  float paletteBrightness = uCustomSoapPalette
      ? max(max(frontSoap.r, frontSoap.g), frontSoap.b) /
        max(max(max(naturalSoap.r, naturalSoap.g), naturalSoap.b), 1e-5)
      : 1.0;
  vec3 frontFilm = surface(frontSoap, cosI);
  vec3 backFilm = surface(soapFilmPalette(film(filmThickness(backPoint, 1.0, 0.0), cosI, oilMask(backPoint, 0.0) * rimOil)), cosI);
  // Clear centre also works on small controls and with Oil edge at zero.
  // A radius-relative window keeps the oily rim at every scale; large panels
  // retain their existing, narrower pixel-sized oil band.
  float clearRim = min(rimOil, 1.0 - smoothstep(0.12, 0.55, -sdf));
  // Past the usual amount the clearing spreads out from the middle until only
  // a band at the rim keeps its colours, as wide as Oil edge asks.
  if (uOilEdge > 0.0 && uClearCenter > 0.73) {
    float colourBand = min(band * 0.25, 0.5 * uRadius) / uRadius;
    float toRim = 1.0 - smoothstep(colourBand * 0.5, colourBand, -sdf);
    clearRim = mix(clearRim, min(clearRim, toRim), smoothstep(0.73, 1.0, uClearCenter));
  }
  float clarity = mix(1.0, clearRim, uClearCenter);
  frontFilm *= clarity * contactOptics;
  backFilm *= clarity * contactOptics;

  // Outer wall: convex mirror, upright image. Inner wall: concave mirror seen
  // through the front film, inverted image. Solid glass has no thin back
  // wall to mirror, so that image fades with the glass.
  vec3 frontRay = reflect(view, front);
  vec3 backRay = reflect(view, -back);
  // The reflected direction turns twice as fast as the normal, which turns
  // as 1 / n.z towards the rim.
  float spread = 2.0 * uReach / max(front.z, 0.03);
  // The shell curves fastest across the outline, so measure one pixel that way.
  vec3 nextNormal = shellNormal(shellInset(sdf - pixel), gradient, 1.0);
  rayFootprint = length(reflect(view, nextNormal) - frontRay);
  vec3 frontReflection = frontFilm * radiance(frontPoint, frontRay, uMirage, spread);
  vec3 backReflection = backFilm * (1.0 - frontFilm) * (1.0 - frontFilm) * (1.0 - 0.7 * uGlass) *
                        radiance(backPoint, backRay, uMirage, spread);
  frontReflection = soapSpectrum(frontReflection, uSoapHighlightColor);
  backReflection = soapSpectrum(backReflection, uSoapShadeColor);

  // Light from behind, refracted only if the film is given body. The ray is
  // followed across the shell to where it meets the back wall, so rays near
  // the rim cross a long chord just as they do in a ball lens.
  bool onPaper = !uHasBackdrop && uPaper.a > 0.0;
  vec3 behind = onPaper ? toLinear(uPaper.rgb) : vec3(0.0);
  float behindAlpha = uHasBackdrop || onPaper ? 1.0 : 0.0;
  vec3 covered = vec3(0.0);
  float coveredWeight = 0.0;
  if (uHasBackdrop || uHasLayer) {
    vec2 exitXY = p;
    vec3 outward = view;
    float exitZ = -lift;
    float eta = 1.0 + (0.333 + 0.25 * uGlass) * uRefraction;
    // With no bevel to trace, the rim lens is all the bending there is.
    float glassLens = uBevel > 0.0 ? smoothstep(0.5, 0.95, uGlass) : 1.0;
    // A flat face passes light straight through: only the bevel is traced.
    if (glassLens < 1.0 && eta > 1.0003 && inset < 0.999) {
      vec3 ray = refract(view, front, 1.0 / eta);
      // Distance along the ray at which it leaves through the back wall.
      float near = 0.0;
      float far = (lift + 1.0) / max(-ray.z, 0.05);
      for (int i = 0; i < 10; i++) {
        float mid = 0.5 * (near + far);
        vec3 x = frontPoint + ray * mid;
        float sd = outline(x.xy);
        if (x.z > -shellLift(shellInset(sd)) && sd < 0.0) near = mid; else far = mid;
      }
      vec3 x = frontPoint + ray * near;
      exitXY = x.xy;
      exitZ = x.z;
      vec2 exitGradient = vec2(outline(x.xy + e.xy) - outline(x.xy - e.xy),
                               outline(x.xy + e.yx) - outline(x.xy - e.yx));
      exitGradient /= max(length(exitGradient), 1e-5);
      float exitInset = shellInset(outline(x.xy));
      vec3 exitNormal = shellNormal(exitInset, exitGradient, -1.0);
      outward = refract(ray, -exitNormal, eta);
      if (dot(outward, outward) < 1e-4) outward = reflect(ray, -exitNormal);
    }
    float t = (-1.3 - exitZ) / min(outward.z, -0.05);
    vec2 target = exitXY + outward.xy * t;
    // A ball lens can throw a grazing ray far across the page. As the film
    // becomes glass, use a local rim lens instead: no displacement on the
    // flat face, strongest at the outer rim and bounded by its width.
    // Coordinates stay anchored to the page while a menu changes shape.
    // Its width is its own, so the edge can bend light with no bevel to see.
    float lens = uLensWidth > 0.0 ? glassEdge(uLensWidth) : bevelWidth();
    float rim = lens > 1e-4 ? pow(1.0 - clamp(-sdf / lens, 0.0, 1.0), 2.6) : 0.0;
    vec2 rimShift = -gradient * lens * 1.1 * rim * uRefraction;
    target = mix(target, p + rimShift, glassLens);
    // Glass disperses: red bends less than blue.
    vec2 shift = target - p;
    float split = 0.12 * uGlass * uDispersion;
    vec4 green = behindAt(target);
    behind = green.rgb;
    behindAlpha = green.a;
    if (split > 1e-4 && dot(shift, shift) > 1e-8) {
      behind.r = behindAt(p + shift * (1.0 - split)).r;
      behind.b = behindAt(p + shift * (1.0 + split)).b;
    }
    // Everything this one covers (text, images, other bubbles) seen along the
    // same ray bent as far as asked.
    if (uHasCovered) {
      vec2 bent = p + shift * uCoveredBend;
      vec2 uv = uBackdropOrigin + vec2(bent.x, -bent.y) * uBackdropScale;
      vec4 seen = coveredSample(uv);
      covered = seen.rgb;
      // Only where something lies: over the bare page the film stays whole.
      coveredWeight = seen.a;
      if (split > 1e-4 && dot(shift, shift) > 1e-8) {
        vec2 reach = shift * uCoveredBend;
        vec2 red = p + reach * (1.0 - split);
        vec2 blue = p + reach * (1.0 + split);
        covered.r = coveredSample(uBackdropOrigin + vec2(red.x, -red.y) * uBackdropScale).r;
        covered.b = coveredSample(uBackdropOrigin + vec2(blue.x, -blue.y) * uBackdropScale).b;
      }
    }
  }
  // User-controlled tint under the film, independent of the page theme.
  // Premultiplied compositing also works without a captured backdrop.
  // A solid body would hide what the rim lens bends, so it can clear there.
  float lensReach = uLensWidth > 0.0 ? glassEdge(uLensWidth) : bevelWidth();
  float lensClear = uLensClear * (1.0 - smoothstep(0.0, max(lensReach, 1e-4), -sdf));
  vec4 bodyTint = contactTint(uTint, p, uJoin0, uJoinCorners.x, uJoinAmounts.x, uJoinTint0);
  bodyTint = contactTint(bodyTint, p, uJoin1, uJoinCorners.y, uJoinAmounts.y, uJoinTint1);
  bodyTint = contactTint(bodyTint, p, uJoin2, uJoinCorners.z, uJoinAmounts.z, uJoinTint2);
  bodyTint = contactTint(bodyTint, p, uJoin3, uJoinCorners.w, uJoinAmounts.w, uJoinTint3);
  bodyTint.a *= 1.0 - lensClear;
  behind = behind * (1.0 - bodyTint.a) + toLinear(bodyTint.rgb) * bodyTint.a;
  behindAlpha = behindAlpha * (1.0 - bodyTint.a) + bodyTint.a;

  // Back wall and whatever lies behind it.
  vec3 colour = behind * (1.0 - backFilm) + backReflection;
  vec3 through = 1.0 - backFilm;

  colour = colour * (1.0 - frontFilm) + frontReflection;
  through *= 1.0 - frontFilm;

  // The oil is an outer coating, separate from the base tint. Give that
  // coating its own spectral colour so an opaque tint cannot fill its colour
  // bands away. Only light themes use this extra coating: dark themes keep
  // their original spectral reflections and transmission unchanged.
  if (uLightTheme) {
    float oilCoat = min(uIridescence * 0.3, 0.65) * uGlass * frontOil * clarity * uOilOpacity * min(uReflectivity, 1.0);
    float oilPeak = max(max(frontSoap.r, frontSoap.g), frontSoap.b);
    vec3 oilHue = frontSoap / max(oilPeak, 1e-4);
    float baseLight = max(0.1, dot(colour, vec3(0.2126, 0.7152, 0.0722)));
    colour = mix(colour, oilHue * baseLight * paletteBrightness, oilCoat);
    through *= 1.0 - oilCoat;
  }

  // Liquid glass catches light along its bevel: a bright upper-left rim and
  // a fainter one opposite.
  if (uGlass > 0.0) {
    float bevel = pow(1.0 - cosI, 3.0) * smoothstep(0.0, 0.08, inset);
    vec2 side = normalize(front.xy + 1e-5);
    float lit = pow(max(dot(side, normalize(vec2(-0.6, 0.8))), 0.0), 2.0) +
                0.45 * pow(max(dot(side, normalize(vec2(0.6, -0.8))), 0.0), 2.0);
    colour += soapPalette(vec3(0.9, 0.95, 1.0), uSoapHighlightColor) * uGlass * uReflectivity * 0.55 * bevel * lit * contactOptics;
  }

  // Roll off reflected highlights, leaving a cleared centre's page colours intact.
  colour = colour / (1.0 + max(colour - 0.85, 0.0) * 0.6 * clarity);
  float darkFace = (1.0 - smoothstep(0.08, 0.6, max(max(colour.r, colour.g), colour.b))) * clarity;
  colour = mix(colour, soapSpectrum(colour, uSoapShadeColor), darkFace);

  // The bubbles of the promo's intro: a soft band where the far, lower wall
  // catches the light (a shade on light pages, a glow on dark ones), and
  // the room's key light mirrored large across the top.
  if (uBottomShade) {
    // Measured from the shape's own rounding, raised a little: a crescent
    // inside a round bubble, a band along the whole bottom of a pill.
    float rc = clamp(uCorner, 0.05, 1.0);
    vec2 raised = restPoint(p) - vec2(0.0, 0.4 * rc);
    vec2 inner = max(uExtent - rc, 0.0);
    float t = length(raised - clamp(raised, -inner, inner)) / (1.35 * rc);
    float band = t < 0.6 ? 0.0
      : t < 0.88 ? (t - 0.6) / 0.28
      : mix(1.0, 0.35, (t - 0.88) / 0.12);
    band = clamp(band, 0.0, 1.0);
    // The theme's shade, a soft shadow on light pages and a glow on dark
    // ones, unless a colour is given; its opacity sets the strength.
    bool themed = uShadeColor.a < 0.0;
    vec3 shade = themed ? (uLightTheme ? vec3(0.0) : vec3(1.0)) : toLinear(uShadeColor.rgb);
    shade = mix(shade, toLinear(uSoapShadeColor.rgb), uSoapShadeColor.a);
    float strength = (themed ? (uLightTheme ? 0.16 : 0.2) : uShadeColor.a * 0.35) * contactOptics * min(uReflectivity, 1.0);
    colour = mix(colour, shade, band * strength);
    through *= 1.0 - band * strength;
  }
  // Keep the spectral coating above an opaque base and its coloured shades.
  // Oil opacity, not Tint alpha or spectral saturation, controls its opacity.
  // Coverage and Clear centre keep defining where the spectrum lies.
  // An explicitly transparent soap colour keeps legacy base-only accents
  // (such as the green +) from gaining an additional spectral coating.
  float tintPresent = uCustomSoapPalette ? 1.0 : smoothstep(0.0, 0.2, uSoapColor.a);
  float tintedOil = tintPresent * smoothstep(0.0, 0.05, uIridescence) * 0.95 *
                    uOilOpacity * frontOil * clarity * min(uReflectivity, 1.0);
  if (tintedOil > 0.0) {
    vec3 spectrum = frontSoap;
    float peak = max(max(spectrum.r, spectrum.g), spectrum.b);
    vec3 hue = spectrum / max(peak, 1e-4);
    float baseLight = max(0.1, dot(colour, vec3(0.2126, 0.7152, 0.0722)));
    colour = mix(colour, hue * baseLight * paletteBrightness, tintedOil);
    through *= 1.0 - tintedOil;
  }
  if (uWindowLight || uGlintIntensity > 0.0) {
    // The intro's window, set in from and following the top-left edge (an
    // arc on a round bubble, the end and then the top of a pill, a panel's
    // corner), and its inverted twin, small and faint, on the far wall at
    // the bottom right, as on a real bubble. Both slide as the pointer turns
    // the room and ride the wobble, so they read as reflections.
    float rc = clamp(uCorner, 0.05, 1.0);
    // The edge window and its twin move along the edge themselves; only the
    // wobble moves the shape under them.
    vec2 q = restPoint(p);
    vec2 near = uWindowStyle == 1 ? bubbleWindow(q, rc, pixel) : windowLight(q, rc, pixel, 1.0);
    vec2 far = windowLight(uTwinShape == 4 ? q : q * 1.35, rc, pixel, -1.0);
    float light = min(1.0, near.x * uWindowIntensity) * smoothstep(0.05, 0.35, gradient.y) * contactOptics * min(uReflectivity, 1.0);
    // Thin shapes need more light to read at all.
    float twinStrength = uTwinShape == 0 ? 0.16 : uTwinShape == 2 ? 0.26 : uTwinShape == 4 ? 0.45 : 0.3;
    float twin = uWindowLight && uWindowTwin ? min(1.0, far.x * twinStrength * uWindowIntensity) * smoothstep(0.05, 0.35, -gradient.y) * contactOptics * min(uReflectivity, 1.0) : 0.0;
    // The film's oil colours show at the window's edges, as on a bubble.
    float peak = max(max(frontSoap.r, frontSoap.g), frontSoap.b);
    vec3 hue = frontSoap / max(peak, 1e-4);
    float fringe = clamp(near.y * 1.2 - 0.3, 0.0, 1.0) * min(uIridescence, 1.5) * 0.3;
    vec3 reflected = mix(vec3(1.0), hue, fringe) * light + vec3(twin);
    reflected = soapPalette(reflected, uSoapHighlightColor);
    // Reflected light adds to what is there rather than covering it.
    colour = 1.0 - (1.0 - colour) * (1.0 - min(reflected, vec3(1.0)));
    through *= 1.0 - max(light, twin);
  }
  // Laid over the film rather than under it, so See-through reads the same
  // on a light page, where the film's bright reflections would bury it.
  if (uHasCovered) {
    // What lies behind, so a solid body (Opacity) hides it as it hides the page.
    colour = mix(colour, covered, uSeeThrough * coveredWeight * (1.0 - bodyTint.a));
  }
  vec3 encoded = pow(max(colour, 0.0), vec3(1.0 / 2.2));
  vec4 bubble;
  if (uHasBackdrop) {
    bubble = vec4(encoded, 1.0);
  } else if (onPaper) {
    // The film is lit as it would be on its page, then only what it changes
    // there is painted: the same colours over the paper, and whatever else
    // lies on the page still shows through.
    vec3 shown = min(encoded, vec3(1.0));
    vec3 away = max(
      (shown - uPaper.rgb) / max(1.0 - uPaper.rgb, vec3(1e-4)),
      (uPaper.rgb - shown) / max(uPaper.rgb, vec3(1e-4))
    );
    float paint = clamp(max(away.r, max(away.g, away.b)), 0.0, 1.0);
    bubble = vec4(max(shown - uPaper.rgb * (1.0 - paint), vec3(0.0)), paint);
  } else {
    // Over live page content: the page is seen undistorted through the film,
    // dimmed by what the film reflects away.
    float alpha = 1.0 - dot(through, vec3(0.2126, 0.7152, 0.0722)) * (1.0 - behindAlpha);
    bubble = vec4(encoded, clamp(alpha, 0.0, 1.0));
    bubble.a = max(bubble.a, max(max(bubble.r, bubble.g), bubble.b));
  }
  outColor = bubble * coverage + outside * (1.0 - coverage);
}
`;

/** Keep Bubble UI's complete material while supplying another silhouette's SDF. */
export function soapBubbleFragmentForOutline(source: string) {
  return soapBubbleFragment
    .replace('/* CUSTOM_OUTLINE */', source)
    .replace(
      '/* OUTLINE_DISTANCE */ roundedRect(restPoint(p), uExtent, clamp(uCorner, 0.0, 1.0))',
      'customOutline(restPoint(p))',
    );
}
