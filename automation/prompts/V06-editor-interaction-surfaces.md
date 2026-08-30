---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V06
title: Editor Interaction Surfaces
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Normalize visual presentation of existing selection, transforms, symmetry, UV overlays, semantic focus and 2D↔3D correspondence so they are precise, restrained and consistent.

# Required reading

Before changing code, read `README.md`, `AGENTS.md`, `TECHNICAL_STUDIO_DESIGN.md`, `ROADMAP4.md`, and all directly relevant docs/implementation for this task.

Treat the current repository as the source of truth. This task may run in a fresh Codex session; do not depend on prior chats or completion reports.

# Preflight

Before implementation:
- verify branch is exactly `main`;
- record current `HEAD` as baseline;
- verify working tree and index are clean;
- do not create branch/worktree;
- do not stash/reset/clean/restore/rewrite history;
- do not discard unrelated work.

If preflight fails, STOP and report.

# Product boundary

Roadmap 4 is visual-system work. Preserve existing behavior. Do not introduce new product functionality merely because it would make redesign easier.

Explicitly do not implement AI, semantic palettes, ramps, palette generation, palette-to-skin mapping, browser/NameMC, social/community, cloud accounts, plugins, or marketplace.

# Scope

Restyle existing rectangular/floating selection, handles/outline if present, transform affordances/menus, symmetry active states, UV boundaries, body/face hover labels, focus/isolation presentation, 2D↔3D highlights, contextual semantic target UI. No new capability.

# Architecture / design constraints

Never modify canonical pixels for visual state. Overlays legible over light/dark/transparent content. Avoid neon/game-like outlines. Avoid continuous animation unless already justified. Distinguish pixel selection from semantic selection. Use Technical Studio accent/state language. Do not compromise coordinate mapping/pointer behavior.

# Required steps

1. Audit current selection/UV/semantic visuals. 2. Normalize selection/floating styling. 3. Normalize transform/context UI. 4. Normalize symmetry active indicators. 5. Restyle UV boundaries and semantic hover/status. 6. Restyle 2D↔3D highlights. 7. Normalize isolate/focus. 8. Verify alignment under pan/zoom/DPR/model switches. 9. Verify transient states clear on blur/document/tool changes.

# Testing and manual QA

Manual QA: selection over light/dark/checkerboard, move/paste/transforms, symmetry, UV multiple zooms, body focus, 2D→3D and 3D→2D hover, isolate, Classic/Slim, Base/Outer, blur/cancel/document switch. Preserve semantic/coordinate tests.

# Out of scope for this task

New transforms; new symmetry modes; UV editing; semantic commands; AI selections.

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

All existing tests must remain green. If an environment-specific limitation prevents a check, report it precisely; do not claim success without evidence.

# Git contract

Work directly on `main`. After successful validation create one focused commit, do not amend unrelated commits, and verify final working tree/index are clean.

Suggested commit message: `Unify Technical Studio editor interaction visuals`

# STOP conditions

STOP without committing if:
- task requires new product functionality;
- architecture cannot support the visual change without broad unrelated rewrite;
- a durable contract would need to be violated;
- Electron security would need weakening;
- tests/build fail for unexplained reasons;
- repository becomes unexpectedly dirty;
- destructive Git recovery would be required;
- scope would need to expand into another Roadmap 4 stage;
- implementation requires Roadmap 5 / AI functionality.

Do not automatically repair unrelated defects.

# Completion report

Return:
1. baseline SHA;
2. design/architecture decisions;
3. exact visual/ergonomic changes;
4. files changed;
5. tests updated/added;
6. manual QA performed;
7. validation results;
8. final commit SHA;
9. final Git status;
10. known limitations/deferred visual issues;
11. explicit confirmation that no new product functionality was added.
