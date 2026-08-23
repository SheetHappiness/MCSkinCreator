import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the neutral M2 application shell with no active document', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('No document open')).toHaveLength(2);
    expect(screen.getByText('M2')).toBeInTheDocument();
  });
});
