import type { EditorTool } from '../../engine/tools';

export type PointerAction = 'pan' | 'edit';

const SHORTCUT_TO_TOOL: Readonly<Record<string, EditorTool>> = {
  p: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
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

export function getPointerAction(
  button: number,
  spacePressed: boolean,
): PointerAction | undefined {
  if (button === 1 || (button === 0 && spacePressed)) return 'pan';
  if (button === 0) return 'edit';
  return undefined;
}
