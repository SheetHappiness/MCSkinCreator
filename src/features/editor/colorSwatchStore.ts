import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RgbaColor } from '../../engine/document';

export const COLOR_SWATCH_STORAGE_KEY =
  'minecraft-skin-editor.color-swatches.v1';

export interface ColorSwatch {
  readonly id: string;
  readonly color: RgbaColor;
  readonly name?: string;
}

export interface ColorSwatchInput {
  readonly color: RgbaColor;
  readonly name?: string;
}

interface PersistedColorSwatches {
  readonly version: 1;
  readonly swatches: readonly ColorSwatch[];
}

interface ColorSwatchState {
  readonly swatches: readonly ColorSwatch[];
}

const DEFAULT_SWATCH_DEFINITIONS: readonly ColorSwatch[] = [
  { id: 'default-black', name: 'Black', color: { r: 0, g: 0, b: 0, a: 255 } },
  {
    id: 'default-white',
    name: 'White',
    color: { r: 255, g: 255, b: 255, a: 255 },
  },
  {
    id: 'default-gray',
    name: 'Gray',
    color: { r: 128, g: 128, b: 128, a: 255 },
  },
  {
    id: 'default-transparent',
    name: 'Transparent',
    color: { r: 0, g: 0, b: 0, a: 0 },
  },
];

let generatedSwatchId = 0;

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function isRgbaColor(value: unknown): value is RgbaColor {
  if (typeof value !== 'object' || value === null) return false;
  const color = value as Partial<RgbaColor>;
  return (
    isByte(color.r) && isByte(color.g) && isByte(color.b) && isByte(color.a)
  );
}

function isColorSwatch(value: unknown): value is ColorSwatch {
  if (typeof value !== 'object' || value === null) return false;
  const swatch = value as Partial<ColorSwatch>;
  return (
    typeof swatch.id === 'string' &&
    swatch.id.length > 0 &&
    swatch.id.length <= 128 &&
    (swatch.name === undefined ||
      (typeof swatch.name === 'string' && swatch.name.length <= 120)) &&
    isRgbaColor(swatch.color)
  );
}

function colorsEqual(left: RgbaColor, right: RgbaColor): boolean {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    left.a === right.a
  );
}

function freezeSwatch(
  swatch: ColorSwatchInput & { readonly id: string },
): ColorSwatch {
  return Object.freeze({
    id: swatch.id,
    ...(swatch.name === undefined ? {} : { name: swatch.name }),
    color: Object.freeze({ ...swatch.color }),
  });
}

function freezeSwatches(
  swatches: readonly ColorSwatch[],
): readonly ColorSwatch[] {
  return Object.freeze(swatches.map((swatch) => freezeSwatch(swatch)));
}

export function defaultColorSwatches(): readonly ColorSwatch[] {
  return freezeSwatches(DEFAULT_SWATCH_DEFINITIONS);
}

export function serializeColorSwatches(
  swatches: readonly ColorSwatch[],
): string {
  const payload: PersistedColorSwatches = {
    version: 1,
    swatches,
  };
  return JSON.stringify(payload);
}

export function deserializeColorSwatches(
  raw: string | null,
): readonly ColorSwatch[] {
  if (raw === null) return defaultColorSwatches();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultColorSwatches();
    }
    const payload = parsed as Partial<PersistedColorSwatches>;
    if (payload.version !== 1 || !Array.isArray(payload.swatches)) {
      return defaultColorSwatches();
    }

    const ids = new Set<string>();
    const swatches = payload.swatches.map((swatch) => {
      if (!isColorSwatch(swatch) || ids.has(swatch.id)) return undefined;
      ids.add(swatch.id);
      return freezeSwatch(swatch);
    });
    if (swatches.some((swatch) => swatch === undefined)) {
      return defaultColorSwatches();
    }
    return Object.freeze(swatches as ColorSwatch[]);
  } catch {
    return defaultColorSwatches();
  }
}

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readInitialSwatches(): readonly ColorSwatch[] {
  const storage = getStorage();
  if (storage === undefined) return defaultColorSwatches();
  try {
    return deserializeColorSwatches(storage.getItem(COLOR_SWATCH_STORAGE_KEY));
  } catch {
    return defaultColorSwatches();
  }
}

const colorSwatchStore = createStore<ColorSwatchState>(() => ({
  swatches: readInitialSwatches(),
}));

function persist(swatches: readonly ColorSwatch[]): void {
  const storage = getStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(COLOR_SWATCH_STORAGE_KEY, serializeColorSwatches(swatches));
  } catch {
    // Local preferences are optional and must not interrupt editing.
  }
}

function setSwatches(swatches: readonly ColorSwatch[]): void {
  const next = freezeSwatches(swatches);
  colorSwatchStore.setState({ swatches: next });
  persist(next);
}

function nextSwatchId(existing: readonly ColorSwatch[]): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid !== undefined) return randomUuid.call(globalThis.crypto);

  let id: string;
  do {
    generatedSwatchId += 1;
    id = `local-swatch-${generatedSwatchId}`;
  } while (existing.some((swatch) => swatch.id === id));
  return id;
}

export function getColorSwatches(): readonly ColorSwatch[] {
  return colorSwatchStore.getState().swatches;
}

export function addColorSwatch(input: ColorSwatchInput): ColorSwatch {
  if (!isRgbaColor(input.color)) {
    throw new RangeError(
      'Swatch colors must contain exact byte RGBA channels.',
    );
  }
  const existing = getColorSwatches();
  const matching = existing.find((swatch) =>
    colorsEqual(swatch.color, input.color),
  );
  if (matching !== undefined) return matching;

  const swatch = freezeSwatch({ ...input, id: nextSwatchId(existing) });
  setSwatches([...existing, swatch]);
  return swatch;
}

export function addColorSwatches(inputs: readonly ColorSwatchInput[]): number {
  let added = 0;
  let swatches = getColorSwatches();
  for (const input of inputs) {
    if (!isRgbaColor(input.color)) continue;
    if (swatches.some((swatch) => colorsEqual(swatch.color, input.color))) {
      continue;
    }
    const swatch = freezeSwatch({ ...input, id: nextSwatchId(swatches) });
    swatches = [...swatches, swatch];
    added += 1;
  }
  if (added > 0) setSwatches(swatches);
  return added;
}

export function removeColorSwatch(id: string): void {
  const swatches = getColorSwatches();
  const next = swatches.filter((swatch) => swatch.id !== id);
  if (next.length !== swatches.length) setSwatches(next);
}

export function moveColorSwatch(id: string, offset: -1 | 1): void {
  const swatches = [...getColorSwatches()];
  const index = swatches.findIndex((swatch) => swatch.id === id);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= swatches.length) {
    return;
  }
  [swatches[index], swatches[targetIndex]] = [
    swatches[targetIndex]!,
    swatches[index]!,
  ];
  setSwatches(swatches);
}

export function replaceColorSwatches(
  swatches: readonly ColorSwatchInput[],
): void {
  const next: ColorSwatch[] = [];
  for (const input of swatches) {
    if (!isRgbaColor(input.color)) continue;
    if (next.some((swatch) => colorsEqual(swatch.color, input.color))) {
      continue;
    }
    next.push(freezeSwatch({ ...input, id: nextSwatchId(next) }));
  }
  setSwatches(next);
}

export function resetColorSwatches(): void {
  setSwatches(defaultColorSwatches());
}

export function useColorSwatches(): readonly ColorSwatch[] {
  return useStore(colorSwatchStore, (state) => state.swatches);
}
