import type { RgbaColor, SkinDocument } from '../document';
import type {
  DocumentEditOperation,
  DocumentEditTransaction,
  DocumentHistory,
} from '../history';
import {
  expandSymmetryTargets,
  type SymmetryEditOptions,
  type SymmetrySource,
} from '../symmetry';
import { hsvToRgba, rgbaToHsv } from '../color/ColorConversions';
import { rasterizeLine, type EditorTool } from './EditorTools';

export type AdvancedPaintTool = 'lighten' | 'darken' | 'noise' | 'stamp';

export function getAdvancedPaintHistoryLabel(tool: AdvancedPaintTool): string {
  switch (tool) {
    case 'lighten':
      return 'Lighten Stroke';
    case 'darken':
      return 'Darken Stroke';
    case 'noise':
      return 'Noise Stroke';
    case 'stamp':
      return 'Stamp';
  }
}

export function isAdvancedPaintTool(
  tool: EditorTool,
): tool is AdvancedPaintTool {
  return (
    tool === 'lighten' ||
    tool === 'darken' ||
    tool === 'noise' ||
    tool === 'stamp'
  );
}

export interface LightenToolOptions {
  readonly strength: number;
}

export interface DarkenToolOptions {
  readonly strength: number;
}

export interface NoiseToolOptions {
  readonly strength: number;
  readonly density: number;
  readonly seed: number;
}

export type StampPattern = 'checker-2x2' | 'stripe-3x3';

export interface StampToolOptions {
  readonly pattern: StampPattern;
}

export type AdvancedPaintToolOptions =
  LightenToolOptions | DarkenToolOptions | NoiseToolOptions | StampToolOptions;

export interface AdvancedPaintColors {
  readonly primary: RgbaColor;
  readonly secondary: RgbaColor;
}

export type NoiseRandomSource = () => number;

export interface StampDefinition {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly ('primary' | 'secondary')[];
}

const STAMP_DEFINITIONS: Readonly<Record<StampPattern, StampDefinition>> = {
  'checker-2x2': {
    width: 2,
    height: 2,
    cells: ['primary', 'secondary', 'secondary', 'primary'],
  },
  'stripe-3x3': {
    width: 3,
    height: 3,
    cells: [
      'primary',
      'primary',
      'primary',
      'secondary',
      'secondary',
      'secondary',
      'primary',
      'primary',
      'primary',
    ],
  },
};

export const STAMP_PATTERN_LABELS: Readonly<Record<StampPattern, string>> = {
  'checker-2x2': 'Checker 2×2',
  'stripe-3x3': 'Stripe 3×3',
};

const MAX_NOISE_CHANNEL_RANGE = 64;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function optionRecord(
  options: unknown,
  tool: AdvancedPaintTool,
): Record<string, unknown> {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError(`Options for ${tool} must be an object.`);
  }
  return options as Record<string, unknown>;
}

function assertExactKeys(
  tool: AdvancedPaintTool,
  options: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actualKeys = Object.keys(options).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(
      `Options for ${tool} must contain exactly: ${expected.join(', ')}.`,
    );
  }
}

function assertUnitInterval(
  tool: AdvancedPaintTool,
  options: Record<string, unknown>,
  key: string,
): void {
  const value = options[key];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new RangeError(`${tool} option ${key} must be from 0 to 1.`);
  }
}

function assertSeed(
  tool: AdvancedPaintTool,
  options: Record<string, unknown>,
): void {
  const value = options.seed;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  ) {
    throw new RangeError(
      `${tool} option seed must be an unsigned 32-bit integer.`,
    );
  }
}

function assertStampPattern(
  tool: AdvancedPaintTool,
  options: Record<string, unknown>,
): void {
  if (options.pattern !== 'checker-2x2' && options.pattern !== 'stripe-3x3') {
    throw new RangeError(`${tool} option pattern is not supported.`);
  }
}

