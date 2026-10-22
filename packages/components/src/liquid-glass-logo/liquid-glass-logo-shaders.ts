export const liquidGlassLogoVertex = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// An optical surface, independent of the artwork beneath it. The first lens morphs
// from a sphere to a superellipse; the second opens over the measured wordmark.
// Refraction is integrated over the visible spectrum, rather than RGB offsets.
// All distances are in CSS pixels, so the optics survive resizing and different DPRs.
export const liquidGlassLogoRender = `#version 300 es
precision highp float;
uniform sampler2D uLogo;
uniform sampler2D uText;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uUnit;
uniform vec2 uLogoBox;
uniform vec2 uTextBox;
uniform float uTextWidth;
uniform float uTime;
uniform float uSettle;
uniform float uArtScale;
uniform float uWordmarkEnabled;
uniform vec3 uTile;
uniform float uTileEnabled;
// 0 on a dark page, 1 on a pale one.
uniform float uPageLight;
uniform float uDepth;
uniform float uDispersion;
uniform float uRelief;
uniform float uCaustics;
uniform float uHighlights;
// How much the faint line outside the rim takes the plate color.
uniform float uEchoTint;
// 0 draws the full inner wall; 1 keeps it to the upper-left and lower-right arcs.
uniform float uInnerWallFocus;
uniform float uDropSize;
uniform float uDropStrength;
uniform float uDecay;
// Second drop: radius, core radius, rim stretch, center factor (negative inverts).
uniform vec4 uDrop;
// Second drop: core edge magnification, profile exponent, ripple amplitude, wavelength.
uniform vec4 uDropLens;
// Second drop: ripple phase, share of ripples inside the core, dispersion, unused.
uniform vec4 uDropWave;
out vec4 outColor;
const float PI = 3.14159265359;
const int BANDS = 32;

float sq(float x) { return x * x; }
float bell(float x, float width) { return exp(-sq(x / max(width, 0.001))); }
float ease(float a, float b, float x) { return smoothstep(a, b, x); }

// Smooth overlapping spectral sensitivities, normalized in the integration below.
vec3 spectrum(float s) {
  float wavelength = 400.0 + 300.0 * s;
  vec3 rgb = vec3(0.0);
  if (wavelength < 440.0) rgb = vec3((440.0 - wavelength) / 120.0, 0.0, 1.0);
  else if (wavelength < 490.0) rgb = vec3(0.0, (wavelength - 440.0) / 50.0, 1.0);
  else if (wavelength < 510.0) rgb = vec3(0.0, 1.0, (510.0 - wavelength) / 20.0);
  else if (wavelength < 580.0) rgb = vec3((wavelength - 510.0) / 70.0, 1.0, 0.0);
  else if (wavelength < 645.0) rgb = vec3(1.0, (645.0 - wavelength) / 65.0, 0.0);
  else rgb = vec3(1.0, 0.0, 0.0);
  return rgb * mix(0.2, 1.0, ease(400.0, 430.0, wavelength)) * mix(1.0, 0.65, ease(650.0, 700.0, wavelength));
}
float glassIor(float s, float spread) {
  float wavelength = 0.4 + 0.3 * s;
  return 1.38 + (0.04 / (wavelength * wavelength) - 0.12) * spread;
}

vec4 imageAt(sampler2D image, vec2 p, vec2 box) {
  vec2 uv = 0.5 + p / box;
  // Transparent outside the image, including images that touch their texture edges.
  // Explicit LOD is stable inside the back-face branch; implicit derivatives are
  // undefined there and can make the same sought frame change after another draw.
  vec2 footprint = vec2(textureSize(image, 0)) / max(box * uDpr, vec2(1.0));
  float lod = max(0.0, log2(max(footprint.x, footprint.y)));
  // The first sphere comes into focus as it flattens into a plate.
  lod += (1.0 - ease(0.20, 0.36, uTime)) * 2.2;
  vec4 ink = textureLod(image, uv, lod);
  return ink * step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
}

float superRadius(vec2 p, float n) {
  vec2 a = max(abs(p), vec2(0.00001));
  return pow(pow(a.x, n) + pow(a.y, n), 1.0 / n);
}
vec2 superNormal(vec2 p, float n) {
  return normalize(sign(p) * pow(max(abs(p), vec2(0.00001)), vec2(n - 1.0)) + vec2(0.000001));
}

float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Real glass is not a perfect stroke. Along an edge (u = arc length in pixels) its
// light varies slowly and breaks into short glints where the surface is uneven.
float contourNoise(float u) {
  float i = floor(u);
  float f = fract(u);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}
float specks(float u, float d, float size, float seed) {
  float spacing = size * 22.0;
  float cell = floor(u / spacing);
  float on = step(0.7, hash1(cell + seed));
  float center = (cell + 0.2 + 0.6 * hash1(cell + seed + 17.0)) * spacing;
  float offset = (hash1(cell + seed + 31.0) - 0.5) * size * 0.6;
  // Glints are dashes along the edge, several times longer than they are wide.
  float dash = size * (2.5 + 4.0 * hash1(cell + seed + 53.0));
  return on * bell(u - center, dash) * bell(d - offset, size * 0.35);
}
// The same glints as particles held by the liquid: each one bobs across the edge
// on its own period and barely sways along it, so nothing slides sideways.
// Neighboring cells are included so a moving glint is not clipped at its cell.
float driftingSpecks(float u, float d, float size, float seed, float t) {
  float spacing = size * 22.0;
  float cell = floor(u / spacing);
  float glints = 0.0;
  for (int j = -1; j <= 1; j++) {
    float id = cell + float(j);
    float on = step(0.7, hash1(id + seed));
    float rate = 2.5 + 3.0 * hash1(id + seed + 71.0);
    float phase = 6.2832 * hash1(id + seed + 89.0);
    float center = (id + 0.2 + 0.6 * hash1(id + seed + 17.0)) * spacing + sin(t * rate * 0.5 + phase) * spacing * 0.05;
    float offset = (hash1(id + seed + 31.0) - 0.5) * size * 0.6 + sin(t * rate + phase) * size * 1.6;
    float dash = size * (2.5 + 4.0 * hash1(id + seed + 53.0));
    glints += on * bell(u - center, dash) * bell(d - offset, size * 0.35);
  }
  return min(glints, 1.0);
}

// Material-space relief: neighboring glass walls share the slow undulation but
// have different fine thickness variations. It stays attached as the lens grows.
float edgeWarp(float arc, float seed) {
  float broad = contourNoise(arc / (uUnit * 0.037) + seed) - 0.5;
  float fine = contourNoise(arc / (uUnit * 0.008) + seed + 29.0) - 0.5;
  return uUnit * (broad * 0.0017 + fine * 0.0008);
}

// Small flattened air pockets in the glass channel. x is the dark cavity;
// y is its light-catching lip. Three cells avoid popping at cell boundaries.
vec2 glassPores(float arc, float d, float seed) {
  if (abs(d) > uUnit * 0.011) return vec2(0.0);
  float pitch = uUnit * 0.022;
  float cell = floor(arc / pitch);
  vec2 pores = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    float id = cell + float(j) + seed;
    float visible = step(0.63, hash1(id));
    float center = (cell + float(j) + 0.15 + 0.7 * hash1(id + 17.0)) * pitch;
    float across = (hash1(id + 31.0) - 0.5) * uUnit * 0.009;
    float span = uUnit * (0.0022 + 0.0035 * hash1(id + 53.0));
    float height = max(0.35 / uDpr, uUnit * (0.0007 + 0.0012 * hash1(id + 71.0)));
    vec2 q = vec2((arc - center) / span, (d - across) / height);
    // A slight skew keeps the cavities from forming identical ellipses.
    q.x += q.y * (hash1(id + 89.0) - 0.5) * 0.55;
    float radius = length(q);
    float aa = max(0.18, 0.4 / (uDpr * height));
    float cavity = bell(radius, 0.65);
    float lip = bell(radius - 1.0, aa);
    float glint = 0.25 + 0.75 * max(dot(q / max(radius, 0.001), normalize(vec2(-0.4, 0.8))), 0.0);
    pores += vec2(cavity, lip * glint) * visible;
  }
  return min(pores, vec2(1.0));
}

// Light reflected off the ripples outside the glass is invisible on a pale page.
// There the same ripples bend the page away and read as cool shadows, as in the
// light reference. Coverage is unchanged, so a dark page renders as before.
vec3 exteriorColor(vec3 light, float coverage) {
  // The shadow leans toward the plate's own tone, a little deeper, so it belongs
  // to the glass instead of reading as a gray smudge on the page.
  vec3 shade = mix(vec3(0.40, 0.46, 0.56), uTile * 0.86, uEchoTint);
  return mix(light, shade * coverage, uPageLight);
}

// Per-channel coverage of the last refracted image. Each wavelength band lands
// on the artwork at its own offset, so a dark logo over a light plate blocks red,
// green and blue at slightly different places and its edges split into color.
vec3 refractedCoverage;

// A refracted image behind a glass lens, with a little light focused onto its ink.
vec4 refractedLogo(vec2 p, vec2 normalXY, float lensScale, float glass, float chromaticScale, float surfaceDistance) {
  vec3 normal = normalize(vec3(normalXY, 1.0));
  vec3 color = vec3(0.0);
  vec3 weights = vec3(0.0);
  float alpha = 0.0;
  float minCoverage = 1.0;
  float maxCoverage = 0.0;
  refractedCoverage = vec3(0.0);
  float spread = uDispersion * chromaticScale * mix(0.85, mix(2.2, 1.5, ease(0.28, 0.9, uTime)), ease(0.25, 0.33, uTime));
  vec3 neutralRay = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / glassIor(0.5, spread));
  vec2 neutralOffset = neutralRay.xy / max(-neutralRay.z, 0.25) * uUnit * uDepth * 0.80 * lensScale;
  for (int i = 0; i < BANDS; i++) {
    float s = float(i) / float(BANDS - 1);
    // Shorter wavelengths bend more. Dispersion is intentionally visible at the bevel.
    // The young sphere splits light only at its rim; the settled bevel splits it strongly.
    float ior = glassIor(s, spread);
    vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / ior);
    vec2 offset = ray.xy / max(-ray.z, 0.25) * uUnit * uDepth * 0.80 * lensScale;
    // Measured artwork scale over time; see artworkScale in the renderer.
    float artworkScale = uArtScale;
    float magnification = 1.0;
    // The opening focus folds the edge of the image into a partial crescent.
    // It opens into barrel distortion before the sphere flattens into the plate.
    float sphereRadius = uUnit * lensScale * 0.5;
    float sphereFocus = 1.0 - ease(0.225, 0.335, uTime);
    float bubbleQ = min(length(p) / max(sphereRadius, 1.0), 1.0);
    float openingFocus = 1.0 - ease(0.19, 0.265, uTime);
    float focusProfile = mix(0.7 + 0.6 * sq(bubbleQ), 1.0 - 0.9 * sq(bubbleQ), openingFocus);
    vec2 bubbleSample = p * focusProfile + offset * mix(0.35, 0.12, openingFocus);
    bubbleSample += vec2(0.025, 0.10) * uUnit * openingFocus;
    bubbleSample += (offset - neutralOffset) * openingFocus * 1.6;
    vec2 sourcePoint = mix(p + offset, bubbleSample, sphereFocus);
    vec4 ink = imageAt(uLogo, sourcePoint, uLogoBox * artworkScale * magnification);
    // Focus is inside the young dome, leaving clear glass between the enlarged
    // fragment and the rim. The aperture opens as the rest of the logo appears.
    ink *= mix(1.0, 1.0 - ease(0.72, 0.86, bubbleQ), openingFocus);
    // The rim is an optical aperture too. Giving each wavelength its own boundary
    // creates a red/yellow outer edge and cyan/blue inner edge without tinting the ink.
    float edgeShift = (s - 0.5) * uUnit * lensScale * 0.018 * uDispersion * chromaticScale;
    ink *= 1.0 - smoothstep(-0.8 / uDpr, 0.8 / uDpr, surfaceDistance - edgeShift);
    minCoverage = min(minCoverage, ink.a);
    maxCoverage = max(maxCoverage, ink.a);
    vec3 w = spectrum(s);
    color += ink.rgb * w;
    alpha += ink.a * (w.r + w.g + w.b);
    refractedCoverage += ink.a * w;
    weights += w;
  }
  color /= weights;
  refractedCoverage /= weights;
  // A coated glass shoulder has a cooler spectral response at a split image edge.
  // Coverage variance keeps solid areas and original-color artwork free of a tint.
  float coating = ease(-uUnit * lensScale * 0.022, 0.0, surfaceDistance);
  color.g *= 1.0 - 0.65 * coating * (maxCoverage - minCoverage);
  // The young curved face catches a violet interference fringe at internal ink
  // edges. Its outer lip stays cyan; opaque artwork keeps its original color.
  float youngFilm = (maxCoverage - minCoverage) * (1.0 - ease(0.19, 0.30, uTime));
  youngFilm *= 1.0 - ease(-uUnit * lensScale * 0.08, -uUnit * lensScale * 0.025, surfaceDistance);
  color.r += color.b * youngFilm * 0.80;
  color.b += color.r * youngFilm * 0.60;
  color.g *= 1.0 - youngFilm * 0.55;
  alpha /= weights.r + weights.g + weights.b;
  // This lift belongs to the image's edges, not a painted rainbow on the lens.
  float diffuse = max(dot(normal, normalize(vec3(-0.4, 0.6, 1.0))), 0.0);
  vec3 earlyWhite = mix(vec3(0.90, 0.93, 0.95), vec3(0.84, 0.86, 0.89), ease(0.21, 0.40, uTime));
  vec3 whiteBalance = mix(earlyWhite, vec3(0.87, 0.88, 0.885), ease(0.75, 1.22, uTime));
  color *= whiteBalance * ((0.90 + 0.10 * diffuse + glass * uCaustics * 0.04) * ((0.975 + 0.025 * sin(p.y / uUnit * PI)) * (1.0 + 0.09 * ease(0.75, 1.22, uTime) + 0.03 * (1.0 - ease(0.2, 0.5, uTime)))));
  return vec4(color, alpha);
}

vec4 iconLens(vec2 p) {
  float t = uTime;
  float settle = ease(0.0, 1.0, uSettle);
  float enter = ease(0.025, 0.16, t);
  vec4 source = imageAt(uLogo, p, uLogoBox * uArtScale);
  if (t > 1.58) return source * settle;
  if (enter < 0.001) return vec4(0.0);
  float shape = 2.0 + 3.0 * ease(0.29, 0.36, t);
  // The sphere appears quickly, then the glass continues expanding after the
  // corners have squared off. Completing both motions at once feels abrupt.
  float expand = enter * (0.64 + 0.41 * (1.0 - exp(-max(t - 0.16, 0.0) * 5.8)));
  float collapse = 1.0 - ease(1.33, 1.52, t);
  float lensScale = max(0.001, mix(expand * mix(0.48, 1.0, collapse), 1.0, settle));
  float halfSize = uUnit * 0.5 * lensScale;
  float radius = superRadius(p / halfSize, shape);
  float sd = (radius - 1.0) * halfSize;
  float aa = max(fwidth(sd), 0.65);
  float mask = (1.0 - smoothstep(-aa, aa, sd));
  float glass = (1.0 - ease(1.05, 1.4, t)) * collapse * (1.0 - settle);
  float shown = ease(0.12, 0.165, t) * (1.0 - ease(1.39, 1.53, t));
  // Nothing is drawn beyond the thin echo just outside the rim.
  if (sd > uUnit * 0.10) return vec4(0.0);
  vec2 outward = superNormal(p / halfSize, shape);
  // A flat center rolls into a thick, curved shoulder. The normal continuously bends
  // source rays into the plate and folds them at its rim, whatever the source image.
  vec2 radial = normalize(p + vec2(0.001));
  float diagonal = max(0.0, 2.0 * radial.x * radial.y);
  float shoulderStart = 0.6 + 0.18 * ease(0.66, 1.15, t) * (1.0 - diagonal) + 0.16 * ease(1.0, 1.22, t) * diagonal;
  float shoulder = ease(shoulderStart, 1.0, radius);
  float slope = (0.04 * radius + (0.85 + 0.2 * (1.0 - ease(0.28, 0.75, t))) * shoulder * shoulder) * glass * uDropStrength;
  // The early sphere is rounder and more strongly magnifying than the settled tile.
  slope += (1.0 - ease(0.18, 0.42, t)) * radius * 0.32 * uDropStrength;
  vec2 opticalDirection = normalize(mix(outward, normalize(p + vec2(0.001)), 0.95));
  // A mild astigmatic shoulder carries the image into opposite corners.
  float astigmatism = 0.8 + 0.4 * radial.x * radial.y;
  vec2 n = opticalDirection * slope * astigmatism * (1.0 - settle);
  vec4 ink = refractedLogo(p, n, lensScale, glass, 1.0, sd);
  float illumination = 0.5 + 0.5 * dot(outward, normalize(vec2(-0.5, 0.9)));
  vec3 inkCoverage = refractedCoverage;
  // A dark plate deepens toward its rim; a pale frosted plate stays nearly even.
  float plateLight = ease(0.3, 0.8, dot(uTile, vec3(0.299, 0.587, 0.114)));
  vec3 body = uTile * (mix(0.55, 0.96, plateLight) + mix(0.45, 0.04, plateLight) * (1.0 - min(radius, 1.0)));
  body += vec3(0.004, 0.007, 0.01) * bell(radius - 0.75, 0.5);
  vec3 color = ink.rgb + body * (1.0 - inkCoverage) * glass * uTileEnabled;
  // On a pale page the plate's coverage follows the glass exactly, so its color
  // keeps the same hue while it melts into the page instead of dipping and
  // flaring. A dark page keeps its original fade.
  float plateFade = mix((1.0 - ease(1.08, 1.36, t)) * (1.0 - settle), glass, uPageLight);
  float alpha = max(ink.a, plateFade * uTileEnabled);
  // A broad studio light is reflected by the curved front face of the sphere.
  // It fades as the face flattens, revealing the dark glass beneath the artwork.
  vec2 spherePoint = p / halfSize;
  vec3 sphereNormal = normalize(vec3(spherePoint, sqrt(max(0.001, 1.0 - dot(spherePoint, spherePoint)))));
  vec3 sphereRay = reflect(vec3(0.0, 0.0, -1.0), sphereNormal);
  float lightTravel = mix(-0.12, 0.20, ease(0.13, 0.30, t));
  float softbox = bell(sphereRay.x - lightTravel, 1.05) * bell(sphereRay.y - 0.56, 0.52);
  float sphericalLight = softbox * (1.0 - ease(0.245, 0.36, t)) * glass * uHighlights * 0.70;
  color += vec3(0.50, 0.61, 0.72) * sphericalLight * (1.0 - ink.a * 0.85);
  alpha = max(alpha, sphericalLight);

  // Thin nested surface reflections, with asymmetric key light and a dim cool fill.
  // Material coordinates stay fixed during expansion and deterministic seeking.
  float arc = atan(p.y, p.x) * uUnit * 0.5;
  float grainScale = uUnit * 0.03;
  float developed = ease(0.23, 0.48, t);
  float cornerExposure = ease(0.12, 0.8, -2.0 * radial.x * radial.y);
  float reliefScale = lensScale * developed * (0.2 + 0.8 * cornerExposure);
  float sharedWarp = edgeWarp(arc, 0.0) * reliefScale;
  float rimSd = sd + sharedWarp;
  float innerSd = sd + sharedWarp * 0.7 + edgeWarp(arc, 41.0) * reliefScale * 0.4;
  float inner2Sd = sd + sharedWarp * 0.45 + edgeWarp(arc, 83.0) * reliefScale * 0.6;
  float thickness = 0.75 + 0.5 * contourNoise(arc / (uUnit * 0.013) + 13.0);
  // The bright rim line is a liquid edge, not an etched one. Its segments shimmer
  // in place and it bobs slightly across the edge as standing waves, so nothing
  // slides along it; its glints move as separate particles.
  float around = arc / (uUnit * 0.5);
  float rimBob = uUnit * 0.0025 * developed * (0.6 * sin(7.0 * around + 0.4) * sin(t * 6.3 + 1.0) + 0.4 * sin(3.0 * around + 2.0) * sin(t * 4.1));
  float rimLineSd = rimSd + rimBob;
  float shimmer = mix(contourNoise(arc / grainScale), contourNoise(arc / grainScale + 211.0), 0.5 + 0.5 * sin(t * 5.0 + 6.2832 * contourNoise(arc / (grainScale * 3.0) + 7.0)));
  float rim = bell(rimLineSd + uUnit * 0.002, uUnit * 0.0018 * thickness + aa * 0.3) * (0.6 + 0.8 * shimmer);
  // The nested lines nearer the center clear first; the outer rim lingers.
  float centerFade = 1.0 - ease(0.62, 0.92, t);
  float inner = centerFade * bell(innerSd + uUnit * 0.012, uUnit * 0.0025 / thickness + aa * 0.2) * (0.55 + 0.9 * contourNoise(arc / grainScale + 41.0));
  float inner2 = centerFade * bell(inner2Sd + uUnit * 0.022, uUnit * 0.0018 * thickness + aa * 0.1) * (0.5 + contourNoise(arc / grainScale + 83.0));
  float key = pow(illumination, 5.0);
  float rimVisibility = 1.0 - 0.55 * ease(0.75, 1.22, t);
  float lowerRight = pow(0.5 + 0.5 * dot(outward, normalize(vec2(0.8, -0.6))), 5.0);
  lowerRight *= ease(-0.25, -0.05, p.x / uUnit) * (1.0 - ease(-0.22, -0.02, p.y / uUnit));
  // Two separated walls, not two strokes at the same edge. The back wall is
  // inset by 7% of a tile edge, leaving a curved transmission channel between them.
  vec2 insetPoint = p - vec2(0.002, -0.002) * uUnit * lensScale;
  float wallGap = (0.055 - 0.023 * ease(0.18, 0.34, t)) + 0.050 * ease(0.14, 0.50, t) * (1.0 - 0.5 * ease(0.80, 1.22, t));
  float insetHalf = halfSize - wallGap * uUnit * lensScale;
  // The back face rounds off slightly later, giving the sphere and tile two visible
  // moving boundaries rather than scaling a second outline with the front face.
  float insetShape = max(2.0, 2.0 + (shape - 2.0) * ease(0.20, 0.55, t) - 0.45);
  float insetRadius = superRadius(insetPoint / insetHalf, insetShape);
  float insetSd = (insetRadius - 1.0) * insetHalf + sharedWarp * 0.4 + edgeWarp(arc, 151.0) * reliefScale * 0.7;
  float channel = ease(-uUnit * 0.008, uUnit * 0.025, insetSd) * mask;
  float echoMask = channel * lowerRight * glass * (1.0 - settle);
  vec3 backFace = vec3(0.0);
  float logoLight = 0.0;
  if (echoMask * uRelief > 0.002) {
    vec2 backNormal = normalize(mix(superNormal(insetPoint / insetHalf, insetShape), radial, 0.6));
    float backSlope = ease(0.90, 1.10, insetRadius) * 1.55 * glass * uDropStrength;
    // Sample a separate transmitted image across the whole bevel channel. Its
    // changing normal pulls a second, chromatically split copy of the logo into it.
    // A thick rim magnifies whatever lies closest behind it. Walk inward from the
    // wall until the ray meets ink and refract from there, so every logo lights
    // this corner from its own nearest shape; a logo with ink at the corner (like
    // X) is found on the first step and keeps its direct image.
    // The search starts where the wall already sends the ray, not at the wall.
    vec2 inward = -normalize(insetPoint + vec2(0.001));
    vec3 backRay = refract(vec3(0.0, 0.0, -1.0), normalize(vec3(backNormal * backSlope, 1.0)), 1.0 / 1.38);
    vec2 landing = insetPoint + backRay.xy / max(-backRay.z, 0.25) * uUnit * uDepth * 0.80 * lensScale;
    float reach = 0.0;
    for (int i = 0; i < 20; i++) {
      reach = float(i) * uUnit * lensScale * 0.03;
      if (imageAt(uLogo, landing + inward * reach, uLogoBox * uArtScale).a > 0.2) break;
    }
    vec4 backImage = refractedLogo(insetPoint + inward * reach, backNormal * backSlope, lensScale, glass, 1.6, sd);
    backFace = backImage.rgb * vec3(0.03, 0.65, 1.0) * echoMask * 0.48 * uRelief * (1.0 - 0.70 * ease(0.75, 1.12, t));
    // The lower-right light is this same refracted image, not a fixed lamp: it
    // only lights where the back wall bends logo ink into the bevel, and takes
    // that ink's shape as the logo or the refraction changes.
    logoLight = ease(0.05, 0.6, backImage.a);
  }
  lowerRight *= logoLight;
  float wallRim = centerFade * bell(insetSd, uUnit * 0.0028 + aa * 0.25);
  float wallShadow = centerFade * bell(insetSd + uUnit * 0.008, uUnit * 0.005);
  vec2 pores = vec2(0.0);
  if (developed * cornerExposure > 0.001) {
    pores = glassPores(arc, (rimSd + uUnit * 0.003) / lensScale, 313.0);
    pores += glassPores(arc, insetSd / lensScale, 617.0) * 0.6 * centerFade;
    pores += glassPores(arc, (inner2Sd + uUnit * 0.027) / lensScale, 919.0) * 0.8 * centerFade;
    pores *= developed * cornerExposure;
  }
  float angle = atan(p.y, p.x);
  float upperSliver = 0.12 + 1.15 * bell(angle - 2.18, 0.32);
  float lowerSliver = 0.12 + 1.10 * bell(angle + 0.85, 0.30);
  // The inner wall holds a brighter line around the upper-left and lower-right
  // corners, whatever the key light does. Each arc runs farther along the top or
  // bottom edge than down the side: its window is wider toward the horizontal.
  float tlOffset = angle - 0.75 * PI;
  float brOffset = angle + 0.25 * PI;
  float tlReach = tlOffset < 0.0 ? 0.65 : 0.42;
  float brReach = brOffset < 0.0 ? 0.65 : 0.42;
  float wallCorner = max(
    1.0 - ease(0.6 * tlReach, tlReach, abs(tlOffset)),
    1.0 - ease(0.6 * brReach, brReach, abs(brOffset))
  );
  vec3 insetLight = vec3(0.60, 0.78, 0.91) * wallRim * (key * key * 0.8 * upperSliver + lowerRight * lowerRight * 0.75 * lowerSliver + 0.005 + 0.35 * wallCorner * uInnerWallFocus);
  // The caustic follows the curved channel: a white-cyan core with blue lips, streaked
  // by the glass it passes through.
  // Filaments run parallel to the edge; their brightness drifts slowly along it.
  float drift = 0.7 + 0.6 * contourNoise(arc / (uUnit * 0.09) + 7.0);
  float filaments = (bell(innerSd + uUnit * 0.021, uUnit * 0.0035 * thickness) * 0.9 + bell(inner2Sd + uUnit * 0.028, uUnit * 0.004 / thickness) * 0.7) * centerFade + bell(rimSd + uUnit * 0.035, uUnit * 0.003 * thickness) * 0.5;
  vec3 lowerRelief = (
    vec3(0.03, 0.32, 1.0) * bell(sd + uUnit * 0.038, uUnit * 0.022 + aa * 0.2) * 0.55 +
    vec3(0.22, 0.62, 1.0) * bell(sd + uUnit * 0.027, uUnit * 0.012 + aa * 0.1) * 0.7 +
    vec3(0.75, 0.97, 1.0) * filaments * 1.35
  ) * drift * lowerRight * glass * uHighlights * uRelief * (1.0 - 0.85 * ease(0.6, 1.0, t)) * (1.0 - settle);
  lowerRelief *= 1.0 - pores.x * 0.22;
  lowerRelief += vec3(0.45, 0.85, 1.0) * pores.y * 0.10 * lowerRight * glass * uHighlights * uRelief * (1.0 - settle);
  // With focus at 0 the inner wall is drawn whole. Raising it keeps the wall on a
  // pale plate to its strongly lit segments and its upper-left and lower-right
  // arcs, since there its weak light clips to white and its shadow would
  // otherwise outline the full contour.
  float wallLit = clamp(key * key * 0.8 * upperSliver + lowerRight * lowerRight * 0.75 * lowerSliver, 0.0, 1.0);
  float wallGate = mix(1.0, max(ease(0.2, 0.7, wallLit), wallCorner), uPageLight * uInnerWallFocus);
  color *= 1.0 - wallShadow * wallGate * uRelief * 0.12 * (1.0 - ink.a);
  color += backFace + lowerRelief + insetLight * wallGate * glass * uHighlights * uRelief * (1.0 - ink.a) * mix(rimVisibility, 0.9, key);
  alpha = max(alpha, max(lowerRelief.r, max(lowerRelief.g, lowerRelief.b)));
  float rimLight = rim * (0.07 + key * 0.55) + inner * (0.025 + key * 0.16) + inner2 * 0.025;
  // Micro-bubbles along the lit edges, strongest where the key and the lower fill land.
  float speckSize = max(uUnit * 0.0042, 0.8 / uDpr);
  float bubbles = driftingSpecks(arc, rimLineSd + uUnit * 0.002, speckSize, 0.0, t) * 0.9;
  bubbles += specks(arc, innerSd + uUnit * 0.012, speckSize * 0.8, 97.0) * 0.6 * centerFade;
  bubbles += specks(arc, insetSd, speckSize * 0.9, 191.0) * 0.5 * centerFade;
  rimLight += bubbles * (0.04 + key * 0.5 + lowerRight * 0.45);
  rimLight = rimLight * (1.0 - pores.x * 0.35) + pores.y * (key * 0.16 + lowerRight * 0.12);
  vec3 spectralRim = vec3(0.0);
  vec3 spectralWeights = vec3(0.0);
  for (int i = 0; i < BANDS; i++) {
    float s = float(i) / float(BANDS - 1);
    vec3 w = spectrum(s);
    spectralRim += w * bell(rimSd + (s - 0.5) * uUnit * 0.011 * uDispersion + uUnit * 0.003, uUnit * 0.002 * thickness);
    spectralWeights += w;
  }
  spectralRim /= spectralWeights;
  vec3 reflection = (vec3(0.6, 0.76, 0.9) * rimLight * 1.15 + spectralRim * (0.02 + ink.a * 0.32)) * uHighlights * glass * mix(rimVisibility, 1.2, key);
  float sphericalRim = (
    bell(sd + uUnit * lensScale * 0.008, uUnit * lensScale * 0.009) * 0.60 +
    bell(insetSd, uUnit * lensScale * 0.008) * 0.40
  ) * (0.25 + 0.75 * abs(outward.y)) * (1.0 - ease(0.235, 0.34, t));
  reflection += vec3(0.65, 0.80, 0.90) * sphericalRim * 1.4 * uHighlights * glass;
  float cyanKey = pow(max(0.0, -outward.x), 8.0) * (1.0 - ease(0.235, 0.34, t));
  float cyanLip = bell(sd + uUnit * lensScale * 0.020, uUnit * lensScale * 0.009);
  cyanLip += bell(insetSd, uUnit * lensScale * 0.005) * 0.35;
  reflection += vec3(0.015, 0.68, 1.0) * cyanLip * cyanKey * glass * uHighlights * 0.85;
  // The young drop is full of scattered light: a milky glow behind the artwork.
  float youth = 1.0 - ease(0.25, 0.37, t);
  reflection += vec3(0.78, 0.84, 0.9) * youth * 0.07 * (0.5 + 0.5 * radius) * (1.0 - ink.a) * glass;
  vec3 film = mix(vec3(0.32, 0.0, 0.20), vec3(0.32, 0.08, 0.02), ease(0.75, 1.12, t)) * bell(sd + uUnit * 0.001, uUnit * 0.002) * ink.a * glass * uHighlights;
  color += reflection + film;
  alpha = max(alpha, max(reflection.r, max(reflection.g, reflection.b)));
  vec4 result = vec4(color * mask, alpha * mask);

  // Reflections outside the body are faint glass echoes, not solid colored outlines.
  float outer = bell(rimSd - uUnit * 0.012, uUnit * 0.0028 * thickness) * (0.04 + key * 0.2) * (0.5 + contourNoise(arc / grainScale + 131.0));
  outer += specks(arc, rimSd - uUnit * 0.012, speckSize, 277.0) * (0.03 + key * 0.3 + lowerRight * 0.25);
  // A single wave leaves the rim as the plate forms, stays close to it and fades.
  float waveAge = ease(0.36, 1.1, t);
  float wave = bell(sd - uUnit * (0.014 + 0.03 * waveAge), uUnit * 0.004 + aa * 0.3) * 0.05 * ease(0.34, 0.42, t) * (1.0 - waveAge);
  // The echo is lit through the plate, so it can carry the plate's hue and, on a
  // dark page, stay quieter than the rim it echoes.
  vec3 echoTint = mix(vec3(0.43, 0.62, 0.79), uTile + (1.0 - uTile) * 0.4, 0.5 * uEchoTint);
  float echoLevel = mix(1.0, mix(0.6, 1.0, uPageLight), uEchoTint);
  // The echo line runs around all four sides. The wave stays faint on the left
  // and right, where a full ring would read as streaks beside the glass.
  float waveSides = mix(1.0, 0.10, ease(0.25, 0.80, abs(outward.x)));
  vec3 ghost = (echoTint + ink.rgb * 0.6) * (outer + wave * waveSides) * glass * uHighlights * rimVisibility * echoLevel;
  float exterior = max(ghost.r, max(ghost.g, ghost.b)) * 1.8;
  result.rgb += exteriorColor(ghost * 1.8, exterior);
  result.a = max(result.a, exterior);
  // Resolve directly to the source, retaining its full size after the glass fades.
  return mix(result * shown, source, settle);
}

// The second drop is a radial lens with spherical aberration. Its core magnifies the
// wordmark (inverting it while the drop is tall), so between center and edge the image
// runs through focus and floods the drop; across its rim a thin ring of the image is
// stretched outward, and ripples crossing the rim repeat that ring in bands.
vec4 wordmarkLens(vec2 p) {
  float t = uTime;
  if (uWordmarkEnabled < 0.5) return vec4(0.0);
  if (t < 1.46) return vec4(0.0);
  if (t >= 3.3) return imageAt(uText, p, uTextBox);
  float radius = max(uDrop.x, 1.0);
  float r = length(p);
  if (r > radius + uUnit * 0.6) return vec4(0.0);
  vec2 outward = p / max(r, 0.001);
  float q = r / radius;
  float aa = 1.0 / uDpr;
  float edge = radius - r;
  float mask = ease(-aa, aa, edge);
  float young = 1.0 - ease(1.72, 2.02, t);

  float core = min(uDrop.y, radius);
  float coreQ = r / max(core, 1.0);
  float edgeLanding = core / max(uDropLens.x, 0.01);
  float center = uDrop.w;
  float landing = r < core
    ? edgeLanding * coreQ * (center + (1.0 - center) * pow(coreQ, uDropLens.y))
    : edgeLanding + (r - core) * uDrop.z;
  float rimZone = ease(core * 0.9, core, r);
  float k = 2.0 * PI / max(uDropLens.w, 1.0);
  landing += uDropLens.z * sin(k * r - uDropWave.x) * ease(0.0, uDropLens.w, r) * mix(uDropWave.y, 1.0, rimZone);
  vec2 bend = outward * (landing - r);
  float spread = uDropWave.z * uDispersion * (0.15 + 0.85 * rimZone);

  vec3 color = vec3(0.0);
  vec3 weights = vec3(0.0);
  float alpha = 0.0;
  float opacity = ease(1.46, 1.49, t);
  for (int i = 0; i < BANDS; i++) {
    float s = float(i) / float(BANDS - 1);
    vec2 source = p + bend * (1.0 + spread * (s - 0.5));
    vec4 ink = imageAt(uText, source, uTextBox);
    vec3 w = spectrum(s);
    color += ink.rgb * w;
    alpha += ink.a * (w.r + w.g + w.b);
    weights += w;
  }
  color /= weights;
  alpha /= weights.r + weights.g + weights.b;
  color *= 1.0 + uCaustics * bell(edge, uUnit * 0.06) * 0.15;
  color *= mask;
  alpha *= mask;
  // A fresh drop is full of scattered light: overexposed ink, a milky body and a cool
  // spill around it, all fading as it flattens.
  float fresh = 1.0 - ease(1.62, 1.95, t);
  color = min(color * (1.0 + 0.6 * fresh), vec3(1.0));
  float milk = mask * fresh * 0.30 * (0.6 + 0.4 * q) * uCaustics;
  color += vec3(0.75, 0.82, 0.9) * milk * (1.0 - alpha);
  float spill = exp(-max(r - radius, 0.0) / (uUnit * 0.17)) * (1.0 - mask) * fresh * 0.12;
  // As it spreads, the drop keeps a faint blue haze that dies with the waves.
  spill += exp(-max(r - radius, 0.0) / (uUnit * 0.4)) * (1.0 - fresh) * 0.035 * exp(-max(t - 1.95, 0.0) / 0.45) * (1.0 - ease(2.8, 3.1, t));
  color += vec3(0.32, 0.6, 1.0) * spill;
  alpha = max(alpha, max(milk, spill));
  vec3 sphereNormal = normalize(vec3(p / radius, sqrt(max(0.005, 1.0 - q * q))));
  vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), sphereNormal);
  float softbox = bell(reflected.x + 0.3, 0.2) * bell(reflected.y - 0.55, 0.15);
  float smallLight = bell(reflected.x - 0.25, 0.14) * bell(reflected.y - 0.65, 0.08);
  float broadLight = bell(reflected.x + 0.35, 0.65) * bell(reflected.y - 0.6, 0.45);
  float surface = (softbox * 0.8 + smallLight * 0.6 + broadLight * 0.22) * young * uHighlights * mask;
  color += vec3(0.85, 0.95, 1.0) * surface;
  alpha = max(alpha, surface);

  float key = pow(0.5 + 0.5 * dot(outward, normalize(vec2(-0.6, 0.8))), 7.0);
  float rings = 0.0;
  for (int i = 0; i < 4; i++) {
    float j = float(i);
    float ringRadius = radius + (j - 1.0) * uUnit * 0.022 * (1.0 + 0.55 * ease(1.8, 3.1, t));
    rings += bell(r - ringRadius, uUnit * (0.003 + j * 0.001)) * (0.11 / (1.0 + j));
  }
  float age = max(0.0, t - 1.46);
  float fade = exp(-age / max(uDecay, 0.1)) * (1.0 - ease(2.65, 3.3, t));
  // Only the drop's own nested rims are lit; no broad glow or crest travels out
  // beyond it.
  float sideLight = pow(abs(outward.x), 10.0) * mix(1.0, 0.72, step(0.0, p.x));
  vec3 reflection = vec3(0.4, 0.62, 0.79) * rings * (0.3 + key * 2.0 + sideLight * 1.8) * fade * uHighlights;
  color += reflection;
  alpha = max(alpha, max(reflection.r, max(reflection.g, reflection.b)));
  return vec4(color, alpha) * opacity;
}

void main() {
  vec2 p = (gl_FragCoord.xy - uResolution * 0.5) / uDpr;
  vec4 icon = iconLens(p);
  vec4 wordmark = wordmarkLens(p);
  vec4 result = wordmark + icon * (1.0 - wordmark.a);
  // RGB and alpha use the same coverage; preserve saturated spectral fringes when
  // compositing onto transparent or colored backgrounds.
  result.a = clamp(max(result.a, max(result.r, max(result.g, result.b))), 0.0, 1.0);
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(clamp(result.rgb + dither * result.a, vec3(0.0), vec3(result.a)), result.a);
}
`;

