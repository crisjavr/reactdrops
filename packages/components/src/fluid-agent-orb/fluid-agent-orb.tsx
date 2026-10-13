'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  FluidGlassGradient,
  type FluidGlassGradientProps,
  type FluidGlassGradientHandle,
} from '../fluid-glass-gradient/fluid-glass-gradient';
import {
  agentState,
  agentThinkingAnimation,
  agentSearchingAnimation,
  fluidAgentOrbDefaults,
  fluidAgentOrbPresets,
  fluidAgentOrbStateLabels,
  normalizeAudioLevel,
  type FluidAgentOrbState,
  type FluidAgentOrbPreset,
  type FluidAgentOrbThinkingAnimation,
  type FluidAgentOrbSearchingAnimation,
  type FluidAgentOrbSearchCurve,
} from './fluid-agent-orb-model';
import { createAgentMotion } from './fluid-agent-orb-motion';
import { fluidAgentOrbFragment, fluidAgentOrbUniforms } from './fluid-agent-orb-patterns';
import { createFluidAgentOrbEntrance } from './fluid-agent-orb-entrance';
import './fluid-agent-orb.css';
const {
  state: _state,
  thinkingAnimation: _thinkingAnimation,
  searchingAnimation: _searchingAnimation,
  intensity: _intensity,
  preserveWhites: _preserveWhites,
  animateEntrance: _animateEntrance,
  ...glassDefaults
} = fluidAgentOrbDefaults;

export type FluidAgentOrbHandle = {
  setAudioLevel: (level: number) => void;
  reset: () => void;
};
export type FluidAgentOrbProps = Omit<
  FluidGlassGradientProps,
  'shape' | 'onFrame' | 'materialAnimation' | 'preset' | 'data-state'
> & {
  shape?: 'circle';
  preset?: FluidAgentOrbPreset;
  state?: FluidAgentOrbState;
  thinkingAnimation?: FluidAgentOrbThinkingAnimation;
  searchingAnimation?: FluidAgentOrbSearchingAnimation;
  /** Customize the searching lens duration, easing and clock position. */
  searchingCurve?: Partial<FluidAgentOrbSearchCurve>;
  /** Strength of voice response in Listening and Speaking, independent of icon relief. */
  intensity?: number;
  preserveWhites?: boolean;
  audioLevel?: number;
  getAudioLevel?: () => number;
  /** Grow from the center with power4.out on mount. Disabled for reduced motion. */
  animateEntrance?: boolean;
};

export const FluidAgentOrb = forwardRef<FluidAgentOrbHandle, FluidAgentOrbProps>(
  function FluidAgentOrb(
    {
      state: requestedState,
      thinkingAnimation: requestedThinkingAnimation,
      searchingAnimation: requestedSearchingAnimation,
      searchingCurve,
      intensity = 1,
      preserveWhites = true,
      audioLevel = 0.55,
      getAudioLevel,
      animateEntrance = fluidAgentOrbDefaults.animateEntrance,
      shape: _shape,
      interactive: _interactive,
      preset,
      className = '',
      'aria-label': label,
      ...props
    },
    ref,
  ) {
    const state = agentState(requestedState);
    const thinkingAnimation = agentThinkingAnimation(requestedThinkingAnimation);
    const searchingAnimation = agentSearchingAnimation(requestedSearchingAnimation);
    const gradient = useRef<FluidGlassGradientHandle>(null);
    const imperative = useRef<number | null>(null);
    const input = useRef({
      state,
      thinkingAnimation,
      searchingAnimation,
      searchingCurve,
      intensity,
      preserveWhites,
      audioLevel,
      getAudioLevel,
    });
    input.current = {
      state,
      thinkingAnimation,
      searchingAnimation,
      searchingCurve,
      intensity,
      preserveWhites,
      audioLevel,
      getAudioLevel,
    };
    const motion = useMemo(
      () =>
        createAgentMotion(() => ({
          state: input.current.state,
          thinkingAnimation: input.current.thinkingAnimation,
          searchingAnimation: input.current.searchingAnimation,
          searchingCurve: input.current.searchingCurve,
          intensity: input.current.intensity,
          preserveWhites: input.current.preserveWhites,
          audioLevel:
            input.current.getAudioLevel?.() ?? imperative.current ?? input.current.audioLevel,
        })),
      [],
    );
    const material = useMemo(
      () => ({
        fragment: fluidAgentOrbFragment,
        uniformNames: fluidAgentOrbUniforms,
        uniforms: motion.uniforms,
      }),
      [motion],
    );
    useImperativeHandle(
      ref,
      () => ({
        setAudioLevel(level) {
          imperative.current = normalizeAudioLevel(level);
          gradient.current?.invalidate();
        },
        reset() {
          motion.reset();
          gradient.current?.reset();
        },
      }),
      [motion],
    );
    useEffect(() => {
      const host = gradient.current?.element;
      if (animateEntrance && host) return createFluidAgentOrbEntrance(host);
    }, [animateEntrance]);
    useEffect(() => {
      imperative.current = null;
      gradient.current?.invalidate();
    }, [audioLevel]);
    useEffect(() => {
      gradient.current?.invalidate();
    }, [
      state,
      thinkingAnimation,
      searchingAnimation,
      searchingCurve,
      intensity,
      preserveWhites,
      getAudioLevel,
    ]);
    return (
      <FluidGlassGradient
        ref={gradient}
        {...glassDefaults}
        {...(preset ? fluidAgentOrbPresets[preset] : {})}
        {...props}
        interactive={false}
        shape="circle"
        className={`fluid-agent-orb${animateEntrance ? ' fluid-agent-orb--entrance' : ''} ${className}`.trim()}
        aria-label={label ?? `AI assistant: ${fluidAgentOrbStateLabels[state]}`}
        data-state={state}
        onFrame={motion.frame}
        materialAnimation={material}
      />
    );
  },
);
