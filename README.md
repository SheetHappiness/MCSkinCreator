# Minecraft Skin Editor

> Working title. Product name is intentionally not fixed yet.

A desktop-first Minecraft skin creation environment designed as a **professional creative tool**, not as a simplified game-themed skin editor.

The long-term goal is to provide artists with a precise, visually refined workspace for creating, editing, analyzing, and eventually sharing Minecraft skins.

The first version is intentionally narrow:

**open a valid 64×64 Minecraft skin, edit it pixel by pixel, preview it correctly in 3D, and save it.**

Everything else comes later.

---

## Product Direction

The application should feel closer to a focused creative workstation than to a typical Minecraft utility.

Reference categories include:

- Figma
- Affinity
- Photoshop
- Substance Painter
- Blender
- DaVinci Resolve

These are references for interaction discipline, density, hierarchy, and workflow quality — not visual templates to copy.

The editor should avoid:

- game-like decoration;
- oversized cards;
- excessive rounded containers;
- generic SaaS-dashboard layouts;
- Minecraft-green branding as a dominant visual language;
- decorative UI that competes with the artwork;
- beginner-oriented simplification at the expense of precision.

The artwork should remain the most visually prominent element on screen.

---

# v0.1 — Core Editor

## Objective

Deliver a complete vertical slice of the core editing workflow:

```text
Open PNG
   ↓
Validate Minecraft skin
   ↓
Edit pixels
   ↓
Preview changes in 3D
   ↓
Save PNG
```

The first release does not need to be feature-rich.

It needs to be **correct, fast, predictable, and visually coherent**.

---

## Supported Format

Initial support:

- PNG
- exactly 64×64 pixels
- RGBA
- modern Minecraft skin layout
- Classic / Steve model
- Slim / Alex model
- base layer
- outer layer

The implementation contract for modern Java UV regions, model geometry, face
orientation, and Classic/Slim differences is documented in
[`docs/MINECRAFT_SKIN_SPEC.md`](docs/MINECRAFT_SKIN_SPEC.md).

Legacy 64×32 skins are not part of v0.1.

Higher-resolution skins are not part of v0.1.

---

# v0.1 Feature Scope

## Roadmap 1 status

The foundational editor roadmap is complete and includes:

- desktop shell;
- canonical `SkinDocument`;
- PNG open/save with unsaved-change protection;
- pixel-perfect 2D viewport;
- transactional Undo/Redo history;
- Pencil, Eraser, Fill, and Eyedropper;
- canonical Minecraft skin specification;
- live Classic/Slim 3D preview;
- lifecycle, accessibility, and desktop UX hardening.

Broader advanced-artist, palette-intelligence, AI, browser, cloud, and
community features remain intentionally deferred beyond the core editor. The
completed Roadmap 2 slice adds the deterministic artist features that are in
scope for this release:
direct 3D editing, body-part and layer visibility, primary/secondary colors,
advanced color controls, swatches, advanced paint tools, contextual tool
options, history timeline, multi-document local workflows, and pop-out
preview utilities.

Roadmap 3 A06 adds a view-only semantic link between the 2D canvas and 3D
preview: canonical body-part, layer, and face targets can be highlighted from
either surface, Ctrl/Cmd+left-click in 3D focuses the corresponding 2D face,
and visibility isolation keeps the two views coordinated.

Roadmap 3 A08 completes the artist workflow quality pass for the existing
A00–A07 slice: native Edit commands respect text-field focus, New Skin manages
modal keyboard focus, HSV dragging cancels safely on window blur, and saved
PNGs invalidate cached library thumbnails. No Roadmap 4 scope is included.

The formal MCSkin3D comparison, compatibility boundary, and explicit
exclusions are recorded in
[`docs/MCSKIN3D_PARITY.md`](docs/MCSKIN3D_PARITY.md).

## File operations

