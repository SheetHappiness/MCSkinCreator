---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A01
title: Professional Color Workspace
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Make color selection a first-class artist workflow: fast primary/secondary control, a compact professional color editor, exact HSV/hex/alpha editing, recents, and refined swatches.

# Context

Roadmap 1 and the MCSkin3D-parity roadmap are already implemented. Treat the current repository as the only source of truth. Read `README.md`, `AGENTS.md`, `automation/ROADMAP3.md` if present, and all directly relevant implementation/docs before changing code.

This task is executed in a fresh Codex session. Do not rely on prior Codex chats or completion reports.

# Preflight

Before implementation:

- verify the current branch is exactly `main`;
- record current `HEAD` as the baseline SHA;
- verify working tree and index are clean;
- do not create a branch or worktree;
- do not stash, reset, clean, restore, rewrite history, or discard unrelated work.

If any preflight condition fails, STOP and report the exact state.

# Scope

Implement/refine:

- clear Primary and Secondary color swatches and active-slot indication;
- deterministic swap/reset behavior where compatible with existing Roadmap 2 contracts;
- compact color popup/inspector;
- HSV controls;
- exact `#RRGGBB` and, if cleanly supported, `#RRGGBBAA`;
- exact alpha `0..255`;
- bounded recent colors;
- improved manual swatches UX.

Preserve existing primary/secondary painting semantics, right/secondary actions, temporary eyedropper behavior, and exact RGBA painting.

# Architecture constraints

- Reuse the existing color store/model; do not create parallel primary/secondary state.
- Canonical paint colors remain exact RGBA.
- HSV/hex are editing representations with deterministic conversion.
- Color UI state, recents, and swatches do not dirty the skin or create document history.
- Keep color shortcuts suppressed while editing text/numeric fields.
- No smart/semantic palette model in this task.

# Required steps

1. Audit current color architecture and Roadmap 2 swatch behavior.
2. Improve Primary/Secondary presentation so both values and the active slot are obvious without relying only on color.
3. Add a compact popup/inspector with a visual picker/wheel or saturation-value area plus exact numeric controls.
4. Implement and test deterministic RGB↔HSV helpers.
5. Implement validated hex editing with invalid-state handling that never corrupts canonical color.
6. Keep alpha exact at `0..255`; avoid lossy percentage round trips.
7. Add a bounded recent-color list with exact RGBA identity and duplicate suppression.
8. Refine add/remove/select/reorder swatch interactions already supported by the project.
9. Normalize focus, keyboard, tool-shortcut and temporary-eyedropper behavior.
10. Keep visual density appropriate for a professional desktop editor.

# Testing / QA

Cover primary/secondary independence, swap/reset if present, RGB↔HSV representative cases, hue wrapping, grayscale, hex parsing/invalid input, alpha preservation, recents bounds/deduplication, exact swatch RGBA, shortcut suppression in inputs, and no dirty/history changes from color UI state.

Manual QA: rapid primary/secondary switching, left/right paint, temporary eyedropper, HSV, hex, alpha, recents, swatches, popup dismissal/focus at small and large windows.

# Out of scope

- OKLCH intelligence;
- semantic Hair/Skin/Shirt palettes;
- generated shade ramps;
- color harmony generation;
- palette extraction from reference skins;
- AI color suggestions;
- selection tools.

# Validation

Run all applicable checks:

```text
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
npm run validate
git diff --check
```

All existing tests must remain green. If a command cannot run for an environment-specific reason, report that precisely; do not claim success.

# Git contract

Work directly on `main`.

After successful validation:

- create one focused commit;
- do not amend unrelated commits;
- verify working tree and index are clean.

Suggested commit message:

`Implement professional color workspace`

# Stop conditions

STOP without committing if:

- the task cannot be completed within its scope;
- a prerequisite architecture is missing or fundamentally inconsistent;
- tests/build fail for an unexplained reason;
- the repository becomes unexpectedly dirty;
- destructive Git recovery would be required;
- Electron security would need to be weakened;
- a durable documented contract would need to be violated;
- completing the task requires a later Roadmap 3 stage or Roadmap 4 functionality;
- scope would need to expand silently.

Do not automatically repair unrelated defects. Do not generate the next roadmap task.

# Deliverables / completion report

Return:

1. baseline SHA;
2. architecture/design decisions;
3. exact behavior implemented;
4. files changed;
5. tests added/updated;
6. manual QA performed where relevant;
7. validation commands/results;
8. final commit SHA;
9. final Git status;
10. known limitations / deferred work;
11. explicit confirmation that no later Roadmap 3 or Roadmap 4 functionality was implemented.
