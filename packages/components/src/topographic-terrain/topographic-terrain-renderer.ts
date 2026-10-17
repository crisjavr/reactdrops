import {
  terraceShader,
  terrainSplineShader,
  terrainElevationColorShader,
  terrainMaterialShader,
} from './topographic-terrain-shaders';
import {
  pointerWarpShader,
  type TopographicSurfaceFrame,
} from '../topographic-flow/topographic-surface';

// Keep fine silhouettes at device resolution without unbounded full-screen
// color/depth storage. The budget counts both resolution and MSAA samples.
const maximumPixelRatio = 2;
const renderPixelBudget = 8_388_608;

const vertex = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform ivec2 uMesh;
uniform sampler2D uHeight;
uniform vec2 uGrid, uExtent, uViewport;
uniform vec4 uCamera;
uniform float uMargin, uCosine, uSine, uDensity, uElevation, uSoftness;
uniform float uZoom, uDistance, uOverscan;
uniform vec4 uStamps[1];
uniform highp int uStampCount;
uniform float uPointerRadius, uPointerLift;
out vec2 vField;
out vec3 vWorld;
${pointerWarpShader}
${terraceShader}
vec4 weights(float t) {
  float t2=t*t, t3=t2*t;
  return vec4(1.-3.*t+3.*t2-t3,4.-6.*t2+3.*t3,1.+3.*t+3.*t2-3.*t3,t3)/6.;
}
float elevationHeight(vec2 uv) {
  vec2 p=uv*(uGrid-1.), cell=floor(p), f=fract(p);
  vec4 x=weights(f.x), y=weights(f.y);
  float result=0.;
  ivec2 size=ivec2(uGrid), origin=ivec2(cell)-1;
  // Mesh vertices only need height. The fragment shader recovers slope at
  // the corrected intersection, so vertex derivative work would be unused.
  for(int j=0;j<4;j++) for(int i=0;i<4;i++) {
    vec3 h=texelFetch(uHeight,clamp(origin+ivec2(i,j),ivec2(0),size-1),0).rgb;
    float altitude=dot(h,vec3(1.,uCosine,uSine));
    result+=altitude*(x[i]*y[j]);
  }
  return result;
}
void main() {
  // Indexed vertex IDs locate the regular grid without a position buffer.
  int row=gl_VertexID/(uMesh.x+1), column=gl_VertexID-row*(uMesh.x+1);
  vec2 aScreen=vec2(column,row)/vec2(uMesh);
  // A fixed screen grid intersects the camera's ground plane. This puts mesh
  // detail in the visible footprint instead of wasting it across huge overscan.
  vec2 screen=(aScreen*2.-1.)*uViewport*.5*uOverscan/uZoom;
  float st=uCamera.x, ct=uCamera.y, sr=uCamera.z, cr=uCamera.w;
  float denominator=max(ct*uDistance-screen.y*st,uDistance*.025);
  float ry=screen.y*uDistance/denominator;
  float rx=screen.x*(1.+st*ry/uDistance);
  vec2 ground=vec2(cr*rx+sr*ry,-sr*rx+cr*ry);
  vField=(vec2(ground.x+uViewport.x*.5,uViewport.y*.5-ground.y)+uMargin)/uExtent;
  // The pointer deforms the terrain horizontally: the ground spreads outward
  // on its own plane (heights unchanged), so the tilted camera shows the
  // layers themselves moving aside. Sample where the spread moved this from.
  vec2 spread=pointerWarp(ground,uPointerLift);
  float altitude=elevationHeight(
    (vec2(spread.x+uViewport.x*.5,uViewport.y*.5-spread.y)+uMargin)/uExtent);
  // The riser is centered on the original contour level. Quintic easing keeps
  // height, velocity and acceleration continuous as a vertex crosses a level.
  float q=(altitude-.037)*uDensity+.5;
  float terrace=terraceProfile(q)-.5;
  float z=(terrace/uDensity+.037)*uElevation;
  vWorld=vec3(ground,z);
  float viewY=ct*ry+st*z, depth=-st*ry+ct*z;
  float w=1.-depth/uDistance;
  // Reversed floating-point depth keeps a compact depth range independent
  // of the heightfield's oversized cache and its changing camera footprint.
  gl_Position=vec4(vec2(rx,viewY)*2./uViewport*uZoom,.0002-w,w);
}`;

const fragment = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uHeight, uGrain;
uniform vec2 uGrid, uExtent, uCanvasSize, uViewport;
uniform vec4 uCamera;
uniform float uDistance, uMargin, uZoom;
uniform float uCosine, uSine, uDensity, uElevation, uSoftness, uRatio;
uniform float uWidth, uOpacity, uGrainAmount, uLightingBlend, uLightIntensity, uGradientDiffusion;
uniform vec3 uLineColor, uAccentColor, uSurfaceColor, uShadowColor, uLight, uGradientColors[8];
uniform int uGradientStops;
uniform vec4 uStamps[1];
uniform highp int uStampCount;
uniform float uPointerRadius, uPointerLift;
in vec2 vField;
in vec3 vWorld;
uniform bool uCustomShadow;
out vec4 color;
${pointerWarpShader}${terrainSplineShader}${terrainElevationColorShader}${terraceShader}
vec2 fieldAt(vec3 position) {
  return (vec2(position.x+uViewport.x*.5,uViewport.y*.5-position.y)+uMargin)/uExtent;
}
// Height and world-space slope through the ground expansion; its Jacobian
// carries the slope back so lighting follows the spread terrain exactly.
vec3 surfaceAt(vec2 ground) {
  vec2 spread=pointerWarp(ground,uPointerLift);
  vec3 surface=elevationSurface(fieldAt(vec3(spread,0.)));
  surface.yz=transpose(warpJacobian)*surface.yz;
  return surface;
}
void main() {
  vec3 camera=vec3(-uCamera.z*uCamera.x*uDistance,-uCamera.w*uCamera.x*uDistance,uCamera.y*uDistance);
  vec3 position=vWorld;
  vec3 ray=normalize(position-camera);
  vec3 sampled=surfaceAt(position.xy);
  // Rasterization supplies a close initial intersection. Correct it along
  // the camera ray so lighting and depth follow the same smooth surface,
  // rather than the mesh's piecewise-linear approximation of each bevel.
  vec3 origin=position;
  float travel=0., positive=0., negative=0.;
  bool hasPositive=false, hasNegative=false;
  for(int i=0;i<12;i++) {
    float phase=(sampled.x-.037)*uDensity+.5;
    float height=((terraceProfile(phase)-.5)/uDensity+.037)*uElevation;
    float residual=position.z-height;
    // A 1/200 CSS-pixel height residual is already far below the raster
    // footprint; avoid another spline evaluation for invisible corrections.
    if(abs(residual)<.005) break;
    if(residual>0.) { positive=travel; hasPositive=true; }
    else { negative=travel; hasNegative=true; }
    vec2 slope=sampled.yz*uElevation*terraceGain(phase);
    float denominator=ray.z-dot(slope,ray.xy);
    // Small hills have steep, closely spaced walls. A free Newton step can
    // jump to the next layer and oscillate; limit its contour-phase travel.
    float maxStep=min(8.,.15/max(uDensity*abs(dot(sampled.yz,ray.xy)),.00001));
    float next=travel-(abs(denominator)>.025?clamp(residual/denominator,-maxStep,maxStep):0.);
    // A narrow riser can fall entirely between two Newton samples. Retain
    // the samples above and below it; bisect whenever Newton would escape
    // that bracket, instead of bouncing between the neighboring plateaus.
    // Either orientation is valid: back-facing intersections still converge
    // before the visibility test below rejects them.
    float lower=min(positive,negative), upper=max(positive,negative);
    if(hasPositive&&hasNegative&&(next<=lower||next>=upper)) next=(lower+upper)*.5;
    position=origin+ray*next;
    travel=next;
    sampled=surfaceAt(position.xy);
  }
  float altitude=sampled.x;
  float q=(altitude-.037)*uDensity+.5;
  vec2 slope=sampled.yz*uElevation*terraceGain(q);
  if(dot(vec3(-slope,1.),ray)>0.) discard;
  // Different visible branches meet at occlusion boundaries. Screen-space
  // derivatives of their interpolated positions jump there; the analytic
  // projection Jacobian gives a stable pixel footprint on either surface.
  vec2 right=vec2(uCamera.w,-uCamera.z), forward=vec2(uCamera.z,uCamera.w);
  float rx=dot(right,position.xy), ry=dot(forward,position.xy);
  float depth=-uCamera.x*ry+uCamera.y*position.z;
  float w=1.-depth/uDistance;
  // Height slope is a scalar multiple of the field slope. Reducing the
  // projection inverse along that slope avoids constructing its 2x2 matrix.
  vec2 fieldCamera=vec2(dot(sampled.yz,right),dot(sampled.yz,forward));
  float cameraHeight=uCamera.y*uDistance-position.z;
  float projectionDenominator=cameraHeight+dot(slope,position.xy-camera.xy);
  // det(J)=zoom^2*denominator/(w^3*distance). Preserve the original signed
  // abs(det)>=1e-5 floor by expressing it in this denominator's units.
  float minimumDenominator=.00001*w*w*w*uDistance/(uZoom*uZoom);
  projectionDenominator=sign(projectionDenominator)*max(abs(projectionDenominator),minimumDenominator);
  vec2 screenSlope=vec2(fieldCamera.x*cameraHeight,
    fieldCamera.y*w*uDistance+fieldCamera.x*rx*uCamera.x)
    *(uDensity*w/(uZoom*uRatio*projectionDenominator));
  float footprint=max(abs(screenSlope.x)+abs(screenSlope.y),.0001);
  float gain=(terraceProfile(q+footprint*.5)-terraceProfile(q-footprint*.5))/footprint;
  vec3 normal=normalize(vec3(-sampled.yz*uElevation*gain,1.));
  gl_FragDepth=.0001/w;
${terrainMaterialShader}
}`;

