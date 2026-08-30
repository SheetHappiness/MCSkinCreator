export const WORKSPACE_LAYOUT_STORAGE_KEY =
  'minecraft-skin-editor.workspace-layout.v1';

export const WORKSPACE_LAYOUT_VERSION = 1 as const;

/** Width of each interactive splitter track in CSS pixels. */
export const WORKSPACE_SPLITTER_SIZE = 8;

/** Width of a collapsed side-panel rail in CSS pixels. */
export const COLLAPSED_PANEL_SIZE = 32;

/** The minimum canvas width reserved by the layout solver. */
export const MIN_2D_CANVAS_WIDTH = 220;

/** The fixed editor tool rail width used by the current shell. */
export const TOOL_RAIL_WIDTH = 48;

export const LEFT_PANEL_WIDTH_LIMITS = Object.freeze({
  min: 160,
  max: 360,
});

export const RIGHT_PANEL_WIDTH_LIMITS = Object.freeze({
  min: 244,
  max: 480,
});

export const RIGHT_INSPECTOR_HEIGHT_LIMITS = Object.freeze({
  min: 180,
  max: 520,
});

export const COLOR_WORKSPACE_HEIGHT_LIMITS = Object.freeze({
  min: 280,
  max: 620,
});

/** Minimum height kept for the Local Library above the color workspace. */
export const MIN_LOCAL_LIBRARY_HEIGHT = 160;

/** Minimum height reserved for the lower 3D preview section. */
export const MIN_3D_PREVIEW_HEIGHT = 180;

/**
 * Preferred workspace dimensions are CSS pixels. They are view state only:
 * no field here belongs to SkinDocument or DocumentHistory.
 */
export interface WorkspaceLayout {
  readonly leftPanelWidth: number;
  readonly rightPanelWidth: number;
  readonly rightInspectorHeight: number;
  readonly colorWorkspaceHeight: number;
  readonly leftCollapsed: boolean;
  readonly rightCollapsed: boolean;
}

export interface WorkspaceDimensionBounds {
  readonly min: number;
  readonly max: number;
}

export interface WorkspaceLayoutMeasurements {
  readonly applicationWidth: number;
  readonly editorMainWidth: number;
  readonly rightPanelHeight: number;
}

