'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { FluidRipples, type FluidRipplesHandle, type FluidRipplesProps } from './fluid-ripples';
import './fluid-typing.css';

export type FluidTypingMode = 'auto' | 'manual' | 'static';
export type FluidTypingProps = Omit<FluidRipplesProps, 'typing'> & {
  /** An array creates consecutive lines in the same text. */
  text?: string | string[];
  typeSpeed?: number;
  deleteSpeed?: number;
  holdDuration?: number;
  loop?: boolean;
  cursor?: boolean;
  /** False renders controlled text directly and emits ripples for its changes. */
  autoType?: boolean;
  /** A fixed prefix, displayed alongside the animated or editable text. */
  staticText?: string;
  /** Manual uses an editable text field; auto also respects the legacy autoType flag. */
  typingMode?: FluidTypingMode;
  /** Controlled manual input. Omit to use defaultValue and internal state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  inputLabel?: string;
  /** Start each automatic cycle with one large wave from the lone cursor, then pause. */
  introWave?: boolean;
  /** Milliseconds between that opening wave and the first character. */
  introPause?: number;
  /** Type with a person's uneven rhythm and size every wave by the speed of its keystroke. */
  naturalRhythm?: boolean;
};
export type FluidTypingHandle = FluidRipplesHandle;
type TypingPhase = 'intro' | 'typing' | 'holding' | 'deleting' | 'done';
type Wave = { strength: number; size: number };

/** The user's recovered cyan/pale-pink setup, including its sharper water refraction. */
export const fluidTypingPresets = {
  'rose-lagoon': {
    palette: 'rose-lagoon',
    backgroundColor: '',
    blueColor: '',
    lavenderColor: '',
    highlightColor: '',
    rippleCount: 7,
    rippleWidth: 0.09,
    seed: 1,
    borderRadius: 0,
    blur: 0.035,
    distortion: 0,
    turbulenceScale: 0.093,
    refraction: 0.87,
    interactive: true,
    interactionStrength: 1.4,
  },
} as const satisfies Record<string, FluidTypingProps>;

export const fluidTypingDefaults = {
  ...fluidTypingPresets['rose-lagoon'],
  text: ['Text over a fluid background.', 'Animated with React Drops.'],
  typeSpeed: 110,
  deleteSpeed: 50,
  holdDuration: 1800,
  loop: true,
  cursor: true,
  autoType: true,
  staticText: '',
  typingMode: 'auto' as const,
  defaultValue: '',
  placeholder: 'Type here…',
  inputLabel: 'Your text',
  introWave: true,
  introPause: 900,
  naturalRhythm: true,
};

function milliseconds(value: number, fallback: number, minimum = 0) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

/** The lone cursor drops into the water: a broad, strong wave before the first character. */
const introDrop: Wave = { strength: 1.45, size: 2.4 };
const plainWave: Wave = { strength: 1, size: 1 };
/** A person's typical time between keystrokes sizes the waves of manual and controlled edits. */
const keystrokeInterval = 130;

