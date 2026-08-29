import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EditorTool } from '../../engine/tools';
import { ToolOptionsInspector } from './ToolOptionsInspector';
import { resetToolOptions } from './toolOptions';

afterEach(() => {
  cleanup();
  resetToolOptions();
});

describe('ToolOptionsInspector', () => {
  it.each([
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
});
