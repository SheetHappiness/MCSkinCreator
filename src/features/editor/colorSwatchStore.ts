import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RgbaColor } from '../../engine/document';

export const COLOR_SWATCH_STORAGE_KEY =
  'minecraft-skin-editor.color-swatches.v1';
export const COLOR_RECENT_STORAGE_KEY =
  'minecraft-skin-editor.recent-colors.v1';
export const MAX_RECENT_COLORS = 12;
export const MANUAL_PALETTE_ID = 'manual-palette';
export const MANUAL_PALETTE_NAME = 'Manual palette';
export const MANUAL_PALETTE_GROUP_ID = 'manual-colors';

export interface ColorSwatch {
  readonly id: string;
  readonly color: RgbaColor;
  readonly name?: string;
}

/** A named container kept deliberately generic for future palette groups. */
export interface PaletteGroup {
  readonly id: string;
  readonly name: string;
  readonly swatches: readonly ColorSwatch[];
}

/** The durable user-authored palette model; no semantic meaning is implied. */
export interface ManualPalette {
  readonly id: string;
  readonly name: string;
  readonly groups: readonly PaletteGroup[];
}

export interface ColorSwatchInput {
  readonly color: RgbaColor;
  readonly name?: string;
}

interface PersistedColorSwatches {
  readonly version: 1;
  readonly swatches: readonly ColorSwatch[];
}

interface PersistedManualPalette {
  readonly version: 1;
  readonly palette: ManualPalette;
}

interface PersistedRecentColors {
  readonly version: 1;
  readonly colors: readonly RgbaColor[];
}

interface ColorSwatchState {
  readonly palette: ManualPalette;
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

function freezePaletteGroup(group: PaletteGroup): PaletteGroup {
  return Object.freeze({
    id: group.id,
    name: group.name,
    swatches: freezeSwatches(group.swatches),
  });
}

function freezeManualPalette(palette: ManualPalette): ManualPalette {
  return Object.freeze({
    id: palette.id,
    name: palette.name,
    groups: Object.freeze(palette.groups.map(freezePaletteGroup)),
  });
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

export function defaultManualPalette(): ManualPalette {
  return freezeManualPalette({
    id: MANUAL_PALETTE_ID,
    name: MANUAL_PALETTE_NAME,
    groups: [
      {
        id: MANUAL_PALETTE_GROUP_ID,
        name: 'Colors',
        swatches: DEFAULT_SWATCH_DEFINITIONS,
      },
    ],
  });
}

function isPaletteGroup(value: unknown): value is PaletteGroup {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as Partial<PaletteGroup>;
  return (
    typeof group.id === 'string' &&
    group.id.length > 0 &&
    group.id.length <= 128 &&
    typeof group.name === 'string' &&
    group.name.length > 0 &&
    group.name.length <= 120 &&
    Array.isArray(group.swatches)
  );
}

function isManualPalette(value: unknown): value is ManualPalette {
  if (typeof value !== 'object' || value === null) return false;
  const palette = value as Partial<ManualPalette>;
  if (
    typeof palette.id !== 'string' ||
    palette.id.length === 0 ||
    palette.id.length > 128 ||
    typeof palette.name !== 'string' ||
    palette.name.length === 0 ||
    palette.name.length > 120 ||
    !Array.isArray(palette.groups) ||
    palette.groups.some((group) => !isPaletteGroup(group))
  ) {
    return false;
  }

  const groupIds = new Set<string>();
  const swatchIds = new Set<string>();
  for (const group of palette.groups) {
    if (groupIds.has(group.id)) return false;
    groupIds.add(group.id);
    for (const swatch of group.swatches) {
      if (!isColorSwatch(swatch) || swatchIds.has(swatch.id)) return false;
      swatchIds.add(swatch.id);
    }
  }
  return true;
}

function legacySwatchesFromUnknown(
  value: unknown,
): readonly ColorSwatch[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const swatches: ColorSwatch[] = [];
  for (const swatch of value) {
    if (!isColorSwatch(swatch) || ids.has(swatch.id)) return undefined;
    ids.add(swatch.id);
    swatches.push(freezeSwatch(swatch));
  }
  return Object.freeze(swatches);
}

function paletteFromSwatches(swatches: readonly ColorSwatch[]): ManualPalette {
  return freezeManualPalette({
    id: MANUAL_PALETTE_ID,
    name: MANUAL_PALETTE_NAME,
    groups: [
      {
        id: MANUAL_PALETTE_GROUP_ID,
        name: 'Colors',
        swatches,
      },
    ],
  });
}

export function serializeManualPalette(palette: ManualPalette): string {
  const payload: PersistedManualPalette = {
    version: 1,
    palette: freezeManualPalette(palette),
  };
  return JSON.stringify(payload);
}

export function deserializeManualPalette(raw: string | null): ManualPalette {
  if (raw === null) return defaultManualPalette();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultManualPalette();
    }
    const payload = parsed as Partial<PersistedManualPalette> &
      Partial<PersistedColorSwatches>;
    if (payload.version !== 1) return defaultManualPalette();
    if (isManualPalette(payload.palette)) {
      return freezeManualPalette(payload.palette);
    }
    const legacySwatches = legacySwatchesFromUnknown(payload.swatches);
    return legacySwatches === undefined
      ? defaultManualPalette()
      : paletteFromSwatches(legacySwatches);
  } catch {
    return defaultManualPalette();
  }
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
  const palette = deserializeManualPalette(raw);
  return Object.freeze(palette.groups.flatMap((group) => group.swatches));
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

function readInitialPalette(): ManualPalette {
  const storage = getStorage();
  if (storage === undefined) return defaultManualPalette();
  try {
    return deserializeManualPalette(storage.getItem(COLOR_SWATCH_STORAGE_KEY));
  } catch {
    return defaultManualPalette();
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
  palette: readInitialPalette(),
  recentColors: readInitialRecentColors(),
}));

