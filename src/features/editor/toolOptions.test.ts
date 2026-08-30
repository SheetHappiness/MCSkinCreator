import { afterEach, describe, expect, it } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import { setActiveEditorTool } from './editorToolStore';
import {
  getToolOptionSummary,
  getToolOptions,
  getToolOptionsState,
  resetToolOptions,
  setToolOptions,
  validateToolOptions,
} from './toolOptions';

afterEach(() => {
  resetToolOptions();
  setActiveEditorTool('pencil');
});

describe('core tool options', () => {
  it.each([
    ['selection', { shape: 'rectangle', coordinates: 'integer-half-open' }],
    ['pencil', { size: 1, source: 'active-color' }],
    ['eraser', { size: 1, output: 'transparent' }],
    ['fill', { mode: 'contiguous', match: 'exact-rgba' }],
    ['eyedropper', { sample: 'single-texel', target: 'active-color' }],
  ] as const)('exposes the documented %s options', (tool, options) => {
    expect(getToolOptions(tool)).toEqual(options);
    expect(getToolOptionsState().byTool[tool]).toEqual(options);
  });

  it('describes only fixed options for the active core tool', () => {
    expect(getToolOptionSummary('selection')).toEqual([
      { key: 'shape', label: 'Shape', value: 'Rectangle', fixed: true },
      {
        key: 'coordinates',
        label: 'Coordinates',
        value: 'Integer · half-open',
        fixed: true,
      },
    ]);
    expect(getToolOptionSummary('pencil')).toEqual([
      { key: 'size', label: 'Size', value: '1 px', fixed: true },
      {
        key: 'source',
        label: 'Color source',
        value: 'Active color',
        fixed: true,
      },
    ]);
    expect(getToolOptionSummary('fill')).toEqual([
      { key: 'mode', label: 'Region', value: 'Contiguous', fixed: true },
      { key: 'match', label: 'Match', value: 'Exact RGBA', fixed: true },
    ]);
  });

  it('validates fixed values and rejects unknown option keys', () => {
    expect(() =>
      validateToolOptions('pencil', {
        size: 2,
        source: 'active-color',
      } as never),
    ).toThrow(RangeError);
    expect(() =>
      validateToolOptions('fill', {
        mode: 'contiguous',
        match: 'exact-rgba',
        tolerance: 0,
      } as never),
    ).toThrow(TypeError);
    expect(() => validateToolOptions('eyedropper', undefined as never)).toThrow(
      TypeError,
    );
  });

  it('keeps options per tool across selection and reset', () => {
    const pencilOptions = getToolOptions('pencil');
    setToolOptions('fill', getToolOptions('fill'));

    setActiveEditorTool('fill');
    setActiveEditorTool('pencil');

    expect(getToolOptions('pencil')).toEqual(pencilOptions);
    expect(getToolOptions('fill')).toEqual({
      mode: 'contiguous',
      match: 'exact-rgba',
    });

    resetToolOptions();
    expect(getToolOptions('pencil')).toEqual({
      size: 1,
      source: 'active-color',
    });
  });

  it('does not dirty a document or create document history', () => {
    const document = SkinDocument.createBlank({ id: 'tool-options' });
    const history = new DocumentHistory(document);

    setToolOptions('eraser', getToolOptions('eraser'));
    resetToolOptions();

    expect(document.revision).toBe(0);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});

describe('advanced tool options', () => {
  it('starts with stable, typed values for each advanced tool', () => {
    expect(getToolOptions('lighten')).toEqual({ strength: 0.25 });
    expect(getToolOptions('darken')).toEqual({ strength: 0.25 });
    expect(getToolOptions('noise')).toEqual({
      strength: 0.25,
      density: 1,
      seed: 1337,
    });
    expect(getToolOptions('stamp')).toEqual({ pattern: 'checker-2x2' });
  });

  it('validates advanced ranges, seeds, and stamp patterns', () => {
    expect(() => setToolOptions('lighten', { strength: 1.1 })).toThrow(
      RangeError,
    );
    expect(() =>
      setToolOptions('noise', { strength: 0.5, density: -0.1, seed: 7 }),
    ).toThrow(RangeError);
    expect(() =>
      setToolOptions('noise', { strength: 0.5, density: 1, seed: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      setToolOptions('stamp', { pattern: 'unknown' as never }),
    ).toThrow(RangeError);
  });

  it('preserves configurable values per tool until an explicit reset', () => {
    setToolOptions('lighten', { strength: 0.8 });
    setToolOptions('noise', { strength: 0.4, density: 0.6, seed: 99 });
    setActiveEditorTool('noise');
    setActiveEditorTool('lighten');

    expect(getToolOptions('lighten')).toEqual({ strength: 0.8 });
    expect(getToolOptions('noise')).toEqual({
      strength: 0.4,
      density: 0.6,
      seed: 99,
    });
    expect(getToolOptionSummary('noise')).toEqual([
      { key: 'strength', label: 'Strength', value: '40%', fixed: false },
      { key: 'density', label: 'Density', value: '60%', fixed: false },
      { key: 'seed', label: 'Seed', value: '99', fixed: false },
    ]);
  });
});
