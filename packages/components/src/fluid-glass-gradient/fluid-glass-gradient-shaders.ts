// Vendored psrdnoise2.glsl, unchanged except for line endings.
// Upstream: https://raw.githubusercontent.com/stegu/psrdnoise/b169834ae3aaeb90518c263179457e4c314a8d9c/src/psrdnoise2.glsl
// Copyright and complete MIT license are included in the GLSL below.
export const licensedNoise = `//
// psrdnoise2.glsl
//
// Authors: Stefan Gustavson (stefan.gustavson@gmail.com)
// and Ian McEwan (ijm567@gmail.com)
// Version 2021-12-02, published under the MIT license (see below)
//
// Copyright (c) 2021 Stefan Gustavson and Ian McEwan.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.
//

//
// Periodic (tiling) 2-D simplex noise (hexagonal lattice gradient noise)
// with rotating gradients and analytic derivatives.
//
// This is (yet) another variation on simplex noise. Unlike previous
// implementations, the grid is axis-aligned and slightly stretched in
// the y direction to permit rectangular tiling.
// The noise pattern can be made to tile seamlessly to any integer period
// in x and any even integer period in y. Odd periods may be specified
// for y, but then the actual tiling period will be twice that number.
//
// The rotating gradients give the appearance of a swirling motion, and
// can serve a similar purpose for animation as motion along z in 3-D
// noise. The rotating gradients in conjunction with the analytic
// derivatives allow for "flow noise" effects as presented by Ken
// Perlin and Fabrice Neyret.
//


//
// 2-D tiling simplex noise with rotating gradients and analytical derivative.
// "vec2 x" is the point (x,y) to evaluate,
// "vec2 period" is the desired periods along x and y, and
// "float alpha" is the rotation (in radians) for the swirling gradients.
// The "float" return value is the noise value, and
// the "out vec2 gradient" argument returns the x,y partial derivatives.
//
// Setting either period to 0.0 or a negative value will skip the wrapping
// along that dimension. Setting both periods to 0.0 makes the function
// execute about 15% faster.
//
// Not using the return value for the gradient will make the compiler
// eliminate the code for computing it. This speeds up the function
// by 10-15%.
//
// The rotation by alpha uses one single addition. Unlike the 3-D version
// of psrdnoise(), setting alpha == 0.0 gives no speedup.
//
float psrdnoise(vec2 x, vec2 period, float alpha, out vec2 gradient) {

	// Transform to simplex space (axis-aligned hexagonal grid)
	vec2 uv = vec2(x.x + x.y*0.5, x.y);

	// Determine which simplex we're in, with i0 being the "base"
	vec2 i0 = floor(uv);
	vec2 f0 = fract(uv);
	// o1 is the offset in simplex space to the second corner
	float cmp = step(f0.y, f0.x);
	vec2 o1 = vec2(cmp, 1.0-cmp);

	// Enumerate the remaining simplex corners
	vec2 i1 = i0 + o1;
	vec2 i2 = i0 + vec2(1.0, 1.0);

	// Transform corners back to texture space
	vec2 v0 = vec2(i0.x - i0.y * 0.5, i0.y);
	vec2 v1 = vec2(v0.x + o1.x - o1.y * 0.5, v0.y + o1.y);
	vec2 v2 = vec2(v0.x + 0.5, v0.y + 1.0);

	// Compute vectors from v to each of the simplex corners
	vec2 x0 = x - v0;
	vec2 x1 = x - v1;
	vec2 x2 = x - v2;

	vec3 iu, iv;
	vec3 xw, yw;

	// Wrap to periods, if desired
	if(any(greaterThan(period, vec2(0.0)))) {
		xw = vec3(v0.x, v1.x, v2.x);
		yw = vec3(v0.y, v1.y, v2.y);
		if(period.x > 0.0)
			xw = mod(vec3(v0.x, v1.x, v2.x), period.x);
		if(period.y > 0.0)
			yw = mod(vec3(v0.y, v1.y, v2.y), period.y);
		// Transform back to simplex space and fix rounding errors
		iu = floor(xw + 0.5*yw + 0.5);
		iv = floor(yw + 0.5);
	} else { // Shortcut if neither x nor y periods are specified
		iu = vec3(i0.x, i1.x, i2.x);
		iv = vec3(i0.y, i1.y, i2.y);
	}

	// Compute one pseudo-random hash value for each corner
	vec3 hash = mod(iu, 289.0);
	hash = mod((hash*51.0 + 2.0)*hash + iv, 289.0);
	hash = mod((hash*34.0 + 10.0)*hash, 289.0);

	// Pick a pseudo-random angle and add the desired rotation
	vec3 psi = hash * 0.07482 + alpha;
	vec3 gx = cos(psi);
	vec3 gy = sin(psi);

	// Reorganize for dot products below
	vec2 g0 = vec2(gx.x,gy.x);
	vec2 g1 = vec2(gx.y,gy.y);
	vec2 g2 = vec2(gx.z,gy.z);

	// Radial decay with distance from each simplex corner
	vec3 w = 0.8 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2));
	w = max(w, 0.0);
	vec3 w2 = w * w;
	vec3 w4 = w2 * w2;

	// The value of the linear ramp from each of the corners
	vec3 gdotx = vec3(dot(g0, x0), dot(g1, x1), dot(g2, x2));

	// Multiply by the radial decay and sum up the noise value
	float n = dot(w4, gdotx);

	// Compute the first order partial derivatives
	vec3 w3 = w2 * w;
	vec3 dw = -8.0 * w3 * gdotx;
	vec2 dn0 = w4.x * g0 + dw.x * x0;
	vec2 dn1 = w4.y * g1 + dw.y * x1;
	vec2 dn2 = w4.z * g2 + dw.z * x2;
	gradient = 10.9 * (dn0 + dn1 + dn2);

	// Scale the return value to fit nicely into the range [-1,1]
	return 10.9 * n;
}
`;

