import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_LAYOUT,
  WORKSPACE_LAYOUT_STORAGE_KEY,
} from '../features/workspace';
import { App } from './App';

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
});

describe('App', () => {
  it('renders the neutral core-editor shell with a useful empty state', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Open a 64×64 Minecraft skin to begin'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open PNG' })).toBeEnabled();
    expect(screen.getByLabelText('Application status')).toHaveTextContent(
      'No document open',
    );
  });

  it('keeps panel collapse, resize, persistence, and reset outside document state', () => {
    render(<App />);

    const applicationBody = document.querySelector('.application-body');
    expect(applicationBody).toHaveStyle(
      'grid-template-columns: 200px 8px minmax(0, 1fr)',
    );
    expect(
      screen.getByRole('button', { name: 'Expand Library' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText('Search local library'),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('workspace-splitter-left'), {
      button: 0,
      pointerId: 1,
      clientX: 200,
    });
    fireEvent.pointerMove(screen.getByTestId('workspace-splitter-left'), {
      pointerId: 1,
      clientX: 248,
    });
    fireEvent.pointerUp(screen.getByTestId('workspace-splitter-left'), {
      pointerId: 1,
    });
    expect(applicationBody).toHaveStyle(
      'grid-template-columns: 248px 8px minmax(0, 1fr)',
    );
    expect(
      JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)!),
    ).toEqual({
      version: 1,
      ...DEFAULT_WORKSPACE_LAYOUT,
      leftPanelWidth: 248,
    });

    fireEvent.pointerDown(screen.getByTestId('workspace-splitter-color'), {
      button: 0,
      pointerId: 2,
      clientY: 220,
    });
    fireEvent.pointerMove(screen.getByTestId('workspace-splitter-color'), {
      pointerId: 2,
      clientY: 260,
    });
    fireEvent.pointerUp(screen.getByTestId('workspace-splitter-color'), {
      pointerId: 2,
    });
    expect(
      JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)!),
    ).toMatchObject({
      leftUpperHeight: DEFAULT_WORKSPACE_LAYOUT.leftUpperHeight + 40,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Expand Library' }));
    expect(
      screen.getByRole('button', { name: 'Collapse Library' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Search local library')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Library' }));
    expect(
      screen.queryByLabelText('Search local library'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse Local Library' }),
    );
    expect(
      screen.getByRole('button', { name: 'Expand Local Library' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-splitter-left')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Layout' }));
    expect(
      screen.getByRole('button', { name: 'Collapse Local Library' }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.workspace-side-slot--left'),
    ).not.toHaveClass('is-collapsed');
    expect(applicationBody).toHaveStyle(
      'grid-template-columns: 200px 8px minmax(0, 1fr)',
    );
    expect(
      JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)!),
    ).toEqual({
      version: 1,
      ...DEFAULT_WORKSPACE_LAYOUT,
    });
  });
});
