import {
  fluidGlassGradientDefaults,
  fluidGlassGradientPresets,
  type FlowTuning,
} from '../fluid-glass-gradient/fluid-glass-gradient-renderer';
import { agentOrbStates, type AgentOrbState } from '../shared/agent-orb-motion';
export {
  agentOrbStates as fluidAgentOrbStates,
  agentOrbStateLabels as fluidAgentOrbStateLabels,
  normalizeAudioLevel,
  type AgentOrbState as FluidAgentOrbState,
} from '../shared/agent-orb-motion';

const fluidAgentOrbPalettes = {
  ...fluidGlassGradientPresets,
  honey: { ...fluidGlassGradientPresets.honey, seed: 58 },
  // These palettes preserve the current seed and playback position.
  azure: {
    baseColor: '#3898ff',
    colorA: '#5d027e',
    colorB: '#fff0f0',
    colorC: '#e0d7ea',
  },
  indigo: {
    baseColor: '#386aff',
    colorA: '#69027e',
    colorB: '#fff0f0',
    colorC: '#e9d7ea',
  },
  mint: {
    baseColor: '#38ffbd',
    colorA: '#73008a',
    colorB: '#e5cde5',
    colorC: '#b6ecba',
  },
  coral: {
    baseColor: '#ff6038',
    colorA: '#7e1402',
    colorB: '#fff0f0',
    colorC: '#ecb6b6',
  },
  scarlet: {
    baseColor: '#ff3838',
    colorA: '#7e0202',
    colorB: '#fff0f0',
    colorC: '#e0d7ea',
  },
  fuchsia: {
    baseColor: '#ff38ee',
    colorA: '#69027e',
    colorB: '#fff0f0',
    colorC: '#e9d7ea',
  },
} as const;

export const fluidAgentOrbPresets = Object.fromEntries(
  Object.entries(fluidAgentOrbPalettes).map(([name, palette]) => [
    name,
    {
      ...palette,
      clusterCount:
        name === 'tide' || name === 'monochrome' ? fluidGlassGradientDefaults.clusterCount : 3,
    },
  ]),
) as {
  [Name in keyof typeof fluidAgentOrbPalettes]: (typeof fluidAgentOrbPalettes)[Name] & {
    clusterCount: number;
  };
};

export type FluidAgentOrbPreset = keyof typeof fluidAgentOrbPresets;
export const fluidAgentOrbThinkingAnimations = ['spiral', 'ripples', 'scan'] as const;
export type FluidAgentOrbThinkingAnimation = (typeof fluidAgentOrbThinkingAnimations)[number];
export const fluidAgentOrbThinkingAnimationLabels = {
  spiral: 'Spiral',
  ripples: 'Ripples',
  scan: 'Scan',
} satisfies Record<FluidAgentOrbThinkingAnimation, string>;
export const fluidAgentOrbSearchingAnimations = ['lens', 'small-lens'] as const;
export type FluidAgentOrbSearchingAnimation = (typeof fluidAgentOrbSearchingAnimations)[number];
export const fluidAgentOrbSearchingAnimationLabels = {
  lens: 'Lens',
  'small-lens': 'Small lens',
} satisfies Record<FluidAgentOrbSearchingAnimation, string>;
export type FluidAgentOrbSearchCurve = {
  duration: number;
  easing: 'linear' | 'power2.out' | 'power3.out' | 'power4.out' | 'custom';
  bezier: readonly [number, number, number, number];
  position: number;
};
// Lens timing at the default speed; position uses clock hours (3.5 means 3:30).
export const fluidAgentOrbSearchCurveDefaults: FluidAgentOrbSearchCurve = {
  duration: 2.83,
  easing: 'custom',
  bezier: [0.167, 0.723, 0.448, 0.924],
  position: 1.5,
};
export const fluidAgentOrbDefaults: FluidAgentOrbSettings = {
  ...fluidGlassGradientDefaults,
  ...fluidAgentOrbPresets.monochrome,
  grain: 0.3,
  distortion: 0.8,
  state: 'idle' as AgentOrbState,
  thinkingAnimation: 'ripples' as FluidAgentOrbThinkingAnimation,
  searchingAnimation: 'lens' as FluidAgentOrbSearchingAnimation,
  intensity: 1,
  preserveWhites: true,
  animateEntrance: true,
  shape: 'circle' as const,
  size: 250,
  aspectRatio: 1,
  borderRadius: 24,
};
export type FluidAgentOrbSettings = FlowTuning & {
  state: AgentOrbState;
  thinkingAnimation: FluidAgentOrbThinkingAnimation;
  searchingAnimation: FluidAgentOrbSearchingAnimation;
  intensity: number;
  preserveWhites: boolean;
  animateEntrance: boolean;
  shape: 'circle';
  size: number;
  aspectRatio: number;
  borderRadius: number;
};

export function agentState(value: AgentOrbState | undefined): AgentOrbState {
  return value && agentOrbStates.includes(value) ? value : 'idle';
}
export function agentThinkingAnimation(
  value: FluidAgentOrbThinkingAnimation | undefined,
): FluidAgentOrbThinkingAnimation {
  return value && fluidAgentOrbThinkingAnimations.includes(value)
    ? value
    : fluidAgentOrbDefaults.thinkingAnimation;
}
export function agentSearchingAnimation(
  value: FluidAgentOrbSearchingAnimation | undefined,
): FluidAgentOrbSearchingAnimation {
  return value && fluidAgentOrbSearchingAnimations.includes(value) ? value : 'lens';
}
