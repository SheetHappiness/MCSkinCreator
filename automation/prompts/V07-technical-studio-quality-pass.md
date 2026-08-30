---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V07
title: Technical Studio Quality Pass
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Complete Roadmap 4 with a full visual/interaction consistency pass across V00–V06, fix concrete issues, document the finished Technical Studio system, then STOP.

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

Audit/harden design tokens, controls, workspace chrome, Color Workspace, right inspector, 3D viewport, Library/documents, selection/UV/semantic surfaces, responsive desktop behavior, accessibility, density, pointer/focus states, and performance regressions. This is a quality pass, not a feature stage.

# Architecture / design constraints

Fix root system inconsistencies rather than local hacks. Do not add new feature families. Avoid aesthetic refactors that destabilize architecture. Preserve canon. Add regression tests for concrete bugs. Do not chase the known Vite large-chunk warning unless a measured UX/performance issue is attributable to it.

# Required steps

1. Structured visual audit by severity. 2. Eliminate core 8–9 px readability issues. 3. Audit spacing scale. 4. Audit surface/border/card hierarchy. 5. Audit control states/focus. 6. Audit compact Library/tool options/Color Workspace. 7. Audit swatch sizes/picker/scroll. 8. Audit Canvas/tool rail/chrome/status. 9. Audit right inspector/3D. 10. Audit tabs/Library states. 11. Audit selection/UV/semantic highlights. 12. Audit large/1200×760/minimum. 13. Audit pointercancel/blur/focus during splitters/painting/selection/3D. 14. Audit unnecessary rerenders/continuous RAF/expensive effects/listeners/observers. 15. Update durable docs/README with `Roadmap 4 — Technical Studio Visual System complete` if validation passes. 16. STOP; do not start AI/another roadmap.

# Testing and manual QA

Manual matrix: workspace sizes/persistence/collapse; Color full workflow and close shades; Canvas tool/zoom/pan/selection/UV/symmetry/semantic hover; right inspector/History/3D/isolate/model/layers; Library multi-skin/search/missing/collections/tabs/dirty; accessibility keyboard focus/labels/non-color-only states/contrast. Add focused regression tests for bugs found; avoid brittle full-page snapshots unless stable infra exists.

# Out of scope for this task

AI; palette generation; AI stylist; semantic palettes; ramps; palette-to-skin mapping; browser/NameMC; social/community; cloud; plugins/marketplace; any new Roadmap 5 feature.

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

Suggested commit message: `Complete Technical Studio visual system`

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
