import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

import { cancelActiveEditorInteraction } from '../editor/activeEditorInteraction';
import {
  clampWorkspaceDimension,
  type WorkspaceDimensionBounds,
} from './workspaceLayout';

export type WorkspaceSplitterAxis = 'horizontal' | 'vertical';

interface WorkspaceSplitterProps {
  readonly axis: WorkspaceSplitterAxis;
  readonly value: number;
  readonly bounds: WorkspaceDimensionBounds;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly controls?: string;
  readonly deltaSign?: 1 | -1;
  readonly disabled?: boolean;
  readonly testId?: string;
}

interface DragState {
  readonly pointerId: number;
  readonly startCoordinate: number;
  readonly startValue: number;
}

function coordinateForEvent(
  axis: WorkspaceSplitterAxis,
  event: { readonly clientX: number; readonly clientY: number },
): number {
  return axis === 'vertical' ? event.clientX : event.clientY;
}

function removeResizeClasses(axis: WorkspaceSplitterAxis): void {
  document.body.classList.remove(
    'is-workspace-resizing',
    `is-workspace-resizing-${axis}`,
  );
}

function addResizeClasses(axis: WorkspaceSplitterAxis): void {
  document.body.classList.add(
    'is-workspace-resizing',
    `is-workspace-resizing-${axis}`,
  );
}

function releasePointerCapture(
  element: HTMLDivElement | null,
  pointerId: number,
): void {
  try {
    if (element?.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // A canceled pointer may already have released capture.
  }
}

/** A keyboard- and pointer-accessible separator for the fixed editor shell. */
export function WorkspaceSplitter({
  axis,
  value,
  bounds,
  onChange,
  label,
  controls,
  deltaSign = 1,
  disabled = false,
  testId,
}: WorkspaceSplitterProps) {
  const splitterRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);
  const safeValue = clampWorkspaceDimension(value, bounds);

  const finishDrag = useCallback(
    (pointerId?: number) => {
      const drag = dragRef.current;
      if (
        drag === undefined ||
        (pointerId !== undefined && drag.pointerId !== pointerId)
      ) {
        return;
      }
      releasePointerCapture(splitterRef.current, drag.pointerId);
      dragRef.current = undefined;
      removeResizeClasses(axis);
    },
    [axis],
  );

  useEffect(() => {
    const handleWindowBlur = () => finishDrag();
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      finishDrag();
    };
  }, [finishDrag]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancelActiveEditorInteraction();
    dragRef.current = {
      pointerId: event.pointerId,
      startCoordinate: coordinateForEvent(axis, event),
      startValue: safeValue,
    };
    addResizeClasses(axis);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few synthetic test environments.
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const delta =
      (coordinateForEvent(axis, event) - drag.startCoordinate) * deltaSign;
    onChange(clampWorkspaceDimension(drag.startValue + delta, bounds));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    let nextValue: number | undefined;
    if (event.key === 'Home') {
      nextValue = bounds.min;
    } else if (event.key === 'End') {
      nextValue = bounds.max;
    } else {
      const positiveKey =
        axis === 'vertical'
          ? event.key === 'ArrowRight'
          : event.key === 'ArrowDown';
      const negativeKey =
        axis === 'vertical'
          ? event.key === 'ArrowLeft'
          : event.key === 'ArrowUp';
      if (!positiveKey && !negativeKey) return;

      const step = event.shiftKey ? 32 : 8;
      const direction = positiveKey ? 1 : -1;
      nextValue = safeValue + direction * step * deltaSign;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelActiveEditorInteraction();
    onChange(clampWorkspaceDimension(nextValue, bounds));
  };

  return (
    <div
      ref={splitterRef}
      className={`workspace-splitter workspace-splitter--${axis}`}
      role="separator"
      aria-label={label}
      aria-orientation={axis}
      aria-controls={controls}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={safeValue}
      aria-valuetext={`${safeValue} pixels`}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerCancel={(event) => finishDrag(event.pointerId)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event.pointerId)}
      onLostPointerCapture={(event) => finishDrag(event.pointerId)}
    />
  );
}
