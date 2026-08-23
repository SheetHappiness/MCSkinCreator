import type { SkinDocument, SkinModel } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';

/** Applies model metadata through the existing reversible document history. */
export function changeSkinModel(
  document: SkinDocument,
  history: DocumentHistory,
  model: SkinModel,
): boolean {
  if (document.model === model) return false;
  const transaction = history.beginTransaction();
  const changed = transaction.setModel(model);
  transaction.commit();
  return changed;
}
