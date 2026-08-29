import type { EditorTool } from '../../engine/tools';

export type PointerAction = 'pan' | 'edit-primary' | 'edit-secondary';

export type ColorShortcutAction = 'swap' | 'reset';

const SHORTCUT_TO_TOOL: Readonly<Record<string, EditorTool>> = {
  p: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
  l: 'lighten',
  k: 'darken',
  n: 'noise',
  t: 'stamp',
};

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    target.getAttribute('contenteditable') === 'true' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function editorToolFromShortcut(key: string): EditorTool | undefined {
  return SHORTCUT_TO_TOOL[key.toLowerCase()];
}

export interface EditorToolShortcutInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | null;
}

export function getEditorToolShortcut(
  input: EditorToolShortcutInput,
): EditorTool | undefined {
  if (
    input.ctrlKey ||
    input.metaKey ||
    input.altKey ||
    isEditableKeyboardTarget(input.target)
  ) {
    return undefined;
  }
  return editorToolFromShortcut(input.key);
}

export function getPointerAction(
  button: number,
  spacePressed: boolean,
): PointerAction | undefined {
  if (button === 1 || (button === 0 && spacePressed)) return 'pan';
  if (button === 0) return 'edit-primary';
  if (button === 2) return 'edit-secondary';
  return undefined;
}

export function getColorShortcutAction(
  input: EditorToolShortcutInput,
): ColorShortcutAction | undefined {
  if (
    input.ctrlKey ||
    input.metaKey ||
    input.altKey ||
    isEditableKeyboardTarget(input.target)
  ) {
    return undefined;
  }

  if (input.key.toLowerCase() === 'x') return 'swap';
  if (input.key.toLowerCase() === 'd') return 'reset';
  return undefined;
}
