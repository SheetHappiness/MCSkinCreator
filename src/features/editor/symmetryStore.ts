import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { SYMMETRY_MODES, type SymmetryMode } from '../../engine/symmetry';

interface SymmetryState {
  readonly mode: SymmetryMode;
}

const symmetryStore = createStore<SymmetryState>(() => ({ mode: 'off' }));

export function getSymmetryMode(): SymmetryMode {
  return symmetryStore.getState().mode;
}

export function setSymmetryMode(mode: SymmetryMode): void {
  if (!SYMMETRY_MODES.includes(mode)) {
    throw new TypeError(`Unsupported symmetry mode: ${String(mode)}.`);
  }
  symmetryStore.setState({ mode });
}

export function resetSymmetryMode(): void {
  symmetryStore.setState({ mode: 'off' });
}

export function useSymmetryMode(): SymmetryMode {
  return useStore(symmetryStore, (state) => state.mode);
}
