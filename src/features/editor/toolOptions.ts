import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { EditorTool } from '../../engine/tools';

/**
 * Core tools intentionally expose only the semantics they already implement.
 * Literal fields make an accidental fake control or unsupported option a type
 * error before P06 adds a tool with genuinely configurable values.
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

export interface ToolOptionsByTool {
  readonly pencil: PencilToolOptions;
  readonly eraser: EraserToolOptions;
  readonly fill: FillToolOptions;
  readonly eyedropper: EyedropperToolOptions;
}

export type ToolOptionsFor<T extends EditorTool> = ToolOptionsByTool[T];

export interface ToolOptionsState {
  readonly byTool: ToolOptionsByTool;
}

export interface ToolOptionSummary {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly fixed: true;
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
  }
  return options;
}

function cloneOptions(options: ToolOptionsByTool): ToolOptionsByTool {
  return Object.freeze({
    pencil: Object.freeze({ ...options.pencil }),
    eraser: Object.freeze({ ...options.eraser }),
    fill: Object.freeze({ ...options.fill }),
    eyedropper: Object.freeze({ ...options.eyedropper }),
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
 * P05's values are fixed, but this typed entry point gives P06 one stable
 * application-state boundary for real options.
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
  }
}
