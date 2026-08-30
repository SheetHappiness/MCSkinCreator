---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V02
title: Workspace Chrome
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Bring application shell, document chrome, Canvas-adjacent controls, panel headers, splitters and status bar into one restrained Technical Studio composition.

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

Redesign presentation of renderer/app chrome where applicable, document tabs, Canvas toolbar/chrome, vertical tool rail, left/right panel headers, splitters, status bar, and workspace separators. Preserve current left/center/right layout and resize behavior.

# Architecture / design constraints

Canvas remains dominant. Do not turn shell into browser/IDE clone. Tabs compact. Tool rail remains main tool-selection surface near Canvas. Group drawing/selection/navigation tools with subtle separators. Do not duplicate full tool list left. Panel headers compact/hierarchical. Status low-noise. Splitter hit area may exceed visible width.

# Required steps

1. Audit top bar/tab/tool rail/status. 2. Restyle tabs with active/dirty/close/focus. 3. Restyle tool rail with consistent targets/icons/active state. 4. Restyle Canvas toolbar into viewport toolbar. 5. Normalize panel headers/section separators. 6. Restyle splitters. 7. Normalize status typography/alignment. 8. Remove unnecessary boxes/separators. 9. Verify resize/collapse/document lifecycle unchanged.

# Testing and manual QA

Manual QA: multiple tabs, active/inactive/dirty, common zooms, tool rail hover/active/focus, shortcuts/tooltips, left/right resize, collapse, large/1200×760/minimum, status values. Update E2E selectors only if needed; do not weaken assertions.

# Out of scope for this task

Color Workspace redesign; inspector/3D redesign; Library content redesign; new docking; new product behavior.

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

Suggested commit message: `Redesign Technical Studio workspace chrome`

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
