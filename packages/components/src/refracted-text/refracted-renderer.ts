import { roundGlyphCorners } from './refracted-glyph-rounding';

const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * .5 + .5;
  gl_Position = vec4(aPosition, 0., 1.);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uMask;
uniform sampler2D uGlowMask;
uniform vec2 uResolution;
uniform float uVirtualWidth;
uniform float uGlyphCount;
uniform float uTime;
uniform float uDuration;
uniform float uOpeningDuration;
uniform float uLiftFlow;
uniform float uRevealGlyph;
uniform float uRevealLift;
uniform float uBeamFollowsLift;
uniform float uIntensity;
uniform float uDispersion;
uniform float uColorIntensity;
uniform float uBeamPosition;
uniform float uFixedBeam;
uniform vec2 uPointer;
uniform float uPointerInfluence;
uniform float uCursorMovesBeam;
uniform float uLightTheme;
uniform vec4 uTopColor;
uniform vec4 uBottomColor;

float gaussian(float x, float width) {
  float d = x / width;
  return exp(-.5 * d * d);
}

// Preserve the original ray overlap and palette at any spectral coordinate.
vec4 spectralProfile(float y, float dispersion, float edgeResponse, float violetModulation) {
  float redRay = gaussian(y - dispersion, .062 + .055 * edgeResponse);
  float greenRay = gaussian(y - dispersion * .18, .078 + .055 * edgeResponse);
  float blueRay = gaussian(y + dispersion * .92, .062 + .055 * edgeResponse);
  vec3 refracted = vec3(.39, .46, .53) + vec3(.61, .50, .48) * vec3(redRay, greenRay, blueRay);
  refracted.r += .25 * gaussian(y + dispersion * 1.45, .052) * violetModulation;
  // Shift warm hues toward champagne (#cbae8f) at the same luminance,
  // with a smooth fade back into neutral and cool wavelengths.
  float warmWeight = smoothstep(0., .10, refracted.r - refracted.b)
    * smoothstep(0., .06, refracted.g - refracted.b);
  vec3 champagne = vec3(203., 174., 143.) / 255.;
  vec3 lumaWeights = vec3(.2126, .7152, .0722);
  vec3 champagneChroma = (champagne - vec3(dot(champagne, lumaWeights))) / (60. / 255.);
  float chromaRange = max(refracted.r, max(refracted.g, refracted.b))
    - min(refracted.r, min(refracted.g, refracted.b));
  vec3 warmReflection = vec3(dot(refracted, lumaWeights)) + champagneChroma * chromaRange * .85;
  refracted = mix(refracted, warmReflection, warmWeight);
  return vec4(refracted, max(redRay, max(greenRay, blueRay)));
}

vec3 spectralChroma(vec3 color) {
  return color - vec3(dot(color, vec3(.2126, .7152, .0722)));
}

float sectionHash(float cell) {
  return clamp(.5 + .34 * sin(cell * 2.3 + .3)
    + .12 * sin(cell * 4.7 + 1.4), .05, .95);
}

float sectionLight(float x) {
  float cell = floor(x);
  float blend = fract(x);
  blend = blend * blend * blend * (blend * (blend * 6. - 15.) + 10.);
  return mix(sectionHash(cell), sectionHash(cell + 1.), blend);
}

float maskAt(vec2 uv) { return texture(uMask, uv).a; }

