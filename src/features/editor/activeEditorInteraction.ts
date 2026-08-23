let cancelActiveInteraction: (() => void) | undefined;

export function registerActiveEditorInteraction(
  cancel: () => void,
): () => void {
  cancelActiveInteraction = cancel;
  return () => {
    if (cancelActiveInteraction === cancel) {
      cancelActiveInteraction = undefined;
    }
  };
}

export function cancelActiveEditorInteraction(): void {
  cancelActiveInteraction?.();
}