function persist(palette: ManualPalette): void {
  const storage = getStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(COLOR_SWATCH_STORAGE_KEY, serializeManualPalette(palette));
  } catch {
    // Local preferences are optional and must not interrupt editing.
  }
}

function setPalette(palette: ManualPalette): void {
  const next = freezeManualPalette(palette);
  colorSwatchStore.setState({ palette: next });
  persist(next);
}

function updatePaletteGroup(
  palette: ManualPalette,
  groupIndex: number,
  swatches: readonly ColorSwatch[],
): ManualPalette {
  const groups = [...palette.groups];
  const current = groups[groupIndex] ?? {
    id: MANUAL_PALETTE_GROUP_ID,
    name: 'Colors',
    swatches: [],
  };
  groups[groupIndex] = {
    ...current,
    swatches,
  };
  return { ...palette, groups };
}

function setFirstGroupSwatches(swatches: readonly ColorSwatch[]): void {
  const current = getColorPalette();
  setPalette(updatePaletteGroup(current, 0, freezeSwatches(swatches)));
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
  return colorSwatchStore
    .getState()
    .palette.groups.flatMap((group) => group.swatches);
}

export function getColorPalette(): ManualPalette {
  return colorSwatchStore.getState().palette;
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
  const firstGroupSwatches = getColorPalette().groups[0]?.swatches ?? [];
  setFirstGroupSwatches([...firstGroupSwatches, swatch]);
  return swatch;
}

export function addColorSwatches(inputs: readonly ColorSwatchInput[]): number {
  let added = 0;
  let allSwatches = [...getColorSwatches()];
  let firstGroupSwatches = getColorPalette().groups[0]?.swatches ?? [];
  for (const input of inputs) {
    if (!isRgbaColor(input.color)) continue;
    if (allSwatches.some((swatch) => colorsEqual(swatch.color, input.color))) {
      continue;
    }
    const swatch = freezeSwatch({ ...input, id: nextSwatchId(allSwatches) });
    firstGroupSwatches = [...firstGroupSwatches, swatch];
    allSwatches = [...allSwatches, swatch];
    added += 1;
  }
  if (added > 0) setFirstGroupSwatches(firstGroupSwatches);
  return added;
}

export function removeColorSwatch(id: string): void {
  const palette = getColorPalette();
  const groupIndex = palette.groups.findIndex((group) =>
    group.swatches.some((swatch) => swatch.id === id),
  );
  if (groupIndex < 0) return;
  const group = palette.groups[groupIndex]!;
  setPalette(
    updatePaletteGroup(
      palette,
      groupIndex,
      group.swatches.filter((swatch) => swatch.id !== id),
    ),
  );
}

export function moveColorSwatch(id: string, offset: -1 | 1): void {
  const palette = getColorPalette();
  const groupIndex = palette.groups.findIndex((group) =>
    group.swatches.some((swatch) => swatch.id === id),
  );
  if (groupIndex < 0) return;
  const swatches = [...palette.groups[groupIndex]!.swatches];
  const index = swatches.findIndex((swatch) => swatch.id === id);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= swatches.length) {
    return;
  }
  [swatches[index], swatches[targetIndex]] = [
    swatches[targetIndex]!,
    swatches[index]!,
  ];
  setPalette(updatePaletteGroup(palette, groupIndex, swatches));
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
  setFirstGroupSwatches(next);
}

export function resetColorSwatches(): void {
  setFirstGroupSwatches(defaultColorSwatches());
}

export function useColorSwatches(): readonly ColorSwatch[] {
  const palette = useColorPalette();
  return palette.groups.flatMap((group) => group.swatches);
}

export function useColorPalette(): ManualPalette {
  return useStore(colorSwatchStore, (state) => state.palette);
}

export function useRecentColors(): readonly RgbaColor[] {
  return useStore(colorSwatchStore, (state) => state.recentColors);
}