void main() {
  // Sample each glyph from its original mask position while drawing it lower
  // in the same canvas. The canvas edge clips the lift without fading it.
  vec2 uv = vUv + vec2(0., uRevealLift);
  if (uv.y > 1.) discard;
  vec4 maskSample = texture(uMask, uv);
  float alpha = maskSample.a;
  vec4 glowSample = texture(uGlowMask, uv);
  float softMask = glowSample.r;
  vec2 pixel = 1. / uResolution;
  if (alpha < .002) {
    // Fine spill extends a few pixels beneath the exterior baseline.
    // Counter holes and side contours stay clear.
    vec4 inkAbove = texture(uMask, uv + vec2(0., pixel.y * 3.));
    float inkBelow = maskAt(uv - vec2(0., pixel.y * 3.));
    float exterior = glowSample.g;
    float aboveGlyph = floor(inkAbove.b / max(inkAbove.a, .01)
      * max(1., uGlyphCount - 1.) + .5);
    if (uRevealGlyph >= 0. && abs(aboveGlyph - uRevealGlyph) > .5) discard;
    float lowerSpill = exterior * max(0., inkAbove.a - inkBelow)
      * smoothstep(.04, .54, softMask) * mix(.16, .05, uLightTheme);
    float spillGlyph = clamp(inkAbove.b / max(inkAbove.a, .01), 0., 1.);
    vec3 spillColor = mix(vec3(.88, .89, .93), vec3(.66, .72, .91), spillGlyph);
    outColor = vec4(spillColor, lowerSpill);
    return;
  }

  float y = 1. - uv.y;
  // The glass material travels with the glyph. The incident beam stays in
  // canvas space unless the material-attached lift mode is selected.
  float beamY = 1. - mix(vUv.y, uv.y, uBeamFollowsLift);
  float glyphPosition = clamp(maskSample.b / max(alpha, .01), 0., 1.);
  float glyphIndex = floor(glyphPosition * max(1., uGlyphCount - 1.) + .5);
  if (uRevealGlyph >= 0. && abs(glyphIndex - uRevealGlyph) > .5) discard;
  // One clock drives the opening pass across the whole word. The character
  // stagger affects only the lift, so the beam's easing never restarts on a
  // later glyph.
  float flowTime = uTime;
  float openingTime = .60 + flowTime;
  // The opening incidence rotates quickly, then loses speed before joining
  // the calm regular cycle. The rightmost glyph leads the same light source;
  // each neighbor receives a smaller, slightly later optical turn.
  // The small cyclic glint also eases to a stop in lift mode; otherwise it
  // would visibly snap to a halt when the entrance clock reaches its end.
  float phaseDuration = uOpeningDuration;
  float phaseProgress = clamp(uTime / phaseDuration, 0., 1.);
  float easedPhaseTime = phaseDuration * .2
    * (1. - pow(1. - phaseProgress, 5.));
  float phase = mix(uTime, easedPhaseTime, uLiftFlow)
    * 6.2831853 / max(.1, uDuration);
  float opticalGlyph = mix(uv.x, glyphPosition, alpha);
  // One light enters across the word. Its grazing point accelerates across
  // each silhouette, then settles.
  float surgeAge = max(0., openingTime - .48 * (1. - opticalGlyph));
  float entryTravel = smoothstep(.13, .58, surgeAge);
  float recovery = smoothstep(.58, 1.05, surgeAge);
  float openingSweep = -(.02 + .08 * opticalGlyph)
    * (entryTravel - .15 * recovery);
  float entryLead = .48 * pow(1. - opticalGlyph, 1.5);
  float entryAge = max(0., openingTime - entryLead);
  float entryDecay = exp(-entryAge * 4.6);
  float entryTurn = (.9 + 2.3 * pow(opticalGlyph, 1.35)) * entryDecay;
  // The center facet bends the shared incident light toward the cool side.
  // This is a phase offset, so the light still travels in one direction.
  float middleFacet = 2.65 * gaussian(opticalGlyph - .5, .16);
  float opticalFlow = phase + uv.x * 3.2 + entryTurn + middleFacet;
  float letterDelay = .12 + .68 * pow(1. - glyphPosition, .8);
  float entryGlint = gaussian(openingTime - letterDelay, .21);
  // A broad grazing reflection travels across neighboring letters while
  // each side catches the brief opening movement of the incident light.
  float lightPass = .5 + .5 * cos(opticalFlow - .6);

  // Distance is measured against each glyph's outer silhouette. Counters do
  // not restart the field, so no rectangular patch appears around a hole.
  vec4 rowAbove = texture(uMask, uv + vec2(0., pixel.y * 7.));
  vec4 rowBelow = texture(uMask, uv - vec2(0., pixel.y * 7.));
  vec2 edgeDistances = (maskSample.rg * 2. + rowAbove.rg * rowAbove.a
    + rowBelow.rg * rowBelow.a) / (2. + rowAbove.a + rowBelow.a);
  float nearLeft = exp(-edgeDistances.r / .16);
  float nearRight = exp(-edgeDistances.g / .16);
  float rightAnchor = smoothstep(.60, .95, glyphPosition);
  // P and R catch the grazing light in a thin outer rim. On O the same
  // reflection spreads farther around the round side.
  float rightWhite = exp(-edgeDistances.g / mix(.075, .105, rightAnchor));
  float whiteEdge = nearLeft + .55 * rightWhite - .55 * nearLeft * rightWhite;
  // The right edge of the leading glyph starts chromatic; its white core
  // catches up over the first few frames instead of appearing fully lit.
  float ignition = 1. - .9 * glyphPosition * nearRight
    * (1. - smoothstep(.035, .067, openingTime));
  // A narrow ridge a few pixels inside each glass edge catches the source
  // before its softer color spreads through the rest of the letter.
  float fineLeft = gaussian(edgeDistances.r - .042, .038);
  float fineRight = gaussian(edgeDistances.g - mix(.024, .030, rightAnchor),
    mix(.022, .027, rightAnchor));
  float fineEdge = clamp(fineLeft + .6 * fineRight, 0., 1.);
  // Blend both sides into one continuous field. A max() makes a visible
  // vertical seam halfway across a stroke, especially in C, T and J.
  float edgeResponse = nearLeft + nearRight - nearLeft * nearRight;
  // Normalize against the ink span on this row, which can be a single stem
  // (J, C) instead of the full width of the glyph's cell.
  float span = edgeDistances.r + edgeDistances.g;
  float rowPosition = span > .002 ? clamp(edgeDistances.r / span, 0., 1.) : .5;
  float singleStem = 1. - smoothstep(.55, 1.25, span);
  // Open C/G contours and the separated arms of E/F collapse the row span.
  // Keep beam geometry on its original row field; use a stable glyph-wide x
  // only for the opening animation's changing light sections.
  float openCoordinate = glowSample.b / max(alpha, .002);
  float openContour = smoothstep(.45, .5, openCoordinate);
  float stemGlyph = smoothstep(.13, .22, openCoordinate)
    * (1. - smoothstep(.34, .44, openCoordinate));
  float stemShape = smoothstep(.28, .68, singleStem);
  float stemFlow = stemGlyph * stemShape;
  float entryShear = 1.15 * entryGlint * (rowPosition - .5);
  float surfaceFacing = .5 + .5 * cos(opticalFlow + entryShear
    + (rowPosition - .5) * 1.1);
  // The shared opening ray bends and changes intensity across the word.
  // Spatial differences remain, but every glyph samples the same clock.
  float openingEnvelope = 1. - smoothstep(uOpeningDuration * (1.35 / 2.1), uOpeningDuration, flowTime);
  float openingEnergy = 0.;
  float openingBrightness = 0.;
  float openingWave = 0.;
  // Once the opening envelope is zero, all of its section lighting is zero.
  // Avoid evaluating its many sine/hash samples on every settled pixel.
  if (openingEnvelope > 0.) {
    float openingAge = openingTime - (.04 + .28 * (1. - glyphPosition));
    float openingProgress = clamp(openingAge / 1.2, 0., 1.);
    float openingTravel = 1. - pow(1. - openingProgress, 2.4);
    float longProgress = clamp(flowTime / uOpeningDuration, 0., 1.);
    // The lifted entrance finishes with power4.out. Keep the initial travel
    // speed when the shorter path settles; the static preset retains its
    // original opening curve and distance.
    float travelPower = mix(4., 5., uLiftFlow);
    float travelDistance = mix(4.4, 3.52, uLiftFlow)
      * (uOpeningDuration / 2.1);
    float longTravel = travelDistance
      * (1. - pow(1. - longProgress, travelPower));
    float lightTravel = openingTravel * 2.2 + longTravel;
    float sectionPhase = lightTravel + glyphIndex * 3.7;
    float openingSections = sectionLight(rowPosition * 2.45 + sectionPhase);
    float openFlowX = clamp((openCoordinate - .5) * 2., 0., 1.);
    if (openContour > 0.) openingSections = mix(openingSections,
      sectionLight(openFlowX * 2.45 + sectionPhase), openContour);
    // Widen the opening blotch only enough for narrow uprights to carry the
    // same traveling variation as the other glyphs, with a softer transition.
    if (stemFlow > 0.) {
      float broadStemX = .5 + (rowPosition - .5) * .62;
      float stemPhase = broadStemX * 2.45 + sectionPhase;
      float broadStemLight = (sectionLight(stemPhase - .18)
        + 2. * sectionLight(stemPhase) + sectionLight(stemPhase + .18)) * .25;
      openingSections = mix(openingSections, broadStemLight, .75 * stemFlow);
    }
    openingEnergy = (openingSections * 2. - 1.) * openingEnvelope;
    // Narrow upright strokes (I/i, T/t, L/l and 1) expose the dark half of the
    // opening modulation as a conspicuous vertical stripe. Keep their moving
    // ray, but let the dimming roll off inside the stem instead of blacking it.
    float shadowFraction = 1. - smoothstep(-.10, .10, openingEnergy);
    openingBrightness = openingEnergy
      * (1. - .22 * stemFlow * shadowFraction);
    float localX = rowPosition - .5;
    float openingTilt = sectionLight(glyphIndex * 3.7
      + lightTravel + .7) * 2. - 1.;
    float openingArch = sectionLight(glyphIndex * 3.7
      + lightTravel + 2.1) * 2. - 1.;
    float openingLift = sectionHash(glyphIndex * 2.5) * 2. - 1.;
    openingWave = .052 * openingEnergy + openingEnvelope
      * (.08 * openingLift + .048 * openingTilt * localX * 2.
        + .025 * openingArch * (1. - 4. * localX * localX));
  }
  float localGlint = entryGlint;
  float entryStrength = .55 * entryGlint;

  // Charcoal glass retains contrast against a light surface. Keep the dark
  // palette and the refracted highlights intact.
  vec3 dark = mix(vec3(.105, .11, .116), vec3(.029, .0325, .0385), uLightTheme);
  vec3 middle = mix(vec3(.43, .43, .44), vec3(.1175, .1275, .145), uLightTheme);
  vec3 lower = mix(vec3(.79, .79, .80), vec3(.22, .24, .27), uLightTheme);
  // Tint the material vertically; the ray and contour highlights keep their
  // own lighting. Zero alpha preserves the original theme palette exactly.
  dark = mix(dark, uTopColor.rgb, uTopColor.a);
  lower = mix(lower, uBottomColor.rgb, uBottomColor.a);
  middle = mix(middle, mix(dark, lower, .47), max(uTopColor.a, uBottomColor.a));
  vec3 color = mix(dark, middle, smoothstep(.29, .59, y));
  color = mix(color, lower, smoothstep(.62, .99, y));
  // The glass crown stays charcoal-gray; saturated color comes from the
  // narrower refracted ray rather than a blue wash over every letter.
  float crown = gaussian(y - .30, .15)
    * smoothstep(.015, .14, y);
  color += crown * (.25 + .75 * edgeResponse) * vec3(.085, .09, .10)
    * (.84 + .24 * lightPass);
  color += gaussian(y - .38, .38) * lightPass * surfaceFacing
    * (.018 + .052 * edgeResponse) * vec3(.94, .96, 1.);
  color += gaussian(y - .38, .36) * entryStrength
    * (.045 + .075 * edgeResponse) * vec3(.97, .95, .92);
  // The band stays steady after entry; the opening sweep briefly moves the
  // grazing highlight along each letter's side contour.
  float localAnchor = mix(.25, .85, rightAnchor);
  float cursorSteering = uPointerInfluence * uCursorMovesBeam;
  float steering = max(uFixedBeam, cursorSteering);
  float cursorLens = 0.;
  if (uPointerInfluence > 0. && uCursorMovesBeam < 1.)
    cursorLens = uPointerInfluence * (1. - uCursorMovesBeam)
      * gaussian((uv.x - uPointer.x) * uVirtualWidth / 394., .5);
  float localReflection = gaussian(rowPosition - localAnchor, .42);
  float sourceLight = .78 + .17 * edgeResponse + .14 * singleStem
    + .13 * localReflection + .25 * lightPass
    + .08 * edgeResponse * surfaceFacing + .6 * entryStrength
    + cursorLens * (.28 + .18 * edgeResponse);
  sourceLight *= 1. + .70 * openingBrightness;
  // A soft cap keeps the white core bright without a flat rectangular plateau.
  float over = sourceLight - 1.75;
  sourceLight = .5 * (sourceLight + 1.75 - sqrt(over * over + .01)) * uIntensity;
  sourceLight *= mix(1., ignition, .72);
  // Each glass shape redirects the grazing light at its own edges. The broad
  // source remains shared, while the bright crossbar steps and curves through
  // the individual letters instead of drawing a ruler-straight strip.
  float bend = .022 * edgeResponse;
  float facetCurve = (.043 + .028 * entryGlint) * (nearRight - nearLeft)
    * (.7 + .3 * surfaceFacing);
  float bandY = .35 + .07 * glyphPosition + bend + facetCurve;
  float fixedPointerY = mix(uBeamPosition, uPointer.y, cursorSteering);
  float pointerY = clamp(fixedPointerY + bend * .7 + facetCurve * .5, .12, .88);
  // The cursor acts as a local lens: it pulls a smooth arc out of the ray,
  // while the refraction keeps flowing across the word. Full steering remains
  // an explicit opt-in mode.
  float pointerPull = clamp(uPointer.y - bandY, -.22, .22);
  float lineY = mix(bandY, pointerY, steering)
    + cursorLens * pointerPull * .7
    + openingWave * (1. - .5 * steering)
    + edgeResponse * openingSweep
    - .07 * nearRight * (1. - rightAnchor);
  // Keep the stem blotch slightly broad without washing out its light band.
  color *= 1. + .19 * openingBrightness
    * gaussian(beamY - lineY, .27 + .04 * stemFlow * openingEnvelope);

  // RGB rays separate by wavelength, then recombine into white. Their
  // changing separation produces cyan, gold, violet and peach in addition
  // to blue and amber, particularly along the O's outer edge.
  float dispersion = (.026 + .085 * edgeResponse)
    * sin(opticalFlow + entryShear + .95) * (1. + .35 * cursorLens)
    + .055 * cursorLens * pointerPull
    + .016 * openingEnergy;
  // Keep the original neutral reflection at its original width. Only its
  // chromatic part is replaced by a stretched profile; extending the colors
  // must not extend the white/gray light produced by overlapping wavelengths.
  float spectralY = beamY - lineY;
  float spectralCoverage = .25 + .75 * uDispersion;
  float violetModulation = edgeResponse * (.5 + .5 * sin(opticalFlow + entryShear - .9));
  vec4 originalSpectrum = spectralProfile(spectralY, dispersion, edgeResponse, violetModulation);
  // The default coverage samples the very same profile. Reuse it rather
  // than computing the four spectral Gaussians and warm hue mapping twice.
  vec4 extendedSpectrum = originalSpectrum;
  if (uDispersion != 1. && uColorIntensity > 0.)
    extendedSpectrum = spectralProfile(spectralY / spectralCoverage, dispersion, edgeResponse, violetModulation);
  float spectralLight = sourceLight * (.25 + .60 * edgeResponse);
  float originalAmount = clamp(originalSpectrum.a * spectralLight, 0., mix(.94, .72, uLightTheme));
  float extendedAmount = clamp(extendedSpectrum.a * spectralLight, 0., mix(.94, .72, uLightTheme));
  color = mix(color, originalSpectrum.rgb, originalAmount);
  color += spectralChroma(extendedSpectrum.rgb) * extendedAmount * uColorIntensity
    - spectralChroma(originalSpectrum.rgb) * originalAmount;
  float whiteBloom = gaussian(beamY - lineY, .058 + .026 * whiteEdge)
    * sourceLight * (.06 + .34 * whiteEdge + .12 * fineEdge)
    * (.72 + .28 * surfaceFacing) * ignition;
  float white = gaussian(beamY - lineY, .022 + .010 * whiteEdge)
    * sourceLight * (.025 + .38 * whiteEdge + .16 * fineEdge)
    * (.65 + .35 * surfaceFacing) * ignition;
  color = mix(color, vec3(.96, .97, 1.), clamp(whiteBloom * .33, 0., .50));
  color = mix(color, vec3(1., .998, .97), clamp(white * .9, 0., .70));
  float entrySheen = entryStrength * gaussian(beamY - lineY, .11)
    * (.06 + .13 * edgeResponse);
  color = mix(color, vec3(1., .99, .965), clamp(entrySheen, 0., .22));
  float sideGlint = (nearLeft + .55 * rightWhite) * gaussian(beamY - lineY, .14)
    * (.10 + .15 * surfaceFacing) * (lightPass + 1.15 * entryStrength)
    * ignition;
  color = mix(color, vec3(.97, .975, .98), clamp(sideGlint, 0., .38));
  float leftCore = pow(nearLeft, 2.2) * gaussian(beamY - lineY, .075) * .43;
  float rightCore = pow(rightWhite, 2.2) * gaussian(beamY - lineY, .10) * .25;
  float sideCore = (leftCore + rightCore) * uIntensity * ignition;
  color = mix(color, vec3(.99, .995, 1.), clamp(sideCore, 0., .91));

  // The blurred silhouette supplies a continuous normal and distance-like
  // falloff. One bevel follows every contour of every glyph, including the
  // rounded shoulders, without switching on at sampled pixel thresholds.
  float softLeft = texture(uGlowMask, uv - vec2(pixel.x * 3., 0.)).r;
  float softRight = texture(uGlowMask, uv + vec2(pixel.x * 3., 0.)).r;
  float softUp = texture(uGlowMask, uv + vec2(0., pixel.y * 3.)).r;
  float softDown = texture(uGlowMask, uv - vec2(0., pixel.y * 3.)).r;
  vec2 softGradient = vec2(softLeft - softRight, softDown - softUp);
  vec2 softNormal = softGradient / max(length(softGradient), .0001);
  float topFacingSoft = max(0., softNormal.y);
  float bottomFacingSoft = max(0., -softNormal.y);
  float sideFacingSoft = abs(softNormal.x);
  float innerBevel = alpha * pow(max(0., 1. - softMask), 1.05);
  float bevelGain = .05 + (.22 + .08 * edgeResponse) * topFacingSoft
    + .07 * sideFacingSoft + .13 * bottomFacingSoft;
  float openingIncidence = 1. + .27 * openingBrightness;
  color += innerBevel * bevelGain * (.86 + .22 * lightPass)
    * openingIncidence
    * vec3(.86, .94, 1.);
  // The brightest part of the bevel sits just inside the glass boundary.
  // This broader shoulder carries light into the letter instead of drawing
  // a hard white line on the silhouette.
  float innerRidge = alpha * gaussian(softMask - .64, .10);
  float ridgeGain = .17 * topFacingSoft + .09 * sideFacingSoft
    + .11 * bottomFacingSoft;
  color += innerRidge * ridgeGain * (.92 + .16 * lightPass)
    * openingIncidence
    * vec3(.82, .91, 1.);
  // A thin directional bevel replaces the uniform neon outline.
  float up = maskAt(uv + vec2(0., pixel.y * 2.));
  float down = maskAt(uv - vec2(0., pixel.y * 2.));
  float left = maskAt(uv - vec2(pixel.x * 2., 0.));
  float right = maskAt(uv + vec2(pixel.x * 2., 0.));
  float topEdge = max(0., down - up) * alpha;
  float bottomEdge = max(0., up - down) * alpha;
  float sideEdge = abs(right - left) * alpha;
  float edge = clamp(topEdge * .72 + bottomEdge * .36 + sideEdge * .70, 0., 1.);
  float rimIncidence = gaussian(beamY - lineY - dispersion * .16, .074);
  float ridgeLight = (fineLeft + fineRight * .5)
    * gaussian(beamY - lineY, .075)
    * sourceLight * (.42 + .10 * localGlint) * ignition;
  color = mix(color, vec3(1., .995, .985), clamp(ridgeLight, 0., .55));
  float rimSpark = rimIncidence * sourceLight
    * (.72 + .28 * surfaceFacing + .42 * localGlint) * ignition;
  float edgeLight = clamp(.11 + .16 * lightPass + .76 * rimSpark
    + .16 * entryStrength * rimIncidence, 0., .87);
  vec3 rimBase = mix(vec3(.71, .73, .77), vec3(.42, .46, .51), uLightTheme);
  vec3 rimColor = mix(rimBase, vec3(1., .995, .975),
    clamp((rimIncidence * 1.8 + .25 * entryStrength)
      * (1. - .23 * nearLeft - .52 * rightAnchor * nearRight), 0., 1.));
  color = mix(color, rimColor, edge * edgeLight);
  color += topEdge * (.025 + .012 * edgeResponse)
    * vec3(.86, .94, 1.);
  // Keep the thin contour visible without clipping its side highlight to a
  // solid white patch. The color wash beneath it can remain much longer.
  color *= 1. - (.035 + .035 * rightAnchor) * edgeResponse
    * gaussian(beamY - lineY, .16);
  // The narrow lower highlight follows the actual contour of every glyph.
  // It remains part of the same inner bevel on straight and curved bases.
  float lowerRim = bottomEdge * (.30 + .10 * lightPass) * uIntensity;
  color = mix(color, vec3(.99, .995, 1.), clamp(lowerRim, 0., .44));
  // The refracted light belongs to the glass. Keep the surrounding black
  // transparent so the bright falloff stays inside each silhouette.
  outColor = vec4(color, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

// Mark the background connected to the canvas edge. The lower light spill
// needs this mask to avoid illuminating counters, but the font ink stays intact.
function findExterior(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const size = width * height;
  const exterior = new Uint8Array(size);
  // The span queue is usually close to the perimeter, rather than one entry
  // per pixel. Grow only for unusually fragmented exterior shapes.
  let queue = new Int32Array(Math.min(size, 2 * (width + height)));
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (exterior[index] || data[index * 4 + 3] >= 128) return;
    exterior[index] = 2;
    if (tail === queue.length) {
      const larger = new Int32Array(Math.min(size, queue.length * 2));
      larger.set(queue);
      queue = larger;
    }
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const seed = queue[head++];
    if (exterior[seed] === 1) continue;
    const y = Math.floor(seed / width);
    const rowStart = y * width;
    const rowEnd = rowStart + width;
    let start = seed;
    while (start > rowStart && exterior[start - 1] !== 1 && data[(start - 1) * 4 + 3] < 128)
      start--;
    let aboveSpan = false;
    let belowSpan = false;
    // Flood whole horizontal spans without a separate queue entry and x/y
    // divisions for every background pixel.
    for (
      let index = start;
      index < rowEnd && exterior[index] !== 1 && data[index * 4 + 3] < 128;
      index++
    ) {
      exterior[index] = 1;
      if (y > 0) {
        const above = index - width;
        const open = exterior[above] !== 1 && data[above * 4 + 3] < 128;
        if (open && !aboveSpan) enqueue(index - rowStart, y - 1);
        aboveSpan = open;
      }
      if (y + 1 < height) {
        const below = index + width;
        const open = exterior[below] !== 1 && data[below * 4 + 3] < 128;
        if (open && !belowSpan) enqueue(index - rowStart, y + 1);
        belowSpan = open;
      }
    }
  }
  return exterior;
}

function createMaterialColorResolver() {
  let context: CanvasRenderingContext2D | null = null;
  let previous: string | undefined;
  let color: [number, number, number, number] = [0, 0, 0, 0];
  return (value = 'auto') => {
    if (value === previous) return color;
    previous = value;
    color = [0, 0, 0, 0];
    if (!value.trim() || value.trim().toLowerCase() === 'auto') return color;
    if (!context) {
      const sample = document.createElement('canvas');
      sample.width = sample.height = 1;
      context = sample.getContext('2d', { willReadFrequently: true });
    }
    if (!context) return color;
    // Invalid CSS leaves fillStyle unchanged. Two sentinels distinguish that
    // from a valid black or white color without parsing CSS color spaces.
    context.fillStyle = '#000000';
    context.fillStyle = value;
    const resolved = context.fillStyle;
    context.fillStyle = '#ffffff';
    context.fillStyle = value;
    if (context.fillStyle !== resolved) return color;
    context.clearRect(0, 0, 1, 1);
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    color = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, pixel[3] / 255];
    return color;
  };
}

