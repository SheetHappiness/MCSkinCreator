import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { EditorTool } from '../../engine/tools';
import {
  STAMP_PATTERN_LABELS,
  validateAdvancedPaintOptions,
  type DarkenToolOptions,
  type LightenToolOptions,
  type NoiseToolOptions,
  type StampToolOptions,
} from '../../engine/tools/AdvancedPaintTools';

/**
 * Core tools intentionally expose only the semantics they already implement.
 * Literal fields make an accidental fake control or unsupported option a type
 * error for a core tool while advanced tools use validated numeric options.
 */
export interface PencilToolOptions {
  readonly size: 1;
  readonly source: 'active-color';
}

export interface EraserToolOptions {
  readonly size: 1;
  readonly output: 'transparent';
}

export interface FillToolOptions {
  readonly mode: 'contiguous';
  readonly match: 'exact-rgba';
}

export interface EyedropperToolOptions {
  readonly sample: 'single-texel';
  readonly target: 'active-color';
}

export type { StampPattern } from '../../engine/tools/AdvancedPaintTools';

export interface ToolOptionsByTool {
  readonly pencil: PencilToolOptions;
  readonly eraser: EraserToolOptions;
  readonly fill: FillToolOptions;
  readonly eyedropper: EyedropperToolOptions;
  readonly lighten: LightenToolOptions;
  readonly darken: DarkenToolOptions;
  readonly noise: NoiseToolOptions;
  readonly stamp: StampToolOptions;
}

export type ToolOptionsFor<T extends EditorTool> = ToolOptionsByTool[T];

export interface ToolOptionsState {
  readonly byTool: ToolOptionsByTool;
}

export interface ToolOptionSummary {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly fixed: boolean;
}

function freezeDefaultOptions(): ToolOptionsByTool {
  return Object.freeze({
    pencil: Object.freeze({
      size: 1 as const,
      source: 'active-color' as const,
    }),
    eraser: Object.freeze({ size: 1 as const, output: 'transparent' as const }),
    fill: Object.freeze({
      mode: 'contiguous' as const,
      match: 'exact-rgba' as const,
    }),
    eyedropper: Object.freeze({
      sample: 'single-texel' as const,
      target: 'active-color' as const,
    }),
    lighten: Object.freeze({ strength: 0.25 }),
    darken: Object.freeze({ strength: 0.25 }),
    noise: Object.freeze({ strength: 0.25, density: 1, seed: 1337 }),
    stamp: Object.freeze({ pattern: 'checker-2x2' as const }),
  });
}

const DEFAULT_TOOL_OPTIONS = freezeDefaultOptions();

const toolOptionsStore = createStore<ToolOptionsState>(() => ({
  byTool: DEFAULT_TOOL_OPTIONS,
}));

