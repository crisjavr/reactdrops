import {
  fractalGlassCover,
  fractalGlassCoverage,
  fractalGlassEase,
  fractalGlassEaseStagger,
  fractalGlassRefractionMean,
  normalizeFractalGlass,
  type FractalGlassSettings,
} from './fractal-glass-model';
import {
  fractalGlassVertexShader,
  fractalGlassFragmentShader,
  fractalGlassCompositeFragmentShader,
  fractalGlassBlurFragmentShader,
} from './fractal-glass-shaders';

export function createFractalGlassRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initial: FractalGlassSettings,
  active: boolean,
  status: (ready: boolean) => void,
) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) {
    status(false);
    return null;
  }
  let settings = normalizeFractalGlass(initial);
  let hoverStaggerScale = fractalGlassEaseStagger(settings.ease);
  let disposed = false,
    lost = false,
    visible = true,
    ready = false,
    frame = 0;
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    texture: WebGLTexture | null = null;
  let image: HTMLImageElement | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let floatUniformValues: Record<string, number> = {};
  let pairUniformValues: Record<string, readonly [number, number]> = {};
  let compositeProgram: WebGLProgram | null = null;
  let compositeUniforms: Record<string, WebGLUniformLocation | null> = {};
  let compositeFloatValues: Record<string, number> = {};
  let compositePairValues: Record<string, readonly [number, number]> = {};
  const setFloat = (name: string, value: number) => {
    if (floatUniformValues[name] === value) return;
    gl.uniform1f(uniforms[name], value);
    floatUniformValues[name] = value;
  };
  const setPair = (name: string, x: number, y: number) => {
    const previous = pairUniformValues[name];
    if (previous?.[0] === x && previous[1] === y) return;
    gl.uniform2f(uniforms[name], x, y);
    pairUniformValues[name] = [x, y];
  };
  let refractionMeanKey = '';
  let refractionMean: readonly [number, number] = [0, 0];
  let blurProgram: WebGLProgram | null = null;
  let blurUniforms: Record<string, WebGLUniformLocation | null> = {};
  let blurWidth = 0,
    blurHeight = 0;
  const blurTextures: WebGLTexture[] = [],
    blurTargets: WebGLFramebuffer[] = [];
  let blurKey = '',
    sourceVersion = 0;
  let glassTexture: WebGLTexture | null = null,
    glassTarget: WebGLFramebuffer | null = null;
  let glassKey = '',
    glassWidth = 0,
    glassHeight = 0,
    floatGlassAvailable = false;
  let width = 1,
    height = 1;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const circleHover = () => settings.hoverEffect && settings.hoverAnimation === 'circle';
  const coverageFor = () => (circleHover() ? 1 : fractalGlassCoverage(settings));
  const transitionDuration = () => (circleHover() ? settings.hoverDuration : settings.duration);
  let pointerX = 0.5,
    pointerY = 0.5;
  const proceduralHover = () => settings.hoverEffect && settings.hoverAnimation === 'procedural';
  const hoverAnimated = () =>
    proceduralHover() &&
    !settings.disabled &&
    !motion.matches &&
    settings.hoverDuration > 0 &&
    settings.duration > 0;
  // The hybrid reveal composites fully formed glass, keeping refraction anchored
  // while the soft sweep and opacity change together.
  const targetFor = () =>
    settings.disabled
      ? 0
      : circleHover()
        ? Number(active)
        : proceduralHover()
          ? 1
          : settings.hoverEffect
            ? Number(settings.hoverPreset === 'reveal-on-hover' ? !active : active)
            : 1;
  let amount = targetFor(),
    startAmount = amount,
    target = amount,
    started = 0;
  type StripeTransition = {
    value: number;
    start: number;
    target: number;
    started: number;
    hover: number;
    hoverStart: number;
  };
  let coverageTarget = coverageFor();
  let stripeCount = 1;
  let stripes: StripeTransition[] = [];
  let stripePixels = new Uint8Array(0);
  let stripeTexture: WebGLTexture | null = null;
  let stripeTextureWidth = 0,
    stripeDirty = true;
  let hoverStarted = performance.now();
  const fromHigh = () => (settings.side === 'right') !== (settings.direction === 'horizontal');
  const inverseHover = () => proceduralHover() && settings.hoverPreset === 'reveal-on-hover';
  const recoveryRightToLeft = () => {
    switch (settings.recoveryDirection) {
      case 'same':
        return settings.side === 'right';
      case 'left-to-right':
        return false;
      case 'right-to-left':
        return true;
      default:
        return settings.side !== 'right';
    }
  };
  const recoveryFromHigh = () =>
    settings.direction === 'vertical'
      ? recoveryRightToLeft()
      : settings.recoveryDirection === 'reverse'
        ? !fromHigh()
        : fromHigh();
  // Hover progress increases on reveal and decreases on recovery. The latter
  // needs the opposite mask orientation to travel in the requested direction.
  const hoverReverseFor = () =>
    inverseHover() ? Number(active ? settings.side === 'right' : !recoveryRightToLeft()) : 0;
  let hoverReverse = hoverReverseFor(),
    hoverReverseStart = hoverReverse,
    hoverReverseTarget = hoverReverse,
    hoverReverseStarted = 0;
  const stripeEnd = (index: number) =>
    fromHigh() ? 1 - index / stripeCount : Math.min(1, (index + 1) / stripeCount);
  const stripeTarget = (index: number) =>
    Number(
      settings.coverageMode === 'continuous' ||
        (coverageTarget > 0 && stripeEnd(index) <= coverageTarget + 1e-7),
    );
  const resetStripes = () => {
    stripeCount =
      settings.stripes * (settings.mode === 'default' ? 100 / settings.textureScale : 1);
    stripes =
      !circleHover() && (settings.coverageMode === 'stripes' || proceduralHover())
        ? Array.from({ length: Math.ceil(stripeCount) }, (_, index) => {
            const target = stripeTarget(index);
            const hover = proceduralHover() ? Number(active) : 1;
            return { value: target, start: target, target, started: 0, hover, hoverStart: hover };
          })
        : [];
    stripePixels = new Uint8Array(stripes.length * 4);
    stripeDirty = true;
  };
  resetStripes();
  const releaseGlass = () => {
    if (glassTexture) gl.deleteTexture(glassTexture);
    if (glassTarget) gl.deleteFramebuffer(glassTarget);
    glassTexture = null;
    glassTarget = null;
    glassKey = '';
    glassWidth = glassHeight = 0;
  };
  const releaseBlur = () => {
    if (blurProgram) gl.deleteProgram(blurProgram);
    for (const texture of blurTextures) gl.deleteTexture(texture);
    for (const target of blurTargets) gl.deleteFramebuffer(target);
    blurProgram = null;
    blurTextures.length = blurTargets.length = 0;
    blurUniforms = {};
    blurWidth = blurHeight = 0;
    blurKey = '';
  };
  const release = () => {
    releaseGlass();
    releaseBlur();
    if (program) gl.deleteProgram(program);
    if (compositeProgram) gl.deleteProgram(compositeProgram);
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    if (stripeTexture) gl.deleteTexture(stripeTexture);
    program = null;
    compositeProgram = null;
    compositeUniforms = {};
    compositeFloatValues = {};
    compositePairValues = {};
    buffer = null;
    texture = null;
    stripeTexture = null;
    stripeTextureWidth = 0;
    stripeDirty = true;
    floatUniformValues = {};
    pairUniformValues = {};
    ready = false;
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader unavailable');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }
    return shader;
  };
  const initialize = () => {
    const shaders: WebGLShader[] = [];
    try {
      shaders.push(compile(gl.VERTEX_SHADER, fractalGlassVertexShader));
      shaders.push(compile(gl.FRAGMENT_SHADER, fractalGlassFragmentShader));
      program = gl.createProgram();
      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!program || !buffer || !texture) throw new Error('GPU allocation failed');
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GPU link failed');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uniforms = Object.fromEntries(
        [
          'image',
          'blurred',
          'defaultMode',
          'smoothness',
          'textureScale',
          'blackPoint',
          'whitePoint',
          'gamma',
          'edgeWidth',
          'size',
          'pixelSize',
          'cover',
          'stripes',
          'distortion',
          'refractionBias',
          'refractionMean',
          'blur',
          'grain',
          'relief',
          'refraction',
          'roughness',
          'reflection',
          'dispersion',
          'caustics',
          'coverage',
          'stripeProgress',
          'stripeTextureWidth',
          'coverageStripes',
          'proceduralHover',
          'hoverReveal',
          'hoverReverse',
          'transitionBlend',
          'coverageHorizontal',
          'side',
          'horizontal',
          'amount',
          'circleHover',
          'hoverCenter',
          'hoverRadius',
          'hoverFeather',
        ].map((name) => [name, gl.getUniformLocation(program!, `u_${name}`)]),
      );
      gl.uniform1i(uniforms.image, 0);
      gl.uniform1i(uniforms.blurred, 1);
      gl.uniform1i(uniforms.stripeProgress, 2);
      uniforms.glassCache = gl.getUniformLocation(program, 'u_glassCache');
      uniforms.cachePass = gl.getUniformLocation(program, 'u_cachePass');
      uniforms.useGlassCache = gl.getUniformLocation(program, 'u_useGlassCache');
      gl.uniform1i(uniforms.glassCache, 3);
      floatGlassAvailable = Boolean(
        gl.getExtension('OES_texture_float') && gl.getExtension('WEBGL_color_buffer_float'),
      );
      return true;
    } catch {
      release();
      status(false);
      return false;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  };
  const bindQuad = (program: WebGLProgram) => {
    gl.useProgram(program);
  };
  const prepareComposite = () => {
    if (compositeProgram) return;
    const shaders: WebGLShader[] = [];
    try {
      shaders.push(compile(gl.VERTEX_SHADER, fractalGlassVertexShader));
      shaders.push(compile(gl.FRAGMENT_SHADER, fractalGlassCompositeFragmentShader));
      compositeProgram = gl.createProgram();
      if (!compositeProgram) throw new Error('Composite allocation failed');
      for (const shader of shaders) gl.attachShader(compositeProgram, shader);
      gl.bindAttribLocation(compositeProgram, 0, 'a_position');
      gl.linkProgram(compositeProgram);
      if (!gl.getProgramParameter(compositeProgram, gl.LINK_STATUS))
        throw new Error('Composite link failed');
      compositeUniforms = Object.fromEntries(
        Object.keys(uniforms).map((name) => [
          name,
          gl.getUniformLocation(compositeProgram!, `u_${name}`),
        ]),
      );
      gl.useProgram(compositeProgram);
      gl.uniform1i(compositeUniforms.image, 0);
      gl.uniform1i(compositeUniforms.stripeProgress, 2);
      gl.uniform1i(compositeUniforms.glassCache, 3);
    } catch (error) {
      if (compositeProgram) gl.deleteProgram(compositeProgram);
      compositeProgram = null;
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
      gl.useProgram(program);
    }
  };
  const prepareBlur = () => {
    if (settings.mode !== 'default' || settings.blur === 0 || !image) return;
    const key = `${sourceVersion}:${canvas.width}:${canvas.height}:${settings.blur}:${width}:${height}`;
    if (blurKey === key) return;
    if (!blurProgram) {
      const shaders: WebGLShader[] = [];
      try {
        shaders.push(compile(gl.VERTEX_SHADER, fractalGlassVertexShader));
        shaders.push(compile(gl.FRAGMENT_SHADER, fractalGlassBlurFragmentShader));
        blurProgram = gl.createProgram();
        if (!blurProgram) throw new Error('Blur program unavailable');
        for (const shader of shaders) gl.attachShader(blurProgram, shader);
        gl.bindAttribLocation(blurProgram, 0, 'a_position');
        gl.linkProgram(blurProgram);
        if (!gl.getProgramParameter(blurProgram, gl.LINK_STATUS))
          throw new Error('Blur link failed');
        blurUniforms = Object.fromEntries(
          ['source', 'cover', 'step'].map((name) => [
            name,
            gl.getUniformLocation(blurProgram!, `u_${name}`),
          ]),
        );
      } finally {
        for (const shader of shaders) gl.deleteShader(shader);
      }
    }
    bindQuad(blurProgram);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    const cover = fractalGlassCover(width, height, image.naturalWidth, image.naturalHeight);
    const sigma = (settings.blur * width) / 1080;
    for (let pass = 0; pass < 2; pass++) {
      if (!blurTextures[pass]) {
        const nextTexture = gl.createTexture(),
          nextTarget = gl.createFramebuffer();
        // Track partial allocations too, so fallback and unmount always release them.
        if (nextTexture) blurTextures.push(nextTexture);
        if (nextTarget) blurTargets.push(nextTarget);
        if (!nextTexture || !nextTarget) throw new Error('Blur allocation failed');
      }
      gl.bindTexture(gl.TEXTURE_2D, blurTextures[pass]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (blurWidth !== canvas.width || blurHeight !== canvas.height)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          canvas.width,
          canvas.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurTargets[pass]);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        blurTextures[pass],
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Blur framebuffer unavailable');
      gl.bindTexture(gl.TEXTURE_2D, pass === 0 ? texture : blurTextures[0]);
      gl.uniform1i(blurUniforms.source, 0);
      gl.uniform2f(blurUniforms.cover, ...(pass === 0 ? cover : ([1, 1] as const)));
      gl.uniform2f(
        blurUniforms.step,
        pass === 0 ? sigma / width : 0,
        pass === 1 ? sigma / height : 0,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    blurWidth = canvas.width;
    blurHeight = canvas.height;
    blurKey = key;
  };
  const prepareStripeProgress = () => {
    if (!stripes.length) return;
    if (!stripeTexture) {
      stripeTexture = gl.createTexture();
      if (!stripeTexture) throw new Error('Stripe texture unavailable');
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, stripeTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if (!stripeDirty) return;
    // Independent 16-bit progress values for coverage (RG) and hover (BA).
    // Only this tiny strip table changes; source and Gaussian textures stay cached.
    let changed = stripeTextureWidth !== stripes.length;
    for (let i = 0; i < stripes.length; i++) {
      const value = Math.round(stripes[i].value * 65535);
      const opacity = Math.round(stripes[i].hover * 65535);
      const offset = i * 4;
      changed ||=
        stripePixels[offset] !== value >> 8 ||
        stripePixels[offset + 1] !== (value & 255) ||
        stripePixels[offset + 2] !== opacity >> 8 ||
        stripePixels[offset + 3] !== (opacity & 255);
      stripePixels[i * 4] = value >> 8;
      stripePixels[i * 4 + 1] = value & 255;
      stripePixels[i * 4 + 2] = opacity >> 8;
      stripePixels[i * 4 + 3] = opacity & 255;
    }
    stripeDirty = false;
    if (!changed) return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, stripeTexture);
    if (stripeTextureWidth !== stripes.length) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        stripes.length,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        stripePixels,
      );
      stripeTextureWidth = stripes.length;
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        stripes.length,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        stripePixels,
      );
    }
  };
  const prepareGlass = (coverage: number) => {
    // Circular and per-strip reveals composite fully formed glass. Their masks
    // never change the underlying optics. Float storage preserves shader values
    // before the final blend; an 8-bit cache would quantize the soft edge.
    // A default mode circle stroke follows the pointer, so retain the direct path.
    if (
      !(
        circleHover() ||
        proceduralHover() ||
        (!settings.hoverEffect && settings.coverageMode === 'stripes')
      ) ||
      (circleHover() && settings.mode === 'default' && settings.edgeWidth > 0) ||
      !floatGlassAvailable
    ) {
      releaseGlass();
      return false;
    }
    // Global transitions deform the glass with amount, unlike a mask reveal.
    // Preserve their direct renderer while retaining the full-strength cache.
    if (!circleHover() && amount !== 1) return false;
    const key = [
      sourceVersion,
      canvas.width,
      canvas.height,
      width,
      height,
      settings.mode,
      settings.stripes,
      settings.distortion,
      settings.refractionBias,
      settings.blur,
      settings.grain,
      settings.smoothness,
      settings.textureScale,
      settings.blackPoint,
      settings.whitePoint,
      settings.gamma,
      settings.edgeWidth,
      settings.relief,
      settings.refraction,
      settings.roughness,
      settings.reflection,
      settings.dispersion,
      settings.caustics,
      settings.coverageMode,
      settings.side,
      settings.direction,
      Number(circleHover()),
      circleHover() || (settings.mode === 'default' && settings.edgeWidth === 0) ? 1 : coverage,
    ].join(':');
    if (glassKey === key) return true;
    try {
      prepareComposite();
      if (!glassTexture) glassTexture = gl.createTexture();
      if (!glassTarget) glassTarget = gl.createFramebuffer();
      if (!glassTexture || !glassTarget) throw new Error('Glass cache unavailable');
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, glassTexture);
      if (glassWidth !== canvas.width || glassHeight !== canvas.height) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          canvas.width,
          canvas.height,
          0,
          gl.RGBA,
          gl.FLOAT,
          null,
        );
        glassWidth = canvas.width;
        glassHeight = canvas.height;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, glassTarget);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glassTexture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Glass cache target unavailable');
      // Never sample a texture while it is attached to the active framebuffer.
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setFloat('useGlassCache', 0);
      setFloat('cachePass', 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      glassKey = key;
      return true;
    } catch {
      releaseGlass();
      floatGlassAvailable = false;
      return false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      setFloat('cachePass', 0);
    }
  };
  const draw = () => {
    if (disposed || lost || !ready || !program || !image) return;
    try {
      prepareBlur();
      prepareStripeProgress();
    } catch {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseBlur();
      ready = false;
      status(false);
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bindQuad(program);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, stripeTexture ?? texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurTextures[1] ?? texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.viewport(0, 0, canvas.width, canvas.height);
    setPair('size', width, height);
    setPair('pixelSize', width / canvas.width, height / canvas.height);
    setPair('cover', ...fractalGlassCover(width, height, image.naturalWidth, image.naturalHeight));
    for (const key of [
      'stripes',
      'distortion',
      'refractionBias',
      'blur',
      'grain',
      'relief',
      'refraction',
      'roughness',
      'reflection',
      'dispersion',
      'caustics',
      'smoothness',
      'textureScale',
      'blackPoint',
      'whitePoint',
      'gamma',
      'edgeWidth',
    ] as const)
      setFloat(key, settings[key]);
    // Retain departing strips until their wipe finishes, without delaying new targets.
    const coverage =
      settings.coverageMode === 'stripes'
        ? stripes.reduce(
            (extent, stripe, index) =>
              stripe.value > 0 || stripe.target > 0 ? Math.max(extent, stripeEnd(index)) : extent,
            coverageTarget,
          )
        : coverageTarget;
    setFloat('coverage', coverage);
    setFloat('stripeTextureWidth', Math.max(1, stripes.length));
    setFloat('coverageStripes', Number(!circleHover() && settings.coverageMode === 'stripes'));
    setFloat('proceduralHover', Number(proceduralHover()));
    setFloat('hoverReveal', Number(settings.hoverPreset === 'reveal-on-hover'));
    setFloat('hoverReverse', hoverReverse);
    setFloat('transitionBlend', settings.transitionBlend);
    setFloat(
      'coverageHorizontal',
      Number(settings.coverageMode === 'stripes' && settings.direction === 'horizontal'),
    );
    setFloat('side', Number(settings.side === 'right'));
    setFloat('horizontal', Number(settings.direction === 'horizontal'));
    setFloat('amount', amount);
    setFloat('circleHover', Number(circleHover()));
    setPair('hoverCenter', pointerX, pointerY);
    setFloat('hoverRadius', settings.hoverRadius);
    setFloat('hoverFeather', settings.hoverFeather);
    setFloat('defaultMode', Number(settings.mode === 'default'));
    setFloat('cachePass', 0);
    const glassAmount = circleHover() ? 1 : amount;
    if (glassAmount !== 0) {
      // Default mode displacement scales linearly with strength. Integrate the
      // fixed field once instead of evaluating 3,072 harmonics on every fade.
      const meanAmount = settings.mode === 'default' ? 1 : glassAmount;
      const key = [
        settings.mode,
        settings.stripes,
        settings.textureScale,
        settings.smoothness,
        settings.distortion,
        settings.relief,
        settings.refraction,
        settings.direction,
        width,
        height,
        meanAmount,
      ].join(':');
      if (key !== refractionMeanKey) {
        refractionMean = fractalGlassRefractionMean(settings, width, height, meanAmount);
        refractionMeanKey = key;
      }
      const strength = settings.mode === 'default' ? glassAmount : 1;
      setPair('refractionMean', refractionMean[0] * strength, refractionMean[1] * strength);
    } else setPair('refractionMean', 0, 0);
    const cachedGlass = prepareGlass(coverage);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, cachedGlass ? glassTexture : texture);
    setFloat('useGlassCache', Number(cachedGlass));
    if (cachedGlass && compositeProgram) {
      bindQuad(compositeProgram);
      for (const [name, value] of Object.entries(floatUniformValues)) {
        const location = compositeUniforms[name];
        if (location && compositeFloatValues[name] !== value) {
          gl.uniform1f(location, value);
          compositeFloatValues[name] = value;
        }
      }
      for (const [name, value] of Object.entries(pairUniformValues)) {
        const location = compositeUniforms[name];
        const previous = compositePairValues[name];
        if (location && (previous?.[0] !== value[0] || previous[1] !== value[1])) {
          gl.uniform2f(location, value[0], value[1]);
          compositePairValues[name] = value;
        }
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (cachedGlass && compositeProgram) bindQuad(program);
  };
  const canDraw = () => !disposed && !lost && ready && visible && !document.hidden;
  const cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const settle = () => {
    amount = target;
    startAmount = target;
    started = 0;
    for (const stripe of stripes) {
      stripe.value = stripe.start = stripe.target;
      stripe.started = 0;
      stripe.hover = stripe.hoverStart = proceduralHover() ? Number(active) : 1;
    }
    hoverStarted = performance.now();
    hoverReverse = hoverReverseStart = hoverReverseTarget = hoverReverseFor();
    hoverReverseStarted = 0;
    stripeDirty = true;
  };
  const animating = () =>
    amount !== target ||
    stripes.some((stripe) => stripe.value !== stripe.target) ||
    (hoverAnimated() &&
      coverageTarget > 0 &&
      (stripes.some((stripe) => stripe.hover !== Number(active)) ||
        hoverReverse !== hoverReverseTarget));
  const advanceHover = (now: number) => {
    if (!proceduralHover()) return;
    let changed = false;
    if (!hoverAnimated()) {
      for (const stripe of stripes) {
        changed ||= stripe.hover !== Number(active);
        stripe.hover = stripe.hoverStart = Number(active);
      }
      hoverReverse = hoverReverseStart = hoverReverseTarget = hoverReverseFor();
    } else {
      if (hoverReverse !== hoverReverseTarget) {
        const progress = Math.min(
          1,
          Math.max(0, (now - hoverReverseStarted) / Math.min(120, settings.hoverDuration)),
        );
        hoverReverse =
          hoverReverseStart +
          (hoverReverseTarget - hoverReverseStart) * fractalGlassEase(progress, settings.ease);
        if (progress === 1) hoverReverse = hoverReverseStart = hoverReverseTarget;
      }
      // Continuous horizontal coverage clips along X, so all horizontal bands
      // intersect that panel. Other modes stagger only its visible divisions.
      const count =
        settings.coverageMode === 'continuous' && settings.direction === 'horizontal'
          ? stripes.length
          : stripes.reduce((count, _, index) => {
              const start = fromHigh()
                ? 1 - Math.min(1, (index + 1) / stripeCount)
                : index / stripeCount;
              return count + Number(start < coverageTarget - 1e-7);
            }, 0);
      const duration = settings.hoverDuration;
      // Small panels keep the short ripple. Above half coverage, smoothly grow
      // a light curtain sequence: every strip starts before the first finishes.
      const span = Math.max(1, count - 1);
      const ripple = Math.min(0.02, 0.22 / span);
      const curtain = Math.min(0.12, 0.6 / span);
      const coverage = Math.max(0, Math.min(1, (coverageTarget - 0.5) * 2));
      const sequence = coverage * coverage * (3 - 2 * coverage);
      const stagger = duration * hoverStaggerScale * (ripple + (curtain - ripple) * sequence);
      const target = Number(active);
      const firstVisible = fromHigh() ? stripes.length - count : 0;
      const reverse = !active && inverseHover() ? recoveryFromHigh() : fromHigh();
      for (let index = 0; index < stripes.length; index++) {
        const stripe = stripes[index];
        // Completed strips hold their exact state, even if controls change.
        if (stripe.hover === target) continue;
        // The shader blends adjacent clocks at the panel boundary. Hidden bands
        // follow the final visible strip, preventing a fading seam or extra frames.
        const order = Math.min(
          Math.max(0, count - 1),
          Math.max(0, reverse ? firstVisible + count - 1 - index : index - firstVisible),
        );
        const delay = active || inverseHover() ? order * stagger : 0;
        const progress = Math.min(1, Math.max(0, (now - hoverStarted - delay) / duration));
        const eased = fractalGlassEase(progress, settings.ease);
        const reveal =
          progress === 1 ? target : stripe.hoverStart + (target - stripe.hoverStart) * eased;
        // Retiming a live reveal must not make glass disappear while hovering.
        const next = active ? Math.max(stripe.hover, reveal) : Math.min(stripe.hover, reveal);
        changed ||= stripe.hover !== next;
        stripe.hover = next;
      }
    }
    stripeDirty ||= changed;
  };
  const advance = (now: number) => {
    if (motion.matches || settings.disabled) {
      settle();
      return;
    }
    if (amount !== target) {
      const duration = transitionDuration();
      const progress = duration === 0 ? 1 : Math.min(1, Math.max(0, (now - started) / duration));
      const eased = fractalGlassEase(progress, settings.ease);
      const next = startAmount + (target - startAmount) * eased;
      amount = target > amount ? Math.max(amount, next) : Math.min(amount, next);
      if (progress === 1) amount = startAmount = target;
    }
    for (const stripe of stripes) {
      if (stripe.value === stripe.target) continue;
      const progress =
        settings.duration === 0
          ? 1
          : Math.min(1, Math.max(0, (now - stripe.started) / settings.duration));
      const eased = fractalGlassEase(progress, settings.ease);
      const next = stripe.start + (stripe.target - stripe.start) * eased;
      stripe.value =
        stripe.target > stripe.value ? Math.max(stripe.value, next) : Math.min(stripe.value, next);
      if (progress === 1) stripe.value = stripe.start = stripe.target;
      stripeDirty = true;
    }
    advanceHover(now);
  };
  const tick = (now: number) => {
    frame = 0;
    if (!canDraw()) return;
    if (animating()) advance(now);
    draw();
    if (animating()) frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (canDraw() && !frame) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const maxSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      settings.maxDpr,
      Math.sqrt(settings.maxPixels / (width * height)),
      maxSize / width,
      maxSize / height,
    );
    const w = Math.max(1, Math.floor(width * dpr)),
      h = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    schedule();
  };
  const upload = () => {
    if (disposed || lost || !program || !image?.complete || !image.naturalWidth) return;
    try {
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      let source: TexImageSource = image;
      if (image.naturalWidth > max || image.naturalHeight > max) {
        const small = document.createElement('canvas');
        const scale = max / Math.max(image.naturalWidth, image.naturalHeight);
        small.width = Math.max(1, Math.floor(image.naturalWidth * scale));
        small.height = Math.max(1, Math.floor(image.naturalHeight * scale));
        const context = small.getContext('2d');
        if (!context) throw new Error('Image resize unavailable');
        context.drawImage(image, 0, 0, small.width, small.height);
        source = small;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Image upload failed');
      ready = true;
      sourceVersion++;
      // Publish readiness only after the first complete frame, avoiding a blank flash.
      draw();
      status(ready);
      schedule();
    } catch {
      ready = false;
      status(false);
      cancel();
    }
  };
  const lostContext = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancel();
    release();
    status(false);
  };
  const restoredContext = () => {
    lost = false;
    if (disposed || !initialize()) return;
    settle();
    resize();
    upload();
  };
  const visibility = () => {
    if (!canDraw()) cancel();
    else {
      settle();
      schedule();
    }
  };
  const reducedMotion = () => {
    cancel();
    settle();
    schedule();
  };
  const observer = new ResizeObserver(resize);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    visibility();
  });
  observer.observe(host);
  intersection.observe(host);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', reducedMotion);
  canvas.addEventListener('webglcontextlost', lostContext);
  canvas.addEventListener('webglcontextrestored', restoredContext);
  initialize();
  resize();
  return {
    captureFrame() {
      if (disposed || lost || !ready) return null;
      if (animating()) advance(performance.now());
      // Redraw and copy synchronously: WebGL may clear its buffer after compositing.
      draw();
      if (!ready) return null;
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('Image export is unavailable in this browser.');
      context.drawImage(canvas, 0, 0);
      return copy;
    },
    update(next: FractalGlassSettings, nextActive: boolean) {
      const now = performance.now();
      if (animating()) advance(now);
      const previous = settings;
      const wasActive = active;
      const wasProcedural = proceduralHover();
      const wasCircle = circleHover();
      settings = normalizeFractalGlass(next);
      if (previous.ease !== settings.ease)
        hoverStaggerScale = fractalGlassEaseStagger(settings.ease);
      active = nextActive;
      const nextTarget = targetFor();
      if (nextTarget !== target) {
        startAmount = amount;
        target = nextTarget;
        started = now;
      }
      const nextCoverage = coverageFor();
      const sameDivisions =
        previous.coverageMode === settings.coverageMode &&
        previous.mode === settings.mode &&
        previous.stripes === settings.stripes &&
        previous.textureScale === settings.textureScale &&
        previous.side === settings.side &&
        previous.direction === settings.direction &&
        wasProcedural === proceduralHover() &&
        wasCircle === circleHover();
      coverageTarget = nextCoverage;
      if (!sameDivisions) {
        resetStripes();
        settle();
      } else {
        for (let index = 0; index < stripes.length; index++) {
          const stripe = stripes[index];
          const nextTarget = stripeTarget(index);
          // Slider events only retarget the divisions that actually changed.
          if (stripe.target === nextTarget) continue;
          stripe.start = stripe.value;
          stripe.target = nextTarget;
          stripe.started = now;
          stripeDirty = true;
        }
      }
      if (wasActive !== active && proceduralHover()) {
        hoverStarted = now;
        for (const stripe of stripes) stripe.hoverStart = stripe.hover;
      }
      const nextReverse = hoverReverseFor();
      if (nextReverse !== hoverReverseTarget) {
        hoverReverseStart = hoverReverse;
        hoverReverseTarget = nextReverse;
        hoverReverseStarted = now;
        // At exact clear/glass endpoints both orientations render identically.
        // Interrupted curtains instead crossfade from their current mask.
        if (
          stripes.every((stripe) => stripe.hover === 0) ||
          stripes.every((stripe) => stripe.hover === 1)
        )
          hoverReverse = hoverReverseStart = hoverReverseTarget;
      }
      if (
        motion.matches ||
        settings.disabled ||
        !canDraw() ||
        (transitionDuration() === 0 && !hoverAnimated()) ||
        (target === 0 && amount === 0)
      )
        settle();
      else advance(now);
      if (previous.maxDpr !== settings.maxDpr || previous.maxPixels !== settings.maxPixels)
        resize();
      schedule();
    },
    setPointer(x: number, y: number) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const nextX = Math.max(0, Math.min(1, x));
      const nextY = Math.max(0, Math.min(1, y));
      if (pointerX === nextX && pointerY === nextY) return;
      pointerX = nextX;
      pointerY = nextY;
      if (circleHover() && (active || amount > 0)) schedule();
    },
    setSource(src: string) {
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
      cancel();
      ready = false;
      status(false);
      image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = upload;
      image.onerror = () => {
        ready = false;
        status(false);
        cancel();
      };
      if (src) image.src = src;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      cancel();
      observer.disconnect();
      intersection.disconnect();
      if (image) {
        image.onload = null;
        image.onerror = null;
        image = null;
      }
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', reducedMotion);
      canvas.removeEventListener('webglcontextlost', lostContext);
      canvas.removeEventListener('webglcontextrestored', restoredContext);
      release();
      // Detached preview canvases will never be reused. Release their contexts
      // now rather than waiting for GC to evict the still-mounted Home canvas.
      if (canvas.isConnected === false) gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
