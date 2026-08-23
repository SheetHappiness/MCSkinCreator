import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the neutral M0 application shell', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No document open')).toBeInTheDocument();
  });
});
