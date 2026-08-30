import type {
  SkinLibraryCollection,
  SkinLibraryEntry,
} from '../../../electron/fileContract';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function filterLibraryEntries(
  entries: readonly SkinLibraryEntry[],
  collections: readonly SkinLibraryCollection[],
  query: string,
  selectedCollectionId?: string,
): SkinLibraryEntry[] {
  const normalizedQuery = normalized(query);
  const collectionNames = new Map(
    collections.map((collection) => [
      collection.id,
      normalized(collection.displayName),
    ]),
  );

  return entries.filter((entry) => {
    if (
      selectedCollectionId !== undefined &&
      !entry.collectionIds.includes(selectedCollectionId)
    ) {
      return false;
    }
    if (normalizedQuery.length === 0) return true;
    return (
      normalized(entry.displayName).includes(normalizedQuery) ||
      entry.collectionIds.some((collectionId) =>
        collectionNames.get(collectionId)?.includes(normalizedQuery),
      )
    );
  });
}

export function filterRecentEntries<T extends { readonly displayName: string }>(
  entries: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalized(query);
  if (normalizedQuery.length === 0) return [...entries];
  return entries.filter((entry) =>
    normalized(entry.displayName).includes(normalizedQuery),
  );
}

export function updateCollectionSelection(
  collectionIds: readonly string[],
  collectionId: string,
  selected: boolean,
): string[] {
  const next = new Set(collectionIds);
  if (selected) next.add(collectionId);
  else next.delete(collectionId);
  return [...next];
}
