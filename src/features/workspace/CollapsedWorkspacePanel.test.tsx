import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollapsedWorkspacePanel } from './CollapsedWorkspacePanel';

describe('CollapsedWorkspacePanel', () => {
  it('keeps the restore action accessible for either side', () => {
    const onRestore = vi.fn();

    render(
      <CollapsedWorkspacePanel
        side="right"
        panelLabel="3D Preview"
        shortLabel="3D"
        onRestore={onRestore}
      />,
    );

    expect(
      screen.getByRole('complementary', { name: 'Collapsed 3D Preview panel' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand 3D Preview' }));
    expect(onRestore).toHaveBeenCalledOnce();
  });
});
