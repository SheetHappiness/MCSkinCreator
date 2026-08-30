---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A00
title: Resizable Workspace
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Replace the current fixed workspace sizing with a desktop-grade resizable, collapsible, persistent panel layout while preserving the existing editor architecture.

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

Implement:

- draggable splitter between Local Library and the central 2D workspace;
- draggable splitter between the central workspace and the right-side workspace;
- a vertical splitter inside the right workspace where the current controls/history/3D composition naturally supports it;
- collapse/restore for left and right side panels;
- min/max constraints that always leave a usable 2D workspace;
- Reset Layout;
- local persistence of preferred widths/heights/collapsed state;
- safe clamping when the window becomes smaller than persisted preferences.

Panel resizing and collapsing are view state only: they must not dirty `SkinDocument` or create document history.

# Architecture constraints

- Audit the existing CSS/layout and settings persistence first; extend it rather than replacing it blindly.
- Keep workspace layout state separate from document state/history.
- Do not build a generic docking framework.
- Pointer resizing must use capture/cleanup and must not leak into 2D painting, 2D pan, or 3D orbit.
- Persist only validated layout preferences. Persistence failure must not prevent app startup.
- Prefer retaining the user's preferred persisted size while deriving a clamped effective size for a temporarily small window.

# Required steps

1. Audit current fixed widths/heights and resize assumptions.
2. Define a small typed workspace-layout model and documented defaults.
3. Implement horizontal splitters with pointer capture and min/max constraints.
4. Implement the right-side vertical split only where it matches the existing panel structure cleanly.
5. Implement collapse/restore while preserving prior size.
6. Implement Reset Layout.
7. Persist layout locally using the existing preferences/settings seam if available.
8. Ensure stored invalid/stale values are rejected or clamped.
9. Add keyboard-accessible separator semantics where practical.
10. Verify resize/collapse does not disrupt active editor state, 3D resources, library state, or history.

# Testing / QA

Add focused tests for defaults, persistence restore, invalid stored values, min/max clamping, left/right resize, vertical resize if implemented, collapse/restore, reset, window-resize clamping, pointercancel/blur cleanup, and proof that layout operations do not dirty the document.

Manual QA at large desktop size, about `1200×760`, and the current minimum supported size. Resize/collapse/restart/reset all panels.

# Out of scope

- arbitrary docking;
- floating/detachable panels;
- workspace presets;
- custom themes;
- color-workspace redesign;
- selection features;
- UV-aware canvas;
- 2D↔3D semantic linkage.

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

`Implement resizable artist workspace`

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
