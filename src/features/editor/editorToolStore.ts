import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RgbaColor } from '../../engine/document';
import type { EditorTool } from '../../engine/tools';
import { recordRecentColor } from './colorSwatchStore';

export type ColorSlot = 'primary' | 'secondary';

/** The editor starts with the conventional black primary / white secondary pair. */
export const DEFAULT_PRIMARY_COLOR: RgbaColor = Object.freeze({
  r: 0,
  g: 0,
  b: 0,
  a: 255,
});

export const DEFAULT_SECONDARY_COLOR: RgbaColor = Object.freeze({
  r: 255,
  g: 255,
  b: 255,
  a: 255,
});

export interface EditorToolState {
  readonly activeTool: EditorTool;
  readonly primaryColor: RgbaColor;
  readonly secondaryColor: RgbaColor;
  readonly activeColorSlot: ColorSlot;
}

const editorToolStore = createStore<EditorToolState>(() => ({
  activeTool: 'pencil',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  activeColorSlot: 'primary',
}));

export function getEditorToolState(): EditorToolState {
  return editorToolStore.getState();
}

export function setActiveEditorTool(activeTool: EditorTool): void {
  editorToolStore.setState({ activeTool });
}

function assertColor(color: RgbaColor): void {
  for (const channel of ['r', 'g', 'b', 'a'] as const) {
    const value = color[channel];
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`Editor color ${channel} must be from 0 to 255.`);
    }
  }
}

export function setEditorColor(slot: ColorSlot, color: RgbaColor): void {
  assertColor(color);
  const nextColor = Object.freeze({ ...color });
  editorToolStore.setState(
    slot === 'primary'
      ? { primaryColor: nextColor }
      : { secondaryColor: nextColor },
  );
  recordRecentColor(nextColor);
}

export function setActiveColorSlot(activeColorSlot: ColorSlot): void {
  editorToolStore.setState({
    activeColorSlot,
  });
}

export function swapEditorColors(): void {
  const { primaryColor, secondaryColor } = editorToolStore.getState();
  editorToolStore.setState({
    primaryColor: secondaryColor,
    secondaryColor: primaryColor,
  });
}

export function resetEditorColors(): void {
  editorToolStore.setState({
    primaryColor: DEFAULT_PRIMARY_COLOR,
    secondaryColor: DEFAULT_SECONDARY_COLOR,
    activeColorSlot: 'primary',
  });
}

export function useActiveEditorTool(): EditorTool {
  return useStore(editorToolStore, (state) => state.activeTool);
}

export function usePrimaryEditorColor(): RgbaColor {
  return useStore(editorToolStore, (state) => state.primaryColor);
}

export function useSecondaryEditorColor(): RgbaColor {
  return useStore(editorToolStore, (state) => state.secondaryColor);
}

export function useActiveColorSlot(): ColorSlot {
  return useStore(editorToolStore, (state) => state.activeColorSlot);
}