// The photographic finish is independent of the logo and uses premultiplied coverage.
export const liquidGlassLogoComposite = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uUnit;
uniform float uSettle;
uniform float uBloom;
uniform float uTime;
uniform float uFinish;
uniform float uPageLight;
out vec4 outColor;

// Filter premultiplied color and coverage together. The footprint is in CSS
// pixels, so the glass has the same optical softness on normal and retina screens.
vec4 softenedWaves(vec2 uv, float lod) {
  vec2 d = vec2(uDpr * 0.90) / uResolution;
  vec4 blurred = textureLod(uScene, uv, lod) * 0.25;
  blurred += textureLod(uScene, uv + vec2(d.x, 0.0), lod) * 0.125;
  blurred += textureLod(uScene, uv - vec2(d.x, 0.0), lod) * 0.125;
  blurred += textureLod(uScene, uv + vec2(0.0, d.y), lod) * 0.125;
  blurred += textureLod(uScene, uv - vec2(0.0, d.y), lod) * 0.125;
  blurred += textureLod(uScene, uv + d, lod) * 0.0625;
  blurred += textureLod(uScene, uv - d, lod) * 0.0625;
  blurred += textureLod(uScene, uv + vec2(d.x, -d.y), lod) * 0.0625;
  blurred += textureLod(uScene, uv + vec2(-d.x, d.y), lod) * 0.0625;
  return blurred;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 base = textureLod(uScene, uv, 0.0);
  float offset = log2(max(uDpr, 0.5));
  // Only the exterior liquid is softened. The artwork and its final resting
  // silhouette retain their native sharpness and original coverage.
  float wavePhase = smoothstep(0.29, 0.41, uTime) * (1.0 - smoothstep(1.25, 1.50, uTime));
  float waveMask = 0.0;
  if (wavePhase > 0.001) {
    float enter = smoothstep(0.025, 0.16, uTime);
    float expand = enter * (0.64 + 0.41 * (1.0 - exp(-max(uTime - 0.16, 0.0) * 5.8)));
    float collapse = 1.0 - smoothstep(1.33, 1.52, uTime);
    float lensScale = mix(expand * mix(0.48, 1.0, collapse), 1.0, smoothstep(0.0, 1.0, uSettle));
    float halfSize = max(0.001, uUnit * lensScale * 0.5);
    float shape = 2.0 + 3.0 * smoothstep(0.29, 0.36, uTime);
    vec2 p = abs((gl_FragCoord.xy - uResolution * 0.5) / uDpr) / halfSize;
    float radius = pow(pow(p.x, shape) + pow(p.y, shape), 1.0 / shape);
    float distance = (radius - 1.0) * halfSize;
    waveMask = smoothstep(0.0, max(0.75, uUnit * 0.004), distance) * wavePhase;
    if (waveMask > 0.001) {
      base = mix(base, softenedWaves(uv, max(0.0, offset + 0.15)), waveMask * 0.94);
    }
  }
  vec3 diffused = textureLod(uScene, uv, offset + 2.5).rgb * 0.50;
  diffused += textureLod(uScene, uv, offset + 4.1).rgb * 0.32;
  diffused += textureLod(uScene, uv, offset + 5.4).rgb * 0.18;
  float light = max(base.r, max(base.g, base.b));
  // Bright ink retains its calibrated color; light diffuses into its surroundings.
  float effect = 1.0 - smoothstep(0.0, 1.0, uFinish);
  // Bloom is light spilling onto a dark page. A pale page already holds that
  // light, and adding it where the plate thins out reads as a flash.
  vec3 glow = diffused * uBloom * 0.20 * (1.0 - min(1.0, light * 1.2)) * effect * (1.0 - uPageLight);
  float alpha = clamp(max(base.a, max(glow.r, max(glow.g, glow.b))), 0.0, 1.0);
  float grain = fract(sin(dot(gl_FragCoord.xy + floor(uTime * 24.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  vec3 color = base.rgb + glow + grain * 0.009 * base.a * clamp(light * 3.0 + 0.05, 0.05, 1.0) * effect * (1.0 - waveMask * 0.85);
  outColor = vec4(clamp(color, vec3(0.0), vec3(alpha)), alpha);
}
`;
