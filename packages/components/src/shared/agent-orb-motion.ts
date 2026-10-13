export const agentOrbStates = [
  'idle',
  'listening',
  'thinking',
  'searching',
  'speaking',
  'success',
  'error',
] as const;
export type AgentOrbState = (typeof agentOrbStates)[number];

export const agentOrbStateLabels: Record<AgentOrbState, string> = {
  idle: 'Ready to talk',
  listening: 'Listening',
  thinking: 'Thinking',
  searching: 'Searching',
  speaking: 'Speaking',
  success: 'Complete',
  error: 'Needs attention',
};

// Speed, rotation, breathing and energy are blended in the render loop.
// State changes retain the material seed and animation clock.
export const agentOrbProfiles: Record<AgentOrbState, readonly number[]> = {
  idle: [0.32, 0.055, 0.75, 0.14],
  listening: [0.75, 0.08, 1.1, 0.38],
  thinking: [1.4, 0.34, 1.75, 0.58],
  searching: [2.1, 0.9, 2.3, 0.8],
  speaking: [1.05, 0.12, 1.5, 0.6],
  success: [0.55, 0.07, 1, 0.42],
  error: [0.16, -0.04, 2.8, 0.24],
};

export function normalizeAudioLevel(level: number) {
  return Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}
