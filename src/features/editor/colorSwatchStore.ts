import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RgbaColor } from '../../engine/document';

export const COLOR_SWATCH_STORAGE_KEY =
  'minecraft-skin-editor.color-swatches.v1';
export const COLOR_RECENT_STORAGE_KEY =
  'minecraft-skin-editor.recent-colors.v1';
export const MAX_RECENT_COLORS = 12;

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

interface PersistedRecentColors {
  readonly version: 1;
  readonly colors: readonly RgbaColor[];
}

interface ColorSwatchState {
  readonly swatches: readonly ColorSwatch[];
  readonly recentColors: readonly RgbaColor[];
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

function freezeColor(color: RgbaColor): RgbaColor {
  return Object.freeze({ ...color });
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

function freezeRecentColors(
  colors: readonly RgbaColor[],
): readonly RgbaColor[] {
  const unique: RgbaColor[] = [];
  for (const color of colors) {
    if (!isRgbaColor(color)) continue;
    if (unique.some((existing) => colorsEqual(existing, color))) continue;
    unique.push(freezeColor(color));
    if (unique.length === MAX_RECENT_COLORS) break;
  }
  return Object.freeze(unique);
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

export function serializeRecentColors(colors: readonly RgbaColor[]): string {
  const payload: PersistedRecentColors = {
    version: 1,
    colors: freezeRecentColors(colors),
  };
  return JSON.stringify(payload);
}

export function deserializeRecentColors(
  raw: string | null,
): readonly RgbaColor[] {
  if (raw === null) return Object.freeze([]);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return Object.freeze([]);
    }
    const payload = parsed as Partial<PersistedRecentColors>;
    if (
      payload.version !== 1 ||
      !Array.isArray(payload.colors) ||
      payload.colors.some((color) => !isRgbaColor(color))
    ) {
      return Object.freeze([]);
    }
    return freezeRecentColors(payload.colors);
  } catch {
    return Object.freeze([]);
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

function readInitialRecentColors(): readonly RgbaColor[] {
  const storage = getStorage();
  if (storage === undefined) return Object.freeze([]);
  try {
    return deserializeRecentColors(storage.getItem(COLOR_RECENT_STORAGE_KEY));
  } catch {
    return Object.freeze([]);
  }
}

const colorSwatchStore = createStore<ColorSwatchState>(() => ({
  swatches: readInitialSwatches(),
  recentColors: readInitialRecentColors(),
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

function persistRecentColors(colors: readonly RgbaColor[]): void {
  const storage = getStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(COLOR_RECENT_STORAGE_KEY, serializeRecentColors(colors));
  } catch {
    // Recent colors are optional preferences and must not interrupt editing.
  }
}

function setRecentColors(colors: readonly RgbaColor[]): void {
  const next = freezeRecentColors(colors);
  colorSwatchStore.setState({ recentColors: next });
  persistRecentColors(next);
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

export function getRecentColors(): readonly RgbaColor[] {
  return colorSwatchStore.getState().recentColors;
}

export function recordRecentColor(color: RgbaColor): void {
  if (!isRgbaColor(color)) {
    throw new RangeError(
      'Recent colors must contain exact byte RGBA channels.',
    );
  }
  const recentColors = getRecentColors();
  if (recentColors[0] !== undefined && colorsEqual(recentColors[0], color)) {
    return;
  }
  setRecentColors([
    freezeColor(color),
    ...recentColors.filter((existing) => !colorsEqual(existing, color)),
  ]);
}

export function resetRecentColors(): void {
  setRecentColors([]);
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

export function useRecentColors(): readonly RgbaColor[] {
  return useStore(colorSwatchStore, (state) => state.recentColors);
}
