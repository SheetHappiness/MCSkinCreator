import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceSplitter } from './WorkspaceSplitter';

afterEach(() => {
  cleanup();
  document.body.classList.remove(
    'is-workspace-resizing',
    'is-workspace-resizing-vertical',
    'is-workspace-resizing-horizontal',
  );
});

function renderSplitter(
  overrides: Partial<React.ComponentProps<typeof WorkspaceSplitter>> = {},
) {
  const onChange = vi.fn();
  render(
    <WorkspaceSplitter
      axis="vertical"
      value={100}
      bounds={{ min: 50, max: 150 }}
      label="Resize panel"
      testId="splitter"
      onChange={onChange}
      {...overrides}
    />,
  );
  const splitter = screen.getByTestId('splitter');
  return { onChange, splitter };
}

describe('WorkspaceSplitter', () => {
  it('exposes separator semantics and resizes by captured pointer movement', () => {
    const { onChange, splitter } = renderSplitter();
    const setPointerCapture = vi.fn();
    Object.defineProperty(splitter, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });

    expect(splitter).toHaveAttribute('role', 'separator');
    expect(splitter).toHaveAttribute('aria-orientation', 'vertical');
    expect(splitter).toHaveAttribute('aria-valuemin', '50');
    expect(splitter).toHaveAttribute('aria-valuemax', '150');
    expect(splitter).toHaveAttribute('aria-valuenow', '100');

    fireEvent.pointerDown(splitter, {
      button: 0,
      pointerId: 7,
      clientX: 300,
      clientY: 20,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(document.body).toHaveClass('is-workspace-resizing-vertical');

    fireEvent.pointerMove(splitter, {
      pointerId: 7,
      clientX: 345,
      clientY: 20,
    });
    expect(onChange).toHaveBeenLastCalledWith(145);

    fireEvent.pointerUp(splitter, { pointerId: 7 });
    expect(document.body).not.toHaveClass('is-workspace-resizing');
    const callCount = onChange.mock.calls.length;
    fireEvent.pointerMove(splitter, {
      pointerId: 7,
      clientX: 350,
      clientY: 20,
    });
    expect(onChange).toHaveBeenCalledTimes(callCount);
  });

  it('clamps keyboard resizing and inverts the right-panel direction', () => {
    const { onChange, splitter } = renderSplitter({ deltaSign: -1 });

    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(108);
    fireEvent.keyDown(splitter, { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(68);
    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.keyDown(splitter, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(150);
  });

  it('cleans up captured pointer state on pointercancel and window blur', () => {
    const { onChange, splitter } = renderSplitter({ axis: 'horizontal' });

    fireEvent.pointerDown(splitter, {
      button: 0,
      pointerId: 3,
      clientX: 10,
      clientY: 100,
    });
    fireEvent.pointerMove(splitter, {
      pointerId: 3,
      clientX: 10,
      clientY: 145,
    });
    expect(onChange).toHaveBeenLastCalledWith(145);
    fireEvent.pointerCancel(splitter, { pointerId: 3 });
    expect(document.body).not.toHaveClass('is-workspace-resizing');
    const callCountAfterCancel = onChange.mock.calls.length;
    fireEvent.pointerMove(splitter, {
      pointerId: 3,
      clientX: 10,
      clientY: 130,
    });
    expect(onChange).toHaveBeenCalledTimes(callCountAfterCancel);

    fireEvent.pointerDown(splitter, {
      button: 0,
      pointerId: 4,
      clientX: 10,
      clientY: 100,
    });
    window.dispatchEvent(new Event('blur'));
    expect(document.body).not.toHaveClass('is-workspace-resizing');
    fireEvent.pointerMove(splitter, {
      pointerId: 4,
      clientX: 10,
      clientY: 130,
    });
    expect(onChange).toHaveBeenCalledTimes(callCountAfterCancel);
  });

  it('does not capture disabled separators', () => {
    const { onChange, splitter } = renderSplitter({ disabled: true });
    expect(splitter).toHaveAttribute('aria-disabled', 'true');
    expect(splitter).toHaveAttribute('tabindex', '-1');

    fireEvent.pointerDown(splitter, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
