const activeInteractionCancellers = new Set<() => void>();

export function registerActiveEditorInteraction(
  cancel: () => void,
): () => void {
  activeInteractionCancellers.add(cancel);
  return () => {
    activeInteractionCancellers.delete(cancel);
  };
}

export function cancelActiveEditorInteraction(): void {
  for (const cancel of [...activeInteractionCancellers]) cancel();
}
