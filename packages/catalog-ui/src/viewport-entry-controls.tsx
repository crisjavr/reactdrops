import { useRef, useState } from 'react';
import { ControlField } from './controls-panel';
import { NumberControl, SwitchControl } from './customizer-controls';
import { ViewportGuides, type ViewportGuideInteraction } from './viewport-guides';

const mirrorViewport = (value: number) => Number((100 - value).toFixed(2));

export function ViewportEntryControls({
  start,
  up,
  onStartChange,
  onUpChange,
  onPreviewChange,
}: {
  start: number;
  up?: number;
  onStartChange: (value: number) => void;
  onUpChange: (value: number | undefined) => void;
  onPreviewChange?: (value: { start: number; up?: number } | null) => void;
}) {
  const [guide, setGuide] = useState<ViewportGuideInteraction | null>(null);
  const [draft, setDraft] = useState<{ start: number; up?: number } | null>(null);
  const drag = useRef<typeof draft>(null);
  const separate = up !== undefined;
  const displayed = draft ?? { start, up };
  const downLabel = separate ? 'Scrolling down (%)' : 'Viewport start (%)';
  const change = (direction: 'down' | 'up', value: number) => {
    if (drag.current) {
      // Keep committed usage stable; previews can opt into live adjustments.
      drag.current = { ...drag.current, [direction === 'down' ? 'start' : 'up']: value };
      setDraft(drag.current);
      onPreviewChange?.(drag.current);
    } else if (direction === 'down') onStartChange(value);
    else onUpChange(value);
  };
  const interact = (direction: 'down' | 'up', active: boolean, input: HTMLInputElement) => {
    if (active) {
      drag.current = { start, up };
      setDraft(drag.current);
      setGuide({ input, direction });
      onPreviewChange?.(drag.current);
    } else {
      const final = drag.current;
      drag.current = null;
      setDraft(null);
      setGuide(null);
      onPreviewChange?.(null);
      if (final && direction === 'down' && final.start !== start) onStartChange(final.start);
      if (final && direction === 'up' && final.up !== up) onUpChange(final.up);
    }
  };
  return (
    <>
      <ViewportGuides
        interaction={guide}
        down={displayed.start}
        up={displayed.up ?? mirrorViewport(displayed.start)}
        separate={separate}
      />
      <ControlField
        className="is-boolean"
        label="Separate scroll directions"
        description="Choose independent entry lines for scrolling down and up. Both percentages are measured from the top of the screen."
      >
        <SwitchControl
          label="Separate scroll directions"
          checked={separate}
          onChange={(enabled) => onUpChange(enabled ? mirrorViewport(start) : undefined)}
        />
      </ControlField>
      <ControlField
        className="is-number"
        label={downLabel}
        description="Entry line measured from the top of the screen. Hold the slider to see both lines. Upward entry mirrors this value unless separate directions are enabled."
      >
        <NumberControl
          label={downLabel}
          value={displayed.start}
          min={1}
          max={100}
          step={0.01}
          onChange={(value) => change('down', value)}
          onInteractionChange={(active, input) => interact('down', active, input)}
        />
      </ControlField>
      {separate && (
        <ControlField
          className="is-number"
          label="Scrolling up (%)"
          description="The bottom of the component must reach this line when scrolling up. Hold the slider to see it."
        >
          <NumberControl
            label="Scrolling up (%)"
            value={displayed.up ?? up}
            min={0}
            max={100}
            step={0.01}
            onChange={(value) => change('up', value)}
            onInteractionChange={(active, input) => interact('up', active, input)}
          />
        </ControlField>
      )}
    </>
  );
}
