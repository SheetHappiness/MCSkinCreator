import { create } from 'zustand';

interface ShellState {
  documentStatus: 'No document open';
}

export const useShellStore = create<ShellState>(() => ({
  documentStatus: 'No document open',
}));