/** A small seeded generator, so a message replays each cycle with the same rhythm. */
function seededRandom(text: string, cycle: number) {
  let state = 2166136261 ^ cycle;
  for (const char of text) state = Math.imul(state ^ (char.codePointAt(0) ?? 0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A typist's pauses as multiples of the average type speed: quick runs inside words, with some
 * words in a single burst, a reach before each new word, breaths after punctuation and line
 * breaks, and a hesitant start.
 */
function createTypist(text: string, cycle: number) {
  const roll = seededRandom(text, cycle);
  let burst = 1;
  return {
    roll,
    pause(symbols: string[], index: number) {
      const previous = symbols[index - 1] ?? '',
        next = symbols[index] ?? '';
      if (!/[\p{L}\p{N}]$/u.test(previous)) burst = roll() < 0.35 ? 0.6 : 1;
      let pause: number;
      if (/^[\r\n]+$/u.test(previous)) pause = 2.6 + roll();
      else if (/[.!?…]$/u.test(previous)) pause = 2.3 + 1.2 * roll();
      else if (/[,;:]$/u.test(previous)) pause = 1.6 + 0.8 * roll();
      else if (/^\s+$/u.test(next)) pause = 0.95 + 0.4 * roll();
      else if (!previous || /^\s+$/u.test(previous)) pause = 1.45 + 0.7 * roll();
      else pause = (0.62 + 0.5 * roll()) * burst;
      return pause * (1 + 0.25 * Math.max(0, 3 - index));
    },
  };
}

/** A quick tap stirs a small, soft ring; a deliberate keystroke a broad, strong one. */
function keystrokeWave(pause: number, roll: () => number): Wave {
  const energy = Math.min(1.4, Math.max(0.55, pause ** 0.45));
  return {
    strength: energy * (0.9 + 0.2 * roll()),
    size: energy ** 0.7 * (0.94 + 0.12 * roll()),
  };
}

/** An edit's wave follows the time since the previous edit, as a typist's keystroke would. */
function editWave(clock: { at: number; roll: () => number }, natural: boolean) {
  const now = performance.now(),
    pause = (now - clock.at) / keystrokeInterval;
  clock.at = now;
  return natural ? keystrokeWave(pause, clock.roll) : plainWave;
}

function graphemes(text: string) {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (part) => part.segment,
  );
}

function isVisible(host: HTMLElement) {
  const bounds = host.getBoundingClientRect();
  let left = Math.max(0, bounds.left),
    right = Math.min(innerWidth, bounds.right);
  let top = Math.max(0, bounds.top),
    bottom = Math.min(innerHeight, bounds.bottom);
  for (let parent = host.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent),
      clip = parent.getBoundingClientRect();
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  return right > left && bottom > top;
}

function changes(previous: string, next: string) {
  const before = graphemes(previous),
    after = graphemes(next);
  let start = 0,
    end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return [
    ...before
      .slice(start, before.length - end)
      .filter((char) => !/^[\r\n]+$/u.test(char))
      .map(() => 0.45),
    ...after
      .slice(start, after.length - end)
      .filter((char) => !/^[\r\n]+$/u.test(char))
      .map(() => 1),
  ];
}

function selectionPosition(node: HTMLElement) {
  const selection = node.ownerDocument.getSelection();
  const range = node.ownerDocument.createRange();
  if (selection?.rangeCount && selection.focusNode && node.contains(selection.focusNode)) {
    range.setStart(selection.focusNode, selection.focusOffset);
    range.collapse(true);
  } else {
    range.selectNodeContents(node);
    range.collapse(false);
  }
  const rect = range.getClientRects().item(0);
  const bounds = node.getBoundingClientRect();
  return rect ?? new DOMRect(bounds.left, bounds.top, 0, bounds.height);
}

function replaceInput(node: HTMLElement, value: string) {
  const selection = node.ownerDocument.getSelection();
  let offset = value.length;
  const focused = node.ownerDocument.activeElement === node;
  if (
    focused &&
    selection?.rangeCount &&
    selection.focusNode &&
    node.contains(selection.focusNode)
  ) {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    range.setEnd(selection.focusNode, selection.focusOffset);
    offset = Math.min(value.length, range.toString().length);
  }
  node.textContent = value;
  if (focused && selection) {
    const range = node.ownerDocument.createRange();
    range.setStart(node.firstChild ?? node, node.firstChild ? offset : 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export const FluidTyping = forwardRef<FluidTypingHandle, FluidTypingProps>(function FluidTyping(
  {
    text = fluidTypingDefaults.text,
    typeSpeed = 110,
    deleteSpeed = 50,
    holdDuration = 1800,
    loop = true,
    cursor = true,
    autoType = true,
    staticText = '',
    typingMode,
    value,
    defaultValue = '',
    onValueChange,
    placeholder = fluidTypingDefaults.placeholder,
    inputLabel = fluidTypingDefaults.inputLabel,
    introWave = true,
    introPause = 900,
    naturalRhythm = true,
    palette = fluidTypingDefaults.palette,
    blur = fluidTypingDefaults.blur,
    distortion = fluidTypingDefaults.distortion,
    refraction = fluidTypingDefaults.refraction,
    paused = false,
    className = '',
    children,
    ...surface
  },
  ref,
) {
  const fullText = Array.isArray(text) ? text.join('\n') : text;
  const mode =
    typingMode === 'manual' ? 'manual' : typingMode === 'static' || !autoType ? 'static' : 'auto';
  const animated = mode === 'auto';
  const prefix = staticText && !/\s$/u.test(staticText) ? `${staticText} ` : staticText;
  const [inputValue, setInputValue] = useState({ text: defaultValue });
  const manualText = value ?? inputValue.text;
  const initialInput = useRef(manualText);
  const committedInput = useRef(manualText);
  const reportedInput = useRef(manualText);
  const manualActive = useRef(false);
  const composing = useRef(false);
  const engine = useRef<FluidRipplesHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const editor = useRef<HTMLSpanElement>(null);
  const caretMetrics = useRef<HTMLSpanElement>(null);
  const syncManualCaret = useRef<(() => void) | null>(null);
  const previous = useRef<{ text: string; autoType: boolean } | null>(null);
  const controller = useRef<{
    sync: () => void;
    emit: (strength: number, rect?: DOMRect, size?: number) => void;
  } | null>(null);
  const editClock = useRef({ at: -Infinity, roll: seededRandom('', 0) });
  const playbackOverride = useRef<boolean | null>(null);
  const previousPaused = useRef(paused);
  const timing = {
    paused,
    typeSpeed,
    deleteSpeed,
    holdDuration,
    loop,
    introWave,
    introPause,
    naturalRhythm,
  };
  const latest = useRef(timing);
  latest.current = timing;
  useImperativeHandle(
    ref,
    () => ({
      reset: () => engine.current?.reset(),
      seek: (seconds) => engine.current?.seek(seconds),
      pause: () => {
        playbackOverride.current = true;
        engine.current?.pause();
        controller.current?.sync();
      },
      play: () => {
        playbackOverride.current = false;
        engine.current?.play();
        controller.current?.sync();
      },
      rippleAt: (x, y, strength) => engine.current?.rippleAt(x, y, strength),
    }),
    [],
  );

  useLayoutEffect(() => {
    if (mode !== 'manual') composing.current = false;
    const root = stage.current,
      node = output.current,
      anchor = caret.current;
    const host = root?.closest<HTMLElement>('.fluid-ripples');
    if (!root || !host || (mode !== 'manual' && (!node || !anchor))) return;
    const symbols = graphemes(fullText);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches,
      visible = isVisible(host),
      hidden = document.hidden;
    // Each cycle opens with the lone cursor's wave, unless disabled, then types with a new rhythm.
    const opening = (): TypingPhase => (latest.current.introWave ? 'intro' : 'typing');
    let cycle = 0,
      typist = createTypist(fullText, cycle),
      dropped = false,
      pace = 1;
    let index = animated && !reduced ? 0 : symbols.length;
    let phase: TypingPhase = animated && !reduced ? opening() : 'done';
    let timer = 0,
      frame = 0,
      deadline = 0,
      remaining: number | null = null,
      disposed = false;
    const running = () =>
      !disposed &&
      visible &&
      !hidden &&
      !reduced &&
      !(playbackOverride.current ?? latest.current.paused);
    const show = () => {
      if (node) {
        if (!animated || reduced) node.textContent = symbols.slice(0, index).join('');
        else {
          while (node.childNodes.length > index) node.lastChild?.remove();
          while (node.childNodes.length < index) {
            const symbol = symbols[node.childNodes.length];
            if (/^[\r\n]+$/u.test(symbol)) node.append(document.createTextNode(symbol));
            else {
              const character = document.createElement('span');
              character.className = 'fluid-typing-character';
              character.textContent = symbol;
              node.append(character);
            }
          }
        }
      }
      root.dataset.fluidTypingState = mode === 'manual' ? 'manual' : phase;
    };
    const emit = (strength: number, rect?: DOMRect, size = 1) => {
      if (!running()) return;
      const bounds = host.getBoundingClientRect(),
        position = rect ?? anchor?.getBoundingClientRect();
      if (!position) return;
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(
        0,
        Math.min(1, (position.left + position.width / 2 - bounds.left) / bounds.width),
      );
      const y = Math.max(
        0,
        Math.min(1, (position.top + position.height / 2 - bounds.top) / bounds.height),
      );
      engine.current?.rippleAt(x, y, strength, size);
    };
    const cancel = () => {
      if (timer) {
        remaining = Math.max(0, deadline - performance.now());
        clearTimeout(timer);
        timer = 0;
      }
    };
    // Plans the next step. Pace keeps its delay in average keystrokes to size that step's wave.
    const plan = () => {
      const options = latest.current,
        speed = milliseconds(options.typeSpeed, 110, 1);
      let delay: number;
      if (phase === 'intro')
        delay = dropped ? milliseconds(options.introPause, 900) : cycle ? 600 : 360;
      else if (phase === 'holding') delay = milliseconds(options.holdDuration, 1800);
      else if (phase === 'deleting')
        delay =
          milliseconds(options.deleteSpeed, 50, 1) *
          (options.naturalRhythm ? 0.8 + 0.4 * typist.roll() : 1);
      else delay = speed * (options.naturalRhythm ? typist.pause(symbols, index) : 1);
      pace = delay / speed;
      return delay;
    };
    const step = () => {
      timer = 0;
      remaining = null;
      if (!running()) {
        sync();
        return;
      }
      const options = latest.current;
      if (phase === 'intro' && !dropped) {
        dropped = true;
        emit(introDrop.strength, undefined, introDrop.size);
      } else if (phase === 'intro' || phase === 'typing') {
        const char = symbols[index++];
        phase = index === symbols.length ? (options.loop ? 'holding' : 'done') : 'typing';
        show();
        if (!/^[\r\n]+$/u.test(char)) {
          const wave = options.naturalRhythm ? keystrokeWave(pace, typist.roll) : plainWave;
          emit(wave.strength, undefined, wave.size);
        }
      } else if (!options.loop) {
        phase = 'done';
        show();
      } else {
        const char = symbols[--index];
        if (index) phase = 'deleting';
        else {
          // The message is gone: the lone cursor opens the next cycle with a new rhythm.
          typist = createTypist(fullText, ++cycle);
          dropped = false;
          phase = opening();
        }
        show();
        if (!/^[\r\n]+$/u.test(char))
          emit(
            0.45 * (options.naturalRhythm ? 0.85 + 0.3 * typist.roll() : 1),
            undefined,
            options.naturalRhythm ? 0.8 + 0.2 * typist.roll() : 1,
          );
      }
      sync();
    };
    const sync = () => {
      if (animated && phase === 'done' && !reduced && symbols.length && latest.current.loop)
        phase = 'holding';
      root.dataset.fluidTypingPaused = String(!running());
      if (!animated || !running() || phase === 'done' || !symbols.length) {
        cancel();
        return;
      }
      if (timer) return;
      const delay = remaining ?? plan();
      deadline = performance.now() + delay;
      timer = window.setTimeout(step, delay);
    };
    const onVisibility = () => {
      hidden = document.hidden;
      sync();
    };
    const onMotion = () => {
      cancel();
      reduced = media.matches;
      remaining = null;
      index = reduced || !animated ? symbols.length : 0;
      phase = reduced || !animated ? 'done' : opening();
      dropped = false;
      show();
      sync();
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries.at(-1);
            if (entry) {
              visible = entry.isIntersecting;
              sync();
            }
          });
    observer?.observe(host);
    media.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    controller.current = { sync, emit };
    show();
    sync();
    if (mode === 'static' && previous.current && !previous.current.autoType) {
      const emissions = changes(previous.current.text, fullText);
      const wave = emissions.length
        ? editWave(editClock.current, latest.current.naturalRhythm)
        : plainWave;
      frame = requestAnimationFrame(() => {
        emissions.forEach((strength) => {
          emit(strength * wave.strength, undefined, wave.size);
        });
      });
    }
    previous.current = mode === 'manual' ? null : { text: fullText, autoType: animated };
    return () => {
      disposed = true;
      cancel();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      controller.current = null;
    };
  }, [fullText, mode, animated, prefix, introWave]);

  useLayoutEffect(() => {
    const node = editor.current,
      anchor = caret.current,
      metrics = caretMetrics.current,
      copy = node?.parentElement;
    if (mode !== 'manual' || !node || !anchor || !metrics || !copy) return;
    // Measure the same inline caret used by automatic typing to preserve its baseline.
    const reference = metrics.querySelector<HTMLElement>('.fluid-typing-caret');
    const character = metrics.firstChild;
    if (!reference || !character) return;
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(character);
    const sync = () => {
      const bounds = copy.getBoundingClientRect(),
        text = range.getBoundingClientRect(),
        sample = reference.getBoundingClientRect(),
        position = selectionPosition(node);
      const top = node.innerText
        ? position.top + sample.top - text.top
        : node.getBoundingClientRect().top + sample.top - metrics.getBoundingClientRect().top;
      anchor.style.left = `${String(position.left - bounds.left + copy.scrollLeft)}px`;
      anchor.style.top = `${String(top - bounds.top + copy.scrollTop)}px`;
      const selection = node.ownerDocument.getSelection();
      anchor.dataset.fluidActive = String(
        node.ownerDocument.activeElement === node &&
          !composing.current &&
          (!selection?.rangeCount || selection.isCollapsed),
      );
    };
    syncManualCaret.current = sync;
    sync();
    node.addEventListener('focus', sync);
    node.addEventListener('blur', sync);
    node.ownerDocument.addEventListener('selectionchange', sync);
    copy.addEventListener('scroll', sync);
    const observer = new ResizeObserver(sync);
    observer.observe(copy);
    observer.observe(node);
    return () => {
      syncManualCaret.current = null;
      observer.disconnect();
      node.removeEventListener('focus', sync);
      node.removeEventListener('blur', sync);
      node.ownerDocument.removeEventListener('selectionchange', sync);
      copy.removeEventListener('scroll', sync);
    };
  }, [mode]);

  // The browser owns the editable DOM and selection. Only external value changes replace it.
  useLayoutEffect(() => {
    const node = editor.current;
    if (mode !== 'manual') {
      manualActive.current = false;
      return;
    }
    if (!node || composing.current) return;
    if (node.innerText !== manualText) replaceInput(node, manualText);
    if (!manualActive.current) {
      committedInput.current = manualText;
      manualActive.current = true;
    }
    reportedInput.current = manualText;
    syncManualCaret.current?.();
    if (committedInput.current !== manualText) {
      const position = caret.current?.getBoundingClientRect() ?? selectionPosition(node);
      const wave = editWave(editClock.current, latest.current.naturalRhythm);
      changes(committedInput.current, manualText)
        .slice(-24)
        .forEach((strength) =>
          controller.current?.emit(strength * wave.strength, position, wave.size),
        );
      committedInput.current = manualText;
    }
  });

  const commitInput = () => {
    const node = editor.current;
    if (!node) return;
    const next = node.innerText.replace(/\r\n?/gu, '\n');
    if (next === reportedInput.current) return;
    reportedInput.current = next;
    setInputValue({ text: next });
    onValueChange?.(next);
  };

  useEffect(() => {
    if (previousPaused.current !== paused) playbackOverride.current = null;
    previousPaused.current = paused;
    controller.current?.sync();
  }, [paused, typeSpeed, deleteSpeed, holdDuration, loop]);

  return (
    <FluidRipples
      ref={engine}
      {...fluidTypingPresets['rose-lagoon']}
      {...surface}
      palette={palette}
      blur={blur}
      distortion={distortion}
      refraction={refraction}
      typing
      paused={paused}
      className={`fluid-typing ${className}`.trim()}
    >
      <div ref={stage} className="fluid-typing-stage" data-fluid-typing-mode={mode}>
        <p className="fluid-typing-copy">
          {mode === 'manual' ? (
            <>
              {prefix && <span className="fluid-typing-fixed">{prefix}</span>}
              <span
                ref={editor}
                className="fluid-typing-input"
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                role="textbox"
                aria-label={inputLabel}
                aria-placeholder={placeholder}
                aria-multiline="true"
                tabIndex={0}
                data-placeholder={placeholder}
                data-fluid-cursor={cursor}
                onInput={() => {
                  if (!composing.current) commitInput();
                }}
                onCompositionStart={() => {
                  composing.current = true;
                  syncManualCaret.current?.();
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                  commitInput();
                  syncManualCaret.current?.();
                }}
              >
                {initialInput.current}
              </span>
              <span ref={caretMetrics} className="fluid-typing-caret-metrics" aria-hidden="true">
                {'\u200b'}
                <span className="fluid-typing-caret" />
              </span>
              <span
                ref={caret}
                className="fluid-typing-caret fluid-typing-manual-caret"
                aria-hidden="true"
                data-fluid-cursor={cursor}
              />
            </>
          ) : (
            <>
              <span className="fluid-typing-accessible">
                {prefix}
                {fullText}
              </span>
              <span className="fluid-typing-reserve" aria-hidden="true">
                {prefix && <span className="fluid-typing-fixed">{prefix}</span>}
                {fullText.split('\n').map((line, index) => (
                  <span key={index}>
                    {index > 0 && <br />}
                    {graphemes(line).map((symbol, symbolIndex) => (
                      <span key={symbolIndex}>{symbol}</span>
                    ))}
                    <span className="fluid-typing-caret" />
                  </span>
                ))}
              </span>
              <span className="fluid-typing-visible" aria-hidden="true">
                {prefix && <span className="fluid-typing-fixed">{prefix}</span>}
                <span ref={output} className="fluid-typing-text">
                  {fullText}
                </span>
                <span ref={caret} className="fluid-typing-caret" data-fluid-cursor={cursor} />
              </span>
            </>
          )}
        </p>
        {children}
      </div>
    </FluidRipples>
  );
});
