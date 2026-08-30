---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V03
title: Color Workspace Redesign
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Turn the completed manual Color Workspace into a visually mature primary artist surface with strong Primary/Secondary hierarchy, a professional precision picker, large readable swatches and a cleaner palette interaction model.

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

Restyle/recompose the existing Color Workspace only. Preserve Primary/Secondary, active-slot semantics, swap/reset, eyedropper, SV picker, Hue/Alpha, RGB/HSV, exact #RRGGBBAA, alpha 0..255, recents exact RGBA/dedupe/limit, manual palette model/groups/persistence/migration, responsive swatches, and no document/history mutation. Hierarchy: Primary/Secondary → SV → Hue/Alpha → exact values → Recent → Manual Palette.

# Architecture / design constraints

Do not rewrite color architecture. Primary/Secondary remain visible compactly and gain more visual importance. Picker gets generous area. Exact fields read like instrument panel. Recent ~30 px, palette ~38–40 px. Reduce columns before swatch size. Keep checkerboard. Do not obscure swatches with icons/text. Remove/replace permanent per-swatch P/S/arrows/delete stacks if equivalent existing actions can move to selection/hover/context UI without adding capabilities. Prefer one coherent Color Workspace scroll, avoid nested scrollbars.

# Required steps

1. Audit current post-foundation Color UI. 2. Recompose Primary/Secondary with clear active slot and compact swap/reset. 3. Restyle picker frame/cursor and Hue/Alpha. 4. Align RGB/HSV/HEX/Alpha into compact precision section. 5. Restyle Recents with large clean swatches. 6. Restyle Manual Palette so colors are primary objects. 7. Move low-frequency palette actions away from permanent button stacks where possible. 8. Normalize spacing/labels/separators/scroll. 9. Verify compact/normal/expanded heights. 10. Verify close shades are easy to inspect.

# Testing and manual QA

Preserve existing Color tests. Add/update only where presentation affects behavior. Manual QA: Primary/Secondary, swap/reset, eyedropper, SV/Hue/Alpha, RGB/HSV/HEX, transparency, recents, palette, narrow/wide panel, compact/expanded workspace, keyboard focus, adjacent browns/pinks.

# Out of scope for this task

Semantic palettes; ramps; palette-to-skin mapping; AI; palette generation; new color engine; unrelated panels.

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

Suggested commit message: `Redesign Technical Studio color workspace`

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
