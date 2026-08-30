import { describe, expect, it } from 'vitest';

import {
  editorToolFromShortcut,
  getColorShortcutAction,
  getEditorToolShortcut,
  getPointerAction,
  isEditableKeyboardTarget,
  shouldRouteEditorCommandToCanvas,
} from './editorShortcuts';

describe('editor tool keyboard shortcuts', () => {
  it.each([
    ['s', 'selection'],
    ['p', 'pencil'],
    ['P', 'pencil'],
    ['e', 'eraser'],
    ['G', 'fill'],
    ['i', 'eyedropper'],
    ['l', 'lighten'],
    ['k', 'darken'],
    ['n', 'noise'],
    ['t', 'stamp'],
  ] as const)('maps %s through the canonical tool path', (key, tool) => {
    expect(editorToolFromShortcut(key)).toBe(tool);
  });

  it('ignores unrelated keys', () => {
    expect(editorToolFromShortcut('x')).toBeUndefined();
  });

  it.each(['input', 'textarea', 'select'])(
    'identifies %s as an editable shortcut target',
    (tagName) => {
      expect(isEditableKeyboardTarget(document.createElement(tagName))).toBe(
        true,
      );
    },
  );

  it('identifies contenteditable controls but not ordinary buttons', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isEditableKeyboardTarget(editable)).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement('button'))).toBe(
      false,
    );
  });

  it('keeps native edit commands inside editable controls', () => {
    expect(
      shouldRouteEditorCommandToCanvas(document.createElement('input')),
    ).toBe(false);
    expect(
      shouldRouteEditorCommandToCanvas(document.createElement('textarea')),
    ).toBe(false);
    expect(
      shouldRouteEditorCommandToCanvas(document.createElement('select')),
    ).toBe(false);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(shouldRouteEditorCommandToCanvas(editable)).toBe(false);
    expect(
      shouldRouteEditorCommandToCanvas(document.createElement('canvas')),
    ).toBe(true);
    expect(
      shouldRouteEditorCommandToCanvas(document.createElement('button')),
    ).toBe(true);
  });

  it('suppresses tool changes in inputs and with command modifiers', () => {
    const base = {
      key: 'e',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: document.createElement('button'),
    };

    expect(getEditorToolShortcut(base)).toBe('eraser');
    expect(getEditorToolShortcut({ ...base, ctrlKey: true })).toBeUndefined();
    expect(getEditorToolShortcut({ ...base, metaKey: true })).toBeUndefined();
    expect(getEditorToolShortcut({ ...base, altKey: true })).toBeUndefined();
    expect(
      getEditorToolShortcut({
        ...base,
        target: document.createElement('input'),
      }),
    ).toBeUndefined();
  });

  it('maps color swaps and resets while suppressing editable targets', () => {
    const base = {
      key: 'x',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: document.createElement('button'),
    };

    expect(getColorShortcutAction(base)).toBe('swap');
    expect(getColorShortcutAction({ ...base, key: 'D' })).toBe('reset');
    expect(getColorShortcutAction({ ...base, ctrlKey: true })).toBeUndefined();
    expect(getColorShortcutAction({ ...base, metaKey: true })).toBeUndefined();
    expect(getColorShortcutAction({ ...base, altKey: true })).toBeUndefined();
    expect(
      getColorShortcutAction({
        ...base,
        target: document.createElement('input'),
      }),
    ).toBeUndefined();
  });
});

describe('pointer input arbitration', () => {
  it('gives middle drag and Space + left drag priority over editing', () => {
    expect(getPointerAction(1, false)).toBe('pan');
    expect(getPointerAction(0, true)).toBe('pan');
  });

  it('maps left and right actions to primary and secondary editing', () => {
    expect(getPointerAction(0, false)).toBe('edit-primary');
    expect(getPointerAction(2, false)).toBe('edit-secondary');
  });

  it('ignores auxiliary buttons', () => {
    expect(getPointerAction(3, false)).toBeUndefined();
  });
});
