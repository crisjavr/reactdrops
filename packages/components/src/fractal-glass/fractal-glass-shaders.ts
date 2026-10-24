export const fractalGlassVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fractalGlassMaskShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_blurred;
uniform float u_defaultMode;
uniform float u_smoothness;
uniform float u_textureScale;
uniform float u_blackPoint;
uniform float u_whitePoint;
uniform float u_gamma;
uniform float u_edgeWidth;
uniform vec2 u_size;
uniform vec2 u_pixelSize;
uniform vec2 u_cover;
uniform float u_stripes;
uniform float u_distortion;
uniform float u_refractionBias;
uniform vec2 u_refractionMean;
uniform float u_blur;
uniform float u_grain;
uniform float u_relief;
uniform float u_refraction;
uniform float u_roughness;
uniform float u_reflection;
uniform float u_dispersion;
uniform float u_caustics;
uniform float u_coverage;
uniform sampler2D u_stripeProgress;
uniform float u_stripeTextureWidth;
uniform float u_coverageStripes;
uniform float u_proceduralHover;
uniform float u_hoverReveal;
uniform float u_hoverReverse;
uniform float u_transitionBlend;
uniform float u_coverageHorizontal;
uniform float u_side;
uniform float u_horizontal;
uniform float u_amount;
uniform float u_circleHover;
uniform vec2 u_hoverCenter;
uniform float u_hoverRadius;
uniform float u_hoverFeather;
uniform sampler2D u_glassCache;
uniform float u_cachePass;
uniform float u_useGlassCache;

float circleDistance(vec2 uv) {
  return length((uv - u_hoverCenter) * u_size);
}
float circleMask(vec2 uv) {
  float distance = circleDistance(uv);
  float feather = min(u_hoverFeather, u_hoverRadius);
  if (feather <= 0.0) return step(distance, u_hoverRadius);
  return 1.0 - smoothstep(u_hoverRadius - feather, u_hoverRadius, distance);
}

float coveragePosition(vec2 uv) {
  float coordinate = mix(uv.x, 1.0 - uv.y, u_coverageHorizontal);
  return mix(coordinate, 1.0 - coordinate, u_side);
}
float coverageSize() { return mix(u_size.x, u_size.y, u_coverageHorizontal); }
// A wide travelling gradient reveals each strip from left to right, while opacity
// brings in the entire strip. Explicit endpoints preserve exact clear/full frames.
float hybridReveal(float progress, float along) {
  if (progress <= 0.0) return 0.0;
  if (progress >= 1.0) return 1.0;
  float feather = 0.25;
  float front = mix(-feather, 1.0 + feather, progress);
  float sweep = 1.0 - smoothstep(front - feather, front + feather, along);
  return mix(sweep, progress, u_transitionBlend);
}
float stripeLeftToRight(vec2 uv, float band, float count) {
  float left = u_horizontal > 0.5 ? 0.0 : band / count;
  float right = u_horizontal > 0.5 ? 1.0 : min(1.0, (band + 1.0) / count);
  // Normalize against the visible width, including clipped edge divisions and
  // horizontal flutes inside a continuous panel on either side of the image.
  if (u_coverageHorizontal < 0.5) {
    left = max(left, mix(0.0, 1.0 - u_coverage, u_side));
    right = min(right, mix(u_coverage, 1.0, u_side));
  }
  return clamp((uv.x - left) / max(0.00001, right - left), 0.0, 1.0);
}
float stripeHoverProgress(float band) {
  float index = clamp(band, 0.0, u_stripeTextureWidth - 1.0);
  vec2 encoded = texture2D(u_stripeProgress, vec2((index + 0.5) / u_stripeTextureWidth, 0.5)).ba;
  return dot(encoded, vec2(256.0, 1.0)) / 257.0;
}
// Coverage and procedural hover share a left-to-right sweep/opacity blend.
// Interpolate hover clocks, then soften the local sweep at the grooves so the
// repeating reveal does not introduce hard opacity seams between divisions.
float coverageReveal(vec2 uv) {
  if (u_coverageStripes < 0.5 && u_proceduralHover < 0.5) return 1.0;
  float count = u_stripes * mix(1.0, 100.0 / u_textureScale, u_defaultMode);
  float coordinate = mix(uv.x, uv.y, u_horizontal);
  float phase = coordinate * count;
  float band = min(u_stripeTextureWidth - 1.0, floor(phase));
  float along = stripeLeftToRight(uv, band, count);
  float reveal = 1.0;
  if (u_coverageStripes > 0.5) {
    vec2 encoded = texture2D(u_stripeProgress, vec2((band + 0.5) / u_stripeTextureWidth, 0.5)).rg;
    float progress = dot(encoded, vec2(256.0, 1.0)) / 257.0;
    reveal = hybridReveal(progress, along);
    if (reveal <= 0.0) return 0.0;
  }
  if (u_proceduralHover > 0.5) {
    float index = floor(phase - 0.5);
    float blend = smoothstep(0.0, 1.0, fract(phase - 0.5));
    float progress = mix(stripeHoverProgress(index), stripeHoverProgress(index + 1.0), blend);
    float groove = u_horizontal > 0.5 ? 1.0
      : smoothstep(0.0, 0.24, min(along, 1.0 - along));
    float sweep = mix(hybridReveal(progress, along), hybridReveal(progress, 1.0 - along),
      u_hoverReverse);
    float hover = mix(progress, sweep, groove);
    // Recovery can select its own direction without changing the glass texture.
    reveal *= mix(hover, 1.0 - hover, u_hoverReveal);
  }
  return reveal;
}