/** Validates advanced options at the engine boundary before a gesture starts. */
export function validateAdvancedPaintOptions(
  tool: AdvancedPaintTool,
  options: AdvancedPaintToolOptions,
): void {
  const record = optionRecord(options, tool);
  switch (tool) {
    case 'lighten':
      assertExactKeys(tool, record, ['strength']);
      assertUnitInterval(tool, record, 'strength');
      break;
    case 'darken':
      assertExactKeys(tool, record, ['strength']);
      assertUnitInterval(tool, record, 'strength');
      break;
    case 'noise':
      assertExactKeys(tool, record, ['strength', 'density', 'seed']);
      assertUnitInterval(tool, record, 'strength');
      assertUnitInterval(tool, record, 'density');
      assertSeed(tool, record);
      break;
    case 'stamp':
      assertExactKeys(tool, record, ['pattern']);
      assertStampPattern(tool, record);
      break;
  }
}

export function getStampDefinition(pattern: StampPattern): StampDefinition {
  return STAMP_DEFINITIONS[pattern];
}

function transformValue(
  color: RgbaColor,
  mode: 'lighten' | 'darken',
  strength: number,
): RgbaColor {
  const hsv = rgbaToHsv(color);
  const value =
    mode === 'lighten'
      ? hsv.v + (100 - hsv.v) * strength
      : hsv.v * (1 - strength);
  return hsvToRgba({ ...hsv, v: value }, color.a);
}

export function lightenColor(color: RgbaColor, strength: number): RgbaColor {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('Lighten strength must be from 0 to 1.');
  }
  return transformValue(color, 'lighten', strength);
}

export function darkenColor(color: RgbaColor, strength: number): RgbaColor {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('Darken strength must be from 0 to 1.');
  }
  return transformValue(color, 'darken', strength);
}

function safeRandom(random: NoiseRandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 0.999999999);
}

function sampleNoiseDelta(
  options: NoiseToolOptions,
  random: NoiseRandomSource,
): number | undefined {
  validateAdvancedPaintOptions('noise', options);
  if (safeRandom(random) >= options.density) return undefined;

  const range = Math.round(options.strength * MAX_NOISE_CHANNEL_RANGE);
  return Math.floor(safeRandom(random) * (range * 2 + 1)) - range;
}

function applyNoiseDelta(color: RgbaColor, delta: number): RgbaColor {
  return {
    r: byte(color.r + delta),
    g: byte(color.g + delta),
    b: byte(color.b + delta),
    a: color.a,
  };
}

export function noiseColor(
  color: RgbaColor,
  options: NoiseToolOptions,
  random: NoiseRandomSource,
): RgbaColor {
  const delta = sampleNoiseDelta(options, random);
  return delta === undefined ? color : applyNoiseDelta(color, delta);
}

/** Small deterministic generator used by Noise when a test seam is not supplied. */
export function createSeededRandom(seed: number): NoiseRandomSource {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Noise seed must be an unsigned 32-bit integer.');
  }
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function coordinateKey(x: number, y: number): number {
  return y * 64 + x;
}

/**
 * One transactional advanced gesture. Lighten, Darken, and Noise interpolate
 * across a 2D path; Stamp places one predefined pattern at each new anchor.
 * A 3D adapter can call extend(undefined) to break interpolation at a face.
 */
export class AdvancedPaintStroke {
  private previous: SymmetrySource | undefined;
  private readonly transformedTargets = new Set<number>();
  private readonly stampedAnchors = new Set<number>();
  private readonly noiseRandom: NoiseRandomSource | undefined;

  constructor(
    private readonly document: SkinDocument,
    private readonly transaction: DocumentEditTransaction,
    private readonly tool: AdvancedPaintTool,
    private readonly options: AdvancedPaintToolOptions,
    private readonly colors: AdvancedPaintColors,
    private readonly symmetry: SymmetryEditOptions,
    randomSource?: NoiseRandomSource,
  ) {
    validateAdvancedPaintOptions(tool, options);
    this.noiseRandom =
      tool === 'noise'
        ? (randomSource ??
          createSeededRandom((options as NoiseToolOptions).seed))
        : undefined;
  }

