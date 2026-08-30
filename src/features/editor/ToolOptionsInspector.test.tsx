import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EditorTool } from '../../engine/tools';
import { ToolOptionsInspector } from './ToolOptionsInspector';
import { getToolOptions, resetToolOptions } from './toolOptions';

afterEach(() => {
  cleanup();
  resetToolOptions();
});

describe('ToolOptionsInspector', () => {
  it.each([
    ['selection', 'Selection', 'Shape option', 'Rectangle'],
    ['pencil', 'Pencil', 'Size option', '1 px'],
    ['eraser', 'Eraser', 'Output option', 'Transparent'],
    ['fill', 'Fill', 'Match option', 'Exact RGBA'],
    ['eyedropper', 'Eyedropper', 'Sample option', 'Single texel'],
  ] as const)(
    'shows only the contextual %s contract',
    (tool, label, valueLabel, value) => {
      render(<ToolOptionsInspector activeTool={tool} />);

      const inspector = screen.getByRole('region', { name: 'Tool options' });
      expect(inspector).toHaveAttribute('data-tool', tool);
      expect(within(inspector).getByText(label)).toBeInTheDocument();
      expect(within(inspector).getByLabelText(valueLabel)).toHaveTextContent(
        value,
      );
      expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument();
      expect(within(inspector).queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('updates immediately when the active tool changes', () => {
    const view = render(<ToolOptionsInspector activeTool="pencil" />);
    const inspector = screen.getByRole('region', { name: 'Tool options' });

    view.rerender(
      <ToolOptionsInspector activeTool={'fill' satisfies EditorTool} />,
    );

    expect(inspector).toHaveAttribute('data-tool', 'fill');
    expect(within(inspector).getByText('Contiguous')).toBeInTheDocument();
    expect(
      within(inspector).queryByText('Active color'),
    ).not.toBeInTheDocument();
  });

  it('exposes validated controls for advanced tools through the shared store', () => {
    const view = render(<ToolOptionsInspector activeTool="lighten" />);
    const inspector = screen.getByRole('region', { name: 'Tool options' });

    fireEvent.change(within(inspector).getByLabelText('Lighten strength'), {
      target: { value: '80' },
    });
    expect(getToolOptions('lighten')).toEqual({ strength: 0.8 });
    expect(
      within(inspector).getByLabelText('Strength value'),
    ).toHaveTextContent('80%');

    view.rerender(<ToolOptionsInspector activeTool="stamp" />);
    fireEvent.change(within(inspector).getByLabelText('Stamp pattern'), {
      target: { value: 'stripe-3x3' },
    });
    expect(getToolOptions('stamp')).toEqual({ pattern: 'stripe-3x3' });
  });
});