- New Skin (Classic or Slim, transparent blank 64×64)
- Open PNG
- Drag-and-drop PNG open
- Validate dimensions and format
- Save
- Save As
- Multiple open document tabs with independent history
- Save All across dirty tabs
- Offline local skin library: cached thumbnails, local search, virtual
  collections, bounded recents, list, open, rename, duplicate, delete, reveal,
  and copy the active document
- Pop Out a read-only 3D preview bound to the current document
- Snapshot the current 3D preview to PNG
- Ctrl+N for New Skin
- Track unsaved changes
- Warn before destructive close when appropriate

New and drag-and-drop workflows are documented in
[`docs/NEW_SKIN_AND_DROP.md`](docs/NEW_SKIN_AND_DROP.md).
Multi-document and local-library behavior is documented in
[`docs/LOCAL_LIBRARY_MULTI_DOCUMENT.md`](docs/LOCAL_LIBRARY_MULTI_DOCUMENT.md).
Pop-out binding and snapshot export are documented in
[`docs/POPOUT_PREVIEW_SNAPSHOT.md`](docs/POPOUT_PREVIEW_SNAPSHOT.md).

Example unsaved-state treatment:

```text
skin.png •
```

Avoid unnecessary save confirmation dialogs.

---

## 2D Editor

Required tools:

- Rectangular Selection
- Pencil
- Eraser
- Eyedropper
- Fill

Required navigation:

- Zoom
- Pan
- Pixel grid
- cursor coordinates

Required editing behavior:

- pixel-perfect output;
- no antialiasing;
- no interpolation;
- no accidental subpixel painting;
- deterministic tool behavior;
- immediate visual response.

Rectangular selection uses integer texture coordinates and half-open bounds.
Copy and cut preserve exact RGBA bytes, including transparent texels. Cut and
Delete clear to transparent black in one history transaction. Paste and move
use a floating selection that previews clipped placement before an explicit
commit; Escape cancels it without changing the document.

Selection transforms add exact horizontal and vertical flips plus Duplicate as
a movable floating copy. The contextual Selection menu also provides explicit
character-relative Right Arm ↔ Left Arm and Right Leg ↔ Left Leg transfers for
either Base only or Outer only, using the current Classic or Slim UV mapping;
the other layer is never changed implicitly. `Ctrl+D` starts Duplicate.

A Minecraft texture pixel must remain a discrete source pixel regardless of display zoom.

Example:

```text
1 texture pixel
      ↓
16 × 16 display pixels
```

Canvas rendering must disable image smoothing.

---

## Layers

The editor must understand Minecraft skin structure rather than treating the PNG as an arbitrary bitmap.

At minimum:

- Base layer
- Outer layer

The UI must allow users to:

- view both;
- hide either;
- edit them intentionally;
- understand which layer is active.

The current editor provides body-part visibility and isolation. The 2D canvas
also exposes a view-only UV-aware workflow: optional canonical face boundaries,
semantic hover identification, focus views for the whole texture and body
parts, and linked semantic selection. A semantic target is always a canonical
body-part/layer/face tuple; it is a view-only coordination state and does not
replace rectangular pixel selection. Paired-limb transfer uses the canonical
UV specification without turning the canvas into a structural editing
selector.

---

# 3D Preview

The 3D preview is a core editing surface, not decoration.

v0.1 requirements:

- correct Minecraft body geometry;
- Classic / Steve arms;
- Slim / Alex arms;
- correct UV mapping;
- base skin;
- outer layer;
- nearest-neighbor texture rendering;
- camera rotation;
- zoom;
- real-time texture updates after editing;
- linked semantic hover and selection with the 2D canvas;
- Ctrl/Cmd+left-click inspect/focus without changing pixels;
- Pop Out and Snapshot utilities.

The 2D editor and 3D preview must use the same underlying document state.

Conceptually:

```text
               SkinDocument
                    │
        ┌───────────┴───────────┐
        ↓                       ↓
   2D Canvas                 3D Preview
        │                       │
   editing view            Three.js model
```

