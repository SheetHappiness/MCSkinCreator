# TECHNICAL_STUDIO_DESIGN.md

# Minecraft Skin Editor — Technical Studio Visual Canon

Status: canonical visual contract for Roadmap 4.

Roadmap 4 preserves existing product behavior and architecture while moving the UI toward one coherent professional desktop creative-tool language.

## Product posture

The editor is a professional skin-art tool, not a Minecraft-themed utility and not a SaaS dashboard. The shell should feel closer to disciplined desktop creative software such as Blender, Substance Painter, Affinity, Figma desktop, or DaVinci Resolve than to a website.

Core properties:

- dense but readable;
- technical without looking unfinished;
- restrained;
- dark-neutral;
- high information value per pixel;
- keyboard/mouse friendly;
- artwork-first;
- minimal decorative chrome;
- precise interaction states;
- no playful Minecraft styling in the shell.

Minecraft appears in content and domain semantics, not ornament.

## Workspace hierarchy

Priority:

1. Canvas — dominant visual/interaction surface.
2. Color Workspace — primary artist surface.
3. 3D / Structure — inspection and structural surface.
4. Active Tool Options — contextual controls.
5. Library / document utilities — secondary, compact, episodic.

Normal layout:

```text
LEFT                         CENTER                         RIGHT
────────────────────────────────────────────────────────────────────────
Compact Library             Canvas                        Inspector
Active Tool Options                                        Parts/Layers
Color Workspace                                            History
                                                          3D Viewport
```

Do not redesign this into arbitrary docking or a multi-window IDE.

## Visual hierarchy

Artwork should be the brightest/richest content. Chrome recedes. Avoid giving every control equal weight. Use spacing, typography, surface depth, subtle borders, selection/accent, grouping, and density. Do not simulate hierarchy with cards.

## Surfaces

Use a small number of semantic levels:

```text
--ts-bg-app
--ts-bg-workspace
--ts-bg-panel
--ts-bg-raised
--ts-bg-hover
--ts-bg-selected
--ts-bg-popover
--ts-bg-canvas-frame
```

Directional dark-neutral family:

```text
App background      ~ #111315
Workspace           ~ #15181B
Panel               ~ #1A1E22
Raised control      ~ #22272C
Hover               ~ #282E34
Border              ~ #30363C
```

These are references, not mandatory literals. Build semantic tokens and tune visually. Do not create many barely distinguishable gray levels.

## Accent

Use one restrained cool accent family: cool blue / blue-violet / desaturated violet-blue. Accent is for state and focus, not decoration.

Good uses: active tool/tab, selected semantic target, keyboard focus, selected swatch, active segmented control.

Bad uses: every icon, every panel header, decorative borders, gradients behind panels.

Danger/warning/success remain semantic and separate.

## Typography

Recommended scale:

```text
11 px  metadata / tertiary information
12 px  compact labels
13 px  standard interface text
14 px  important controls / high-value values
```

Avoid 8–9 px core UI text. Use one clean sans-serif UI family already available. Use monospace selectively for HEX/RGBA/HSV/RGB, coordinates, dimensions, and aligned technical values. Do not make the whole UI monospace.

## Spacing

Preferred scale:

```text
4 px   micro
6 px   dense
8 px   control gap
12 px  grouped controls
16 px  section separation
24 px  major separation
```

Avoid arbitrary one-off spacing.

## Control sizing

Desktop density is intentional, but targets must remain practical:

```text
Compact control height     26–28 px
Standard control height    30–32 px
Toolbar icon hit target    ~30–32 px
Small icon                 14–16 px visual inside larger target
```

Avoid tiny 18–20 px buttons except rare low-frequency micro-controls.

## Borders and radii

Borders are structural, not decorative. Prefer subtle 1 px separators, stronger only for focus/selected/popover. Avoid outlining every nested group.

Radii:

```text
2–4 px controls
4–6 px popovers
```

No pill shapes unless semantically useful.

## Cards

Default: do not use cards. Prefer panel, section, divider, row, popover. Avoid nested card stacks.

## Buttons and iconography

Most controls are neutral, compact, with obvious hover/pressed/selected/focus states. Do not make every button filled.

Use one consistent icon family/weight. Selected state comes from container/state, not icon recolor alone. Tooltips include shortcuts when available.

## Interaction states

Every interactive component defines default / hover / pressed / selected-active / focus-visible / disabled. States must not rely on color alone.

Transitions:

```text
hover       ~70–100 ms
popover     ~100–140 ms
collapse    ~140–180 ms
tool action immediate
painting    immediate
```

No animation in latency-sensitive drawing.

## Scrollbars and splitters

Scrollbars: narrow but usable, integrated, low contrast until hover. Avoid nested scroll areas.

Splitters: subtle idle line, clear hover, correct cursor, accessible where supported. Hit area may exceed visible line width.

## Canvas

Canvas is dominant. Preserve exact checkerboard/grid/pixels/zoom/pan. Chrome should be quiet. Canvas controls should look like a professional viewport toolbar. Selection/UV/semantic highlights must be readable without overpowering skin colors.