// Static procedural motes: seeded centers and Gaussian footprints.
// Profile values describe cell spacing and radius in CSS pixels at size 1,
// and exposure gain. Only the underlying pigment brightness changes exposure.
export const filmGrainShader = `
const float fullTurn = 6.28318530718;
const float hashResolution = 4096.;

struct MoteProfile {
  float spacingPx;
  float radiusPx;
  float exposureGain;
};

MoteProfile moteProfile(float style) {
  if (style < .5) return MoteProfile(1.35, .27, .7);
  if (style < 1.5) return MoteProfile(4., .72, .65);
  return MoteProfile(2.5, .5, .9);
}

vec3 moteRandom(vec2 cell, float seed) {
  // Irrational axis strides separate the lattice coordinates. The power of
  // two fixes the sampling precision.
  float phase = dot(cell, vec2(sqrt(2.), sqrt(3.))) + seed * sqrt(5.);
  return fract(sin(phase + vec3(0., 1., 2.)) * hashResolution);
}

float sampleFilmGrain(vec2 pixels, float seed, float style, float size, float pixelRatio) {
  vec2 cssPixels = pixels / pixelRatio;
  if (style > 2.5) {
    // Monochrome uses centered cell noise with no brightness offset.
    float phase = fullTurn * moteRandom(floor(cssPixels / size), seed).z;
    return .5 * sin(phase);
  }
  MoteProfile profile = moteProfile(style);
  float cellSpan = size * profile.spacingPx;
  float radius = profile.radiusPx / profile.spacingPx;
  vec2 point = cssPixels / cellSpan;
  vec2 home = floor(point);
  float exposure = 0.;
  // Adjacent cells contribute through their Gaussian footprints without seams.
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = home + vec2(float(x), float(y));
      vec3 random = moteRandom(cell, seed);
      vec2 center = cell + random.xy;
      vec2 offset = point - center;
      float footprint = exp(-dot(offset, offset) / (2. * radius * radius));
      // Exponential exposure distributes most energy into sparse bright cores.
      float peak = -log(max(1. / hashResolution, 1. - random.z));
      exposure += footprint * peak;
    }
  }
  return profile.exposureGain * exposure;
}
`;

