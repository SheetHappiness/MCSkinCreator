---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V01
title: Core Controls
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Apply the Technical Studio foundation to reusable controls so the application stops looking like browser-form widgets and gains one coherent desktop creative-tool component language.

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

Restyle/refactor existing buttons, icon buttons, text fields, number fields, selects, sliders, segmented controls, tabs, tooltips, popovers, existing check/toggle controls, scrollbars and splitters where component-level. Do not change semantics.

# Architecture / design constraints

Reuse current behavior/accessibility. Consolidate duplicated CSS/component variants where practical, but no framework rewrite. Standardize default/hover/pressed/active/focus-visible/disabled. Use V00 dimensions. Accent primarily signals active/selected/focus. Inputs stay compact/aligned. Sliders precise/readable; Hue/Alpha tracks may retain functional gradients. Tooltips include shortcuts where already available.

# Required steps

1. Inventory control variants. 2. Establish shared button/icon-button variants. 3. Normalize input/select/number chrome. 4. Normalize slider geometry/states. 5. Normalize segmented controls/tabs. 6. Normalize popover/tooltip surface. 7. Normalize focus-visible. 8. Normalize disabled states. 9. Remove redundant nested borders/cards where safe. 10. Verify keyboard/mouse behavior unchanged.

# Testing and manual QA

Preserve behavioral tests. Add focused tests only for regressions from consolidation, especially disabled/pressed/selected/focus/keyboard/text-field shortcut suppression. Manual QA through Color controls, Parts, Tool Options, tabs, Save buttons, splitters.

# Out of scope for this task

Workspace composition; Color Workspace layout; 3D viewport layout; Library behavior; new controls/features/shortcuts.

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

Suggested commit message: `Unify Technical Studio core controls`

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
