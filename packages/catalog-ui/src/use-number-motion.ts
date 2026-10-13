import { useRef } from 'react';
import { useControlMotion } from './use-control-motion';

export function useNumberMotion(progress: number, disabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useControlMotion(
    progress,
    (value) => {
      const element = root.current;
      if (!element) return;
      element.style.setProperty('--reveal-progress', `${value}%`);
      element.dataset.atEdge = String(value <= 0 || value >= 100);
    },
    disabled,
  );
  return root;
}
