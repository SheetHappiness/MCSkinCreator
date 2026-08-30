import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UvCanvasControls } from './UvCanvasControls';

describe('UV canvas controls', () => {
  it('exposes an optional overlay, canonical layer filter, and focus targets', () => {
    const onToggleUvOverlay = vi.fn();
    const onLayerChange = vi.fn();
    const onFocusChange = vi.fn();

    render(
      <UvCanvasControls
        showUvOverlay={false}
        layer="both"
        focusTarget="whole"
        onToggleUvOverlay={onToggleUvOverlay}
        onLayerChange={onLayerChange}
        onFocusChange={onFocusChange}
      />,
    );

    const controls = screen.getByRole('group', { name: 'Canvas structure' });
    expect(
      screen.getByRole('button', { name: 'UV boundaries' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Canvas focus')).toHaveValue('whole');

    fireEvent.click(screen.getByRole('button', { name: 'UV boundaries' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base' }));
    fireEvent.change(screen.getByLabelText('Canvas focus'), {
      target: { value: 'head' },
    });

    expect(controls).toBeInTheDocument();
    expect(onToggleUvOverlay).toHaveBeenCalledOnce();
    expect(onLayerChange).toHaveBeenCalledWith('base');
    expect(onFocusChange).toHaveBeenCalledWith('head');
  });
});
