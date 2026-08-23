import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

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
});
