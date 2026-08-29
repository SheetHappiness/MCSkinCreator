import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SkinDocument, TRANSPARENT_RGBA } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import { HistoryTimeline } from './HistoryTimeline';

describe('HistoryTimeline', () => {
  afterEach(() => cleanup());

  it('shows the bounded named history and jumps through it without adding entries', () => {
    const document = SkinDocument.createBlank({ id: 'history-timeline' });
    const history = new DocumentHistory(document);
    history.editPixel(1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'Pencil Stroke');
    history.editPixel(2, 2, { r: 0, g: 0, b: 255, a: 255 }, 'Fill');

    render(<HistoryTimeline history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /^History/ }));

    expect(
      screen.getByRole('button', { name: /Initial state · Undo/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pencil Stroke · Undo/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Fill · Current/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Pencil Stroke · Undo/ }),
    );

    expect(document.readPixel(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    expect(history.getTimelineState().currentIndex).toBe(0);
    expect(history.getTimelineState().entries).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: /Pencil Stroke · Current/ }),
    ).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByRole('button', { name: /Fill · Redo/ }),
    ).toBeInTheDocument();
  });

  it('marks a successful saved checkpoint and keeps the current position visible', () => {
    const document = SkinDocument.createBlank({ id: 'history-saved' });
    const history = new DocumentHistory(document);
    history.editPixel(1, 1, { r: 10, g: 20, b: 30, a: 255 }, 'Pencil Stroke');
    document.markSaved();
    history.markSavedCheckpoint();

    render(<HistoryTimeline history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /^History/ }));

    expect(
      screen.getByRole('button', { name: /Pencil Stroke · Current · Saved/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
