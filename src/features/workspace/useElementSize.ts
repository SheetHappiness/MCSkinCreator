import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

const EMPTY_SIZE: ElementSize = { width: 0, height: 0 };

function getElementSize(element: HTMLElement): ElementSize {
  const bounds = element.getBoundingClientRect();
  return { width: bounds.width, height: bounds.height };
}

/** Observes CSS layout size without coupling it to document or history state. */
export function useElementSize<T extends HTMLElement>(
  elementRef: RefObject<T | null>,
  enabled = true,
): ElementSize {
  const [size, setSize] = useState<ElementSize>(EMPTY_SIZE);

  useLayoutEffect(() => {
    if (!enabled) return;

    const element = elementRef.current;
    if (element === null) return;

    const updateSize = () => {
      const next = getElementSize(element);
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, enabled]);

  return size;
}
