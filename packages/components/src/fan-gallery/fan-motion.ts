import {
  fanLayer,
  fanSlot,
  fanLayout,
  fanPose,
  type FanEntrance,
  type FanOptions,
} from './fan-layout';

export type FanCardElement = HTMLButtonElement | HTMLAnchorElement;
export interface FanMotionOptions extends FanOptions {
  entrance: FanEntrance;
  radius: number;
  /** Seconds for one card to settle into the fan. */
  speed: number;
  /** Seconds between successive cards. */
  stagger: number;
  /** 0 lands softly; 1 overshoots and wobbles. */
  bounce: number;
  /** Seconds for the focus to glide to the pointed card. */
  hoverSpeed: number;
}
export interface FanSurface {
  stage: HTMLDivElement;
  cards: FanCardElement[];
  heading: HTMLElement | null;
}

/**
 * Step response of a damped spring from 0 to 1 (exact, time-based, so any
 * moment can be rendered directly). `bounce` lowers the damping ratio.
 */
export function fanSpring(time: number, speed: number, bounce: number) {
  if (time <= 0) return 0;
  const zeta = 1 - 0.68 * Math.max(0, Math.min(1, bounce));
  const omega = 6.6 / Math.max(0.05, speed);
  if (zeta >= 0.999) return 1 - (1 + omega * time) * Math.exp(-omega * time);
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    Math.exp(-zeta * omega * time) *
      (Math.cos(damped * time) + ((zeta * omega) / damped) * Math.sin(damped * time))
  );
}
/** Time after which a spring of this kind stays within 0.1% of its target. */
export function fanSettleTime(speed: number, bounce: number) {
  const zeta = 1 - 0.68 * Math.max(0, Math.min(1, bounce));
  const omega = 6.6 / Math.max(0.05, speed);
  const tolerance = 1e-3;
  if (zeta >= 0.999) {
    // (1 + ωt)·e^(−ωt) = tolerance, solved by fixed-point iteration.
    let t = Math.log(1 / tolerance) / omega;
    for (let i = 0; i < 8; i++) t = (Math.log(1 + omega * t) + Math.log(1 / tolerance)) / omega;
    return t;
  }
  // Underdamped envelope: e^(−ζωt) / √(1 − ζ²).
  return Math.log(1 / (tolerance * Math.sqrt(1 - zeta * zeta))) / (zeta * omega);
}

const radians = Math.PI / 180;

/** Exact critically damped follow (frame-rate independent). */
function follow(state: { x: number; v: number }, target: number, omega: number, dt: number) {
  const decay = Math.exp(-omega * dt);
  const change = state.x - target;
  const lag = (state.v + omega * change) * dt;
  state.x = target + (change + lag) * decay;
  state.v = (state.v - omega * lag) * decay;
}

export interface FanLayoutInfo {
  /** Spacing actually used after fitting the container. */
  spacing: number;
  /** Requested spacing. */
  requestedSpacing: number;
  /** Uniform card scale (1 when the requested card width fits). */
  scale: number;
}