const smoothChannel = (value: number) => {
  const channel = Math.max(0, Math.min(1, value));
  return channel * channel * (3 - 2 * channel);
};

const finite = (value: number | undefined, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));

const heightVertex = `#version 300 es
void main() {
  vec2 position=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);
  gl_Position=vec4(position,0.,1.);
}`;
const heightFragment = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uHeight;
uniform float uCosine, uSine;
out float altitude;
void main() {
  vec3 h=texelFetch(uHeight,ivec2(gl_FragCoord.xy),0).rgb;
  altitude=dot(h,vec3(1.,uCosine,uSine));
}`;

/** Indexed terraces reuse the flat renderer's cached height and grain textures.
 * Mesh positions are camera-projected in the shader; camera edits only uniforms.
 * Float render targets preblend the three height modes once per cache texel,
 * rather than repeating their dot product at every vertex and ray correction.
 * The color/depth target exists only after the first 3D draw.
 */
export function createTopographicTerrainSurface(
  gl: WebGL2RenderingContext,
  geometry?: {
    vertex: string;
    fragment: string;
    clearAlpha?: number;
    meshSize?: (width: number, height: number) => readonly [number, number];
    updateUniforms?: (gl: WebGL2RenderingContext, program: WebGLProgram) => void;
  },
) {
  // Pointer imprints in ground space (x, y, strength, summit) and the last
  // values sent; a terrain without hover uploads none of them per frame.
  const groundStamps = new Float32Array(4),
    sentStamps = new Float32Array(4);
  let sentStampCount = NaN,
    sentPointerRadius = NaN,
    sentPointerLift = NaN;
  let program: WebGLProgram | null = null,
    vao: WebGLVertexArrayObject | null = null,
    indices: WebGLBuffer | null = null,
    target: WebGLFramebuffer | null = null,
    multisampleColor: WebGLRenderbuffer | null = null,
    depth: WebGLRenderbuffer | null = null,
    heightProgram: WebGLProgram | null = null,
    heightTarget: WebGLFramebuffer | null = null,
    scalarTexture: WebGLTexture | null = null;
  const shaders: WebGLShader[] = [];
  let locations: Record<string, WebGLUniformLocation | null> = {};
  let count = 0,
    samples = 1;
  let samplesKnown = false;
  let meshColumns = 0,
    meshRows = 0,
    storageWidth = 0,
    storageHeight = 0;
  const discardedAttachments = [gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT];
  let staticFrame: TopographicSurfaceFrame | null = null;
  let scalarHeight = false;
  let scalarColumns = 0,
    scalarRows = 0,
    scalarRevision = -1,
    scalarCosine = NaN,
    scalarSine = NaN;
  let heightLocations: Record<string, WebGLUniformLocation | null> = {};
  const destroy = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    shaders.length = 0;
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(indices);
    gl.deleteFramebuffer(target);
    gl.deleteRenderbuffer(multisampleColor);
    gl.deleteRenderbuffer(depth);
    gl.deleteProgram(heightProgram);
    gl.deleteFramebuffer(heightTarget);
    gl.deleteTexture(scalarTexture);
    program = vao = indices = target = multisampleColor = depth = null;
    heightProgram = heightTarget = scalarTexture = null;
    locations = {};
    meshColumns = meshRows = storageWidth = storageHeight = 0;
    staticFrame = null;
    scalarColumns = scalarRows = 0;
    scalarRevision = -1;
    scalarCosine = scalarSine = NaN;
    heightLocations = {};
    count = 0;
  };
  const initializeSamples = () => {
    if (samplesKnown) return;
    const colorSamples = gl.getInternalformatParameter(
      gl.RENDERBUFFER,
      gl.RGBA8,
      gl.SAMPLES,
    ) as Int32Array;
    const depthSamples = gl.getInternalformatParameter(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT32F,
      gl.SAMPLES,
    ) as Int32Array;
    samples =
      [4, 2].find((value) => colorSamples.includes(value) && depthSamples.includes(value)) ?? 0;
    samplesKnown = true;
  };
  const initialize = () => {
    sentStampCount = sentPointerRadius = sentPointerLift = NaN;
    initializeSamples();
    scalarHeight = !!gl.getExtension('EXT_color_buffer_float');
    program = gl.createProgram();
    vao = gl.createVertexArray();
    indices = gl.createBuffer();
    target = gl.createFramebuffer();
    multisampleColor = gl.createRenderbuffer();
    depth = gl.createRenderbuffer();
    if (!program || !vao || !indices || !target || !multisampleColor || !depth)
      throw new Error('Terrace resources unavailable');
    for (const [type, original] of [
      [gl.VERTEX_SHADER, geometry?.vertex ?? vertex],
      [gl.FRAGMENT_SHADER, geometry?.fragment ?? fragment],
    ] as const) {
      const source = scalarHeight
        ? original.replaceAll('dot(h,vec3(1.,uCosine,uSine))', 'h.r')
        : original;
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Terrace shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Terrace linking failed');
    for (const name of [
      'uHeight',
      'uMesh',
      'uGrain',
      'uGrid',
      'uExtent',
      'uViewport',
      'uCanvasSize',
      'uMargin',
      'uCosine',
      'uSine',
      'uDensity',
      'uElevation',
      'uSoftness',
      'uCamera',
      'uZoom',
      'uDistance',
      'uOverscan',
      'uRatio',
      'uWidth',
      'uOpacity',
      'uGrainAmount',
      'uLightingBlend',
      'uLightIntensity',
      'uLineColor',
      'uAccentColor',
      'uSurfaceColor',
      'uShadowColor',
      'uCustomShadow',
      'uLight',
      'uGradientStops',
      'uGradientColors[0]',
      'uGradientDiffusion',
      'uStamps[0]',
      'uStampCount',
      'uPointerRadius',
      'uPointerLift',
    ])
      locations[name] = gl.getUniformLocation(program, name);
    gl.useProgram(program);
    gl.uniform1i(locations.uHeight, 0);
    gl.uniform1i(locations.uGrain, 2);
    if (scalarHeight) {
      heightProgram = gl.createProgram();
      heightTarget = gl.createFramebuffer();
      if (!heightProgram || !heightTarget) throw new Error('Terrain scalar cache unavailable');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, heightVertex],
        [gl.FRAGMENT_SHADER, heightFragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Terrain height shader unavailable');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(heightProgram, shader);
      }
      gl.linkProgram(heightProgram);
      if (!gl.getProgramParameter(heightProgram, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(heightProgram) ?? 'Terrain height linking failed');
      for (const name of ['uHeight', 'uCosine', 'uSine'])
        heightLocations[name] = gl.getUniformLocation(heightProgram, name);
      gl.useProgram(heightProgram);
      gl.uniform1i(heightLocations.uHeight, 0);
    }
  };
  const prepareHeight = (options: TopographicSurfaceFrame) => {
    if (!scalarHeight) return;
    const [columns, rows] = options.grid;
    if (columns !== scalarColumns || rows !== scalarRows) {
      gl.deleteTexture(scalarTexture);
      scalarTexture = gl.createTexture();
      if (!scalarTexture) throw new Error('Terrain scalar texture unavailable');
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, scalarTexture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, columns, rows);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, heightTarget);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        scalarTexture,
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Terrain scalar framebuffer unavailable');
      scalarColumns = columns;
      scalarRows = rows;
      scalarRevision = -1;
    }
    if (
      scalarRevision !== options.heightRevision ||
      scalarCosine !== options.cosine ||
      scalarSine !== options.sine
    ) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, options.heightTexture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, heightTarget);
      gl.viewport(0, 0, columns, rows);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(null);
      gl.useProgram(heightProgram);
      gl.uniform1f(heightLocations.uCosine, options.cosine);
      gl.uniform1f(heightLocations.uSine, options.sine);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      scalarRevision = options.heightRevision;
      scalarCosine = options.cosine;
      scalarSine = options.sine;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scalarTexture);
  };
  const prepareMesh = (width: number, height: number, scale: number) => {
    // Small hills need a closer initial ray intersection at their steep
    // walls. Two discrete detail levels avoid rebuilding geometry on every
    // scale edit. Denser initial intersections keep thin visible branches
    // continuous along the beveled silhouettes during morphing.
    const maximum = width < 520 ? (scale < 240 ? 640 : 512) : scale < 240 ? 1280 : 1024,
      longest = Math.max(width, height),
      columns =
        geometry?.meshSize?.(width, height)[0] ??
        Math.max(192, Math.round((maximum * width) / longest)),
      rows =
        geometry?.meshSize?.(width, height)[1] ??
        Math.max(192, Math.round((maximum * height) / longest));
    if (columns === meshColumns && rows === meshRows) return;
    // Each strip keeps the triangle list's diagonal. Fixed primitive restart
    // separates rows, using about a third of the original index storage.
    const faces = new Uint32Array(rows * ((columns + 1) * 2 + 1) - 1);
    let index = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x <= columns; x++) {
        const a = y * (columns + 1) + x;
        faces[index++] = a;
        faces[index++] = a + columns + 1;
      }
      if (y < rows - 1) faces[index++] = 0xffffffff;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faces, gl.STATIC_DRAW);
    count = faces.length;
    meshColumns = columns;
    meshRows = rows;
  };
  const prepareTarget = (width: number, height: number) => {
    if (width === storageWidth && height === storageHeight) return;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      gl.DEPTH_COMPONENT32F,
      width,
      height,
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, multisampleColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      multisampleColor,
    );
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('Terrace framebuffer unavailable');
    storageWidth = width;
    storageHeight = height;
  };
  return {
    presentationSize(width: number, height: number, ratio: number): readonly [number, number] {
      initializeSamples();
      const targetRatio = Math.min(
        ratio,
        maximumPixelRatio,
        Math.sqrt(renderPixelBudget / (Math.max(2, samples) * width * height)),
      );
      return [
        Math.max(1, Math.round(width * targetRatio)),
        Math.max(1, Math.round(height * targetRatio)),
      ];
    },
    draw(options: TopographicSurfaceFrame) {
      const { width, height, ratio, config } = options;
      if (!width || !height || gl.isContextLost()) return;
      try {
        if (!program) initialize();
        prepareMesh(width, height, finite(config.scale, 120, 900, 480));
        const targetRatio = Math.min(
            ratio,
            maximumPixelRatio,
            Math.sqrt(renderPixelBudget / (Math.max(2, samples) * width * height)),
          ),
          targetWidth = Math.max(1, Math.round(width * targetRatio)),
          targetHeight = Math.max(1, Math.round(height * targetRatio));
        prepareTarget(targetWidth, targetHeight);
        prepareHeight(options);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.enable(gl.DEPTH_TEST);
        // A triangle can cross the true silhouette after refinement. Let
        // physical surface normals decide visibility in the fragment shader.
        gl.disable(gl.CULL_FACE);
        gl.depthFunc(gl.GEQUAL);
        gl.depthMask(true);
        gl.clearDepth(0);
        gl.clearColor(
          geometry?.clearAlpha === 0 ? 0 : (options.background[0] ?? 0),
          geometry?.clearAlpha === 0 ? 0 : (options.background[1] ?? 0),
          geometry?.clearAlpha === 0 ? 0 : (options.background[2] ?? 0),
          geometry?.clearAlpha ?? 1,
        );
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        const previous = staticFrame;
        // The shared frame descriptor is mutable; keep an independent snapshot
        // of its static values. Only morph coefficients and an enabled RGB shadow change per frame.
        if (
          !previous ||
          previous.config !== config ||
          previous.width !== width ||
          previous.height !== height ||
          previous.ratio !== ratio ||
          previous.margin !== options.margin ||
          previous.grid[0] !== options.grid[0] ||
          previous.grid[1] !== options.grid[1] ||
          previous.extent[0] !== options.extent[0] ||
          previous.extent[1] !== options.extent[1] ||
          previous.line !== options.line ||
          previous.accent !== options.accent ||
          previous.surface !== options.surface ||
          previous.shadow !== options.shadow ||
          previous.gradient !== options.gradient
        ) {
          const elevation = finite(config.elevation, 0, 240, 120),
            tilt = (finite(config.cameraTilt, 0, 60, 48) * Math.PI) / 180,
            rotation = (finite(config.cameraRotation, -180, 180, -20) * Math.PI) / 180,
            direction = (finite(config.lightDirection, -360, 360, 315) * Math.PI) / 180,
            distance = Math.hypot(width, height) * 4 + elevation * 4;
          gl.uniform2i(locations.uMesh, meshColumns, meshRows);
          gl.uniform2f(locations.uGrid, options.grid[0], options.grid[1]);
          gl.uniform2f(locations.uExtent, options.extent[0], options.extent[1]);
          gl.uniform2f(locations.uViewport, width, height);
          gl.uniform2f(locations.uCanvasSize, targetWidth, targetHeight);
          gl.uniform1f(locations.uMargin, options.margin);
          gl.uniform1f(locations.uDensity, finite(config.density, 2, 20, 5));
          gl.uniform1f(locations.uElevation, elevation);
          gl.uniform1f(locations.uSoftness, finite(config.terraceSoftness, 0.08, 3, 0.6));
          // Camera trig is shared by every vertex; evaluate it once on the CPU.
          gl.uniform4f(
            locations.uCamera,
            Math.sin(tilt),
            Math.cos(tilt),
            Math.sin(rotation),
            Math.cos(rotation),
          );
          gl.uniform1f(locations.uZoom, finite(config.cameraZoom, 0.6, 2, 1));
          gl.uniform1f(locations.uDistance, distance);
          gl.uniform1f(
            locations.uOverscan,
            Math.min(2.5, 1.2 + (elevation / Math.max(120, Math.min(width, height))) * 1.8),
          );
          gl.uniform1f(locations.uRatio, targetRatio);
          gl.uniform1f(locations.uWidth, finite(config.lineWidth, 0.25, 5, 1));
          gl.uniform1f(locations.uOpacity, finite(config.opacity, 0, 1, 1));
          gl.uniform1f(locations.uGrainAmount, finite(config.grain, 0, 1, 0));
          gl.uniform1f(locations.uLightingBlend, finite(config.lightingBlend, 0, 1, 0));
          gl.uniform1f(locations.uLightIntensity, finite(config.lightIntensity, 0, 2, 1));
          gl.uniform3f(
            locations.uLight,
            Math.cos(direction) * 0.56,
            Math.sin(direction) * 0.56,
            0.82849,
          );
          gl.uniform3f(locations.uLineColor, options.line[0], options.line[1], options.line[2]);
          gl.uniform3f(
            locations.uAccentColor,
            options.accent[0],
            options.accent[1],
            options.accent[2],
          );
          gl.uniform3f(
            locations.uSurfaceColor,
            options.surface[0],
            options.surface[1],
            options.surface[2],
          );
          gl.uniform1i(
            locations.uCustomShadow,
            options.shadow || config.shadowAnimation === 'rgb' ? 1 : 0,
          );
          gl.uniform3f(
            locations.uShadowColor,
            options.shadow?.[0] ?? 0,
            options.shadow?.[1] ?? 0,
            options.shadow?.[2] ?? 0,
          );
          gl.uniform1i(locations.uGradientStops, options.gradient.count);
          gl.uniform1f(locations.uGradientDiffusion, finite(config.gradientDiffusion, 0, 1, 0));
          if (options.gradient.count >= 2)
            gl.uniform3fv(locations['uGradientColors[0]'], options.gradient.data);
          staticFrame = {
            ...options,
            grid: [...options.grid],
            extent: [...options.extent],
          };
        }
        if (config.shadowAnimation === 'rgb') {
          const duration = finite(config.shadowCycleDuration, 1, 30, 6);
          const hue = ((options.elapsedSeconds / duration) % 1) * 6;
          // Reuse the visible playback clock: pause, resume and reset affect
          // both terrain and color without a second RAF or React render loop.
          gl.uniform3f(
            locations.uShadowColor,
            smoothChannel(Math.abs(hue - 3) - 1),
            smoothChannel(2 - Math.abs(hue - 2)),
            smoothChannel(2 - Math.abs(hue - 4)),
          );
        }
        if (!scalarHeight) {
          gl.uniform1f(locations.uCosine, options.cosine);
          gl.uniform1f(locations.uSine, options.sine);
        }
        {
          // Unproject the pointer onto the terrain, inverting the vertex
          // projection at the surface height there (the spread leaves the
          // pointer's own point in place), refined from the CPU height copy.
          const lift = options.pointerLift,
            stampCount = lift !== 0 ? Math.min(1, options.pointerStampCount) : 0;
          if (stampCount) {
            const elevation = finite(config.elevation, 0, 240, 120),
              tilt = (finite(config.cameraTilt, 0, 60, 48) * Math.PI) / 180,
              rotation = (finite(config.cameraRotation, -180, 180, -20) * Math.PI) / 180,
              zoom = finite(config.cameraZoom, 0.6, 2, 1),
              distance = Math.hypot(width, height) * 4 + elevation * 4,
              st = Math.sin(tilt),
              ct = Math.cos(tilt),
              sr = Math.sin(rotation),
              cr = Math.cos(rotation);
            for (let stamp = 0; stamp < stampCount; stamp++) {
              const sx = (options.pointerStamps[stamp * 4] - width / 2) / zoom,
                sy = (height / 2 - options.pointerStamps[stamp * 4 + 1]) / zoom;
              let z = 0,
                groundX = 0,
                groundY = 0;
              // Damped fixed point: on steep terrain a plain iteration can
              // oscillate between frames, which reads as stutter.
              for (let step = 0; step < 8; step++) {
                const ry =
                    (sy * (1 - (ct * z) / distance) - st * z) /
                    Math.max(ct - (sy * st) / distance, 0.025),
                  rx = sx * (1 + (st * ry - ct * z) / distance);
                groundX = cr * rx + sr * ry;
                groundY = -sr * rx + cr * ry;
                const surfaceZ = options.altitudeAt(groundX, groundY) * elevation;
                z = step ? (z + surfaceZ) / 2 : surfaceZ;
              }
              groundStamps[stamp * 4] = groundX;
              groundStamps[stamp * 4 + 1] = groundY;
              groundStamps[stamp * 4 + 2] = options.pointerStamps[stamp * 4 + 2];
              groundStamps[stamp * 4 + 3] = options.pointerStamps[stamp * 4 + 3];
            }
            let changed = stampCount !== sentStampCount;
            for (let index = 0; !changed && index < stampCount * 4; index++)
              changed = groundStamps[index] !== sentStamps[index];
            if (changed) {
              sentStamps.set(groundStamps.subarray(0, stampCount * 4));
              gl.uniform4fv(locations['uStamps[0]'], groundStamps, 0, stampCount * 4);
            }
            if (lift !== sentPointerLift) {
              sentPointerLift = lift;
              gl.uniform1f(locations.uPointerLift, lift);
            }
            if (options.pointerRadius !== sentPointerRadius) {
              sentPointerRadius = options.pointerRadius;
              gl.uniform1f(locations.uPointerRadius, options.pointerRadius);
            }
          }
          if (stampCount !== sentStampCount) {
            sentStampCount = stampCount;
            gl.uniform1i(locations.uStampCount, stampCount);
          }
        }
        geometry?.updateUniforms?.(gl, program!);
        gl.drawElements(gl.TRIANGLE_STRIP, count, gl.UNSIGNED_INT, 0);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
          0,
          0,
          targetWidth,
          targetHeight,
          0,
          0,
          targetWidth,
          targetHeight,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        // Resolve directly to an equally sized canvas backing. CSS presentation
        // applies the final scaling; the shader samples and grain stay intact.
        gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, discardedAttachments);
      } catch (error) {
        destroy();
        throw error;
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE0);
      }
    },
    destroy,
  };
}
