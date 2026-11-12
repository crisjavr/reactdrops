import { fluidRipplesField as field } from './fluid-ripples-field';

export const fluidRipplesVertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Blur precedes shared turbulence; screen derivatives include its effect on the water normals. */
export const fluidRipplesFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution, uBufferSize;
uniform float uCount, uWidth, uDistortion, uTurbulence, uBlur, uRefraction, uSeed, uDark, uCustomPalette;
uniform vec3 uBackground, uBlue, uLavender, uHighlight;
uniform vec4 uRings[24];
uniform float uAmplitude[24];
uniform sampler2D uNoise;
const float TAU = 6.28318530718;

vec2 noise(vec2 p) {
  return texture(uNoise,p).rg*2.0-1.0;
}
vec3 palette(vec3 color, float bend) {
  if (uDark > .5) {
    float cool=clamp((color.b-color.r-.025)*7.0,0.0,1.0);
    float lavender=clamp((color.b-color.g-.025)*9.0,0.0,1.0);
    vec3 ink=mix(uBackground,uBlue,cool*.72);
    ink=mix(ink,uLavender,lavender*.28);
    return mix(ink,uHighlight,clamp(bend*.14,0.0,.30));
  }
  mat3 inversePalette = mat3(-8.30651491,8.45663265,1.65129513,
    6.25490581,-17.88903061,-.47537284,6.75529827,6.17984694,14.78659733);
  vec3 w = inversePalette*(color-vec3(230.0,238.0,240.0)/255.0);
  vec4 weights = vec4(1.0-w.x-w.y-w.z,w);
  if (uCustomPalette > .5) {
    // Keep saturated presets inside their four colors instead of extrapolating into clipped RGB.
    weights=max(weights,vec4(0.0));
    weights/=max(.0001,dot(weights,vec4(1.0)));
  }
  return weights.x*uBackground+weights.y*uBlue+weights.z*uLavender+weights.w*uHighlight;
}
vec3 gradient(vec2 u) {
  float twist = noise(u*.8+vec2(.17,.29)).x*${field.backgroundTwist.toFixed(8)};
  vec2 q = mat2(cos(twist),sin(twist),-sin(twist),cos(twist))*(u-.5)+.5;
  vec2 p1=vec2(.27552,.31074), p2=vec2(.33953,.89130);
  vec2 p3=vec2(.94161,.13269), p4=vec2(.62161,.69287);
  float w1=1.0/pow(.015+dot(q-p1,q-p1),2.0);
  float w2=1.0/pow(.015+dot(q-p2,q-p2),2.0);
  float w3=1.0/pow(.015+dot(q-p3,q-p3),2.0);
  float w4=1.0/pow(.015+dot(q-p4,q-p4),2.0);
  vec3 pearl=vec3(.941,.953,.976);
  vec3 material=(vec3(.773,.859,.965)*w1+vec3(.870,.875,.941)*w2
    +pearl*w3+vec3(.800,.905,.957)*w4)/(w1+w2+w3+w4);
  // The tutorial's twisted material opens into a broad pearl pool on the right.
  float pool=smoothstep(.62,.92,q.x)*(.7+.3*smoothstep(.2,.7,q.y));
  return mix(material,pearl,pool);
}
void main() {
  vec2 uv=vec2(vUv.x,1.0-vUv.y);
  float aspect=uResolution.x/max(1.0,uResolution.y);
  vec2 p=uv*vec2(aspect,1.0);
  vec2 turbulence=noise(p/vec2(766.0/438.0,1.0)*.093/max(.02,uTurbulence)
    +vec2((uSeed-1.0)*.173,(uSeed-1.0)*.117));
  float widthScale=sqrt(uWidth*uWidth+2.0*uBlur*uBlur)/.11445523;
  float height=0.0;
  for (int i=0;i<24;i++) {
    if(float(i)>=uCount) break;
    vec4 ring=uRings[i];
    vec2 q=p-ring.xy+turbulence*uDistortion;
    float d=(length(q)-ring.z)/max(.008,ring.w*widthScale);
    height+=exp(-.5*d*d)*uAmplitude[i];
  }
  // Work in height units regardless of the drawing-buffer resolution.
  vec2 slope=vec2(dFdx(height),-dFdy(height))*uBufferSize.y*uRefraction/.41;
  vec3 normal=normalize(vec3(-slope,1.0));
  vec3 ray=refract(vec3(0,0,-1),normal,1.0/${field.refractiveIndex.toFixed(8)});
  vec2 offset=ray.xy/max(.1,-ray.z)*${field.depth.toFixed(8)};
  vec3 color=gradient(uv+offset);
  float diffuse=${field.ambient.toFixed(8)}+${field.lightPower.toFixed(8)}*dot(normal,normalize(vec3(-.6,-.5,1.0)));
  color*=1.0+(diffuse-1.0)*${field.lighting.toFixed(8)};
  fragColor=vec4(clamp(palette(color,length(slope)),0.0,1.0),1.0);
}`;
