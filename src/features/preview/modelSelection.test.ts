import { describe, expect, it } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import { changeSkinModel } from './modelSelection';

describe('preview model selection', () => {
  it('changes only model metadata through reversible history', () => {
    const document = SkinDocument.createBlank({ id: 'model-selection' });
    const history = new DocumentHistory(document);
    const pixelsBefore = document.copyPixelData();

    expect(changeSkinModel(document, history, 'slim')).toBe(true);
    expect(document.model).toBe('slim');
    expect(document.copyPixelData()).toEqual(pixelsBefore);
    expect(document.isDirty).toBe(true);
    expect(history.canUndo).toBe(true);

    expect(history.undo()).toBe(true);
    expect(document.model).toBe('classic');
    expect(document.isDirty).toBe(false);
    expect(history.redo()).toBe(true);
    expect(document.model).toBe('slim');
  });

  it('does not create history for the selected model', () => {
    const document = SkinDocument.createBlank({ id: 'model-no-op' });
    const history = new DocumentHistory(document);

    expect(changeSkinModel(document, history, 'classic')).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(document.revision).toBe(0);
  });
});