There must not be independent duplicated copies of the skin state.

---

# Current Technical Baseline

The stack is intentionally documented as a **current baseline**, not an irreversible decision.

## Desktop

**Electron**

Reasons:

- desktop-only product;
- mature filesystem and window integration;
- strong support for custom desktop UI;
- Chromium included with the application;
- future embedded browser functionality is a planned product direction;
- Electron `WebContentsView` provides a natural path for controlled external web content.

The increased application size and memory footprint are acceptable if they provide meaningful product capability.

---

## Frontend

**React + TypeScript + Vite**

Responsibilities:

- application shell;
- panels;
- toolbars;
- menus;
- properties;
- palette UI;
- workspace UI;
- application state presentation.

React must not be used to represent individual texture pixels as DOM nodes.

---

## 2D Rendering

**Canvas 2D**

The canonical skin representation should use a raw pixel buffer or equivalent deterministic bitmap representation.

Example conceptual model:

```ts
interface SkinDocument {
  width: 64;
  height: 64;
  pixels: Uint8ClampedArray;
}
```

Pixel operations belong in an editor engine, not inside React components.

Examples:

```text
setPixel
erasePixel
fillRegion
replaceColor
mirrorRegion
applyEdit
```

React renders application UI.

Canvas renders pixels.

---

## 3D Rendering

**Three.js**

Responsibilities:

- Minecraft body geometry;
- UV mapping;
- base texture;
- outer-layer meshes;
- Classic / Slim body models;
- camera interaction;
- real-time texture preview.

Texture filtering must preserve pixel art.

Use nearest-neighbor filtering.

---

## State Management

**Zustand**

Appropriate for application-level editor state such as:

- active tool;
- active layer;
- selected color;
- active body region;
- zoom;
- visibility options;
- workspace state;
- editor preferences.

The raw pixel buffer should not be naively copied through global React state on every pointer movement.

---

## Color Processing

Initial v0.1 only needs reliable color selection.

A dedicated color engine is planned for later versions.

Preferred color model for future procedural palette operations:

**OKLCH**

Potential operations:

- generate ramp;
- warmer;
- cooler;
- increase contrast;
- decrease contrast;
- saturation adjustment;
- perceptual lightness adjustment;
- hue shifting between highlights and shadows.

---

## Persistence

Initial application:

- local filesystem for PNG;
- local settings/preferences;
- no account required;
- no cloud dependency.

The editor should remain fully usable offline.

The resizable artist workspace stores validated local panel preferences and
derives clamped effective sizes for temporarily smaller windows. Its defaults,
collapse behavior, and view-state boundary are documented in
[`docs/WORKSPACE_LAYOUT.md`](docs/WORKSPACE_LAYOUT.md).

---

## Testing

Baseline:

- Vitest for unit and engine tests;
- Playwright for high-value application workflows.

Pixel-engine and Minecraft-format correctness require deterministic automated tests.

---

# Architecture

Recommended separation:

```text
src/
├── app/
│   ├── shell/
│   ├── commands/
│   └── menus/
│
├── components/
│
├── features/
│   ├── editor/
│   ├── preview/
│   ├── layers/
│   ├── history/
│   └── file-management/
│
├── engine/
│   ├── document/
│   ├── pixels/
│   ├── minecraft-uv/
│   ├── tools/
│   ├── selection/
│   └── commands/
│
├── renderers/
│   ├── canvas2d/
│   └── three/
│
├── stores/
│
└── design/
    ├── tokens/
    ├── typography/
    ├── surfaces/
    └── components/
```

Exact structure may evolve.

The architectural boundaries matter more than the folder names.

---

# Editor Engine

The editor engine must remain deterministic.

Natural-language AI, future generators, and UI components must not directly mutate arbitrary PNG state.

All meaningful edits should eventually be expressible as explicit editor operations.

Example future model:

```text
User intent
    ↓
structured operation
    ↓
Editor Engine
    ↓
SkinDocument
```

This architecture allows:

- reliable Undo;
- automated testing;
- validation;
- reproducibility;
- future AI assistance without sacrificing correctness.

---

# Undo / Redo

Undo/Redo is foundational infrastructure.

A complete pointer stroke should normally correspond to one history operation.

Example:

```text
pointer down
    ↓
37 pixel mutations
    ↓
pointer up
    ↓
1 Undo entry
```

Do not create one history entry per pixel.

Long-term, operations should fit a command-style architecture such as:

```text
PaintStroke
EraseStroke
FillRegion
ReplaceColor
MirrorRegion
ApplyPalette
```

Every reversible editor operation must have well-defined undo semantics.

---

# UI / UX Principles

## 1. Professional creative-tool density

Prefer compact, information-dense controls over oversized touch-oriented UI.

Desktop is the primary and only target.

---

## 2. Neutral workspace

The application chrome should generally remain visually neutral so that skin colors dominate perception.

Avoid strong permanent brand colors across large editor surfaces.

Accent color may eventually be configurable.

---

## 3. Minimal container nesting

Prefer:

```text
Workspace
Panel
Floating Surface
```

Avoid:

```text
Panel
  Card
    Card
      Container
        Button container
```

Hierarchy should primarily come from:

- spacing;
- typography;
- alignment;
- contrast;
- separators;
- surface elevation;
- scale.

---

## 4. Contextual controls

Do not display every possible property simultaneously.

Example:

When Pencil is active:

```text
Size
Opacity
Symmetry
```

When Fill is active:

```text
Tolerance
Contiguous
```

Later, when Palette editing is active:

```text
Ramp
Contrast
Hue Shift
Temperature
```

---

## 5. Keyboard-first capability

Professional users should be able to build muscle memory.

Tools should eventually support shortcuts.

Example:

```text
P  Pencil
E  Eraser
I  Eyedropper
G  Fill
```

Exact bindings are not yet contractual.

---

## 6. Precision over animation

Micro-interactions should improve comprehension.

Animation must never delay painting, navigation, selection, or file operations.

---

## 7. Predictability

Professional feel depends heavily on behavioral consistency.

Examples:

- zoom remains centered where expected;
- pan never fights the cursor;
- pixels never blur;
- tools never produce unintended interpolation;
- Undo always restores exactly the previous state;
- panels retain useful layout state;
- Save behaves consistently.

---

# Preliminary Workspace Concept

A possible default layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ File  Edit  Skin  Select  View                     skin.png  │
├──────┬────────────────────────────────────┬───────────────────┤
│      │                                    │  3D PREVIEW       │
│  P   │                                    │                   │
│  E   │                                    │                   │
│  G   │             CANVAS                 │                   │
│  I   │                                    │                   │
│      │                                    ├───────────────────┤
│      │                                    │  PROPERTIES       │
│      │                                    │                   │
│      │                                    ├───────────────────┤
│      │                                    │  COLORS           │
│      │                                    │                   │
├──────┴────────────────────────────────────┴───────────────────┤
│ Alex │ Base + Outer │ Grid │ 1600% │ X:34 Y:17 │ 64×64     │
└───────────────────────────────────────────────────────────────┘
```

This is a structural reference, not a final visual design.

---

# Initial v0.1 Non-Goals

This section records the original narrow v0.1 boundary. Roadmap 2 later
implemented direct 3D painting and advanced deterministic editing while
keeping the following broader product areas out of scope:

- AI generation;
- AI chat;
- automatic shading;
- smart palettes;
- palette extraction;
- reference datasets;
- account system;
- social network;
- comments;
- likes;
- follows;
- online profiles;
- browser;
- NameMC integration;
- cloud sync;
- plugins;
- marketplace;
- animation;
- custom model geometry;
- 128×128 support;
- mobile;
- web version.

These are roadmap items, not hidden MVP requirements.

---

# Future Direction

The long-term product may evolve through several layers.

## Stage 1 — Core Editor

```text
PNG
Pixel editing
Layers
Undo/Redo
3D preview
Save
```

---

## Stage 2 — Further Artist Tools

The defined Roadmap 2 parity slice is complete, and Roadmap 3 A04–A06 adds
live symmetry plus coordinated 2D/3D semantic inspection on top of the
selection and paired-limb work. The ideas below are possible future work
beyond those slices and require separate scope:

- advanced fill;
- replace color;
- palette ramps;
- custom workspaces;
- reference panel;
- richer brush and shape workflows.

The implemented semantic workflow includes:

```text
hover 3D arm
      ↓
