import { expect, it } from 'vitest';
import { streamVertex } from '../packages/components/src/fluid-glass-gradient/fluid-glass-gradient-shaders';
import { fluidAgentOrbFragment } from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-patterns';

it('keeps glass-fold normals consistent with the height surface, including the center and bent motifs', () => {
  const canvas = document.createElement('canvas');
  // Odd dimensions include the exact center, where angular motifs can pinch.
  canvas.width = canvas.height = 65;
  const gl = canvas.getContext('webgl')!;
  expect(gl).toBeTruthy();
  const vertex = gl.createShader(gl.VERTEX_SHADER)!;
  const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
  const program = gl.createProgram()!;
  const buffer = gl.createBuffer()!;
  try {
    gl.shaderSource(vertex, streamVertex);
    gl.compileShader(vertex);
    // Test the actual GPU height sampler against independent seven-point
    // differences. Seven samples avoid cancellation in GPU trig functions;
    // a short step also resolves the curvature around the spiral core.
    gl.shaderSource(
      fragment,
      fluidAgentOrbFragment.slice(0, fluidAgentOrbFragment.lastIndexOf('void main()')) +
        `uniform float uCheckSymmetry;
        void main() {
          vec2 p=surfacePoint();
          if(uCheckSymmetry>4.5) {
            vec2 center=floor(65535.*(agentLensOrbitCenter()+.5)+.5);
            gl_FragColor=vec4(floor(center.x/256.),mod(center.x,256.),floor(center.y/256.),mod(center.y,256.))/255.;
            return;
          }
          if(uCheckSymmetry>3.5) {
            float density=1.85*canvasDensity()*uZoom*(uFlowType<.5?1.75:1.);
            float scale=2.*uZoom/.42/max(.001,density);
            vec3 lens=agentFolds(p+agentLensOrbitCenter()/scale);
            gl_FragColor=vec4((lens.x+.62)/1.25,.02*length(lens.yz),0.,1.);
            return;
          }
          if(uCheckSymmetry>2.5) {
            float phase=floor(65535.*agentLensOrbitPhase()/fullTurn+.5);
            gl_FragColor=vec4(floor(phase/256.)/255.,mod(phase,256.)/255.,0.,1.);
            return;
          }
          if(uCheckSymmetry>1.5) {
            vec3 value=agentFolds(p);
            gl_FragColor=vec4((value.x+.62)/1.25,min(1.,.025*length(value.yz)),0.,1.);
            return;
          }
          if(uCheckSymmetry>0.) {
            float density=1.85*canvasDensity()*uZoom*(uFlowType<.5?1.75:1.);
            vec2 mirror=vec2(density-p.x,p.y);
            float error=abs(agentFolds(p).x-agentFolds(mirror).x);
            gl_FragColor=vec4(64.*error,0.,0.,1.);
            return;
          }
          vec3 sampleValue=agentFolds(p);
          float step=.00035;
          vec2 numeric=vec2(
            45.*(agentFolds(p+vec2(step,0.)).x-agentFolds(p-vec2(step,0.)).x)
              -9.*(agentFolds(p+vec2(2.*step,0.)).x-agentFolds(p-vec2(2.*step,0.)).x)
              +(agentFolds(p+vec2(3.*step,0.)).x-agentFolds(p-vec2(3.*step,0.)).x),
            45.*(agentFolds(p+vec2(0.,step)).x-agentFolds(p-vec2(0.,step)).x)
              -9.*(agentFolds(p+vec2(0.,2.*step)).x-agentFolds(p-vec2(0.,2.*step)).x)
              +(agentFolds(p+vec2(0.,3.*step)).x-agentFolds(p-vec2(0.,3.*step)).x))/(60.*step);
          vec2 analytic=heightGradient(sampleValue);
          numeric=heightGradient(vec3(sampleValue.x,numeric));
          // Compare the bounded surface normals used by native glass optics.
          analytic/=sqrt(1.+.08*dot(analytic,analytic));
          numeric/=sqrt(1.+.08*dot(numeric,numeric));
          float error=length(normalize(vec3(-analytic,1.))-normalize(vec3(-numeric,1.)));
          gl_FragColor=vec4(8.*error,0.,0.,1.);
        }`,
    );
    gl.compileShader(fragment);
    expect(gl.getShaderParameter(vertex, gl.COMPILE_STATUS), gl.getShaderInfoLog(vertex)!).toBe(
      true,
    );
    expect(gl.getShaderParameter(fragment, gl.COMPILE_STATUS), gl.getShaderInfoLog(fragment)!).toBe(
      true,
    );
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program)!).toBe(
      true,
    );
    gl.useProgram(program);
    gl.uniform4f(
      gl.getUniformLocation(program, 'uAgentLensCurve'),
      (0.8464 * 0.94 * 2 * Math.PI) / (1.35 * 1.03),
      0.7,
      2,
      4,
    );
    gl.uniform1f(gl.getUniformLocation(program, 'uAgentLensPosition'), 3.5);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'aSpan');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, 'uSpan'), 65, 65);
    gl.uniform1f(gl.getUniformLocation(program, 'uPixelScale'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'uRelief'), 2.94);
    gl.uniform1f(gl.getUniformLocation(program, 'uAgentIntensity'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'uEase'), 0.31);
    const pixels = new Uint8Array(65 * 65 * 4);
    // The overlapping power3.out curves are localized around the slow pass. Check
    // the actual GPU phase, including its renewed pickup before the loop seam.
    gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 3);
    for (const [lapFraction, progress] of [
      [0, 0],
      [0.1, 0.104194759633],
      [0.25, 0.2737062786697],
      [0.5, 0.5],
      [0.75, 0.7262937213303],
      [0.9, 0.895805240367],
      [0.99, 0.9899931605493],
      [1.0001, 0.0001000000072],
      [1.25, 0.2737062786697],
    ]) {
      gl.uniform1f(
        gl.getUniformLocation(program, 'uAgentClock'),
        (lapFraction * 0.8464 * 0.94 * 2 * Math.PI) / (1.35 * 1.03),
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      expect(
        Math.abs((pixels[0] * 256 + pixels[1]) / 65535 - progress),
        `power3.out at ${lapFraction} laps`,
      ).toBeLessThan(2 / 65535);
    }
    const phaseAt = (fraction: number) => {
      gl.uniform1f(
        gl.getUniformLocation(program, 'uAgentClock'),
        (fraction * 0.8464 * 0.94 * 2 * Math.PI) / (1.35 * 1.03),
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return (pixels[0] * 256 + pixels[1]) / 65535;
    };
    const travelAt = (fraction: number, step = 0.025) => {
      const before = phaseAt(fraction),
        after = phaseAt(fraction + step);
      return (after - before + 1) % 1;
    };
    for (const fraction of [0, 0.25, 0.5, 0.75, 0.85, 0.9, 0.95, 0.99, 1])
      expect(travelAt(fraction), `reduced slowdown at ${fraction} laps`).toBeGreaterThan(0.017);
    // Pickup happens before finishing, and both sides of the seam carry the
    // same speed. Measure the actual shader phase at 16-bit precision so small
    // changes in the tuned curve are visible without rounding away motion.
    expect(travelAt(0.9, 0.1)).toBeGreaterThan(1.2 * travelAt(0.5, 0.1));
    expect(travelAt(0.9, 0.1)).toBeLessThan(1.8 * travelAt(0.5, 0.1));
    // The speed has recovered by the sides of the formerly broad slowdown.
    expect(travelAt(0.25, 0.1)).toBeGreaterThan(0.095);
    expect(travelAt(0.65, 0.1)).toBeGreaterThan(0.095);
    expect(travelAt(0.65, 0.1)).toBeGreaterThan(1.2 * travelAt(0.45, 0.1));
    expect(Math.abs(travelAt(0.975) - travelAt(0))).toBeLessThan(2 / 255);
    const lensCurve = gl.getUniformLocation(program, 'uAgentLensCurve');
    const lap = (0.8464 * 0.94 * 2 * Math.PI) / (1.35 * 1.03);
    for (const exponent of [3, 4, 5]) {
      gl.uniform4f(lensCurve, lap, 1, 2, exponent);
      for (let fraction = 0; fraction < 1; fraction += 0.025)
        expect(travelAt(fraction)).toBeGreaterThan(0);
    }
    gl.uniform4f(lensCurve, lap, 0, 2, 4);
    expect(phaseAt(0.25)).toBeCloseTo(0.25, 4);
    gl.uniform4f(lensCurve, lap, 0.7, 2, 1);
    expect(phaseAt(0.75)).toBeCloseTo(0.75, 4);
    gl.uniform4f(lensCurve, lap, 0.7, 2, 4);
    gl.uniform4f(gl.getUniformLocation(program, 'uAgentModesA'), 0, 0, 0, 1);
    gl.uniform4f(gl.getUniformLocation(program, 'uAgentSearchingModes'), 1, 0, 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, 'uZoom'), 0.23);
    gl.uniform1f(gl.getUniformLocation(program, 'uBend'), 8);
    gl.uniform1f(gl.getUniformLocation(program, 'uFlowType'), 0);
    // Measure the actual GPU center and recenter the rendered glass field.
    // A tilted elliptical translation has fixed axes and unchanged local geometry,
    // even with maximum Distortion. Global radial warping fails the latter.
    let centered: Uint8Array | undefined;
    for (let step = 0; step < 32; step++) {
      gl.uniform1f(gl.getUniformLocation(program, 'uAgentClock'), (step * lap) / 32);
      gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const cx = (pixels[0] * 256 + pixels[1]) / 65535 - 0.5;
      const cy = (pixels[2] * 256 + pixels[3]) / 65535 - 0.5;
      const dx = cx + 0.075,
        dy = cy - 0.075;
      const major = (dx + dy) / Math.SQRT2;
      const minor = (-dx + dy) / Math.SQRT2;
      expect(Math.abs(Math.hypot(major / 0.045, minor / 0.03) - 1)).toBeLessThan(0.0005);
      if (step === 16) expect(Math.abs(Math.atan2(dy, dx) + Math.PI / 12)).toBeLessThan(0.0005);
      gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 4);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      centered ??= pixels.slice();
      let error = 0;
      for (let pixel = 0; pixel < pixels.length; pixel++) {
        const difference = Math.abs(pixels[pixel] - centered[pixel]);
        expect(difference).toBeLessThanOrEqual(2);
        error += difference;
      }
      expect(error / pixels.length).toBeLessThan(0.15);
    }
    gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 0);
    for (const [state, animation] of [
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [3, 0],
      [3, 1],
      [5, 0],
      [6, 0],
    ]) {
      const weights = new Float32Array(7);
      weights[state] = 1;
      gl.uniform4fv(gl.getUniformLocation(program, 'uAgentModesA'), weights.subarray(0, 4));
      gl.uniform4fv(
        gl.getUniformLocation(program, 'uAgentModesB'),
        new Float32Array([...weights.subarray(4), 0]),
      );
      gl.uniform4f(
        gl.getUniformLocation(program, 'uAgentThinkingModes'),
        animation === 0 ? 1 : 0,
        animation === 1 ? 1 : 0,
        animation === 2 ? 1 : 0,
        0,
      );
      gl.uniform4f(
        gl.getUniformLocation(program, 'uAgentSearchingModes'),
        state === 3 && animation === 1 ? 0 : 1,
        state === 3 && animation === 1 ? 1 : 0,
        0,
        0,
      );
      for (const [zoom, bend, time, voice, flow] of [
        [0.23, 0, 0, 0, 0],
        [0.23, 2.4, 0.9, 0.55, 0],
        [0.64, 8, 7, 1, 1],
        [0.08, 8, 2, 0, 2],
      ]) {
        for (const [name, value] of Object.entries({
          uZoom: zoom,
          uBend: bend,
          uAgentClock: time,
          uAgentVoice: voice,
          uFlowType: flow,
        }))
          gl.uniform1f(gl.getUniformLocation(program, name), value);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let maximumIndex = 0,
          maximum = 0,
          sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > maximum) maximumIndex = i / 4;
          maximum = Math.max(maximum, pixels[i]);
          sum += pixels[i];
        }
        const context = `state ${state}, animation ${animation}, scale ${zoom}, distortion ${bend}, time ${time}, mean ${sum / (65 * 65)}, max ${maximum} at ${maximumIndex % 65},${Math.floor(maximumIndex / 65)}`;
        // Mean normal difference < .15 degrees, worst pixel < 1.8 degrees,
        // including crests where GPU trig approximation is most apparent.
        expect(sum / (65 * 65), context).toBeLessThan(5);
        expect(maximum, context).toBeLessThan(64);
        expect(gl.getError()).toBe(0);
        // The microphone stays upright after deformation.
        if (state === 1) {
          gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 1);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          for (let i = 0; i < pixels.length; i += 4)
            expect(pixels[i], `upright ${context}, pixel ${i / 4}`).toBeLessThan(2);
          gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 0);
        }
        if (state === 2 && zoom === 0.23) {
          gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 2);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.readPixels(0, 0, 65, 65, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          // A surface texture must reach every outer sector, not sit in the
          // center like a glyph. Count visible slopes and height variation.
          const sectors = Array.from({ length: 8 }, () => ({
            count: 0,
            slopes: 0,
            min: 255,
            max: 0,
          }));
          let surfacePixels = 0,
            curvedPixels = 0;
          for (let y = 0; y < 65; y++)
            for (let x = 0; x < 65; x++) {
              const px = (x - 32) / 32,
                py = (y - 32) / 32;
              const radius = Math.hypot(px, py);
              if (radius > 0.95) continue;
              const index = (y * 65 + x) * 4;
              surfacePixels++;
              if (pixels[index + 1] > 6) curvedPixels++;
              if (radius < 0.65) continue;
              const sector =
                sectors[Math.min(7, Math.floor(((Math.atan2(py, px) + Math.PI) * 4) / Math.PI))];
              sector.count++;
              if (pixels[index + 1] > 12) sector.slopes++;
              sector.min = Math.min(sector.min, pixels[index]);
              sector.max = Math.max(sector.max, pixels[index]);
            }
          // Broad curved valleys should not leave large flat pools inside
          // the spiral, even away from the tall folds and outer sectors.
          expect(curvedPixels / surfacePixels, `curved surface ${context}`).toBeGreaterThan(0.8);
          sectors.forEach((sector, index) => {
            expect(
              sector.slopes / sector.count,
              `texture coverage ${context}, sector ${index}`,
            ).toBeGreaterThan(0.35);
            expect(
              sector.max - sector.min,
              `texture height ${context}, sector ${index}`,
            ).toBeGreaterThan(80);
          });
          gl.uniform1f(gl.getUniformLocation(program, 'uCheckSymmetry'), 0);
        }
      }
    }
  } finally {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
});
