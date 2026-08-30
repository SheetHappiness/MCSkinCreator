---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V00
title: Design Foundation
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Establish the canonical Technical Studio visual foundation: semantic design tokens, typography, spacing, surface hierarchy, borders/radii, interaction states and icon/control sizing without broadly restyling the entire application yet.

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

Implement a durable visual foundation used by V01–V07: semantic color/surface tokens; text/metadata/accent/semantic-state tokens; spacing scale; typography scale; control-height sizing tokens; border/radius tokens; focus/hover/pressed/selected/disabled state tokens; restrained transition timings; consistent icon sizing rules; scrollbar/splitter base styling where a global primitive already exists.

# Architecture / design constraints

Prefer CSS custom properties / existing style architecture over a new styling framework. Do not introduce Tailwind, MUI, Chakra, Fluent, or another large component system. Do not globally restyle complex surfaces before primitives/tokens are validated. Preserve exact Canvas colors/rendering. Avoid hardcoded color repetition. Keep token vocabulary semantic rather than page-specific. Follow the canonical anti-patterns strictly.

# Required steps

1. Audit current global CSS/theme variables and repeated literals. 2. Define minimum semantic token set. 3. Establish typography and spacing scales. 4. Establish compact/standard control dimensions. 5. Establish border/radius/focus/selection primitives. 6. Establish restrained transitions. 7. Normalize global background/text defaults only where safe. 8. Migrate a small representative set of primitives to prove the foundation; do not prematurely restyle every feature. 9. Document durable token names/purpose where useful.

# Testing and manual QA

Add tests only where the project meaningfully tests style primitives/contracts; avoid brittle pixel snapshots. Manual QA: launch, readability, surface hierarchy, keyboard focus visibility, selected/disabled distinction, no Canvas/pixel color regression, large and minimum windows.

# Out of scope for this task

Broad control rewrite; Color Workspace redesign; right inspector redesign; Library redesign; full icon replacement; layout restructuring; product behavior changes.

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

Suggested commit message: `Establish Technical Studio design foundation`

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
