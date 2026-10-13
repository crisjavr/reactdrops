type Syllable = { start: number; duration: number; peak: number; attack: number };

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Sampled by the orb's existing render loop. Build a short phrase only when
// needed; each word has different timing, stress and syllables, followed by a
// breath. Randomness belongs to events, never individual frames.
export function createSimulatedSpeech() {
  let seed = 92,
    phraseStart = 0,
    phraseDuration = 0,
    lastTime = 0;
  let syllables: Syllable[] = [];
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const phrase = () => {
    syllables = [];
    let cursor = 0;
    const words = 3 + Math.floor(random() * 4);
    for (let word = 0; word < words; word++) {
      const count = 1 + Math.floor(random() * 3);
      const stress = 0.5 + random() * 0.5;
      for (let syllable = 0; syllable < count; syllable++) {
        const duration = 0.2 + random() * 0.16;
        syllables.push({
          start: cursor,
          duration,
          peak: stress * (0.65 + random() * 0.35),
          attack: 0.28 + random() * 0.14,
        });
        cursor += duration + 0.015 + random() * 0.035;
      }
      cursor += 0.075 + random() * 0.16;
    }
    phraseDuration = cursor + 0.35 + random() * 0.45;
  };
  const reset = () => {
    seed = 92;
    phraseStart = lastTime = 0;
    phrase();
  };
  reset();
  return {
    reset,
    sample(seconds: number) {
      if (!Number.isFinite(seconds)) return 0;
      const time = Math.max(0, seconds);
      if (time < lastTime) reset();
      lastTime = time;
      while (time >= phraseStart + phraseDuration) {
        phraseStart += phraseDuration;
        phrase();
      }
      const local = time - phraseStart;
      for (const syllable of syllables) {
        const phase = (local - syllable.start) / syllable.duration;
        if (phase < 0) break;
        if (phase <= 1)
          return (
            syllable.peak *
            smooth(phase / syllable.attack) *
            (1 - smooth((phase - syllable.attack) / (1 - syllable.attack)))
          );
      }
      return 0;
    },
  };
}
