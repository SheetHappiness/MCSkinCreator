import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewSkinDialog } from './NewSkinDialog';

describe('NewSkinDialog', () => {
  afterEach(() => cleanup());

  it('offers Classic and Slim with Classic selected by default', () => {
    render(
      <NewSkinDialog
        isOpen
        isBusy={false}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'New Skin' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Classic skin model' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Slim skin model' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('submits the selected model and closes on Escape', () => {
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    render(
      <NewSkinDialog
        isOpen
        isBusy={false}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Slim skin model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('slim');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not allow changes while a lifecycle operation is busy', () => {
    const onCreate = vi.fn();
    render(
      <NewSkinDialog isOpen isBusy onCancel={vi.fn()} onCreate={onCreate} />,
    );

    expect(
      screen.getByRole('button', { name: 'Classic skin model' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Slim skin model' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});
