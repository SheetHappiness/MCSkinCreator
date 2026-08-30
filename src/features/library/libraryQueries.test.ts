import { describe, expect, it } from 'vitest';

import type {
  SkinLibraryCollection,
  SkinLibraryEntry,
} from '../../../electron/fileContract';
import {
  filterLibraryEntries,
  filterRecentEntries,
  updateCollectionSelection,
} from './libraryQueries';

const collections: readonly SkinLibraryCollection[] = [
  { id: 'characters', displayName: 'Characters', entryCount: 2 },
  { id: 'winter', displayName: 'Winter set', entryCount: 1 },
];

const entries: readonly SkinLibraryEntry[] = [
  {
    filePath: 'C:\\library\\hero.png',
    displayName: 'hero.png',
    byteLength: 120,
    collectionIds: ['characters'],
  },
  {
    filePath: 'C:\\library\\snow.png',
    displayName: 'snow.png',
    byteLength: 140,
    collectionIds: ['winter'],
  },
  {
    filePath: 'C:\\library\\villain.png',
    displayName: 'villain.png',
    byteLength: 160,
    collectionIds: ['characters'],
  },
];

describe('local library queries', () => {
  it('searches filenames and collection context without changing source order', () => {
    expect(
      filterLibraryEntries(entries, collections, 'WINTER').map(
        (entry) => entry.displayName,
      ),
    ).toEqual(['snow.png']);
    expect(
      filterLibraryEntries(entries, collections, 'hero').map(
        (entry) => entry.displayName,
      ),
    ).toEqual(['hero.png']);
  });

  it('combines collection filtering with the search query', () => {
    expect(
      filterLibraryEntries(entries, collections, 'png', 'characters').map(
        (entry) => entry.displayName,
      ),
    ).toEqual(['hero.png', 'villain.png']);
    expect(filterLibraryEntries(entries, collections, '', 'winter')).toEqual([
      entries[1],
    ]);
  });

  it('filters recent entries by display name and toggles memberships immutably', () => {
    const recent = [{ displayName: 'hero.png' }, { displayName: 'snow.png' }];
    expect(filterRecentEntries(recent, 'snow')).toEqual([
      { displayName: 'snow.png' },
    ]);
    expect(updateCollectionSelection(['characters'], 'winter', true)).toEqual([
      'characters',
      'winter',
    ]);
    expect(
      updateCollectionSelection(['characters', 'winter'], 'characters', false),
    ).toEqual(['winter']);
  });
});
