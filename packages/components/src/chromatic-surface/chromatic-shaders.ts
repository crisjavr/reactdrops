export const chromaticVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0., 1.);
}`;

// Live spherical rotation, source-space blur, plane projection and hue cycle.
export const chromaticFragmentShader = `
#ifdef USE_CHROMATIC_DERIVATIVES
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef USE_CHROMATIC_TEXTURE_LOD
#extension GL_EXT_shader_texture_lod : enable
#endif
precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec2 u_resolution;
uniform vec2 u_grid;
uniform float u_gap;
uniform float u_time;
uniform float u_phase;
uniform float u_feather;
uniform float u_projectionScale;
uniform float u_centerProjectionScale;
uniform float u_borderRadius;
uniform float u_intensity;
uniform float u_grain;
uniform float u_spread;
uniform float u_seed;
uniform vec3 u_color;
uniform float u_colorMode;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform sampler2D u_field;
uniform float u_hover;
uniform float u_hoverEffect;
uniform vec2 u_hoverPosition;

float hash(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 hsv(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0., 2./3., 1./3.)) * 6. - 3.);
  return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y);
}
vec3 rgbToHsv(vec3 c) {
  vec4 k = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1.e-8)), d / (q.x + 1.e-8), q.x);
}
mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

vec3 rotatedField(vec2 source, float t, float tile) {
  vec2 uv = source * vec2(3.14159265, 1.57079633);
  vec3 sphere = vec3(cos(uv.y) * sin(uv.x), sin(uv.y), cos(uv.y) * cos(uv.x));
  sphere.xy = rotate(sin(t * .22 + tile * 3.1) * .55) * sphere.xy;
  sphere.yz = rotate(sin(t * .18 + tile * 2.4) * .55) * sphere.yz;
  sphere.xz = rotate(t * .16 + tile * 6.28) * sphere.xz;
  vec2 fieldUv = vec2(atan(sphere.x, sphere.z) / 6.283185 + .5, asin(clamp(sphere.y, -1., 1.)) / 3.141593 + .5);
#ifdef USE_CHROMATIC_TEXTURE_LOD
  // Longitude wraps from 1 to 0 on the back meridian. Implicit derivatives see
  // that as a full-texture jump and pick the smallest mip, drawing dotted seams,
  // so select the mip from the wrapped (true) longitude change instead.
  vec2 dx = dFdx(fieldUv);
  vec2 dy = dFdy(fieldUv);
  dx.x -= floor(dx.x + .5);
  dy.x -= floor(dy.x + .5);
  return texture2DGradEXT(u_field, fieldUv, dx, dy).rgb;
#else
  return texture2D(u_field, fieldUv).rgb;
#endif
}
vec3 blurredField(vec2 source, float t, float tile) {
  // Blur the rotated field in the unprojected plane so compressed edges
  // remain soft after projection.
  float b = .045;
  vec3 c = rotatedField(source, t, tile) * .28;
  c += (rotatedField(source + vec2(b,0), t, tile) + rotatedField(source - vec2(b,0), t, tile)
    + rotatedField(source + vec2(0,b), t, tile) + rotatedField(source - vec2(0,b), t, tile)) * .12;
  c += (rotatedField(source + vec2(b,b), t, tile) + rotatedField(source - vec2(b,b), t, tile)
    + rotatedField(source + vec2(b,-b), t, tile) + rotatedField(source + vec2(-b,b), t, tile)) * .06;
  return c;
}
vec2 projectedSource(vec2 p, float fov) {
  vec2 angle = p * fov;
  float longitude = clamp(angle.x, -1.565, 1.565);
  float latitude = clamp(angle.y, -1.565, 1.565);
  return vec2(tan(longitude), tan(latitude) / max(.005, cos(longitude))) / tan(fov);
}
vec2 contourExtent() {
  vec2 halfSize = max(vec2(2.), (u_size / u_grid - u_gap) * .5);
  return halfSize / min(halfSize.x, halfSize.y);
}
float contourRadius(vec2 p) {
  // Intersect a ray with circular corners in physical coordinates. A wide
  // button retains straight sides and round end caps instead of becoming an ellipse.
  vec2 direction = abs(p) / max(length(p), .000001);
  vec2 extent = contourExtent();
  vec2 center = extent - u_borderRadius;
  if (direction.y * extent.x <= direction.x * center.y)
    return extent.x / max(direction.x, .000001);
  if (direction.x * extent.y <= direction.y * center.x)
    return extent.y / max(direction.y, .000001);
  float cross = direction.x * center.y - direction.y * center.x;
  return dot(direction, center)
    + sqrt(max(u_borderRadius * u_borderRadius - cross * cross, 0.));
}
float contourBoundary(vec2 p) {
  if (u_borderRadius < 0.) return max(abs(p.x), abs(p.y));
  vec2 physical = p * contourExtent();
  return length(physical) / max(contourRadius(physical), .000001);
}
vec2 materialSource(vec2 p, float fov, float centerFov) {
  if (u_borderRadius >= 0.) {
    // Project from the actual contour instead of clipping a square field.
    // Every point on the rounded/circular edge reaches the same source rim.
    float radius = contourBoundary(p);
    float angle = mix(centerFov, fov, smoothstep(.8, .95, radius));
    float projected = tan(min(radius * angle, 1.565)) / tan(angle);
    return p / max(length(p), .000001) * projected;
  }
  // The face can keep its own projection, which sets how the central gradient
  // moves, while the rim reflections keep the outer projection.
  float rim = smoothstep(.8, .95, max(abs(p.x), abs(p.y)));
  return mix(projectedSource(p, centerFov), projectedSource(p, fov), rim);
}
float projectedBoundary(vec2 p, float fov, float centerFov) {
  vec2 source = materialSource(p, fov, centerFov);
  return u_borderRadius < 0. ? max(abs(source.x), abs(source.y)) : length(source);
}
void main() {
  vec2 cellSize = u_size / u_grid;
  vec2 pixel = vec2(v_uv.x, 1. - v_uv.y) * u_size;
  vec2 id = floor(pixel / cellSize);
  vec2 halfSize = max(vec2(2.), (cellSize - u_gap) * .5);
  vec2 p = (mod(pixel, cellSize) - cellSize * .5) / halfSize;
  float tile = fract(dot(id, vec2(.754877666, .569840296)) + u_seed * .1031);
  float t = u_time + u_phase * 6.283185;
  if (u_hoverEffect > 1.5 && u_hoverEffect < 2.5) t += u_hover * 1.25;

  // Inverse of AE's Plane to Sphere: a 174 degree flat plane is mapped into
  // an equirectangular 360 x 180 degree frame. Most source pixels compress
  // into the perimeter; the colored rim is the projected field itself.
  float fov = radians(u_projectionScale * .5);
  float centerFov = radians(u_centerProjectionScale * .5);
  vec2 source = materialSource(p, fov, centerFov);
  float boundary = u_borderRadius < 0. ? max(abs(source.x), abs(source.y)) : length(source);
  float boxBoundary = contourBoundary(p);
  float edgeWidth;
  float boxWidth;
#ifdef USE_CHROMATIC_DERIVATIVES
  edgeWidth = fwidth(boundary);
  boxWidth = fwidth(boxBoundary);
#else
  // Match one framebuffer pixel even on devices without shader derivatives.
  vec2 dp = u_size / u_resolution / halfSize;
  vec2 dx = vec2(dp.x * .5, 0.);
  vec2 dy = vec2(0., dp.y * .5);
  edgeWidth = abs(projectedBoundary(p + dx, fov, centerFov) - projectedBoundary(p - dx, fov, centerFov))
    + abs(projectedBoundary(p + dy, fov, centerFov) - projectedBoundary(p - dy, fov, centerFov));
  boxWidth = abs(contourBoundary(p + dx) - contourBoundary(p - dx))
    + abs(contourBoundary(p + dy) - contourBoundary(p - dy));
#endif
  edgeWidth = max(edgeWidth, .0001);
  boxWidth = max(boxWidth, .0001);
  float feather = clamp(u_feather / 360., .001, 1.);
  // Integrate coverage across the pixel footprint instead of cutting a
  // subpixel contour. Feather still controls the material's inner softness.
  float opacity = 1. - smoothstep(1. - feather - edgeWidth * .5, 1. + edgeWidth * .5, boundary);
  opacity *= 1. - smoothstep(1. - boxWidth * .5, 1. + boxWidth * .5, boxBoundary);

  // Rotate the already colored, softened source as a panoramic field, just
  // as VR Rotate Sphere precedes the Plane to Sphere adjustment layer.
  vec2 sampleSource = source;
  if (u_hoverEffect > 2.5) sampleSource -= u_hoverPosition * u_hover * .18;
  vec3 sourceColor = blurredField(sampleSource, t, tile);
  float intensity = u_intensity;
  if (u_hoverEffect > .5 && u_hoverEffect < 1.5) intensity *= 1. + u_hover * .3;
  if (u_hoverEffect > 2.5) {
    vec2 light = p - u_hoverPosition;
    intensity *= 1. + u_hover * .4 * exp(-dot(light, light) * 3.);
  }
  vec3 sourceHsv = rgbToHsv(sourceColor);
  vec3 base = rgbToHsv(u_color);
  float hue = sourceHsv.x + base.x - .81 + tile * u_spread + t * .075;
  vec3 color = hsv(vec3(hue, sourceHsv.y * base.y, min(1., sourceHsv.z * 1.75 * intensity * base.z)));
  if (u_colorMode < 2.5) {
    vec3 palette = u_color;
    if (u_colorMode > .5) {
      // Change the whole material's tint over time. Spatial coordinates
      // affect the reflections, never the selected palette's color.
      float flow = .5 - .5 * cos((tile * u_spread + t * .075) * 6.283185);
      palette = mix(u_color, u_color2, flow);
      if (u_colorMode > 1.5) {
        palette = flow < .5
          ? mix(u_color, u_color2, flow * 2.)
          : mix(u_color2, u_color3, flow * 2. - 1.);
      }
    }
    vec3 paletteHsv = rgbToHsv(palette);
    color = hsv(vec3(paletteHsv.xy, min(1., sourceHsv.z * 1.75 * intensity * paletteHsv.z)));
  }
  color += (hash(vec3(floor(pixel * 1.5), u_seed)) - .5) * u_grain * (.1 + length(color) * .15);
  gl_FragColor = vec4(max(color, 0.) * opacity, opacity);
}`;