/** Card transforms, entrance and hover, independent of React and playback. */
export function createFanMotion(
  surface: FanSurface,
  initial: FanMotionOptions,
  reduced: MediaQueryList,
  onLayout?: (info: FanLayoutInfo) => void,
) {
  const { stage, cards, heading } = surface;
  const count = cards.length;
  const root = stage.closest<HTMLElement>('.fan-gallery');
  let options = initial;
  let layout = fanLayout(stage.clientWidth, count, options);
  let measuredWidth = -1;
  // Entrance order follows the front side for every entrance.
  let rank: number[] = [];
  let length = 0;
  const derive = () => {
    rank = cards.map((_, i) => (options.stackFrom === 'right' ? count - 1 - i : i));
    length = (count - 1) * Math.max(0, options.stagger) + fanSettleTime(options.speed, options.bounce);
  };
  derive();

  // Entrance clock: null before play; Infinity once finished.
  let time: number | null = null;
  let started = 0;
  let onComplete: (() => void) | null = null;
  // Hover: one active card; each card follows its own offset from rest with
  // a critically damped spring (x, y, rotation), so every card travels a
  // clear, independent path and nothing passes through an in-between state.
  let active = -1;
  const offsets = cards.map(() => ({
    x: { x: 0, v: 0 },
    y: { x: 0, v: 0 },
    r: { x: 0, v: 0 },
    tx: 0,
    ty: 0,
    tr: 0,
  }));
  const retarget = () => {
    for (let i = 0; i < count; i++) {
      const rest = fanPose(i, count, layout.options);
      const target = fanPose(i, count, layout.options, active);
      const o = offsets[i];
      o.tx = (target.x - rest.x) * layout.fit;
      o.ty = (target.y - rest.y) * layout.fit;
      o.tr = target.rotation - rest.rotation;
    }
  };
  const snap = () => {
    for (const o of offsets) {
      o.x.x = o.tx;
      o.y.x = o.ty;
      o.r.x = o.tr;
      o.x.v = o.y.v = o.r.v = 0;
    }
  };
  let frame = 0;
  let last = 0;
  const written = cards.map(() => ({ transform: '', z: -1, opacity: -1 }));
  let headingOpacity = -1;

  /**
   * Pose of card i at entrance progress p (0 = start, 1 = in the fan).
   * `carried` is the undelayed progress shared by the whole deck.
   */
  const place = (i: number, progress: number, carried: number) => {
    const fit = layout.fit;
    const final = fanPose(i, count, layout.options);
    let x = final.x * fit,
      y = final.y * fit,
      rotation = final.rotation,
      rotateY = 0,
      opacity = 1;
    const p = progress;
    if (p < 1 || p > 1) {
      const h = layout.height;
      // Arcs travel around a virtual pivot below the fan.
      const pivot = h * 3.2;
      const polar = (px: number, py: number) => ({
        angle: Math.atan2(px, pivot - py) / radians,
        reach: Math.hypot(px, pivot - py),
      });
      const fromPolar = (angle: number, reach: number) => {
        x = Math.sin(angle * radians) * reach;
        y = pivot - Math.cos(angle * radians) * reach;
      };
      const side = options.stackFrom === 'right' ? 1 : -1;
      if (options.entrance === 'stack') {
        // A closed stack opens like a swatch book: every card pivots from the
        // middle to its own place, with no lift or slide.
        const end = polar(x, y);
        fromPolar(end.angle * p, end.reach);
        rotation *= p;
      } else if (options.entrance === 'deal') {
        // Thrown from a deck beside the stage, along an arc, with a spin.
        const startX = side * (layout.originX + layout.width * 1.2);
        const startY = layout.stageHeight - layout.originY + h * 0.4;
        const controlX = (startX + x) / 2;
        const controlY = Math.min(startY, y) - h * 0.9;
        const q = 1 - p;
        x = q * q * startX + 2 * q * p * controlX + p * p * x;
        y = q * q * startY + 2 * q * p * controlY + p * p * y;
        rotation = side * -75 + (rotation - side * -75) * p;
      } else if (options.entrance === 'circular' || options.entrance === 'deck') {
        // Along the pivot circle from beyond the front side; rotation follows
        // the angle travelled.
        const start = side * 100;
        const end = polar(x, y);
        let angle: number;
        if (options.entrance === 'circular') angle = start + (end.angle - start) * p;
        else {
          // The closed deck travels together behind its leading card and
          // unfolds card by card as it arrives.
          const lead = options.stackFrom === 'right' ? count - 1 : 0;
          const leadPose = fanPose(lead, count, layout.options);
          const leadAngle = polar(leadPose.x * fit, leadPose.y * fit).angle;
          const open = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
          const unfold = open * open * (3 - 2 * open);
          angle = start + (leadAngle - start) * carried + (end.angle - leadAngle) * unfold;
        }
        fromPolar(angle, end.reach);
        rotation += angle - end.angle;
      } else if (options.entrance === 'rise') {
        // Rises from below the stage into its slot, settling with the spring.
        const startY = layout.stageHeight - layout.originY + h * 0.9;
        const wobble = ((i * 37) % 11) - 5;
        y = startY + (y - startY) * p;
        rotation = rotation + wobble * 4 * (1 - p);
      } else {
        // Turns from edge-on to face, in place.
        rotateY = 90 * (1 - p);
        opacity = Math.max(0, Math.min(1, p * 3));
      }
    }
    // Hover offsets ride on top of the entrance, so hover responds at any time.
    const o = offsets[i];
    return { x: x + o.x.x, y: y + o.y.x, rotation: rotation + o.r.x, rotateY, opacity };
  };

  /** Paints every card, or only those flagged in `only` (others are unchanged). */
  const render = (only?: Uint8Array) => {
    const now = time;
    const carried =
      now === null ? 0 : now === Infinity ? 1 : fanSpring(now, options.speed, options.bounce);
    for (let i = 0; i < count; i++) {
      if (only && !only[i]) continue;
      const delay = rank[i] * Math.max(0, options.stagger);
      const progress =
        now === null ? 0 : now === Infinity ? 1 : fanSpring(now - delay, options.speed, options.bounce);
      const pose = place(i, progress, carried);
      const left = layout.originX + pose.x - layout.width / 2;
      const top = layout.originY + pose.y - layout.height / 2;
      // Each card carries its own perspective, so it is flattened on its own
      // and z-index alone decides overlap: cards never intersect in depth.
      const transform =
        `translate(${left.toFixed(2)}px,${top.toFixed(2)}px) rotate(${pose.rotation.toFixed(3)}deg)` +
        (pose.rotateY ? ` perspective(1400px) rotateY(${pose.rotateY.toFixed(2)}deg)` : '');
      // Stable, unique layers: the active card in front, the rest in resting order.
      const z = 1 + fanLayer(i, count, layout.options) + (i === active ? count : 0);
      const cache = written[i];
      const style = cards[i].style;
      if (cache.transform !== transform) style.transform = cache.transform = transform;
      if (cache.z !== z) style.zIndex = String((cache.z = z));
      const opacity = Math.round(pose.opacity * 1000) / 1000;
      if (cache.opacity !== opacity) style.opacity = String((cache.opacity = opacity));
    }
    if (heading) {
      const opacity =
        now === null ? 0 : now === Infinity ? 1 : Math.min(1, Math.max(0, now / (options.speed * 0.8)));
      if (opacity !== headingOpacity) heading.style.opacity = String((headingOpacity = opacity));
    }
  };

  const settled = (state: { x: number; v: number }, target: number) =>
    Math.abs(state.x - target) < 0.02 && Math.abs(state.v) < 0.05;
  const cardMoving = (o: (typeof offsets)[number]) =>
    !settled(o.x, o.tx) || !settled(o.y, o.ty) || !settled(o.r, o.tr);
  const entering = () => time !== null && time !== Infinity;
  const moving = () => entering() || offsets.some(cardMoving);

  // Cards to repaint this frame when only hover springs move.
  const changed = new Uint8Array(count);
  let fullRepaint = true;
  const tick = (now: number) => {
    frame = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const omega = 6.6 / Math.max(0.05, options.hoverSpeed);
    changed.fill(0);
    for (let i = 0; i < count; i++) {
      const o = offsets[i];
      if (!cardMoving(o)) continue;
      follow(o.x, o.tx, omega, dt);
      follow(o.y, o.ty, omega, dt);
      follow(o.r, o.tr, omega, dt);
      if (!cardMoving(o)) {
        o.x.x = o.tx;
        o.y.x = o.ty;
        o.r.x = o.tr;
        o.x.v = o.y.v = o.r.v = 0;
      }
      changed[i] = 1;
    }
    if (entering()) {
      time = (now - started) / 1000;
      if (time >= length) {
        time = Infinity;
        const done = onComplete;
        onComplete = null;
        done?.();
      }
      fullRepaint = true;
    }
    render(fullRepaint ? undefined : changed);
    fullRepaint = false;
    const still = !moving();
    setAnimating(!still);
    if (!still) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  /**
   * While anything moves, cards may travel past the component's edges (an
   * overshooting spring is never cut); once everything settles, the edges
   * clip again. While a card is active, neighbors may also extend past the
   * sides (the fan is fitted at rest), so the component then only clips
   * vertically.
   */
  let animating = false;
  const setAnimating = (on: boolean) => {
    if (on === animating) return;
    animating = on;
    stage.classList.toggle('is-moving', on);
    root?.classList.toggle('is-animating', on);
  };
  const wake = () => {
    setAnimating(true);
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const setActive = (next: number) => {
    if (next === active) return false;
    if (active >= 0) cards[active]?.removeAttribute('aria-current');
    active = next;
    if (active >= 0) cards[active]?.setAttribute('aria-current', 'true');
    root?.classList.toggle('is-active', active >= 0);
    return true;
  };
  const relayout = () => {
    measuredWidth = stage.clientWidth;
    layout = fanLayout(stage.clientWidth, count, options);
    retarget();
    stage.style.height = `${layout.stageHeight}px`;
    const radius = Math.max(0, options.radius) * layout.fit;
    for (const card of cards) {
      card.style.width = `${layout.width}px`;
      card.style.height = `${layout.height}px`;
      card.style.borderRadius = `${radius}px`;
    }
    onLayout?.({
      spacing: layout.spacing,
      requestedSpacing: Math.max(0, options.spacing),
      scale: layout.fit,
    });
  };

  return {
    measure() {
      if (measuredWidth === stage.clientWidth) return false;
      relayout();
      snap();
      render();
      return true;
    },
    /**
     * Live option changes: geometry and timing update in place, hover
     * springs carry cards to their new targets, and a running entrance
     * continues. Nothing is recreated.
     */
    update(next: FanMotionOptions) {
      options = next;
      derive();
      relayout();
      fullRepaint = true;
      if (reduced.matches) {
        snap();
        render();
      } else {
        render();
        wake();
      }
    },
    /** Starting poses, before the entrance. */
    reset() {
      time = null;
      onComplete = null;
      // Waiting cards (some start beyond the edges) stay clipped until play.
      if (!frame) setAnimating(false);
      render();
    },
    play(done: () => void) {
      time = 0;
      started = performance.now();
      last = 0;
      onComplete = done;
      render();
      wake();
    },
    finish() {
      time = Infinity;
      onComplete = null;
      if (!frame) setAnimating(false);
      render();
    },
    /** Select a card (keyboard, taps, pointer slots), or none with null. */
    focusCard(index: number | null) {
      if (!setActive(index === null ? -1 : Math.round(index))) return;
      retarget();
      // Layers change for the old and new active cards only.
      fullRepaint = true;
      if (reduced.matches) {
        snap();
        render();
      } else wake();
    },
    /**
     * Hover by pointer: stable slots, one per card and centered on its
     * resting position, so a moving card never steals the pointer; only
     * inside the band the cards occupy (plus the active card's rise).
     */
    focusPoint(clientX: number, clientY: number) {
      const box = stage.getBoundingClientRect();
      const y = clientY - box.top;
      const rise = active >= 0 ? Math.max(0, options.lift) * layout.fit : 0;
      if (y < layout.bandTop - rise - 8 || y > layout.bandBottom + 8) {
        this.focusCard(null);
        return;
      }
      const slot = Math.max(1e-3, layout.options.spacing * layout.options.cardWidth * layout.fit);
      const first = layout.originX + fanPose(0, count, layout.options).x * layout.fit - slot / 2;
      this.focusCard(fanSlot((clientX - box.left - first) / (slot * count), count));
    },
    cancel() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      onComplete = null;
      setAnimating(false);
    },
    destroy() {
      this.cancel();
      setActive(-1);
    },
  };
}