// Grain-only fragment pass.
export const grainCacheFragment = `
precision highp float;
uniform float uSalt, uGrainMode, uFleckSpan, uPixelScale;
${filmGrainShader}
void main() {
  float fleck = sampleFilmGrain(gl_FragCoord.xy,
    uSalt, uGrainMode, uFleckSpan, uPixelScale);
  gl_FragColor = vec4(fleck, 0., 0., 1.);
}`;

export const streamVertex = `
attribute vec2 aSpan;
varying vec2 vSheet;
void main() {
  vSheet = aSpan * .5 + .5;
  gl_Position = vec4(aSpan, 0., 1.);
}`;

// A height field shapes a transparent glass surface over the flowing palette.
export const fluidGlassShaderCore = `
#ifdef USE_GLASS_DERIVATIVES
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
varying vec2 vSheet;
uniform vec2 uSpan;
uniform float uElapsed, uWarpElapsed, uZoom, uSpotSize, uBend, uTwist, uEase, uDistribution;
uniform float uClusterCount, uClusterIntensity, uClusterSize;
uniform float uRelief, uRefraction, uRoughness;
uniform float uReliefFade, uReliefFadeSide, uReliefFadeAmount, uReliefFadeWidth;
uniform float uReflection, uCaustics, uDispersion;
uniform float uFleck, uFleckSpan, uSalt, uPixelScale;
uniform float uFlowType, uGrainMode, uPointerActive;
uniform vec2 uPointer;
uniform vec3 uBase, uTintA, uTintB, uTintC;
#ifdef USE_GRAIN_CACHE
uniform highp sampler2D uGrainCache;
#endif

${licensedNoise}
${filmGrainShader}

vec2 seedPosition(float seed) {
  return vec2(seed * 2.17, seed * -1.43);
}

// A closed cycle keeps position and velocity continuous at the seam.
const float morphRadiansPerSecond = .02;
float morphPhase(float time) {
  return mod(time, fullTurn / morphRadiansPerSecond) * morphRadiansPerSecond;
}

float pigmentPhase(float time) {
  return uFlowType < .5 ? morphPhase(time) : time * .06;
}

// Centered samples keep cluster directions continuous across noise cells.
float clusterPotential(vec2 position, float phase) {
  vec2 unused;
  return psrdnoise(position, vec2(0.), phase, unused);
}

float clusterFrequency();

// Cluster curls share the pigment seed and cycle. Normalize travel by their
// spacing so broader coverage keeps the same deformation within each cluster.
vec2 clusterDeformation(vec2 position, float time) {
  if (uClusterCount <= 0. || uClusterIntensity <= 0. || uBend <= 0.) return position;
  float frequency = clusterFrequency();
  // A closed orbit carries concentrations through the pigment field.
  float phase = pigmentPhase(time);
  vec2 transport = uFlowType < .5
    ? .28 * vec2(cos(phase) - 1., sin(phase)) : vec2(0.);
  vec2 p = frequency * position + seedPosition(uSalt) + vec2(-7., 3.) + transport;
  float angle = uSalt * .1435 + phase;
  float field = clusterPotential(p, angle);
  const float footprint = .02;
  vec2 gradient = vec2(
    clusterPotential(p + vec2(footprint, 0.), angle) - clusterPotential(p - vec2(footprint, 0.), angle),
    clusterPotential(p + vec2(0., footprint), angle) - clusterPotential(p - vec2(0., footprint), angle)
  ) / (2. * footprint);
  float concentration = smoothstep(-.05, .65, field);
  vec2 curl = vec2(gradient.y, -gradient.x) / sqrt(1. + dot(gradient, gradient));
  float reach = .24 * uBend / sqrt(1. + .12 * uBend * uBend);
  float amount = smoothstep(0., 1., uClusterCount) * uClusterIntensity;
  return position + amount * reach * concentration * curl / frequency;
}

// Each shear varies perpendicular to its direction, keeping its determinant at one.
vec2 openDeformation(vec2 position, float strength) {
  vec2 unused;
  vec2 mapped = position;
  vec2 seed = seedPosition(uSalt);
  float frequency = .5 / sqrt(1. + .09 * strength * strength);
  // Bound the shear reach to keep color pools broad.
  float reach = .65 * strength / sqrt(1. + .15 * strength * strength);
  vec2 directions[4];
  directions[0] = vec2(1., 0.);
  directions[1] = vec2(0., 1.);
  directions[2] = vec2(.6, .8);
  directions[3] = vec2(-.8, .6);
  for (int index = 0; index < 4; index++) {
    float id = float(index);
    vec2 direction = directions[index];
    vec2 normal = vec2(-direction.y, direction.x);
    vec2 samplePoint = vec2(frequency * dot(mapped, normal) + .5 * dot(seed, normal), id * 7.3 + uSalt * .19);
    float shift = psrdnoise(samplePoint, vec2(0.), uSalt * (.23 + id * .13), unused);
    mapped += reach * shift * direction;
  }
  return mapped;
}

// A logarithmic response adds detail on large canvases without scaling it
// directly with their pixel count. Pace uses the same density calibration.
float canvasDensity() {
  const float referenceExtentPx = 320.;
  const float minimumDensity = .18;
  const float densityPerDoubling = .27;
  float extent = max(uSpan.x, uSpan.y) / uPixelScale;
  return minimumDensity + densityPerDoubling * log2(1. + extent / referenceExtentPx);
}

// Keep enough cluster samples across the visible area, even when large sizes
// or a low pattern scale would otherwise leave most of the screen in one pool.
// Combine scales smoothly; the original curl, reach and height profile remain.
float clusterFrequency() {
  vec2 cssSize = max(uSpan / max(.001, uPixelScale), vec2(1.));
  vec2 span = cssSize / min(cssSize.x, cssSize.y);
  float surfaceSpan = 1.85 * canvasDensity() * uZoom * (uFlowType < .5 ? 1.75 : 1.);
  float count = sqrt(max(1., uClusterCount));
  float sized = .62 * count / sqrt(uClusterSize);
  float coverage = .8 * count / (sqrt(span.x * span.y) * max(.001, surfaceSpan));
  return sqrt(sized * sized + coverage * coverage);
}

float canvasPace() {
  const float referenceDensity = .63;
  return canvasDensity() / referenceDensity;
}

float flowTime() { return uElapsed * canvasPace(); }
float warpTime() { return uWarpElapsed * canvasPace(); }

// Shared surface deformation for Wave and Vortex.
vec2 deformSurface(vec2 position) {
  float strength = .95 * uBend / sqrt(1. + .06 * uBend * uBend);
  float freeStrength = 1.1 * strength / sqrt(1. + .18 * strength * strength);
  float extraBend = max(0., uBend - 4.);
  float boost = 1. + .18 * extraBend * extraBend / (1. + extraBend);
  return openDeformation(position, freeStrength * boost);
}

// Bounded cross-axis shears keep Wave's map from reversing or collapsing.
vec2 waveMotion(vec2 position, float time) {
  float reach = .12 * uBend / sqrt(1. + .16 * uBend * uBend);
  position.x += reach * sin(1.2 * position.y - time * .12);
  position.y += .65 * reach * sin(.9 * position.x + time * .09);
  return position;
}

// A rotated sample at the same frequency breaks up shared lattice junctions.
const float morphFrequency = 1.25;
float morphNoise(vec2 p, float phase) {
  vec2 unused;
  float a = psrdnoise(p, vec2(0.), .3 * sin(phase), unused);
  float b = psrdnoise(mat2(.8, -.6, .6, .8) * p + vec2(29., -17.), vec2(0.), .3 * cos(phase), unused);
  return .96 * a + .12 * b;
}

// Two evolving fields bend the domain sampled by the pigment.
vec2 localDeformation(vec2 position, float phase) {
  vec2 bend = vec2(0.);
  vec2 seed = seedPosition(uSalt);
  float reach = .23 * uBend;
  for (int i = 0; i < 2; i++) {
    float layer = float(i);
    vec2 orbit = vec2(cos(phase * (layer + 1.)), sin(phase * (layer + 1.)));
    vec2 p = position * morphFrequency + bend + seed + vec2(17., -9.) * layer;
    bend = reach * vec2(
      morphNoise(p + .55 * orbit, phase + .7 * layer),
      morphNoise(mat2(.6, -.8, .8, .6) * p + vec2(-13., 8.) - .42 * orbit, phase - 1.3));
  }
  return position + bend / morphFrequency;
}

vec2 flowMap(vec2 position) {
  float time = warpTime();
  vec2 mapped = uFlowType < .5 ? localDeformation(position, morphPhase(time)) : deformSurface(position);
  if (uFlowType > 1.5) {
    mapped = waveMotion(mapped, time);
  } else if (uFlowType > .5) {
    vec2 center = vec2(.75, .9);
    vec2 radius = mapped - center;
    // Oscillate the vortex angle around a fixed center.
    float angle = uBend * exp(-dot(radius, radius) * .25) * sin(.8)
      + .18 * uBend / sqrt(1. + uBend * uBend) * sin(time * .09);
    float spin = cos(angle), crossSpin = sin(angle);
    mapped = center + mat2(spin, -crossSpin, crossSpin, spin) * radius;
  }
  // Add translation to Wave and Vortex.
  if (uFlowType > .5) mapped += vec2(.18 * sin(time * .06), .16 * sin(time * .05));
  if (uPointerActive > .5) {
    vec2 offset = vSheet - uPointer;
    float focus = exp(-dot(offset, offset) * 10.);
    mapped += .32 * uBend * focus * (offset + vec2(.25, -.2));
  }
  return clusterDeformation(mapped, time);
}

vec2 surfacePoint() {
  vec2 cssSize = uSpan / uPixelScale;
  vec2 span = cssSize / min(cssSize.x, cssSize.y);
  vec2 centered = (vSheet - .5) * span;
  float c = cos(uTwist), s = sin(uTwist);
  centered = mat2(c, -s, s, c) * centered;
  float density = canvasDensity();
  return (centered + span * .5) * (1.85 * density * uZoom * (uFlowType < .5 ? 1.75 : 1.));
}

// A screen-anchored height envelope, including its analytic surface gradient.
// The quintic ramp has zero slope and curvature at both shoulders.
vec3 reliefEnvelope(vec2 surface) {
  if (uReliefFade < .5 || uReliefFadeAmount <= 0.) return vec3(1., 0., 0.);
  if (uReliefFadeAmount >= 1.) return vec3(0.);
  float density = 1.85 * canvasDensity() * uZoom * (uFlowType < .5 ? 1.75 : 1.);
  vec2 span = uSpan / min(uSpan.x, uSpan.y);
  float c = cos(uTwist), s = sin(uTwist);
  // Finite-difference queries must also move through the height envelope.
  vec2 sheet = vSheet + mat2(c, s, -s, c) * (surface - surfacePoint())
    / max(.001, density) / span;
  vec2 axis = vec2(1., 0.);
  float distance = sheet.x;
  if (uReliefFadeSide > 2.5) {
    axis = vec2(0., 1.); distance = sheet.y;
  } else if (uReliefFadeSide > 1.5) {
    axis = vec2(0., -1.); distance = 1. - sheet.y;
  } else if (uReliefFadeSide > .5) {
    axis = vec2(-1., 0.); distance = 1. - sheet.x;
  }
  float pixels = abs(axis.x) > .5 ? uSpan.x : uSpan.y;
  float width = max(uPixelScale / pixels, min(uReliefFadeWidth, 1. - uReliefFadeAmount));
  float t = clamp((distance - uReliefFadeAmount) / width, 0., 1.);
  float weight = t * t * t * (t * (6. * t - 15.) + 10.);
  float derivative = 30. * t * t * (t - 1.) * (t - 1.) / width;
  vec2 gradient = mat2(c, -s, s, c) * (axis / span) * derivative / max(.001, density);
  return vec3(weight, gradient);
}

// Smooth shoulders turn the flowing scalar field into convex glass relief.
float glassHeight(float field) {
  float value = field * exp2(-.8 * uDistribution);
  return .24 * uRelief * smoothstep(-.65 - .2 * uEase, .75 + .2 * uEase, value);
}

vec2 glassPosition(vec2 surface) {
  // Blend the original flow into the relief, preserving its flowing folds.
  return mix(surface, flowMap(surface), mix(.26, .08, uEase));
}

vec3 reliefSample(vec2 position, float time) {
  float phase = pigmentPhase(time);
  vec2 samplePoint = position / uSpotSize;
  vec2 gradientA, gradientB;
  float broad;
  vec2 broadGradient;
  if (uFlowType < .5) {
    vec2 orbit = .32 * vec2(cos(2. * phase) - 1., sin(2. * phase));
    vec2 p = samplePoint * morphFrequency + seedPosition(uSalt) + orbit;
    float a = psrdnoise(p, vec2(0.), .3 * sin(phase), gradientA);
    float b = psrdnoise(mat2(.8, -.6, .6, .8) * p + vec2(29., -17.),
      vec2(0.), .3 * cos(phase), gradientB);
    broad = .96 * a + .12 * b;
    broadGradient = (.96 * gradientA + .12 * mat2(.8, .6, -.6, .8) * gradientB) * morphFrequency / uSpotSize;
  } else {
    broad = psrdnoise(samplePoint + seedPosition(uSalt) + vec2(-7., 3.),
      vec2(0.), uSalt * .1435 + phase, gradientA);
    broadGradient = gradientA / uSpotSize;
  }
  float frequency = clusterFrequency();
  float pools = psrdnoise(samplePoint * frequency + seedPosition(uSalt) + vec2(-7., 3.),
    vec2(0.), phase + uSalt * .1435, gradientB);
  vec2 poolGradient = gradientB * frequency / uSpotSize;
  float amount = .8 * smoothstep(0., 1., uClusterCount) * uClusterIntensity / (1. + uClusterIntensity);
  // Clusters contribute rounded volumes as well as the flow's deformation.
  // Blending fields avoids stacking thin pigment folds into an opaque surface.
  return vec3(mix(broad, pools, amount), mix(broadGradient, poolGradient, amount));
}

float reliefField(vec2 position, float time) {
  return reliefSample(position, time).x;
}

vec2 heightGradient(vec3 sampleValue) {
  float spread = 1.4 + .4 * uEase;
  float distribution = exp2(-.8 * uDistribution);
  float t = clamp((sampleValue.x * distribution + .65 + .2 * uEase) / spread, 0., 1.);
  return sampleValue.yz * (.24 * uRelief * 6. * t * (1. - t) * distribution / spread);
}

float heightAt(vec2 surface) {
  return glassHeight(reliefField(glassPosition(surface), warpTime())) * reliefEnvelope(surface).x;
}

vec3 glassNormal(vec2 surface, vec2 position, vec2 gradient, vec2 envelopeSlope) {
  float density = 1.85 * canvasDensity() * uZoom * (uFlowType < .5 ? 1.75 : 1.);
  vec2 slope;
#ifdef USE_GLASS_DERIVATIVES
  // Convert pixel derivatives to surface units so DPR and resizing do not
  // change the relief. The rotation is already present in the sampled height.
  // Analytic noise gradients avoid the 2x2 constant slopes of height
  // derivatives. Only the domain Jacobian needs pixel derivatives.
  slope = vec2(dot(gradient, dFdx(position)) + dot(envelopeSlope, dFdx(surface)),
    dot(gradient, dFdy(position)) + dot(envelopeSlope, dFdy(surface)))
    * min(uSpan.x, uSpan.y) / max(.001, density);
#else
  // Match the surface-to-screen basis when derivatives are unavailable.
  float angle = uTwist;
  vec2 dx = .003 * vec2(cos(angle), -sin(angle));
  vec2 dy = .003 * vec2(sin(angle), cos(angle));
  slope = vec2(heightAt(surface + dx) - heightAt(surface - dx),
    heightAt(surface + dy) - heightAt(surface - dy)) / .006;
#endif
  // Bound grazing angles at the expanded cluster settings without flattening
  // the surface or introducing a threshold in its shape.
  slope /= sqrt(1. + .08 * dot(slope, slope));
  return normalize(vec3(-slope, 1.));
}

// A local optical slope estimates light concentration behind the relief.
// It contains no pixel derivatives, so its ray Jacobian uses first derivatives
// only, including on devices that need finite differences for glass normals.
vec2 causticOffset(vec2 gradient) {
  vec3 normal = normalize(vec3(-gradient, 1.));
  vec3 ray = refract(normalize(vec3(-.35, .4, -1.)), normal, 1. / 1.46);
  return ray.xy / max(.25, abs(ray.z)) * .3 * uRefraction;
}

#ifndef USE_GLASS_DERIVATIVES
vec2 causticOffsetAt(vec2 surface) {
  vec3 sampleValue = reliefSample(glassPosition(surface), warpTime());
  vec3 envelope = reliefEnvelope(surface);
  return causticOffset(heightGradient(sampleValue) * envelope.x
    + glassHeight(sampleValue.x) * envelope.yz);
}
#endif

float causticFocus(vec2 surface, vec2 gradient) {
  vec2 dx, dy;
#ifdef USE_GLASS_DERIVATIVES
  vec2 offset = causticOffset(gradient);
  float density = 1.85 * canvasDensity() * uZoom * (uFlowType < .5 ? 1.75 : 1.);
  float pixelToSurface = min(uSpan.x, uSpan.y) / max(.001, density);
  dx = dFdx(offset) * pixelToSurface;
  dy = dFdy(offset) * pixelToSurface;
#else
  vec2 axisX = .003 * vec2(cos(uTwist), -sin(uTwist));
  vec2 axisY = .003 * vec2(sin(uTwist), cos(uTwist));
  dx = (causticOffsetAt(surface + axisX) - causticOffsetAt(surface - axisX)) / .006;
  dy = (causticOffsetAt(surface + axisY) - causticOffsetAt(surface - axisY)) / .006;
#endif
  float area = (1. + dx.x) * (1. + dy.y) - dx.y * dy.x;
  return clamp(1. / max(.35, abs(area)) - 1., -.3, 1.8);
}

// A broad colored backdrop remains visible through the glass. Refraction
// changes where it is sampled, rather than painting a white outline on top.
vec3 glassBackdrop(vec2 surface, float time) {
  vec2 unused;
  float phase = pigmentPhase(time);
  vec2 travel = .25 * vec2(sin(phase), cos(phase) - 1.);
  float pool = psrdnoise(surface * 2.4 + seedPosition(uSalt) + travel, vec2(0.), phase, unused);
  float wash = psrdnoise(surface * 1.1 + seedPosition(uSalt) + vec2(19., -11.), vec2(0.), .35 * sin(phase), unused);
  vec3 tint = mix(uTintA, uTintB, smoothstep(-.65, .65, pool));
  tint = mix(tint, uTintC, .45 * smoothstep(-.7, .8, wash));
  // Let color pools reach their pigment instead of diluting every region with
  // 42–62% of the base. The base still appears in the low parts of the field.
  return mix(uBase, tint, smoothstep(-.75, .15, pool - .4 * uDistribution));
}

// Soft studio lights reflected by the surface normal. Roughness broadens the
// highlights and reduces their peaks; they follow the glass, not screen masks.
vec3 glassEnvironment(vec3 direction, float normalVariation) {
  float width = mix(.075, .48, uRoughness);
  float band = direction.x + .4 * direction.y + .18;
  float footprint = 0.;
#ifdef USE_GLASS_DERIVATIVES
  // Integrate every studio light over its pixel footprint. Filtering only
  // the key leaves the fill and sharp softbox rims unresolved on tight bends.
  footprint = .35 * normalVariation * normalVariation;
#endif
  float resolvedWidth = sqrt(width * width + footprint);
  float key = exp(-pow(band / resolvedWidth, 2.)) * width / resolvedWidth;
  key *= smoothstep(-.35, .5, direction.z);
  float fillWidth = .17 + .5 * uRoughness;
  float resolvedFillWidth = sqrt(fillWidth * fillWidth + footprint);
  float fill = exp(-pow((direction.y - .35 * direction.z - .28) / resolvedFillWidth, 2.))
    * fillWidth / resolvedFillWidth;
  float studio = .12 + .2 * smoothstep(-.6, .8, direction.y);
  vec3 environment = mix(uTintA * .2, uBase * .6, studio);
  environment += vec3(1., .99, .97) * key * mix(4.5, 1.2, uRoughness);
  environment += mix(uBase, vec3(1.), .7) * fill * mix(1.5, .65, uRoughness);
  float power = mix(72., 6., uRoughness);
  float resolvedPower = power / (1. + 2. * power * footprint);
  float softbox = pow(max(0., dot(direction, normalize(vec3(-.45, .55, 1.)))), resolvedPower)
    * resolvedPower / power;
  environment += vec3(1.) * softbox * mix(8., 1.5, uRoughness);
  return environment;
}

`;

