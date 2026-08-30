const activeInteractionCancellers = new Set<() => void>();
const activeEditorCommandHandlers = new Set<
  (command: ActiveEditorCommand) => void
>();

export type ActiveEditorCommand = 'copy' | 'cut' | 'paste' | 'delete';

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

export function registerActiveEditorCommandHandler(
  handler: (command: ActiveEditorCommand) => void,
): () => void {
  activeEditorCommandHandlers.add(handler);
  return () => activeEditorCommandHandlers.delete(handler);
}

export function dispatchActiveEditorCommand(
  command: ActiveEditorCommand,
): boolean {
  if (activeEditorCommandHandlers.size === 0) return false;
  for (const handler of [...activeEditorCommandHandlers]) handler(command);
  return true;
}