## Editor toolbar

Place the primary tool-selection surface horizontally below the document tabs
and above the Canvas. Group selection/transform, painting, adjustment, and
view/navigation controls with subtle separators, consistent icon targets,
clear active state, shortcut tooltips, and a compact active-tool context readout.
Do not duplicate the full tool list in the left workspace.

## Color Workspace — primary artist surface

Color is first-class. The left column intentionally gives Color Workspace substantial vertical space. The manual color foundation already exists; Roadmap 4 restyles/recomposes it, not rewrites its engine.

Preferred hierarchy:

```text
PRIMARY / SECONDARY
↓
HUE RING + INNER TRIANGLE
↓
ALPHA
↓
EXACT VALUES
↓
RECENT
↓
MANUAL PALETTE
```

### Primary / Secondary

High visual importance. Both always visible in compact state. Active slot obvious without color-only indication. Swap/reset compact. Exact value available. No oversized cards.

### Picker

Use a generous circular hue ring with an inner triangular saturation/value
picker. It is the central visual instrument in the Color Studio. Hue, RGB,
HSV, HEX, and alpha controls remain exact editing representations of the
canonical RGBA bytes; the picker must not change those semantics.

### Exact values

RGB/HSV/HEX/Alpha should read like a precision instrument, not a settings form. Use aligned compact fields. HEX and exact alpha are easy to locate.

### Recent swatches

Intentionally large: ~30 px. Prefer fewer columns over tiny swatches.

### Manual palette swatches

Intentionally large: 38–40 px.

Responsive rule: reduce column count before reducing swatch size.

Selected state must not cover/contaminate the color. Alpha uses checkerboard. Do not keep permanent P/S/up/down/delete button stacks under every swatch if the same existing actions can be presented through selection/hover/context UI. The color itself is the main object.

Roadmap 4 does not implement semantic palettes, ramps, palette-to-skin mapping, or AI, but must not visually paint future grouped palettes into a corner.

## Library

Library is secondary. Normal state is compact, roughly:

```text
LIBRARY        count
[thumbnail] active-skin.png
```

Expanded state may expose search, collections, recent files, actions. It must not dominate left column during painting.

## Active Tool Options

Tool options are contextual. Tool selection remains in the horizontal Editor
toolbar, while the left side shows only relevant active-tool options. Avoid
duplicate tool lists. Use compact rows and aligned fields.

## Right inspector

The right side should feel like one inspector system, not debug panels. Primary families: Layers/Parts, Tool Options where relevant, History, 3D Viewport. Use tabs/segmented sections where they reduce clutter. Avoid repeated micro-buttons like Sel/Iso in every row if a clearer row-state/action model preserves the same behavior.

## 3D Viewport

3D is an integrated working viewport, closer to Blender/Substance than an image preview. Use dark neutral viewport, compact overlay controls, integrated model selector, reset/outer/isolate/view actions in viewport chrome. Do not change Three.js semantics unless required for presentation.

## History

Compact/scannable rows, clear current state, saved checkpoint if already supported, restrained metadata. Not a generic table.

## Document tabs

Clearly expose active, dirty, close, hover, focus. Compact. Avoid browser-tab imitation.

## Status bar

Compact aligned low-noise technical values: 64×64, zoom, X/Y, semantic target, RGBA/HEX, model. Do not overload.

## Empty states

Concise/tool-like, e.g. `No skin open — Open PNG Ctrl+O`. No marketing cards/illustrations.

## Responsive behavior

Desktop-only. As space decreases: preserve Canvas usability, reduce secondary panel space, use existing collapse behavior, intentionally reflow compact controls, reduce palette columns before swatch size, avoid microscopic UI. No mobile layouts.

## Accessibility

Maintain semantic labels, visible focus, keyboard access, non-color-only selected states, readable contrast, sufficient targets. Accessibility should not make UI bulky.

## Performance

Roadmap 4 is visual, not architectural churn. Do not introduce per-texel React rerenders, continuous animation loops, expensive blur/glass, huge DOM semantic grids, gratuitous Three rebuilds. Avoid backdrop blur/glassmorphism.

## Explicit anti-patterns

Do not use:

- glassmorphism;
- glossy gradients;
- neon cyberpunk decoration;
- Minecraft block textures in shell chrome;
- giant rounded cards;
- SaaS dashboard layouts;
- excessive shadows;
- colorful icons everywhere;
- decorative animation;
- arbitrary nested containers;
- tiny palette chips;
- 8–9 px core UI text;
- broad visual changes that alter product behavior.

## Roadmap 4 boundary

Roadmap 4 changes visual language, hierarchy, spacing, typography, component design, presentation, and existing interaction ergonomics.

It does not add new product capability.

Explicitly deferred:

- AI;
- palette generation / AI stylist;
- semantic palettes;
- ramps;
- palette-to-skin mapping;
- browser / NameMC;
- community/social;
- cloud accounts;
- plugins;
- marketplace.

When uncertain, preserve behavior and improve presentation rather than invent functionality.