vec4 imageAt(vec2 uv) {
  return texture2D(u_image, clamp((uv - 0.5) * u_cover + 0.5, 0.0, 1.0));
}
`;

// A separate mask program avoids carrying the optical renderer's register and
// branching costs through every coverage, curtain and pointer-following frame.
// Share the exact mask functions with the direct renderer to preserve its edges.
export const fractalGlassCompositeFragmentShader = `${fractalGlassMaskShader}
void main() {
  vec4 original = imageAt(v_uv);
  float position = coveragePosition(v_uv);
  float mask = u_coverage <= 0.0 ? 0.0 : step(position, u_coverage);
  float reveal = mask * coverageReveal(v_uv);
  float amount = mask * u_amount;
  if (u_circleHover > 0.5) {
    reveal = circleMask(v_uv) * u_amount;
    amount = 1.0;
  }
  if (amount <= 0.00001 || reveal <= 0.00001) { gl_FragColor = original; return; }
  gl_FragColor = mix(original, texture2D(u_glassCache, v_uv), reveal);
}`;

export const fractalGlassFragmentShader = `${fractalGlassMaskShader}
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
}
vec3 toLinear(vec3 color) {
  return mix(pow((color + 0.055) / 1.055, vec3(2.4)), color / 12.92,
    step(color, vec3(0.04045)));
}
vec3 toSrgb(vec3 color) {
  color = max(vec3(0.0), color);
  return mix(1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, color * 12.92,
    step(color, vec3(0.0031308)));
}
vec4 blurredImage(vec2 uv, float radius) {
  if (radius <= 0.01) return imageAt(uv);
  vec2 b = vec2(radius) / u_size;
  return imageAt(uv) * 0.4
    + (imageAt(uv + vec2(b.x, 0.0)) + imageAt(uv - vec2(b.x, 0.0))
    + imageAt(uv + vec2(0.0, b.y)) + imageAt(uv - vec2(0.0, b.y))) * 0.15;
}
float smoothSlope(float distance, float width) {
  float t = clamp(distance / width, 0.0, 1.0);
  return 6.0 * t * (1.0 - t) / width;
}
// Height and its analytic gradient, measured in CSS pixels. Rounded flutes and
// the clipped panel bevel share one surface, so lighting follows the geometry.
vec3 surface(vec2 uv, vec2 axis, float stripeWidth, float amount) {
  float phase = fract(dot(uv, axis) * u_stripes);
  // An elliptical cross-section has steep walls at the groove and a rounded
  // crown. A cosine profile flattens at the seam and loses the glass rim.
  float across = phase * 2.0 - 1.0;
  float root = sqrt(max(0.035, 1.035 - across * across));
  float profileScale = sqrt(1.035) - sqrt(0.035);
  float profile = (root - sqrt(0.035)) / profileScale;
  float thickness = stripeWidth * 0.42 * u_relief * amount;
  float height = thickness * (0.14 + 0.86 * profile);
  vec2 slope = axis * (-thickness * 0.86 * 2.0 * across
    / (stripeWidth * root * profileScale));
  float position = coveragePosition(uv);
  float enter = position * coverageSize();
  float leave = (u_coverage - position) * coverageSize();
  float bevel = clamp(stripeWidth * 0.18, 1.5, 6.0);
  float a = smoothstep(0.0, bevel, enter);
  float b = smoothstep(0.0, bevel, leave);
  float edgeSlope = (smoothSlope(enter, bevel) * b
    - a * smoothSlope(leave, bevel)) * mix(1.0, -1.0, u_side);
  vec2 coverageAxis = mix(vec2(1.0, 0.0), vec2(0.0, -1.0), u_coverageHorizontal);
  return vec3(slope * a * b + coverageAxis * height * edgeSlope, height * a * b);
}
vec3 surfaceNormal(vec3 field) {
  return normalize(vec3(-field.xy, 1.0));
}
vec2 rayOffset(vec3 field, float stripeWidth) {
  vec3 ray = refract(vec3(0.0, 0.0, -1.0), surfaceNormal(field), 1.0 / 1.46);
  return ray.xy / max(0.25, abs(ray.z))
    * (stripeWidth * 0.22 + field.z) * u_refraction;
}
// Orient each strip's refraction without translating the texture or the mask.
// Offset the source by the field's mean, keeping the image anchored while
// individual strips change direction.
vec2 directedRefraction(vec2 displacement, vec2 axis) {
  float across = dot(displacement, axis);
  float centered = across - u_refractionMean.x;
  float directed = -sign(u_refractionBias)
    * (abs(across) - u_refractionMean.y) * mix(1.0, -1.0, u_horizontal);
  return displacement + axis * (mix(centered, directed, abs(u_refractionBias)) - across);
}
float refractionDerivative(float across) {
  float directedSlope = -sign(u_refractionBias) * sign(across) * mix(1.0, -1.0, u_horizontal);
  return mix(1.0, directedSlope, abs(u_refractionBias));
}
// A broad, dim environment gives the curved surface body without drawing a
// white streak. Roughness and the pixel footprint soften the angular shading.
vec3 environment(vec3 direction, vec2 uv, vec2 axis, float normalVariation) {
  vec2 along = vec2(-axis.y, axis.x);
  vec3 light = normalize(vec3(-0.45 * axis + 0.3 * along, 1.0));
  float exponent = mix(5.0, 1.0, u_roughness);
  exponent /= 1.0 + normalVariation;
  float softLight = pow(max(0.0, dot(direction, light)), exponent);
  float lengthwise = dot(uv, vec2(-axis.y, axis.x));
  float window = 0.35 + 0.65 * exp(-pow((lengthwise - mix(0.72, -0.28, u_horizontal)
    + 0.13 * dot(direction.xy, axis)) / 0.62, 2.0));
  vec3 room = mix(vec3(0.025, 0.035, 0.055), vec3(0.13, 0.16, 0.2),
    max(0.0, direction.z));
  return room + vec3(0.32, 0.35, 0.38) * softLight * window;
}
// The texture is a repeated black-to-white gradient. Smooth its height
// before taking the slope, so the reset becomes a rounded refracting groove.
// Refract the blurred source through the repeated gradient texture.
float textureSlope(float phase, float stripeWidth) {
  float sigma = max(0.008, u_smoothness / max(1.0, stripeWidth));
  float slope = 1.0;
  for (int i = 1; i <= 12; i++) {
    float k = float(i);
    slope -= 2.0 * cos(6.28318530718 * k * phase)
      * exp(-19.73920880218 * k * k * sigma * sigma);
  }
  return clamp(slope, -6.0, 2.0);
}
vec4 defaultGlass(vec4 original, float position, float amount) {
  vec2 axis = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), u_horizontal);
  float stripes = u_stripes * 100.0 / u_textureScale;
  float referenceWidth = 1080.0 / stripes;
  float phase = fract(dot(v_uv, axis) * stripes);
  float slope = textureSlope(phase, referenceWidth);
  // Displacement scales with the image using a 1080px base width.
  vec2 displacement = directedRefraction(axis * slope * u_distortion * 2.0 * amount / 1080.0, axis);
  vec2 uv = clamp(v_uv + displacement, 0.0, 1.0);
  vec4 glass = u_blur > 0.0 ? texture2D(u_blurred, uv) : imageAt(uv);
  // Add Noise: Uniform, Monochromatic, after Glass and before Levels.
  glass.rgb += noise(floor(v_uv * u_size)) * 2.0 * u_grain;
  float black = u_blackPoint / 255.0;
  float white = max(black + 1.0 / 255.0, u_whitePoint / 255.0);
  glass.rgb = pow(clamp((glass.rgb - black) / (white - black), 0.0, 1.0),
    vec3(1.0 / u_gamma));
  // The rectangle's 2px inside stroke (#3b3b3b), including the clipping edge.
  float along = mix(v_uv.y, v_uv.x, u_coverageHorizontal);
  float alongSize = mix(u_size.y, u_size.x, u_coverageHorizontal);
  float edge = min(min(position, u_coverage - position) * coverageSize(),
    min(along, 1.0 - along) * alongSize);
  if (u_circleHover > 0.5) edge = u_hoverRadius - circleDistance(v_uv);
  float strokeWidth = u_edgeWidth * u_size.x / 1080.0;
  float stroke = u_edgeWidth <= 0.0 ? 0.0
    : 1.0 - smoothstep(max(0.0, strokeWidth - u_pixelSize.x), strokeWidth, edge);
  glass.rgb = mix(glass.rgb, vec3(59.0 / 255.0), stroke);
  return mix(original, glass, amount);
}
void main() {
  vec4 original = imageAt(v_uv);
  float position = coveragePosition(v_uv);
  float mask = u_coverage <= 0.0 ? 0.0 : step(position, u_coverage);
  float reveal = u_cachePass > 0.5 ? 1.0 : mask * coverageReveal(v_uv);
  float amount = u_cachePass > 0.5 ? 1.0 : mask * u_amount;
  // Composite the same full glass texture through a circular mask in CSS pixels.
  // Pointer position changes only the mask; the image and refraction stay anchored.
  if (u_circleHover > 0.5) {
    reveal = u_cachePass > 0.5 ? 1.0 : circleMask(v_uv) * u_amount;
    amount = 1.0;
  }
  // The clear region is an exact source sample, without blur, noise or lighting.
  if (amount <= 0.00001 || reveal <= 0.00001) { gl_FragColor = original; return; }
  if (u_useGlassCache > 0.5) {
    gl_FragColor = mix(original, texture2D(u_glassCache, v_uv), reveal); return;
  }
  if (u_defaultMode > 0.5) {
    gl_FragColor = mix(original, defaultGlass(original, position, amount), reveal); return;
  }
  // Preserve an exact identity frame when every optical contribution is off,
  // including avoiding the quantization of an unnecessary sRGB round trip.
  if (u_relief <= 0.00001 && u_distortion * u_refraction <= 0.00001
      && u_blur <= 0.00001 && u_roughness <= 0.00001
      && u_reflection <= 0.00001 && u_grain <= 0.00001) {
    gl_FragColor = original; return;
  }
  vec2 axis = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), u_horizontal);
  float stripeWidth = dot(u_size, axis) / u_stripes;
  float coordinate = dot(v_uv, axis);
  float phase = fract(coordinate * u_stripes);
  // Preserve the optical displacement at the grooves, but taper their color
  // overlay to zero. Grazing Fresnel reflections must not paint dark dividers.
  float shading = smoothstep(0.025, 0.22, min(phase, 1.0 - phase));
  float clipDistance = min(position, u_coverage - position) * coverageSize();
  shading *= smoothstep(0.0, clamp(stripeWidth * 0.18, 1.5, 6.0), clipDistance);
  vec3 field = surface(v_uv, axis, stripeWidth, amount);
  vec3 normal = surfaceNormal(field);
  // Keep the repeated gradient ramp, then trace transmission through the
  // rounded surface with Snell's law, as in Fluid Glass Gradient.
  vec2 displacement = axis * ((phase - 0.5) * u_distortion * amount * u_refraction)
    + rayOffset(field, stripeWidth);
  float rayDerivative = refractionDerivative(dot(displacement, axis));
  displacement = directedRefraction(displacement, axis);
  vec2 uv = v_uv + displacement / u_size;
  float radius = (u_blur + u_roughness * u_roughness * (0.5 + field.z * 0.35)) * amount;
  vec4 color = blurredImage(uv, radius);
  if (u_dispersion > 0.00001) {
    vec2 spread = displacement * (0.12 * u_dispersion) / u_size;
    color.r = blurredImage(uv + spread, radius).r;
    color.b = blurredImage(uv - spread, radius).b;
  }
  // Flat transmission needs no lighting or color-space conversion. In this
  // mode an undisplaced channel retains the original texture precision.
  if (u_relief <= 0.00001 && u_reflection <= 0.00001 && u_caustics <= 0.00001) {
    color.rgb += noise(floor(v_uv * u_size)) * u_grain * amount;
    gl_FragColor = mix(original, vec4(clamp(color.rgb, 0.0, 1.0), color.a), reveal); return;
  }
  float normalVariation = 0.0;
  float focus = 0.0;
  // Neighboring normals are only needed for reflections; the four additional
  // refracted rays and Jacobian are only needed when caustics contribute light.
  if (u_reflection > 0.0 || u_caustics > 0.0) {
    vec2 stepSize = max(vec2(0.5), u_pixelSize);
    vec2 stepUV = stepSize / u_size;
    vec3 left = surface(v_uv - vec2(stepUV.x, 0.0), axis, stripeWidth, amount);
    vec3 right = surface(v_uv + vec2(stepUV.x, 0.0), axis, stripeWidth, amount);
    vec3 below = surface(v_uv - vec2(0.0, stepUV.y), axis, stripeWidth, amount);
    vec3 above = surface(v_uv + vec2(0.0, stepUV.y), axis, stripeWidth, amount);
    if (u_reflection > 0.0) {
      normalVariation = 0.5 * (
        length(surfaceNormal(right) - surfaceNormal(left)) * u_pixelSize.x / (2.0 * stepSize.x)
        + length(surfaceNormal(above) - surfaceNormal(below)) * u_pixelSize.y / (2.0 * stepSize.y));
    }
    if (u_caustics > 0.0) {
      float rampSlope = u_distortion * amount * u_refraction / stripeWidth;
      vec2 rayDx = (rayOffset(right, stripeWidth) - rayOffset(left, stripeWidth))
        / (2.0 * stepSize.x) + axis * axis.x * rampSlope;
      vec2 rayDy = (rayOffset(above, stripeWidth) - rayOffset(below, stripeWidth))
        / (2.0 * stepSize.y) + axis * axis.y * rampSlope;
      rayDx += axis * dot(rayDx, axis) * (rayDerivative - 1.0);
      rayDy += axis * dot(rayDy, axis) * (rayDerivative - 1.0);
      float area = abs((1.0 + rayDx.x) * (1.0 + rayDy.y) - rayDx.y * rayDy.x);
      focus = clamp(1.0 / max(0.4, area) - 1.0, -0.25, 1.5);
    }
  }
  // Add light and absorb transmission in linear space, then encode the image.
  color.rgb = toLinear(color.rgb);
  color.rgb *= 1.0 + focus * u_caustics * amount * shading;
  color.rgb *= exp(-vec3(0.08, 0.045, 0.025) * field.z / stripeWidth * shading);
  if (u_reflection > 0.0) {
    float fresnel = clamp((0.035 + 0.965 * pow(1.0 - max(0.0, normal.z), 5.0))
      * u_reflection * amount * shading, 0.0, 1.0);
    vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), normal);
    color.rgb = color.rgb * (1.0 - fresnel)
      + environment(reflected, v_uv, axis, normalVariation) * fresnel;
  }
  color.rgb = toSrgb(color.rgb);
  color.rgb += noise(floor(v_uv * u_size)) * u_grain * amount;
  gl_FragColor = mix(original, vec4(clamp(color.rgb, 0.0, 1.0), color.a), reveal);
}`;

// Two cached Gaussian passes on the image copy, before displacement. Each
// pass spans three standard deviations and clamps source edges, avoiding halos.
export const fractalGlassBlurFragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_cover;
uniform vec2 u_step;
vec4 sampleAt(vec2 uv) {
  return texture2D(u_source, clamp((uv - 0.5) * u_cover + 0.5, 0.0, 1.0));
}
void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) / 4.0;
    float weight = exp(-0.5 * x * x);
    color += sampleAt(v_uv + u_step * x) * weight;
    total += weight;
  }
  gl_FragColor = color / total;
}`;
