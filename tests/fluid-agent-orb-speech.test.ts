import { expect, it } from 'vitest';
import { createSimulatedSpeech } from '../packages/catalog-ui/src/fluid-agent-orb-speech';
import { createAgentMotion } from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-motion';
import { fluidAgentOrbDefaults } from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-model';

it('speaks in irregular pulses with breathing rests after the actual orb smoothing', () => {
  const voice = createSimulatedSpeech();
  const host = document.createElement('div');
  let level = 0;
  const motion = createAgentMotion(() => ({
    ...fluidAgentOrbDefaults,
    state: 'speaking',
    audioLevel: level,
  }));
  const peaks: { time: number; level: number }[] = [];
  const rests: number[] = [];
  let previous = 0,
    previousScale = 1,
    previousDelta = 0,
    quietFrames = 0;
  for (let frame = 0; frame < 60 * 24; frame++) {
    const time = frame / 60;
    level = 0.55 * voice.sample(time);
    motion.frame(fluidAgentOrbDefaults, time * 1000, true, 1 / 60, host);
    const audio = motion.uniforms().uAgentVoice;
    const delta = audio - previous;
    if (previousDelta > 0 && delta <= 0 && previous > 0.08) peaks.push({ time, level: previous });
    if (audio < 0.033) quietFrames++;
    else {
      if (quietFrames >= 12) rests.push(quietFrames / 60);
      quietFrames = 0;
    }
    const scale = Number(host.style.getPropertyValue('--agent-voice-scale'));
    // Syllable attacks remain expressive without a visible size jump: less
    // than 1.3% of the orb diameter per frame at 60 Hz.
    expect(Math.abs(scale - previousScale)).toBeLessThan(0.013);
    expect(scale).toBeCloseTo(1 + 0.16 * audio, 3);
    expect(motion.uniforms().uAgentSpeech).toBeCloseTo(audio, 6);
    previous = audio;
    previousScale = scale;
    previousDelta = delta;
  }
  const intervals = peaks.slice(1).map((peak, i) => peak.time - peaks[i].time);
  const amplitudes = peaks.map((peak) => peak.level);
  expect(peaks.length).toBeGreaterThan(30);
  expect(Math.max(...intervals) / Math.min(...intervals)).toBeGreaterThan(2);
  expect(Math.max(...amplitudes) / Math.min(...amplitudes)).toBeGreaterThan(1.5);
  expect(rests.length).toBeGreaterThanOrEqual(3);
});

it('keeps word boundaries continuous and gives the same speech at different sample rates', () => {
  const voice = createSimulatedSpeech();
  const sparse = createSimulatedSpeech();
  let previous = 0;
  for (let tick = 0; tick < 12000; tick++) {
    const time = tick / 1000;
    const value = voice.sample(time);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
    expect(Math.abs(value - previous)).toBeLessThan(0.03);
    if (tick % 70 === 0) expect(sparse.sample(time)).toBe(value);
    previous = value;
  }
  const restarted = createSimulatedSpeech();
  voice.reset();
  for (const time of [0, 0.1, 0.4, 1, 5]) expect(voice.sample(time)).toBe(restarted.sample(time));
});
