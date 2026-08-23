import { describe, expect, it } from 'vitest';

import {
  editorToolFromShortcut,
  getEditorToolShortcut,
  getPointerAction,
  isEditableKeyboardTarget,
} from './editorShortcuts';

describe('editor tool keyboard shortcuts', () => {
  it.each([
    ['p', 'pencil'],
    ['P', 'pencil'],
    ['e', 'eraser'],
    ['G', 'fill'],
    ['i', 'eyedropper'],
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
});

describe('pointer input arbitration', () => {
  it('gives middle drag and Space + left drag priority over editing', () => {
    expect(getPointerAction(1, false)).toBe('pan');
    expect(getPointerAction(0, true)).toBe('pan');
  });

  it('uses an unmodified left button for the active editing tool', () => {
    expect(getPointerAction(0, false)).toBe('edit');
  });

  it('ignores right and auxiliary buttons', () => {
    expect(getPointerAction(2, false)).toBeUndefined();
    expect(getPointerAction(3, false)).toBeUndefined();
  });
});