highlight corresponding UV region
```

or:

```text
select head in 3D
      ↓
focus head region in 2D
```

---

## Stage 3 — Palette Intelligence

Potential palette model:

```text
Hair
● Highlight
● Light
● Base
● Shadow
● Deep

Skin
● Highlight
● Light
● Base
● Shadow
● Deep
```

Potential operations:

- Generate Ramp
- Warmer
- Cooler
- More Contrast
- Less Contrast
- Muted
- Saturated
- Preserve Base
- Lock Shade

Color relationships should be generated algorithmically and validated perceptually where possible.

---

## Stage 4 — AI-Assisted Editing

AI should primarily interpret intent.

Example:

```text
"Make the hair slightly cooler
and reduce saturation without
changing its shading structure."
```

becomes:

```text
Natural language
      ↓
AI interpretation
      ↓
validated structured command
      ↓
deterministic color engine
      ↓
reversible editor operation
```

The model should not arbitrarily regenerate the complete PNG when a deterministic edit is possible.

---

## Stage 5 — Reference Intelligence

A curated skin dataset may eventually support:

- palette extraction;
- color-ramp analysis;
- similarity search;
- style references;
- shading references;
- structural examples.

A future reference library may contain hundreds or thousands of carefully selected skins.

The application should retrieve relevant examples rather than repeatedly process the entire collection for each operation.

---

## Stage 6 — Library

Potential sections:

```text
My Skins
Palettes
References
Collections
Downloads
```

---

## Stage 7 — Community

Potential product-native social features:

- profiles;
- published skins;
- following;
- likes;
- comments;
- collections;
- discovery;
- remix workflows.

This should be implemented as part of the application UI rather than as an arbitrary website rendered inside the browser.

---

## Stage 8 — Embedded Browser

A future embedded browser may support resources such as:

- NameMC;
- Minecraft Wiki;
- Planet Minecraft;
- other relevant skin/community resources.

Electron `WebContentsView` is the preferred direction if the current stack remains.

Potential workflows:

```text
Browse NameMC
      ↓
find skin
      ↓
download PNG
      ↓
Open in Editor
```

Future integrations may offer explicit actions such as:

```text
Open in Editor
Save as Reference
Extract Palette
Compare with Current Skin
```

External web content must remain isolated from privileged application functionality.

---

# Security Direction

Remote web content must always be considered untrusted.

Future browser functionality must use strict isolation.

Principles:

- no Node.js integration for remote pages;
- context isolation;
- sandboxing;
- explicit permission handling;
- controlled navigation;
- controlled new-window behavior;
- strict IPC contracts;
- no arbitrary exposure of filesystem APIs.

The editor and the embedded internet must remain separate privilege domains.

---

# Product Quality Standard

A feature is not complete merely because it visibly works.

For core editing behavior, completion means:

- correct;
- reversible where appropriate;
- tested;
- visually integrated;
- keyboard/mouse behavior is coherent;
- no regression to PNG validity;
- no UV corruption;
- no unexpected interpolation;
- no obvious latency in basic editing;
- documentation updated when contracts change.

The goal is not maximum feature count.

The goal is a small editor that already feels deliberate.