  get isActive(): boolean {
    return this.transaction.isActive;
  }

  extend(point: SymmetrySource | undefined): void {
    if (!this.transaction.isActive) {
      this.previous = undefined;
      return;
    }
    if (point === undefined) {
      this.previous = undefined;
      return;
    }

    if (this.tool === 'stamp') {
      this.applyStamp(point);
      this.previous = point;
      return;
    }

    const points =
      this.previous === undefined
        ? [point]
        : rasterizeLine(this.previous, point);
    for (const coordinate of points) {
      this.applyTransform({ ...coordinate, surface: point.surface });
    }
    this.previous = point;
  }

  commit(): DocumentEditOperation | undefined {
    if (!this.transaction.isActive) return undefined;
    this.previous = undefined;
    return this.transaction.commit();
  }

  cancel(): void {
    if (this.transaction.isActive) this.transaction.cancel();
    this.previous = undefined;
  }

  private applyTransform(point: SymmetrySource): void {
    const targets = expandSymmetryTargets(point, this.symmetry).filter(
      (target) => {
        const key = coordinateKey(target.x, target.y);
        if (this.transformedTargets.has(key)) return false;
        this.transformedTargets.add(key);
        return true;
      },
    );
    if (targets.length === 0) return;

    if (this.tool === 'noise') {
      const delta = sampleNoiseDelta(
        this.options as NoiseToolOptions,
        this.noiseRandom!,
      );
      if (delta === undefined) return;
      for (const target of targets) {
        this.transaction.writePixel(
          target.x,
          target.y,
          applyNoiseDelta(this.document.readPixel(target.x, target.y), delta),
        );
      }
      return;
    }

    for (const target of targets) {
      const color = this.document.readPixel(target.x, target.y);
      let next = color;
      if (this.tool === 'lighten') {
        next = lightenColor(
          color,
          (this.options as LightenToolOptions).strength,
        );
      } else if (this.tool === 'darken') {
        next = darkenColor(color, (this.options as DarkenToolOptions).strength);
      }
      this.transaction.writePixel(target.x, target.y, next);
    }
  }

  private applyStamp(anchor: SymmetrySource): void {
    const anchorKey = coordinateKey(anchor.x, anchor.y);
    if (this.stampedAnchors.has(anchorKey)) return;
    this.stampedAnchors.add(anchorKey);

    const options = this.options as StampToolOptions;
    const definition = getStampDefinition(options.pattern);
    for (let row = 0; row < definition.height; row += 1) {
      for (let column = 0; column < definition.width; column += 1) {
        const x = anchor.x + column;
        const y = anchor.y + row;
        if (
          x < 0 ||
          x >= this.document.width ||
          y < 0 ||
          y >= this.document.height
        ) {
          continue;
        }
        const reference = definition.cells[row * definition.width + column];
        const color =
          reference === 'primary' ? this.colors.primary : this.colors.secondary;
        for (const target of expandSymmetryTargets(
          { x, y, surface: anchor.surface },
          this.symmetry,
        )) {
          this.transaction.writePixel(target.x, target.y, color);
        }
      }
    }
  }
}

export function beginAdvancedPaintStroke(
  document: SkinDocument,
  history: DocumentHistory,
  tool: AdvancedPaintTool,
  options: AdvancedPaintToolOptions,
  colors: AdvancedPaintColors,
  start: SymmetrySource,
  randomSource?: NoiseRandomSource,
  symmetry: SymmetryEditOptions = { mode: 'off', model: 'classic' },
): AdvancedPaintStroke {
  const stroke = new AdvancedPaintStroke(
    document,
    history.beginTransaction(getAdvancedPaintHistoryLabel(tool)),
    tool,
    options,
    colors,
    symmetry,
    randomSource,
  );
  stroke.extend(start);
  return stroke;
}
