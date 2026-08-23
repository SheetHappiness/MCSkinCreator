import { describe, expect, it } from 'vitest';

import {
  editorToolFromShortcut,
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