export interface EffectiveWorkspaceLayout extends WorkspaceLayout {
  readonly leftPanelBounds: WorkspaceDimensionBounds;
  readonly rightPanelBounds: WorkspaceDimensionBounds;
  readonly rightInspectorBounds: WorkspaceDimensionBounds;
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = Object.freeze({
  leftPanelWidth: 200,
  rightPanelWidth: 300,
  rightInspectorHeight: 260,
  colorWorkspaceHeight: 400,
  leftCollapsed: false,
  rightCollapsed: false,
});

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampInteger(value: number, bounds: WorkspaceDimensionBounds): number {
  const min = Math.min(bounds.min, bounds.max);
  const max = Math.max(bounds.min, bounds.max);
  return Math.min(max, Math.max(min, Math.round(value)));
}

function staticBounds(
  limits: WorkspaceDimensionBounds,
): WorkspaceDimensionBounds {
  return { min: limits.min, max: limits.max };
}

/** Clamps an interactive value without allowing a malformed range to escape. */
export function clampWorkspaceDimension(
  value: number,
  bounds: WorkspaceDimensionBounds,
): number {
  if (!Number.isFinite(value)) return bounds.min;
  return clampInteger(value, bounds);
}

/**
 * Returns the legal preferred width for Local Library at the current window
 * size. The maximum leaves the tool rail, right panel minimum, splitters, and
 * a usable 2D canvas in the central workspace.
 */
export function getLeftPanelWidthBounds(
  applicationWidth: number,
): WorkspaceDimensionBounds {
  if (!finitePositive(applicationWidth)) {
    return staticBounds(LEFT_PANEL_WIDTH_LIMITS);
  }

  const maxByUsableEditor =
    applicationWidth -
    WORKSPACE_SPLITTER_SIZE -
    TOOL_RAIL_WIDTH -
    WORKSPACE_SPLITTER_SIZE -
    RIGHT_PANEL_WIDTH_LIMITS.min -
    MIN_2D_CANVAS_WIDTH;
  return {
    min: LEFT_PANEL_WIDTH_LIMITS.min,
    max: Math.max(
      LEFT_PANEL_WIDTH_LIMITS.min,
      Math.min(LEFT_PANEL_WIDTH_LIMITS.max, Math.floor(maxByUsableEditor)),
    ),
  };
}

/**
 * Returns the legal preferred width for the right panel. The 48% share cap
 * keeps the 2D surface visually primary while still permitting a generous
 * inspector at large desktop sizes.
 */
export function getRightPanelWidthBounds(
  editorMainWidth: number,
): WorkspaceDimensionBounds {
  if (!finitePositive(editorMainWidth)) {
    return staticBounds(RIGHT_PANEL_WIDTH_LIMITS);
  }

  const canvasAndPanelWidth =
    editorMainWidth - TOOL_RAIL_WIDTH - WORKSPACE_SPLITTER_SIZE;
  const maxByCanvas = canvasAndPanelWidth - MIN_2D_CANVAS_WIDTH;
  const maxByShare = Math.floor(canvasAndPanelWidth * 0.48);
  return {
    min: RIGHT_PANEL_WIDTH_LIMITS.min,
    max: Math.max(
      RIGHT_PANEL_WIDTH_LIMITS.min,
      Math.min(
        RIGHT_PANEL_WIDTH_LIMITS.max,
        Math.floor(maxByCanvas),
        maxByShare,
      ),
    ),
  };
}

/**
 * Returns the legal upper inspector height for the right-side vertical split.
 * The lower preview keeps its own minimum height so a tall persisted
 * inspector cannot consume the complete 3D surface after a window resize.
 */
export function getRightInspectorHeightBounds(
  rightPanelHeight: number,
): WorkspaceDimensionBounds {
  if (!finitePositive(rightPanelHeight)) {
    return staticBounds(RIGHT_INSPECTOR_HEIGHT_LIMITS);
  }

  const maxByPreview =
    rightPanelHeight - WORKSPACE_SPLITTER_SIZE - MIN_3D_PREVIEW_HEIGHT;
  return {
    min: RIGHT_INSPECTOR_HEIGHT_LIMITS.min,
    max: Math.max(
      RIGHT_INSPECTOR_HEIGHT_LIMITS.min,
      Math.min(RIGHT_INSPECTOR_HEIGHT_LIMITS.max, Math.floor(maxByPreview)),
    ),
  };
}

/**
 * Returns the legal preferred height for the left-side Color Workspace.
 * Local Library retains a usable upper section while the color surface keeps
 * its own minimum for the persistent picker and slot controls.
 */
export function getColorWorkspaceHeightBounds(
  leftPanelHeight: number,
): WorkspaceDimensionBounds {
  if (!finitePositive(leftPanelHeight)) {
    return staticBounds(COLOR_WORKSPACE_HEIGHT_LIMITS);
  }

  const maxByLibrary =
    leftPanelHeight - WORKSPACE_SPLITTER_SIZE - MIN_LOCAL_LIBRARY_HEIGHT;
  return {
    min: COLOR_WORKSPACE_HEIGHT_LIMITS.min,
    max: Math.max(
      COLOR_WORKSPACE_HEIGHT_LIMITS.min,
      Math.min(COLOR_WORKSPACE_HEIGHT_LIMITS.max, Math.floor(maxByLibrary)),
    ),
  };
}

function persistedDimension(
  value: unknown,
  fallback: number,
  limits: WorkspaceDimensionBounds,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampInteger(value, limits)
    : fallback;
}

function persistedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Sanitizes values before they can enter React state or local persistence. */
export function normalizeWorkspaceLayout(
  value: Partial<WorkspaceLayout> | null | undefined,
): WorkspaceLayout {
  return {
    leftPanelWidth: persistedDimension(
      value?.leftPanelWidth,
      DEFAULT_WORKSPACE_LAYOUT.leftPanelWidth,
      LEFT_PANEL_WIDTH_LIMITS,
    ),
    rightPanelWidth: persistedDimension(
      value?.rightPanelWidth,
      DEFAULT_WORKSPACE_LAYOUT.rightPanelWidth,
      RIGHT_PANEL_WIDTH_LIMITS,
    ),
    rightInspectorHeight: persistedDimension(
      value?.rightInspectorHeight,
      DEFAULT_WORKSPACE_LAYOUT.rightInspectorHeight,
      RIGHT_INSPECTOR_HEIGHT_LIMITS,
    ),
    colorWorkspaceHeight: persistedDimension(
      value?.colorWorkspaceHeight,
      DEFAULT_WORKSPACE_LAYOUT.colorWorkspaceHeight,
      COLOR_WORKSPACE_HEIGHT_LIMITS,
    ),
    leftCollapsed: persistedBoolean(
      value?.leftCollapsed,
      DEFAULT_WORKSPACE_LAYOUT.leftCollapsed,
    ),
    rightCollapsed: persistedBoolean(
      value?.rightCollapsed,
      DEFAULT_WORKSPACE_LAYOUT.rightCollapsed,
    ),
  };
}

export function getEffectiveWorkspaceLayout(
  layout: WorkspaceLayout,
  measurements: WorkspaceLayoutMeasurements,
): EffectiveWorkspaceLayout {
  const normalized = normalizeWorkspaceLayout(layout);
  const leftPanelBounds = getLeftPanelWidthBounds(
    measurements.applicationWidth,
  );
  const rightPanelBounds = getRightPanelWidthBounds(
    measurements.editorMainWidth,
  );
  const rightInspectorBounds = getRightInspectorHeightBounds(
    measurements.rightPanelHeight,
  );

  return {
    ...normalized,
    leftPanelWidth: normalized.leftCollapsed
      ? COLLAPSED_PANEL_SIZE
      : clampWorkspaceDimension(normalized.leftPanelWidth, leftPanelBounds),
    rightPanelWidth: normalized.rightCollapsed
      ? COLLAPSED_PANEL_SIZE
      : clampWorkspaceDimension(normalized.rightPanelWidth, rightPanelBounds),
    rightInspectorHeight: clampWorkspaceDimension(
      normalized.rightInspectorHeight,
      rightInspectorBounds,
    ),
    leftPanelBounds,
    rightPanelBounds,
    rightInspectorBounds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function serializeWorkspaceLayout(layout: WorkspaceLayout): string {
  const normalized = normalizeWorkspaceLayout(layout);
  return JSON.stringify({ version: WORKSPACE_LAYOUT_VERSION, ...normalized });
}

export function deserializeWorkspaceLayout(
  raw: string | null,
): WorkspaceLayout {
  if (raw === null) return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== WORKSPACE_LAYOUT_VERSION) {
      return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
    }
    return normalizeWorkspaceLayout(parsed);
  } catch {
    return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
  }
}

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadWorkspaceLayout(): WorkspaceLayout {
  const storage = getStorage();
  if (storage === undefined) {
    return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
  }

  try {
    return deserializeWorkspaceLayout(
      storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY),
    );
  } catch {
    return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
  }
}

export function persistWorkspaceLayout(layout: WorkspaceLayout): void {
  const storage = getStorage();
  if (storage === undefined) return;

  try {
    storage.setItem(
      WORKSPACE_LAYOUT_STORAGE_KEY,
      serializeWorkspaceLayout(layout),
    );
  } catch {
    // Layout preferences are optional and must not interrupt editing.
  }
}
