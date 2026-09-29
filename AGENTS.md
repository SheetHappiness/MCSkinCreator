# AGENTS.md

## Purpose

This repository contains a desktop Minecraft skin editor intended to become a professional creative tool.

AI coding agents must optimize for:

1. correctness;
2. architectural clarity;
3. deterministic editor behavior;
4. Minecraft format correctness;
5. maintainability;
6. visual coherence;
7. scope discipline.

Do not optimize for maximum feature count.

---

# 1. Current Product Scope

The current implementation target is **v0.1 Core Editor**.

Required workflow:

```text
Open valid 64×64 PNG
        ↓
Edit pixels
        ↓
Preview in 3D
        ↓
Save valid PNG
```

Current scope includes:

- desktop application;
- 64×64 Minecraft skins;
- Classic / Steve model;
- Slim / Alex model;
- base layer;
- outer layer;
- Pencil;
- Eraser;
- Eyedropper;
- Fill;
- Zoom;
- Pan;
- Grid;
- Undo / Redo;
- 3D preview;
- PNG Open;
- Save;
- Save As.

Anything outside this list requires explicit task scope.

---

# 2. Current Technical Baseline

Preferred stack:

```text
Electron
React
TypeScript
Vite
Canvas 2D
Three.js
Zustand
Vitest
Playwright
```

This is the current architectural baseline.

Do not migrate frameworks, rendering technologies, state libraries, build systems, or desktop shells without an explicit task requiring that change.

---

# 3. Scope Discipline

Do not implement speculative roadmap features.

Unless explicitly requested, do not add:

- AI;
- chat;
- procedural palettes;
- palette extraction;
- automatic shading;
- account systems;
- authentication;
- cloud storage;
- social features;
- browser integration;
- NameMC integration;
- plugin systems;
- marketplace infrastructure;
- telemetry;
- analytics;
- direct 3D painting;
- custom model formats;
- mobile support;
- web deployment;
- high-resolution skins.

Roadmap documentation is not implementation authorization.

---

# 4. Preserve Architectural Boundaries

The application should conceptually maintain these boundaries:

```text
Application UI
      │
      ▼
Editor Commands
      │
      ▼
Editor Engine
      │
      ▼
SkinDocument
   ┌──┴──┐
   ▼     ▼
Canvas  Three.js
```

React components must not become the source of truth for pixel data.

Three.js must not become the source of truth for skin data.

Canvas must not become the source of truth for application state.

`SkinDocument` or its equivalent canonical document representation must remain authoritative.

---

# 5. Pixel Engine Rules

Minecraft skin editing is pixel editing.

All source-pixel operations must remain exact.

Never introduce:

- antialiasing;
- interpolation;
- smoothing;
- fractional source pixels;
- implicit scaling of source data;
- lossy image transformations.

Display zoom may scale pixels visually.

Source data remains exactly 64×64.

Canvas rendering must disable image smoothing where required.

---

# 6. React Rules

Do not represent the 64×64 image as thousands of React DOM nodes.

Avoid architectures such as:

```text
4096 <div> pixel elements
```

Use Canvas or direct bitmap rendering.

React is responsible for application UI and orchestration.

The editor engine is responsible for bitmap mutations.

---

# 7. Minecraft UV Correctness

Minecraft UV layout is a product contract.

Do not guess coordinates.

Any implementation involving:

- head;
- torso;
- arms;
- legs;
- left/right variants;
- base layers;
- outer layers;
- Classic arms;
- Slim arms;

must use a centralized, documented UV mapping.

Do not duplicate magic UV coordinates across unrelated files.

Prefer explicit structures such as:

```ts
minecraftUv.head.front
minecraftUv.rightArm.base.front
minecraftUv.leftLeg.outer.back
```

or an equivalent typed representation.

Changes to UV mappings require dedicated tests.

---

# 8. 3D Preview Rules

The 3D model must faithfully represent Minecraft skin geometry.

Requirements:

- correct Classic arm width;
- correct Slim arm width;
- correct UV coordinates;
- correct left/right limb mapping;
- correct base layer;
- correct outer layer;
- nearest-neighbor texture sampling;
- immediate refresh from canonical skin state.

Do not compensate for incorrect UV mapping with ad hoc texture transformations.

Fix the mapping instead.

---

# 9. Single Source of Truth

The 2D editor and 3D preview must observe the same underlying document.

Avoid:

```text
2D skin copy
3D skin copy
save skin copy
```

Preferred:

```text
              SkinDocument
             /     |      \
           2D      3D     Save
```

Derived rendering state is acceptable.

Independent editable document copies are not.

---

# 10. Undo / Redo Contract

Undo/Redo must be deterministic.

A logical user action should map to a logical history operation.

For painting:

```text
pointer down
     ↓
multiple changed pixels
     ↓
pointer up
     ↓
one history record
```

Do not create one Undo entry for every pointer-move event or every painted pixel.

Any operation added to the editor must define:

- what constitutes one transaction;
- what state is captured;
- how Undo restores it;
- how Redo reapplies it.

Undo must restore exact previous pixel values.

---

