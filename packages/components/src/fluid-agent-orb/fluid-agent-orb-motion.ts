import type { FlowTuning } from '../fluid-glass-gradient/fluid-glass-gradient-renderer';
import { createAgentCustomLensCurve } from './fluid-agent-orb-search-curve';
import {
  fluidAgentOrbDefaults,
  fluidAgentOrbSearchCurveDefaults,
  fluidAgentOrbStates,
  fluidAgentOrbThinkingAnimations,
  fluidAgentOrbSearchingAnimations,
  normalizeAudioLevel,
  type FluidAgentOrbState,
  type FluidAgentOrbThinkingAnimation,
  type FluidAgentOrbSearchingAnimation,
  type FluidAgentOrbSearchCurve,
} from './fluid-agent-orb-model';

type AgentInput = {
  state: FluidAgentOrbState;
  thinkingAnimation: FluidAgentOrbThinkingAnimation;
  searchingAnimation: FluidAgentOrbSearchingAnimation;
  searchingCurve?: Partial<FluidAgentOrbSearchCurve>;
  intensity: number;
  preserveWhites?: boolean;
  audioLevel: number;
};

// The native renderer owns the only RAF and all GPU resources. State motion
// updates the motifs, speaking wrinkles and circle transforms. The base
// material settings stay intact.
export function createAgentMotion(read: () => AgentInput) {
  let clock = 0,
    lensOffset = 0,
    lensLap = fluidAgentOrbSearchCurveDefaults.duration * 1.5,
    lensPosition = fluidAgentOrbSearchCurveDefaults.position,
    lensCustomPhase = 0,
    warpOffset = 0,
    wrinkleTime = 0,
    speech = 0,
    audio = 0,
    intensity = 1,
    preserveWhites = 1,
    initialized = false,
    lastScale = '1',
    lastShift = '0px';
  const modes = new Float32Array(7);
  let startTime: number | undefined;
  let reducedMotion: MediaQueryList | undefined;
  const modesA = new Float32Array(4),
    modesB = new Float32Array(4),
    thinkingModes = new Float32Array(4),
    searchingModes = new Float32Array([1, 0, 0, 0]);
  const lensCurve = new Float32Array([lensLap, 1, 2, 6]);
  const lensBezier: [number, number, number, number] = [...fluidAgentOrbSearchCurveDefaults.bezier];
  let sampleCustom: ((time: number) => number) | undefined;
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    value !== undefined && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  modes[0] = modesA[0] = 1;
  thinkingModes[fluidAgentOrbThinkingAnimations.indexOf(fluidAgentOrbDefaults.thinkingAnimation)] =
    1;
  return {
    reset() {
      clock = audio = warpOffset = wrinkleTime = speech = lensOffset = 0;
      startTime = undefined;
      initialized = false;
    },
    frame(
      base: FlowTuning,
      _now: number,
      moving: boolean,
      deltaSeconds: number,
      host: HTMLElement,
    ): void {
      const input = read();
      const tuning = input.searchingCurve;
      const lap =
        1.5 * bounded(tuning?.duration, fluidAgentOrbSearchCurveDefaults.duration, 0.8, 6);
      // Keep the current orbit phase when its duration is adjusted live.
      if (lap !== lensLap) {
        lensOffset = (clock + lensOffset) * (lap / lensLap) - clock;
        lensLap = lap;
      }
      lensCurve[0] = lap;
      const easing = tuning?.easing ?? fluidAgentOrbSearchCurveDefaults.easing;
      // Custom motion uses the full Bezier with no strength multiplier.
      lensCurve[1] = easing === 'custom' ? 1 : 0.7;
      lensCurve[3] =
        easing === 'custom'
          ? 6
          : easing === 'linear'
            ? 1
            : easing === 'power2.out'
              ? 3
              : easing === 'power4.out'
                ? 5
                : 4;
      lensPosition = bounded(tuning?.position, fluidAgentOrbSearchCurveDefaults.position, 0, 12);
      // Changing Start time restarts the native renderer's elapsed clocks.
      if (startTime !== base.startTime) {
        warpOffset = wrinkleTime = 0;
        startTime = base.startTime;
      }
      const dt = moving ? deltaSeconds : 0;
      clock += dt * base.speed;
      if (easing === 'custom') {
        let changed = false;
        for (let i = 0; i < 4; i++) {
          const value = bounded(
            tuning?.bezier?.[i],
            fluidAgentOrbSearchCurveDefaults.bezier[i],
            0,
            1,
          );
          changed ||= value !== lensBezier[i];
          lensBezier[i] = value;
        }
        if (changed || !sampleCustom) {
          sampleCustom = createAgentCustomLensCurve(lensBezier);
        }
        const phase = ((((clock + lensOffset) / lensLap) % 1) + 1) % 1;
        // Sample cached custom travel once per frame, never per fragment.
        lensCustomPhase = sampleCustom(phase);
      }
      const level = normalizeAudioLevel(input.audioLevel);
      const envelope =
        moving && initialized ? 1 - Math.exp(-dt / (level > audio ? 0.065 : 0.22)) : 1;
      audio += (level - audio) * envelope;
      intensity = Number.isFinite(input.intensity) ? Math.max(0, Math.min(2, input.intensity)) : 1;
      preserveWhites = input.preserveWhites === false ? 0 : 1;
      const selected = fluidAgentOrbStates.indexOf(input.state);
      const blend = moving && initialized ? 1 - Math.exp(-dt / 0.24) : 1;
      for (let i = 0; i < modes.length; i++) {
        const target = i === selected ? 1 : 0;
        modes[i] += (target - modes[i]) * blend;
        if (Math.abs(modes[i] - target) < 0.0001) modes[i] = target;
      }
      const thinking = fluidAgentOrbThinkingAnimations.indexOf(input.thinkingAnimation);
      for (let i = 0; i < 3; i++) {
        const target = i === thinking ? 1 : 0;
        thinkingModes[i] += (target - thinkingModes[i]) * blend;
        if (Math.abs(thinkingModes[i] - target) < 0.0001) thinkingModes[i] = target;
      }
      const searching = fluidAgentOrbSearchingAnimations.indexOf(input.searchingAnimation);
      for (let i = 0; i < 2; i++) {
        const target = i === searching ? 1 : 0;
        searchingModes[i] += (target - searchingModes[i]) * blend;
        if (Math.abs(searchingModes[i] - target) < 0.0001) searchingModes[i] = target;
      }
      modesA.set(modes.subarray(0, 4));
      modesB.set(modes.subarray(4, 7));
      reducedMotion ??= host.ownerDocument.defaultView?.matchMedia(
        '(prefers-reduced-motion: reduce)',
      );
      speech = reducedMotion?.matches ? 0 : audio * intensity * modes[4];
      // Add at most 10% to the native glass pace with voice. Integrating the
      // extra travel preserves its phase between syllables and back in Idle.
      // Local wrinkle fields still renew softly without translating the orb.
      if (base.animateDistortion) {
        warpOffset += dt * base.speed * 0.1 * Math.min(1, speech);
        wrinkleTime = (wrinkleTime + dt * base.speed * 0.4 * speech) % 256;
      }
      // Scale the existing circle in the compositor. Its layout and drawing
      // buffer stay stable, avoiding a resize and grain-cache rebuild per syllable.
      const scale = (1 + Math.min(0.24, 0.16 * intensity) * audio * modes[4]).toFixed(4);
      if (scale !== lastScale) {
        host.style.setProperty('--agent-voice-scale', scale);
        lastScale = scale;
      }
      const shift = `${(-4 * intensity * audio * modes[4]).toFixed(3)}px`;
      if (shift !== lastShift) {
        host.style.setProperty('--agent-voice-shift', shift);
        lastShift = shift;
      }
      initialized = true;
    },
    uniforms() {
      return {
        uAgentModesA: modesA,
        uAgentModesB: modesB,
        uAgentThinkingModes: thinkingModes,
        uAgentSearchingModes: searchingModes,
        uAgentClock: clock,
        uAgentLensCurve: lensCurve,
        uAgentLensOffset: lensOffset,
        uAgentLensPosition: lensPosition,
        uAgentLensCustomPhase: lensCustomPhase,
        uAgentVoice: audio,
        uAgentIntensity: intensity,
        uAgentPreserveWhites: preserveWhites,
        uAgentWarpOffset: warpOffset,
        uAgentWrinkleTime: wrinkleTime,
        uAgentSpeech: speech,
      };
    },
  };
}
