import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RgbaColor } from '../../engine/document';
import type { EditorTool } from '../../engine/tools';

interface EditorToolState {
  readonly activeTool: EditorTool;
  readonly selectedColor: RgbaColor;
}

const editorToolStore = createStore<EditorToolState>(() => ({
  activeTool: 'pencil',
  selectedColor: Object.freeze({ r: 0, g: 0, b: 0, a: 255 }),
}));

export function setActiveEditorTool(activeTool: EditorTool): void {
  editorToolStore.setState({ activeTool });
}

export function setSelectedEditorColor(selectedColor: RgbaColor): void {
  for (const channel of ['r', 'g', 'b', 'a'] as const) {
    const value = selectedColor[channel];
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`Selected color ${channel} must be from 0 to 255.`);
    }
  }
  editorToolStore.setState({
    selectedColor: Object.freeze({ ...selectedColor }),
  });
}

export function useActiveEditorTool(): EditorTool {
  return useStore(editorToolStore, (state) => state.activeTool);
}

export function useSelectedEditorColor(): RgbaColor {
  return useStore(editorToolStore, (state) => state.selectedColor);
}