export type RefractedRenderer = {
  setTypography: (
    text: string,
    fontFamily: string,
    fontWeight: number | string,
    letterSpacing: string,
    extraBold?: number,
    cornerRounding?: number,
  ) => void;
  resize: (force?: boolean) => void;
  render: (
    time: number,
    duration: number,
    openingDuration: number,
    intensity: number,
    beamPosition: number,
    fixedBeam: boolean,
    pointerX: number,
    pointerY: number,
    pointerInfluence: number,
    cursorMovesBeam: boolean,
    lightTheme: number,
    revealTime: number,
    liftDuration: number,
    stagger: number,
    ease: RefractedLiftEase,
    beamFollowsLift: boolean,
    topColor?: string,
    bottomColor?: string,
    dispersion?: number,
    colorIntensity?: number,
  ) => void;
  dispose: () => void;
};

export type RefractedLiftEase =
  | 'power4.out'
  | 'power3.out'
  | 'power2.out'
  | 'power1.out'
  | 'expo.out'
  | 'sine.out'
  | 'sine.inOut'
  | 'none';

function liftProgress(progress: number, ease: RefractedLiftEase) {
  switch (ease) {
    case 'power4.out':
      return 1 - (1 - progress) ** 5;
    case 'power3.out':
      return 1 - (1 - progress) ** 4;
    case 'power2.out':
      return 1 - (1 - progress) ** 3;
    case 'power1.out':
      return 1 - (1 - progress) ** 2;
    case 'expo.out':
      return 1 - 2 ** (-10 * progress) * (1 - progress) - (1 - progress) ** 6 * progress;
    case 'sine.out':
      return Math.sin((progress * Math.PI) / 2);
    case 'sine.inOut':
      return (1 - Math.cos(progress * Math.PI)) / 2;
    case 'none':
      return progress;
    default:
      return 1 - (1 - progress) ** 5;
  }
}

