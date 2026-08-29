import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getColorSwatches, resetColorSwatches } from './colorSwatchStore';
import { ColorControls } from './ColorControls';

const PRIMARY = { r: 10, g: 20, b: 30, a: 40 } as const;
const SECONDARY = { r: 200, g: 210, b: 220, a: 230 } as const;

beforeEach(() => {
  resetColorSwatches();
});

afterEach(() => {
  cleanup();
  resetColorSwatches();
});

describe('advanced color controls', () => {
  it('opens compact exact RGB/HSV/alpha controls and edits the active slot', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Color controls' }));
    expect(
      screen.getByRole('dialog', { name: 'Advanced color controls' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'RGB channels' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'HSV channels' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Visual color picker')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Red channel'), {
      target: { value: '99' },
    });
    expect(onChange).toHaveBeenCalledWith('primary', {
      r: 99,
      g: PRIMARY.g,
      b: PRIMARY.b,
      a: PRIMARY.a,
    });
  });

  it('adds a swatch and applies it explicitly to the secondary slot', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Add current color to swatches',
      }),
    );
    expect(getColorSwatches().at(-1)?.color).toEqual(PRIMARY);
    fireEvent.click(screen.getByRole('button', { name: 'Color controls' }));

    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Advanced color controls' }),
      ).getByRole('button', { name: 'Apply Black swatch to Secondary' }),
    );
    expect(onChange).toHaveBeenCalledWith('secondary', {
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    });
  });

  it('switches the advanced editor to the other slot without mixing values', () => {
    const onChange = vi.fn();
    const view = render(
      <ColorControls
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Color controls' }));

    view.rerender(
      <ColorControls
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="secondary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Advanced hex color')).toHaveValue('#C8D2DC');
    expect(screen.getByLabelText('Advanced alpha channel')).toHaveValue(230);
    fireEvent.change(screen.getByLabelText('Red channel'), {
      target: { value: '201' },
    });
    expect(onChange).toHaveBeenCalledWith('secondary', {
      r: 201,
      g: SECONDARY.g,
      b: SECONDARY.b,
      a: SECONDARY.a,
    });
  });
});
