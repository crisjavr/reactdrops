import { useEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { CopyPromptMenu } from './copy-prompt-menu';
import { createSharedHoverIndicator } from './shared-hover-indicator';

export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

type ComponentPreviewToolbarProps = {
  componentName: string;
  componentSlug: string;
  prompt: string;
  defaultPrompt?: string;
  viewport: PreviewViewport;
  onViewportChange: (viewport: PreviewViewport) => void;
};

const viewportOptions: Array<{
  value: PreviewViewport;
  label: string;
  width: number;
}> = [
  { value: 'desktop', label: 'Desktop', width: 1440 },
  { value: 'tablet', label: 'Tablet', width: 768 },
  { value: 'mobile', label: 'Mobile', width: 390 },
];

const heartPath = 'M10 16.4 3.8 10.6A4.1 4.1 0 0 1 9.6 4.8L10 5.2l.4-.4a4.1 4.1 0 0 1 5.8 5.8Z';
const favoriteFeedbackDuration = 1000;

export function PreviewFullscreenButton({
  fullscreen,
  onClick,
  buttonRef,
}: {
  fullscreen: boolean;
  onClick: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const label = fullscreen ? 'Exit full screen' : 'Enter full screen';
  return (
    <button
      ref={buttonRef}
      className="component-fullscreen-button"
      type="button"
      aria-label={label}
      aria-pressed={fullscreen}
      title={label}
      data-tooltip={fullscreen ? 'Minimize · Esc' : 'Full screen'}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d={
            fullscreen
              ? 'M3 7h4V3m6 0v4h4M3 13h4v4m6 0v-4h4'
              : 'M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4'
          }
        />
      </svg>
    </button>
  );
}

function ViewportIcon({ viewport }: { viewport: PreviewViewport }) {
  if (viewport === 'desktop') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" />
        <path d="M7.2 17h5.6M10 14v3" />
      </svg>
    );
  }

  if (viewport === 'tablet') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="4.2" y="2.2" width="11.6" height="15.6" rx="2" />
        <path d="M9.3 15.2h1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="6" y="2" width="8" height="16" rx="2" />
      <path d="M9.3 15.4h1.4" />
    </svg>
  );
}

export function ComponentPreviewToolbar({
  componentName,
  componentSlug,
  prompt,
  defaultPrompt = prompt,
  viewport,
  onViewportChange,
}: ComponentPreviewToolbarProps) {
  const [favorite, setFavorite] = useState(false);
  const [favoriteFeedback, setFavoriteFeedback] = useState(false);
  const favoriteFeedbackTimer = useRef<number | undefined>(undefined);
  const favoriteValue = useRef(false);
  const favoriteIcon = useRef<SVGSVGElement>(null);
  const favoriteAnimation = useRef<gsap.core.Timeline | null>(null);
  const favoriteMotionPreference = useRef<MediaQueryList | null>(null);
  const viewportControls = useRef<HTMLDivElement>(null);
  const favoriteStorageKey = `reactdrops:favorite:${componentSlug}`;

  useEffect(() => {
    window.clearTimeout(favoriteFeedbackTimer.current);
    favoriteFeedbackTimer.current = undefined;
    setFavoriteFeedback(false);
    favoriteValue.current = window.localStorage.getItem(favoriteStorageKey) === 'true';
    setFavorite(favoriteValue.current);

    const icon = favoriteIcon.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    favoriteMotionPreference.current = preference;
    const resetMotion = () => {
      favoriteAnimation.current?.kill();
      favoriteAnimation.current = null;
      if (icon) gsap.set(icon, { clearProps: 'transform' });
    };
    const onMotionChange = () => {
      if (preference.matches) resetMotion();
    };
    preference.addEventListener('change', onMotionChange);
    return () => {
      window.clearTimeout(favoriteFeedbackTimer.current);
      favoriteFeedbackTimer.current = undefined;
      resetMotion();
      preference.removeEventListener('change', onMotionChange);
      favoriteMotionPreference.current = null;
    };
  }, [favoriteStorageKey]);

  useEffect(() => {
    if (!viewportControls.current) return;
    return createSharedHoverIndicator(viewportControls.current, {
      itemSelector: 'button',
      activeSelector: 'button[data-preview-viewport][aria-pressed="true"]',
      matchBorderRadius: true,
    });
  }, []);

  const toggleFavorite = () => {
    const next = !favoriteValue.current;
    favoriteValue.current = next;
    window.localStorage.setItem(favoriteStorageKey, String(next));
    setFavorite(next);
    window.clearTimeout(favoriteFeedbackTimer.current);
    favoriteFeedbackTimer.current = undefined;
    setFavoriteFeedback(next);
    if (next) {
      favoriteFeedbackTimer.current = window.setTimeout(() => {
        setFavoriteFeedback(false);
        favoriteFeedbackTimer.current = undefined;
      }, favoriteFeedbackDuration);
    }

    const icon = favoriteIcon.current;
    if (!icon || favoriteMotionPreference.current?.matches) return;

    // Retarget the same icon so rapid clicks continue from its current pose.
    favoriteAnimation.current?.kill();
    const animation = gsap.timeline({
      defaults: { ease: 'sine.out' },
      onComplete: () => {
        gsap.set(icon, { clearProps: 'transform' });
        favoriteAnimation.current = null;
      },
    });
    favoriteAnimation.current = animation;

    if (next) {
      animation
        .to(icon, { scaleX: 0.92, scaleY: 0.86, y: 0.35, duration: 0.075 })
        .to(icon, { scaleX: 1.18, scaleY: 1.23, y: -0.6, duration: 0.16 })
        .to(icon, {
          scaleX: 1,
          scaleY: 1,
          y: 0,
          duration: 0.38,
          ease: 'back.out(1.65)',
        });
    } else {
      animation
        .to(icon, {
          scaleX: 0.94,
          scaleY: 0.9,
          y: 0.25,
          duration: 0.09,
        })
        .to(icon, { scaleX: 1, scaleY: 1, y: 0, duration: 0.3, ease: 'back.out(1.15)' });
    }
  };

  return (
    <div className="component-header-actions">
      <CopyPromptMenu defaultPrompt={defaultPrompt} customPrompt={prompt} />

      <button
        className={`component-favorite-button${favorite ? ' is-active' : ''}${favoriteFeedback ? ' is-confirming' : ''}`}
        type="button"
        aria-label={
          favorite ? `Remove ${componentName} from favorites` : `Add ${componentName} to favorites`
        }
        aria-pressed={favorite}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={toggleFavorite}
      >
        <svg ref={favoriteIcon} viewBox="0 0 20 20" aria-hidden="true">
          <path className="component-favorite-fill" d={heartPath} />
          <path d={heartPath} />
        </svg>
      </button>

      <div
        ref={viewportControls}
        className="component-viewport-controls"
        role="group"
        aria-label="Preview resolution"
      >
        <span
          className="component-viewport-indicator"
          data-shared-hover-indicator
          aria-hidden="true"
        />
        {viewportOptions.map((option) => (
          <button
            className={viewport === option.value ? 'is-active' : ''}
            type="button"
            aria-label={`${option.label} preview, ${option.width} pixels wide`}
            aria-pressed={viewport === option.value}
            data-preview-viewport={option.value}
            data-tooltip={`${option.label} · ${option.width}px`}
            onClick={() => onViewportChange(option.value)}
            key={option.value}
          >
            <ViewportIcon viewport={option.value} />
          </button>
        ))}
      </div>
    </div>
  );
}