export function createRefractedRenderer(
  canvas: HTMLCanvasElement,
  text: string,
  fontFamily: string,
  fontWeight: number | string,
  letterSpacing: string,
  extraBold = 0,
  cornerRounding = 0,
): RefractedRenderer | null {
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!context) return null;
  const gl: WebGL2RenderingContext = context;
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const glowTexture = gl.createTexture();
  let disposed = false;
  if (!vertex || !fragment || !program || !buffer || !texture || !glowTexture) {
    dispose();
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose();
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, glowTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'uGlowMask'), 2);

  let letters = Array.from(text);
  let virtualWidth = Math.max(1, letters.length * 394);
  // WebGL keeps uniform values between draws. Only send values that changed,
  // so a flowing beam does not resend every material/control on every frame.
  const floatUniform = (name: string) => {
    const location = gl.getUniformLocation(program, name);
    let previous: number | undefined;
    return (value: number) => {
      if (value === previous) return;
      gl.uniform1f(location, value);
      previous = value;
    };
  };
  const colorUniform = (name: string) => {
    const location = gl.getUniformLocation(program, name);
    let previous: readonly number[] | undefined;
    return (value: [number, number, number, number]) => {
      if (value === previous) return;
      gl.uniform4fv(location, value);
      previous = value;
    };
  };
  const resolution = gl.getUniformLocation(program, 'uResolution');
  const timeUniform = floatUniform('uTime');
  const durationUniform = floatUniform('uDuration');
  const openingDurationUniform = floatUniform('uOpeningDuration');
  const liftFlowUniform = floatUniform('uLiftFlow');
  const revealGlyphUniform = floatUniform('uRevealGlyph');
  const revealLiftUniform = floatUniform('uRevealLift');
  const beamFollowsLiftUniform = floatUniform('uBeamFollowsLift');
  const intensityUniform = floatUniform('uIntensity');
  const dispersionUniform = floatUniform('uDispersion');
  const colorIntensityUniform = floatUniform('uColorIntensity');
  const beamPositionUniform = floatUniform('uBeamPosition');
  const fixedBeamUniform = floatUniform('uFixedBeam');
  const pointerUniform = gl.getUniformLocation(program, 'uPointer');
  let previousPointerX: number | undefined;
  let previousPointerY: number | undefined;
  const pointerInfluenceUniform = floatUniform('uPointerInfluence');
  const cursorMovesBeamUniform = floatUniform('uCursorMovesBeam');
  const lightThemeUniform = floatUniform('uLightTheme');
  const topColorUniform = colorUniform('uTopColor');
  const bottomColorUniform = colorUniform('uBottomColor');
  const resolveTopColor = createMaterialColorResolver();
  const resolveBottomColor = createMaterialColorResolver();
  gl.uniform1f(gl.getUniformLocation(program, 'uVirtualWidth'), virtualWidth);
  gl.uniform1f(gl.getUniformLocation(program, 'uGlyphCount'), letters.length);
  let glyphBounds: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  let maskWidth = 0;
  let maskHeight = 0;

  function setTypography(
    nextText: string,
    nextFontFamily: string,
    nextFontWeight: number | string,
    nextLetterSpacing: string,
    nextExtraBold = 0,
    nextCornerRounding = 0,
  ) {
    if (
      disposed ||
      (nextText === text &&
        nextFontFamily === fontFamily &&
        nextFontWeight === fontWeight &&
        nextLetterSpacing === letterSpacing &&
        nextExtraBold === extraBold &&
        nextCornerRounding === cornerRounding)
    )
      return;
    text = nextText;
    fontFamily = nextFontFamily;
    fontWeight = nextFontWeight;
    letterSpacing = nextLetterSpacing;
    extraBold = nextExtraBold;
    cornerRounding = nextCornerRounding;
    letters = Array.from(text);
    virtualWidth = Math.max(1, letters.length * 394);
    maskWidth = maskHeight = 0;
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'uVirtualWidth'), virtualWidth);
    gl.uniform1f(gl.getUniformLocation(program, 'uGlyphCount'), letters.length);
  }

  function resize(force = false) {
    if (disposed || gl.isContextLost()) return;
    // Layout size, not getBoundingClientRect: a CSS transform (such as the
    // catalog miniature's scale) must not lower the backing resolution, since
    // no resize event follows when the transform is removed.
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    // ResizeObserver and font events can report the same size repeatedly.
    // Only a changed backing size or an explicit font refresh needs new masks.
    if (
      !force &&
      maskWidth === width &&
      maskHeight === height &&
      canvas.width === width &&
      canvas.height === height
    )
      return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const ctx = mask.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.scale(width / virtualWidth, height / 318);
    ctx.fillStyle = '#fff';
    ctx.font = `${fontWeight} 342px ${fontFamily}`;
    ctx.fontKerning = 'normal';
    ctx.letterSpacing = letterSpacing;
    const run = ctx.measureText(text);
    const capAscent = ctx.measureText('H').actualBoundingBoxAscent;
    const ascent = Math.max(capAscent, run.actualBoundingBoxAscent);
    const descent = Math.max(0, run.actualBoundingBoxDescent);
    const strokeRadius =
      ((ascent + descent) *
        (Number.isFinite(extraBold) ? Math.max(0, Math.min(6, extraBold)) : 0)) /
      100;
    const roundingRadius =
      ((ascent + descent) *
        (Number.isFinite(cornerRounding) ? Math.max(0, Math.min(8, cornerRounding)) : 0)) /
      100;
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.lineWidth = strokeRadius * 2;
    const scaleY = 278 / Math.max(1, ascent + descent + strokeRadius * 2);
    const baseline = 20 + (ascent + strokeRadius) * scaleY;
    const inkWidth = run.actualBoundingBoxLeft + run.actualBoundingBoxRight + strokeRadius * 2;
    const scaleX = (virtualWidth - 60) / Math.max(1, inkWidth);
    const drawX = 30 + (run.actualBoundingBoxLeft + strokeRadius) * scaleX;
    const pixels = ctx.createImageData(width, height);
    const data = pixels.data;
    const flowMarkers = new Uint8Array(width * height);
    const distanceScale = (virtualWidth / (width * 394)) * 510;
    const smoothRadius = Math.max(2, Math.round(height * 0.055));
    const nextGlyphBounds: typeof glyphBounds = [];
    let prefix = '';
    for (let index = 0; index < letters.length; index++) {
      const letter = letters[index];
      const openContour =
        letter === 'C' ||
        letter === 'G' ||
        letter === 'c' ||
        letter === 'g' ||
        letter === 'E' ||
        letter === 'F';
      const uprightStem = /[IiTtLl1]/.test(letter);
      prefix += letter;
      // The prefix measurement includes the font's own kerning and spacing.
      const metrics = ctx.measureText(letter);
      const origin = ctx.measureText(prefix).width - metrics.width;
      ctx.clearRect(0, 0, virtualWidth, 318);
      ctx.save();
      ctx.translate(drawX + origin * scaleX, baseline);
      ctx.scale(scaleX, scaleY);
      if (strokeRadius > 0) ctx.strokeText(letter, 0, 0);
      ctx.fillText(letter, 0, 0);
      ctx.restore();
      // Read and scan only this glyph's columns, rather than the whole word
      // for every character. Font ink bounds include overhangs and accents.
      const glyphStart = Math.max(
        0,
        Math.min(
          width - 1,
          Math.floor(
            ((drawX + (origin - metrics.actualBoundingBoxLeft - strokeRadius * 10) * scaleX) *
              width) /
              virtualWidth,
          ) - 2,
        ),
      );
      const glyphEnd = Math.min(
        width,
        Math.ceil(
          ((drawX + (origin + metrics.actualBoundingBoxRight + strokeRadius * 10) * scaleX) *
            width) /
            virtualWidth,
        ) + 2,
      );
      const glyphWidth = Math.max(1, glyphEnd - glyphStart);
      const glyph = ctx.getImageData(glyphStart, 0, glyphWidth, height).data;
      roundGlyphCorners(
        glyph,
        glyphWidth,
        height,
        (roundingRadius * scaleX * width) / virtualWidth,
        (roundingRadius * scaleY * height) / 318,
      );
      const first = new Int32Array(height).fill(-1);
      const last = new Int32Array(height).fill(-1);
      let glyphLeft = width;
      let glyphRight = -1;
      let glyphTop = height;
      let glyphBottom = -1;
      for (let y = 0; y < height; y++) {
        for (let localX = 0; localX < glyphWidth; localX++) {
          if (glyph[(y * glyphWidth + localX) * 4 + 3] === 0) continue;
          const x = glyphStart + localX;
          if (first[y] < 0) first[y] = x;
          last[y] = x;
          glyphLeft = Math.min(glyphLeft, x);
          glyphRight = Math.max(glyphRight, x);
        }
        if (first[y] >= 0) {
          glyphTop = Math.min(glyphTop, y);
          glyphBottom = y;
        }
      }
      nextGlyphBounds.push({
        left: glyphLeft,
        right: glyphRight,
        top: glyphTop,
        bottom: glyphBottom,
      });
      for (let y = 0; y < height; y++) {
        if (first[y] < 0) continue;
        let left = 0;
        let right = 0;
        let weightSum = 0;
        for (let offset = -smoothRadius; offset <= smoothRadius; offset++) {
          const row = y + offset;
          if (row < 0 || row >= height || first[row] < 0) continue;
          const weight = smoothRadius + 1 - Math.abs(offset);
          left += first[row] * weight;
          right += last[row] * weight;
          weightSum += weight;
        }
        left /= weightSum;
        right /= weightSum;
        for (let x = first[y]; x <= last[y]; x++) {
          const offset = (y * width + x) * 4;
          const alpha = glyph[(y * glyphWidth + x - glyphStart) * 4 + 3];
          if (alpha <= data[offset + 3]) continue;
          data[offset] = Math.min(255, Math.round(Math.max(0, x - left) * distanceScale));
          data[offset + 1] = Math.min(255, Math.round(Math.max(0, right - x) * distanceScale));
          data[offset + 2] = Math.round((index / Math.max(1, letters.length - 1)) * 255);
          data[offset + 3] = alpha;
          flowMarkers[y * width + x] = openContour
            ? Math.round(
                alpha * (0.5 + (0.5 * (x - glyphLeft)) / Math.max(1, glyphRight - glyphLeft)),
              )
            : uprightStem
              ? Math.round(alpha * 0.28)
              : 0;
        }
      }
    }
    const exterior = findExterior(data, width, height);
    ctx.putImageData(pixels, 0, 0);
    const glowMask = document.createElement('canvas');
    glowMask.width = width;
    glowMask.height = height;
    const glowCtx = glowMask.getContext('2d');
    if (!glowCtx) return;
    glowCtx.filter = `blur(${Math.max(2, Math.round(height * 0.018))}px)`;
    glowCtx.drawImage(mask, 0, 0);
    // Repack the blur readback in place instead of allocating a second RGBA
    // image for the glow texture. Its original RGB channels are unused.
    const glowPixels = glowCtx.getImageData(0, 0, width, height);
    const glowData = glowPixels.data;
    for (let index = 0; index < width * height; index++) {
      glowData[index * 4] = glowData[index * 4 + 3];
      glowData[index * 4 + 1] = exterior[index] * 255;
      glowData[index * 4 + 2] = flowMarkers[index];
      glowData[index * 4 + 3] = 255;
    }
    glowCtx.filter = 'none';
    glowCtx.putImageData(glowPixels, 0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, glowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glowMask);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(resolution, width, height);
    glyphBounds = nextGlyphBounds;
    maskWidth = width;
    maskHeight = height;
  }

  function render(
    time: number,
    duration: number,
    openingDuration: number,
    intensity: number,
    beamPosition: number,
    fixedBeam: boolean,
    pointerX: number,
    pointerY: number,
    pointerInfluence: number,
    cursorMovesBeam: boolean,
    lightTheme: number,
    revealTime: number,
    liftDuration: number,
    stagger: number,
    ease: RefractedLiftEase,
    beamFollowsLift: boolean,
    topColor = 'auto',
    bottomColor = 'auto',
    dispersion = 1,
    colorIntensity = 1,
  ) {
    if (disposed || !canvas.width || !canvas.height || gl.isContextLost()) return;
    gl.useProgram(program);
    timeUniform(time);
    durationUniform(duration);
    openingDurationUniform(
      Number.isFinite(openingDuration) ? Math.max(2.1, Math.min(12, openingDuration)) : 4.9,
    );
    liftFlowUniform(Number.isFinite(revealTime) ? 1 : 0);
    intensityUniform(intensity);
    dispersionUniform(Number.isFinite(dispersion) ? Math.max(0, Math.min(3, dispersion)) : 1);
    colorIntensityUniform(
      Number.isFinite(colorIntensity) ? Math.max(0, Math.min(2, colorIntensity)) : 1,
    );
    beamPositionUniform(
      Number.isFinite(beamPosition) ? Math.max(0, Math.min(1, beamPosition)) : 0.5,
    );
    fixedBeamUniform(fixedBeam ? 1 : 0);
    if (pointerX !== previousPointerX || pointerY !== previousPointerY) {
      gl.uniform2f(pointerUniform, pointerX, pointerY);
      previousPointerX = pointerX;
      previousPointerY = pointerY;
    }
    pointerInfluenceUniform(pointerInfluence);
    cursorMovesBeamUniform(cursorMovesBeam ? 1 : 0);
    lightThemeUniform(lightTheme);
    topColorUniform(resolveTopColor(topColor));
    bottomColorUniform(resolveBottomColor(bottomColor));
    beamFollowsLiftUniform(beamFollowsLift ? 1 : 0);
    const totalLiftDuration = Number.isFinite(liftDuration)
      ? Math.max(0.2, Math.min(5, liftDuration))
      : 1.75;
    const requestedStagger = Number.isFinite(stagger) ? Math.max(0, Math.min(1, stagger)) : 0.55;
    const staggerWindow =
      letters.length > 1 ? Math.min(requestedStagger, totalLiftDuration - 0.1) : 0;
    const characterDuration = totalLiftDuration - staggerWindow;
    if (revealTime >= totalLiftDuration) {
      revealGlyphUniform(-1);
      revealLiftUniform(0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    for (let index = 0; index < glyphBounds.length; index++) {
      const { left, right, top, bottom } = glyphBounds[index];
      if (right < left) continue;
      const delay = letters.length > 1 ? (index / (letters.length - 1)) * staggerWindow : 0;
      const progress = Math.max(0, Math.min(1, (revealTime - delay) / characterDuration));
      // A lift of one places every pixel below the canvas; its draw is empty.
      if (progress === 0) continue;
      const lift = 1 - liftProgress(progress, ease);
      const start = Math.max(0, left - 3);
      const end = Math.min(canvas.width, right + 4);
      // Only the translated ink can contribute visible pixels. Include four
      // pixels for filtering and the original three-pixel lower light spill.
      const topEdge = Math.max(0, Math.floor(top + lift * canvas.height) - 4);
      const bottomEdge = Math.min(canvas.height, Math.ceil(bottom + lift * canvas.height) + 5);
      if (bottomEdge <= topEdge) continue;
      gl.scissor(start, canvas.height - bottomEdge, end - start, bottomEdge - topEdge);
      revealGlyphUniform(index);
      revealLiftUniform(lift);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    gl.deleteTexture(texture);
    gl.deleteTexture(glowTexture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (canvas.isConnected === false) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return { setTypography, resize, render, dispose };
}