function optionRecord(
  options: unknown,
  tool: EditorTool,
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
  tool: EditorTool,
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

function assertFixedValue(
  tool: EditorTool,
  options: Record<string, unknown>,
  key: string,
  expected: string | number,
): void {
  if (options[key] !== expected) {
    throw new RangeError(
      `${tool} option ${key} is fixed at ${String(expected)}.`,
    );
  }
}

/** Validates the explicit core-tool contract before options enter the store. */
export function validateToolOptions<T extends EditorTool>(
  tool: T,
  options: ToolOptionsFor<T>,
): ToolOptionsFor<T> {
  const record = optionRecord(options, tool);
  switch (tool) {
    case 'pencil':
      assertExactKeys(tool, record, ['size', 'source']);
      assertFixedValue(tool, record, 'size', 1);
      assertFixedValue(tool, record, 'source', 'active-color');
      break;
    case 'eraser':
      assertExactKeys(tool, record, ['size', 'output']);
      assertFixedValue(tool, record, 'size', 1);
      assertFixedValue(tool, record, 'output', 'transparent');
      break;
    case 'fill':
      assertExactKeys(tool, record, ['mode', 'match']);
      assertFixedValue(tool, record, 'mode', 'contiguous');
      assertFixedValue(tool, record, 'match', 'exact-rgba');
      break;
    case 'eyedropper':
      assertExactKeys(tool, record, ['sample', 'target']);
      assertFixedValue(tool, record, 'sample', 'single-texel');
      assertFixedValue(tool, record, 'target', 'active-color');
      break;
    case 'lighten':
      validateAdvancedPaintOptions('lighten', options as LightenToolOptions);
      break;
    case 'darken':
      validateAdvancedPaintOptions('darken', options as DarkenToolOptions);
      break;
    case 'noise':
      validateAdvancedPaintOptions('noise', options as NoiseToolOptions);
      break;
    case 'stamp':
      validateAdvancedPaintOptions('stamp', options as StampToolOptions);
      break;
  }
  return options;
}

function cloneOptions(options: ToolOptionsByTool): ToolOptionsByTool {
  return Object.freeze({
    pencil: Object.freeze({ ...options.pencil }),
    eraser: Object.freeze({ ...options.eraser }),
    fill: Object.freeze({ ...options.fill }),
    eyedropper: Object.freeze({ ...options.eyedropper }),
    lighten: Object.freeze({ ...options.lighten }),
    darken: Object.freeze({ ...options.darken }),
    noise: Object.freeze({ ...options.noise }),
    stamp: Object.freeze({ ...options.stamp }),
  });
}

export function getToolOptions<T extends EditorTool>(
  tool: T,
): ToolOptionsFor<T> {
  return toolOptionsStore.getState().byTool[tool];
}

export function getToolOptionsState(): ToolOptionsState {
  return toolOptionsStore.getState();
}

/**
 * Replaces one tool's options without touching SkinDocument or its history.
 * Core values are fixed, while this typed entry point gives advanced tools one
 * stable application-state boundary for real options.
 */
export function setToolOptions<T extends EditorTool>(
  tool: T,
  options: ToolOptionsFor<T>,
): void {
  validateToolOptions(tool, options);
  const current = toolOptionsStore.getState().byTool;
  const next = {
    ...current,
    [tool]: Object.freeze({ ...options }),
  } as ToolOptionsByTool;
  toolOptionsStore.setState({ byTool: cloneOptions(next) });
}

export function resetToolOptions(): void {
  toolOptionsStore.setState({ byTool: DEFAULT_TOOL_OPTIONS });
}

export function useToolOptions<T extends EditorTool>(
  tool: T,
): ToolOptionsFor<T> {
  return useStore(toolOptionsStore, (state) => state.byTool[tool]);
}

/** Read-only contextual facts; no current core tool has an editable option. */
export function getToolOptionSummary(
  tool: EditorTool,
): readonly ToolOptionSummary[] {
  switch (tool) {
    case 'pencil': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'size',
          label: 'Size',
          value: `${options.size} px`,
          fixed: true,
        },
        {
          key: 'source',
          label: 'Color source',
          value:
            options.source === 'active-color' ? 'Active color' : options.source,
          fixed: true,
        },
      ];
    }
    case 'eraser': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'size',
          label: 'Size',
          value: `${options.size} px`,
          fixed: true,
        },
        {
          key: 'output',
          label: 'Output',
          value:
            options.output === 'transparent' ? 'Transparent' : options.output,
          fixed: true,
        },
      ];
    }
    case 'fill': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'mode',
          label: 'Region',
          value: options.mode === 'contiguous' ? 'Contiguous' : options.mode,
          fixed: true,
        },
        {
          key: 'match',
          label: 'Match',
          value: options.match === 'exact-rgba' ? 'Exact RGBA' : options.match,
          fixed: true,
        },
      ];
    }
    case 'eyedropper': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'sample',
          label: 'Sample',
          value:
            options.sample === 'single-texel' ? 'Single texel' : options.sample,
          fixed: true,
        },
        {
          key: 'target',
          label: 'Writes to',
          value:
            options.target === 'active-color' ? 'Active color' : options.target,
          fixed: true,
        },
      ];
    }
    case 'lighten': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'strength',
          label: 'Strength',
          value: `${Math.round(options.strength * 100)}%`,
          fixed: false,
        },
      ];
    }
    case 'darken': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'strength',
          label: 'Strength',
          value: `${Math.round(options.strength * 100)}%`,
          fixed: false,
        },
      ];
    }
    case 'noise': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'strength',
          label: 'Strength',
          value: `${Math.round(options.strength * 100)}%`,
          fixed: false,
        },
        {
          key: 'density',
          label: 'Density',
          value: `${Math.round(options.density * 100)}%`,
          fixed: false,
        },
        {
          key: 'seed',
          label: 'Seed',
          value: String(options.seed),
          fixed: false,
        },
      ];
    }
    case 'stamp': {
      const options = getToolOptions(tool);
      return [
        {
          key: 'pattern',
          label: 'Pattern',
          value: STAMP_PATTERN_LABELS[options.pattern],
          fixed: false,
        },
      ];
    }
  }
}

export function toolLabel(tool: EditorTool): string {
  switch (tool) {
    case 'pencil':
      return 'Pencil';
    case 'eraser':
      return 'Eraser';
    case 'fill':
      return 'Fill';
    case 'eyedropper':
      return 'Eyedropper';
    case 'lighten':
      return 'Lighten';
    case 'darken':
      return 'Darken';
    case 'noise':
      return 'Noise';
    case 'stamp':
      return 'Stamp';
  }
}
