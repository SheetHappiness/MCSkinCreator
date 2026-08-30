# Workspace Layout

The artist workspace keeps layout state separate from `SkinDocument` and
`DocumentHistory`. Resizing, collapsing, restoring, and resetting panels are
view operations: they never create an edit history entry or mark a skin dirty.

## Default layout

The first run starts with these preferred CSS-pixel dimensions:

| Preference                    | Default | Static limits |
| ----------------------------- | ------: | ------------: |
| Local Library width           |  200 px |    160–360 px |
| 3D Preview width              |  300 px |    244–480 px |
| Upper controls/history height |  260 px |    180–520 px |
| Compact left upper stack      |  220 px |    200–520 px |
| Color Workspace height        |  400 px |    280–620 px |

Both outer side-panel rails start expanded; the Library content itself starts
compact. The collapsed rail is 32 px wide, and each interactive splitter
reserves an 8 px track. The layout solver also reserves at least 220 px for
the central 2D canvas and at least 180 px for the lower 3D preview section.

The left-side dock keeps a compact Library and contextual tool options above
the persistent Color Workspace. In the normal compact state, the upper stack
uses its preferred height and Color Workspace receives the remaining space.
Expanding Library temporarily gives the upper stack the available height and
restores the persisted Color Workspace height; collapsing it immediately
returns that space to Color Workspace. The horizontal separator resizes the
active stack in either state. The Color Workspace contains the
primary/secondary slots, exact picker, recents, and manual palette; its layout
state is view-only and does not affect the active skin document.

The right-side vertical split is between the controls/history inspector and
the 3D preview. Its separator has horizontal orientation because dragging it
changes the upper section's height.

## Persistence and clamping

Preferences are stored locally under the versioned
`minecraft-skin-editor.workspace-layout.v1` key. Only finite, typed values are
accepted; malformed fields fall back to their defaults and out-of-range values
are clamped to the static limits. The compact-left-stack height and Library
expanded state are additive fields, so older valid layout preferences continue
to load. Storage failures are ignored so the editor can still start and remain
usable offline.

The stored dimensions are preferred values. A smaller window derives temporary
effective dimensions from the current available space without overwriting the
stored preference. The effective left and right widths leave the tool rail,
splitters, and a usable 2D surface visible; the effective inspector height
leaves room for the 3D preview. Restoring a panel reuses its previous
preferred dimension.

The `Reset Layout` command restores the defaults, including the compact
Library state, and clears both side-panel collapsed states.