# 11. Command-Oriented Editing

Prefer explicit editor operations over arbitrary state mutation.

Examples:

```text
PaintStroke
EraseStroke
FillRegion
ReplaceColor
MirrorRegion
```

A UI component should request an operation.

It should not contain hidden editing logic that bypasses the engine.

This boundary is important for:

- Undo/Redo;
- testing;
- future scripting;
- future AI-assisted editing;
- reproducibility.

---

# 12. File Integrity

Opening a PNG must validate relevant assumptions.

At minimum v0.1 should distinguish:

- valid 64×64 skin;
- unsupported dimensions;
- unreadable/corrupt image.

Saving must preserve a valid 64×64 PNG.

Do not silently resize unsupported files into compliance.

Do not alter unrelated transparent pixels unless the editing operation requires it.

---

# 13. Unsaved State

Document dirty state must be reliable.

A mutation that changes skin data should mark the document dirty.

Saving successfully should clear dirty state.

Undoing back to the saved state should ideally allow dirty state to resolve correctly if the architecture supports it.

Avoid modal noise.

Use desktop-standard behavior.

Open, window close, and application quit are destructive lifecycle actions.
When the active document is dirty, they must use one serialized
`Save / Don't Save / Cancel` decision:

- Save persists the current path, or uses Save As when no path exists, before
  resuming the original action;
- Don't Save resumes without persistence;
- Cancel, a canceled Save As, or any save failure aborts the original action.

The renderer-side document-session controller remains the lifecycle authority
because it owns dirty state and persistence. The Electron main process may gate
native close and quit, but it must not race the renderer or clear the session
before renderer approval. Repeated close requests must not create duplicate
confirmation loops.

---

# 14. UI Design Contract

This is a professional creative application.

Do not default to:

- generic dashboard design;
- large SaaS cards;
- oversized buttons;
- playful Minecraft theming;
- large gradients;
- excessive borders;
- excessive shadows;
- nested rounded rectangles;
- decorative animations.

Prefer:

- compact controls;
- restrained typography;
- neutral editor surfaces;
- subtle separators;
- consistent spacing;
- clear tool hierarchy;
- high information density;
- contextual controls;
- artwork-first visual hierarchy.

---

# 15. Layout Principles

Use a small number of surface levels.

Preferred conceptual hierarchy:

```text
Workspace
Panel
Floating Surface
```

Avoid unnecessary:

```text
Panel
  Card
    Card
      Container
```

Use spacing and typography before adding another container.

---

# 16. Performance Expectations

A 64×64 editor has extremely small source data.

Basic editing interactions should feel effectively immediate.

Do not introduce heavy abstractions that make:

- painting;
- erasing;
- panning;
- zooming;
- preview updates;

visibly lag.

Performance problems at this scale are usually architectural bugs, not hardware limitations.

---

# 17. Pointer Interaction

Painting must behave predictably across continuous pointer movement.

Consider:

- pointer capture;
- interpolation between pointer positions when needed to avoid gaps in strokes;
- integer texture coordinates;
- leaving and re-entering canvas;
- pointer cancellation;
- mouse buttons;
- drag state cleanup.

Interpolation here means filling missed discrete texture coordinates along a stroke.

It does **not** mean antialiasing or fractional pixel color blending.

---

# 18. Zoom

Zoom must preserve pixel clarity.

Preferred behavior:

- image smoothing disabled;
- stable focal point;
- predictable wheel behavior;
- sensible min/max zoom;
- no accidental browser-page zoom inside the editor.

At high zoom, individual texture pixels must remain sharply distinguishable.

---

# 19. Tool Behavior

Every tool should have a precise behavioral contract.

Example Pencil:

```text
Input:
pointer coordinates
selected color

Behavior:
maps pointer to one integer texture coordinate
writes exact selected RGBA value
```

Example Eyedropper:

```text
Input:
texture coordinate

Behavior:
reads exact source pixel value
updates selected color
does not modify document
```

Do not rely on ambiguous emergent behavior from Canvas APIs.

---

# 20. State Management

Use Zustand for editor/application state when appropriate.

Do not push every high-frequency pixel mutation through React rendering.

Separate:

```text
high-frequency bitmap state
```

from:

```text
application/UI state
```

Prevent needless whole-application rerenders during painting.

---

# 21. TypeScript

Prefer explicit domain types.

Examples:

```ts
type SkinModel = "classic" | "slim";
type SkinLayer = "base" | "outer";
```

Prefer typed coordinate/region structures over loosely shaped objects.

Avoid `any` unless interacting with an unavoidable external boundary.

Do not suppress type errors to complete a task faster.

---

# 22. Testing Requirements

Core deterministic logic requires tests.

High-priority test areas:

- pixel writes;
- erase behavior;
- fill;
- coordinate conversion;
- zoom coordinate mapping;
- UV definitions;
- Classic/Slim mappings;
- layer mapping;
- Undo;
- Redo;
- import validation;
- export integrity.

UI tests should target meaningful workflows rather than cosmetic DOM details.

---

# 23. Regression Testing

When fixing a bug:

