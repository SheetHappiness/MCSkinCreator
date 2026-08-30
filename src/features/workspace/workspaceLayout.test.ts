import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLAPSED_PANEL_SIZE,
  COLOR_WORKSPACE_HEIGHT_LIMITS,
  DEFAULT_WORKSPACE_LAYOUT,
  LEFT_UPPER_HEIGHT_LIMITS,
  LEFT_PANEL_WIDTH_LIMITS,
  MIN_LEFT_UPPER_HEIGHT,
  RIGHT_INSPECTOR_HEIGHT_LIMITS,
  RIGHT_PANEL_WIDTH_LIMITS,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  deserializeWorkspaceLayout,
  getColorWorkspaceHeightBounds,
  getEffectiveWorkspaceLayout,
  getLeftUpperHeightBounds,
  getLeftPanelWidthBounds,
  getRightInspectorHeightBounds,
  getRightPanelWidthBounds,
  loadWorkspaceLayout,
  normalizeWorkspaceLayout,
  persistWorkspaceLayout,
  serializeWorkspaceLayout,
} from './workspaceLayout';

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
});

describe('workspace layout model', () => {
  it('defines documented defaults and a versioned serialized form', () => {
    expect(loadWorkspaceLayout()).toEqual(DEFAULT_WORKSPACE_LAYOUT);
    expect(
      JSON.parse(serializeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT)),
    ).toEqual({
      version: 1,
      ...DEFAULT_WORKSPACE_LAYOUT,
    });
  });

  it('restores validated local preferences', () => {
    const preferred = {
      leftPanelWidth: 276,
      rightPanelWidth: 352,
      rightInspectorHeight: 318,
      leftUpperHeight: 236,
      colorWorkspaceHeight: 448,
      libraryExpanded: true,
      leftCollapsed: true,
      rightCollapsed: false,
    } as const;
    persistWorkspaceLayout(preferred);

    expect(loadWorkspaceLayout()).toEqual(preferred);
  });

  it('treats local persistence failures as optional', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage unavailable');
      });
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage unavailable');
      });

    try {
      expect(() =>
        persistWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT),
      ).not.toThrow();
      expect(loadWorkspaceLayout()).toEqual(DEFAULT_WORKSPACE_LAYOUT);
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it('falls back for malformed or version-mismatched storage', () => {
    for (const raw of [
      '{broken',
      JSON.stringify({ version: 2, ...DEFAULT_WORKSPACE_LAYOUT }),
      JSON.stringify({ version: 1, leftPanelWidth: 'wide' }),
    ]) {
      expect(deserializeWorkspaceLayout(raw)).toEqual(
        normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT),
      );
    }
  });

  it('clamps stale numeric preferences and rejects invalid field types', () => {
    expect(
      deserializeWorkspaceLayout(
        JSON.stringify({
          version: 1,
          leftPanelWidth: 9999,
          rightPanelWidth: -20,
          rightInspectorHeight: 9999,
          leftUpperHeight: 9999,
          colorWorkspaceHeight: -20,
          libraryExpanded: 'yes',
          leftCollapsed: 'yes',
          rightCollapsed: true,
        }),
      ),
    ).toEqual({
      leftPanelWidth: LEFT_PANEL_WIDTH_LIMITS.max,
      rightPanelWidth: RIGHT_PANEL_WIDTH_LIMITS.min,
      rightInspectorHeight: RIGHT_INSPECTOR_HEIGHT_LIMITS.max,
      leftUpperHeight: LEFT_UPPER_HEIGHT_LIMITS.max,
      colorWorkspaceHeight: COLOR_WORKSPACE_HEIGHT_LIMITS.min,
      libraryExpanded: DEFAULT_WORKSPACE_LAYOUT.libraryExpanded,
      leftCollapsed: DEFAULT_WORKSPACE_LAYOUT.leftCollapsed,
      rightCollapsed: true,
    });
  });

  it('derives narrow-window bounds without overwriting preferred dimensions', () => {
    const preferred = normalizeWorkspaceLayout({
      leftPanelWidth: LEFT_PANEL_WIDTH_LIMITS.max,
      rightPanelWidth: RIGHT_PANEL_WIDTH_LIMITS.max,
      rightInspectorHeight: RIGHT_INSPECTOR_HEIGHT_LIMITS.max,
    });
    const effective = getEffectiveWorkspaceLayout(preferred, {
      applicationWidth: 800,
      editorMainWidth: 592,
      rightPanelHeight: 462,
    });

    expect(effective.leftPanelWidth).toBe(272);
    expect(effective.rightPanelWidth).toBe(257);
    expect(effective.rightInspectorHeight).toBe(274);
    expect(effective.leftUpperHeight).toBe(
      DEFAULT_WORKSPACE_LAYOUT.leftUpperHeight,
    );
    expect(preferred.leftPanelWidth).toBe(LEFT_PANEL_WIDTH_LIMITS.max);
    expect(preferred.rightPanelWidth).toBe(RIGHT_PANEL_WIDTH_LIMITS.max);
    expect(preferred.rightInspectorHeight).toBe(
      RIGHT_INSPECTOR_HEIGHT_LIMITS.max,
    );
  });

  it('keeps the collapsed rail effective size while preserving restore size', () => {
    const collapsed = normalizeWorkspaceLayout({
      leftPanelWidth: 284,
      rightPanelWidth: 368,
      leftCollapsed: true,
      rightCollapsed: true,
    });
    const effective = getEffectiveWorkspaceLayout(collapsed, {
      applicationWidth: 1200,
      editorMainWidth: 992,
      rightPanelHeight: 662,
    });
    expect(effective.leftPanelWidth).toBe(COLLAPSED_PANEL_SIZE);
    expect(effective.rightPanelWidth).toBe(COLLAPSED_PANEL_SIZE);

    const restored = normalizeWorkspaceLayout({
      ...collapsed,
      leftCollapsed: false,
      rightCollapsed: false,
    });
    expect(restored.leftPanelWidth).toBe(284);
    expect(restored.rightPanelWidth).toBe(368);
  });

  it('exposes usable splitter constraints for each supported orientation', () => {
    expect(getLeftPanelWidthBounds(800)).toEqual({ min: 160, max: 272 });
    expect(getRightPanelWidthBounds(592)).toEqual({ min: 244, max: 257 });
    expect(getRightInspectorHeightBounds(462)).toEqual({
      min: 180,
      max: 274,
    });
    expect(getLeftUpperHeightBounds(800)).toEqual({
      min: MIN_LEFT_UPPER_HEIGHT,
      max: Math.min(LEFT_UPPER_HEIGHT_LIMITS.max, 800 - 8 - 280),
    });
    expect(getColorWorkspaceHeightBounds(800)).toEqual({
      min: COLOR_WORKSPACE_HEIGHT_LIMITS.min,
      max: Math.min(
        COLOR_WORKSPACE_HEIGHT_LIMITS.max,
        800 - 8 - MIN_LEFT_UPPER_HEIGHT,
      ),
    });
  });

  it('resets through the same validated default contract', () => {
    expect(
      normalizeWorkspaceLayout({
        leftPanelWidth: 330,
        rightPanelWidth: 430,
        rightInspectorHeight: 480,
        leftCollapsed: true,
        rightCollapsed: true,
      }),
    ).not.toEqual(DEFAULT_WORKSPACE_LAYOUT);
    expect(normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT)).toEqual(
      DEFAULT_WORKSPACE_LAYOUT,
    );
  });
});
