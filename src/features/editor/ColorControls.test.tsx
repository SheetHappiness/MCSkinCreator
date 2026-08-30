import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getColorSwatches,
  resetColorSwatches,
  resetRecentColors,
} from './colorSwatchStore';
import { ColorControls } from './ColorControls';

const PRIMARY = { r: 10, g: 20, b: 30, a: 40 } as const;
const SECONDARY = { r: 200, g: 210, b: 220, a: 230 } as const;

beforeEach(() => {
  resetColorSwatches();
  resetRecentColors();
});

afterEach(() => {
  cleanup();
  resetColorSwatches();
  resetRecentColors();
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

    expect(screen.getByLabelText('Advanced hex color')).toHaveValue(
      '#C8D2DCE6',
    );
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

  it('shows slot values without relying on color and keeps invalid hex out of state', () => {
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

    expect(screen.getByText('Active: Primary')).toBeInTheDocument();
    expect(screen.getByText('#0A141E')).toBeInTheDocument();
    expect(screen.getByText('Alpha 40')).toBeInTheDocument();
    expect(screen.getByText('#C8D2DC')).toBeInTheDocument();
    expect(screen.getByText('Alpha 230')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Color controls' }));
    const hex = screen.getByLabelText('Advanced hex color');
    fireEvent.change(hex, { target: { value: '#not-a-color' } });
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(hex);
    expect(hex).toHaveValue('#0A141E28');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports exact RGBA hex and keyboard saturation/value editing', () => {
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
    const hex = screen.getByLabelText('Advanced hex color');
    fireEvent.change(hex, { target: { value: '#11223344' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('primary', {
      r: 17,
      g: 34,
      b: 51,
      a: 68,
    });

    onChange.mockClear();
    fireEvent.keyDown(screen.getByLabelText('Visual color picker'), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith(
      'primary',
      expect.objectContaining({ a: PRIMARY.a }),
    );
  });

  it('cancels a pending hex edit on Escape without committing on blur', () => {
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
    const hex = screen.getByLabelText('Advanced hex color');
    fireEvent.change(hex, { target: { value: '#11223344' } });
    fireEvent.keyDown(hex, { key: 'Escape' });

    expect(hex).toHaveValue('#0A141E28');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a visual color picker drag when the window loses focus', () => {
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
    const picker = screen.getByRole('slider', {
      name: 'Visual color picker',
    });
    fireEvent.pointerDown(picker, {
      pointerId: 17,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(picker, {
      pointerId: 17,
      clientX: 20,
      clientY: 20,
    });
    expect(onChange).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('blur'));
    fireEvent.pointerMove(picker, {
      pointerId: 17,
      clientX: 30,
      clientY: 30,
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('normalizes popup focus and dismisses on Escape or outside pointer input', () => {
    render(
      <ColorControls
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={vi.fn()}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Color controls' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Advanced color controls',
    });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: 'Advanced color controls' }),
    ).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Advanced color controls' }),
    ).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole('dialog', { name: 'Advanced color controls' }),
    ).toBeNull();
  });
});

describe('persistent Color Workspace', () => {
  it('keeps the slots and picker visible without a popup trigger', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        persistent
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Color Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Paint colors')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primary color' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Secondary color' }),
    ).toBeVisible();
    expect(
      screen.getByRole('slider', { name: 'Visual color picker' }),
    ).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Hue picker' })).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Alpha slider' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'RGB channels' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'HSV channels' })).toBeVisible();
    expect(screen.getByLabelText('Recent colors')).toBeVisible();
    expect(screen.getByLabelText('Manual palette')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Color controls' })).toBeNull();
  });

  it('preserves exact alpha through the persistent slider and applies palette swatches to the active slot', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        persistent
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="secondary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('slider', { name: 'Alpha slider' }), {
      target: { value: '17' },
    });
    expect(onChange).toHaveBeenCalledWith('secondary', {
      ...SECONDARY,
      a: 17,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply Black swatch to active color',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith('secondary', {
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    });
  });

  it('records a changed color as one exact recent swatch and keeps it bounded in the workspace', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        persistent
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Red channel'), {
      target: { value: '99' },
    });
    expect(screen.getByLabelText('Recent colors')).toContainElement(
      screen.getByRole('button', {
        name: 'Apply recent #63141E color to Primary',
      }),
    );
    expect(
      screen
        .getByLabelText('Recent colors')
        .querySelectorAll('.color-recent-list__chip'),
    ).toHaveLength(1);
  });

  it('does not rewrite exact RGBA when an HSV field is only focused and blurred', () => {
    const onChange = vi.fn();
    render(
      <ColorControls
        persistent
        primaryColor={PRIMARY}
        secondaryColor={SECONDARY}
        activeSlot="primary"
        onSelectSlot={vi.fn()}
        onChange={onChange}
        onSwap={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const saturation = screen.getByLabelText('Saturation channel');
    fireEvent.focus(saturation);
    fireEvent.blur(saturation);

    expect(onChange).not.toHaveBeenCalled();
  });
});