1. reproduce it;
2. add a regression test where practical;
3. fix the underlying cause;
4. verify the related subsystem.

Do not patch symptoms with unexplained offsets or conditions.

---

# 24. Validation Before Completion

Before reporting a coding task complete, run the relevant available validation.

Expected categories:

```text
TypeScript/typecheck
unit tests
lint
build
relevant E2E tests
```

Use the repository's actual scripts once they exist.

Do not invent successful validation.

If a validation command cannot run, report exactly why.

---

# 25. Documentation Is a Contract

README.md describes product direction.

AGENTS.md describes engineering constraints.

When implementation intentionally changes a documented contract, update documentation in the same task where appropriate.

Do not silently diverge from the documentation.

Do not rewrite large documentation sections merely for style during unrelated implementation tasks.

---

# 26. Avoid Premature Generalization

Do not build elaborate abstractions for hypothetical future requirements.

Examples:

Do not create:

```text
GenericCreativeDocumentEngine<T>
UniversalPluginRuntime
CloudDocumentProvider
AIActionBus
```

for v0.1.

Implement the smallest architecture that cleanly supports the current editor.

Generalize when multiple real use cases justify it.

---

# 27. Dependencies

Before adding a dependency:

- determine whether the platform or existing stack already solves the problem;
- prefer mature, actively maintained packages;
- avoid adding large libraries for trivial utilities;
- document meaningful architectural dependencies.

Do not replace working libraries casually.

---

# 28. Electron Security

The current v0.1 does not require remote web content.

Do not add remote page loading without explicit scope.

If browser functionality is implemented later:

- remote content is untrusted;
- Node integration must remain disabled;
- context isolation must remain enabled;
- sandbox remote content;
- expose minimal IPC;
- validate IPC payloads;
- restrict navigation;
- restrict window creation;
- explicitly handle permissions.

Never expose unrestricted filesystem or shell access to remote content.

---

# 29. Future AI Boundary

AI is out of scope for v0.1.

The architecture should nevertheless avoid making future AI unsafe or nondeterministic.

Preferred future pattern:

```text
AI
 ↓
structured validated editor command
 ↓
deterministic engine
```

Avoid future patterns where an LLM directly owns application state.

---

# 30. Future Browser Boundary

The planned browser is not part of v0.1.

Do not preload Chromium features, browser state management, or social infrastructure prematurely.

The current Electron choice already preserves this future option.

That is sufficient.

---

# 31. Git Workflow

Keep implementation work isolated and reviewable.

Preferred behavior:

- use a dedicated branch/worktree for substantial tasks;
- make focused changes;
- avoid unrelated refactors;
- keep commits coherent;
- do not modify unrelated untracked files;
- do not rewrite unrelated history;
- leave the working tree in a clear state.

One task should not quietly become five architectural migrations.

---

# 32. Commit Discipline

A good implementation commit should represent one coherent unit.

Examples:

```text
Implement canonical SkinDocument pixel buffer
```

```text
Add Classic and Slim UV mapping
```

```text
Implement transactional paint history
```

Avoid commits equivalent to:

```text
misc fixes
```

when the work can be described precisely.

---

# 33. Existing Code Takes Precedence

Before introducing a new pattern:

- inspect the existing implementation;
- understand current conventions;
- reuse established abstractions when sound.

Do not create parallel architectures because the agent failed to inspect the repository.

---

# 34. Refactoring

Refactor when it materially improves the task.

Do not perform broad aesthetic refactors while implementing unrelated functionality.

If a larger architectural defect blocks correct implementation, explain it and keep the correction proportional.

---

# 35. Error Handling

Errors shown to users should be:

- actionable;
- concise;
- specific.

Prefer:

```text
This file is 128×128.
v0.1 currently supports 64×64 Minecraft skins only.
```

over:

```text
Invalid image.
```

Internal failures may include additional diagnostic context.

---

# 36. Accessibility

Professional density is not permission to make the UI inaccessible.

Where practical:

- keyboard accessibility;
- visible focus state;
- tooltips;
- semantic controls;
- sufficient text contrast;
- non-color-only state indicators.

Do not sacrifice usability for visual minimalism.

---

# 37. Completion Report

When completing an implementation task, report:

### Implemented

What changed.

### Architecture

Any meaningful architectural decisions.

### Validation

Exact tests/build/typecheck/lint commands run and their results.

### Files

Important files changed.

### Remaining

Known limitations or explicitly deferred scope.

### Commit

Commit SHA when a commit was requested or created.

Keep the report factual.

Do not claim production readiness unless the validation supports it.

---

# 38. Prime Directive

When uncertain between:

```text
more features
```

and

```text
a smaller, cleaner, more predictable editor
```

choose the second.

The initial product succeeds when a user can open a Minecraft skin, edit it with confidence, understand the result in 3D, and save it without the software getting in the way.

# Agent Orchestration

For a task involving multiple agents, the root orchestrator must load
`.agents/skills/mcskincreator-luna-orchestration/SKILL.md`. This is the single
project-local topology and contract policy; keep product and engineering rules
in this file rather than duplicating them in the Skill, `docs/`, or `automation/`.