export const streamFragment = `${fluidGlassShaderCore}void main() {
  vec2 surface = surfacePoint();
  vec2 position = glassPosition(surface);
  vec3 surfaceSample = reliefSample(position, warpTime());
  float field = surfaceSample.x;
  vec3 envelope = reliefEnvelope(surface);
  float rawHeight = glassHeight(field);
  float height = rawHeight * envelope.x;
  vec2 gradient = heightGradient(surfaceSample) * envelope.x;
  vec2 envelopeSlope = rawHeight * envelope.yz;
  vec2 opticalGradient = gradient + envelopeSlope;
  vec3 normal = glassNormal(surface, position, gradient, envelopeSlope);
  float normalVariation = 0.;
#ifdef USE_GLASS_DERIVATIVES
  // Use first derivatives of the analytic gradient for the highlight footprint.
  // Differentiating the derived normal would require undefined second derivatives.
  normalVariation = .5 * (length(dFdx(opticalGradient)) + length(dFdy(opticalGradient)));
#endif
  vec3 incident = vec3(0., 0., -1.);
  vec3 ray = refract(incident, normal, 1. / 1.46);
  vec2 displacement = ray.xy / max(.25, abs(ray.z)) * (.12 + height) * uRefraction;
  vec3 transmission = glassBackdrop(surface + displacement, flowTime());
  if (uDispersion > 0. && uRefraction > 0.) {
    float spread = .24 * uDispersion;
    vec3 red = glassBackdrop(surface + displacement * (1. + spread), flowTime());
    vec3 blue = glassBackdrop(surface + displacement * (1. - spread), flowTime());
    transmission = vec3(red.r, transmission.g, blue.b);
  }
  if (uCaustics > 0. && uRefraction > 0.) {
    transmission *= 1. + .25 * uCaustics * causticFocus(surface, opticalGradient);
  }
  // Thickness absorbs a little of the palette and gives raised regions body.
  transmission *= exp(-height * .7 * (vec3(1.) - uTintA));
  float facing = clamp(normal.z, 0., 1.);
  float fresnel = clamp((.035 + .965 * pow(1. - facing, 5.)) * uReflection, 0., 1.);
  vec3 reflection = glassEnvironment(reflect(incident, normal), normalVariation);
  vec3 color = transmission * (1. - fresnel) + reflection * fresnel;
  float sideLight = dot(normal, normalize(vec3(-.55, .65, .9)));
  color *= .88 + .12 * max(0., sideLight);

#ifdef USE_GRAIN_CACHE
  float fleck = uFleck > 0. ? texture2D(uGrainCache, gl_FragCoord.xy / uSpan).r : 0.;
#else
  float fleck = sampleFilmGrain(gl_FragCoord.xy,
    uSalt, uGrainMode, uFleckSpan, uPixelScale);
#endif
  float brightnessResponse = sqrt(dot(color, color) / 3.);
  color += vec3(fleck * uFleck * brightnessResponse);
  gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
}`;
