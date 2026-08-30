---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V04
title: Right Inspector + 3D
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Transform the right side into a coherent professional inspector and integrated 3D viewport while preserving existing Layers/Parts/Tool Options/History/3D behavior.

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

Restyle/recompose Layers/Parts controls, Tool Options surfaces where present, History, semantic target controls, 3D viewport chrome, Classic/Slim, Outer/Base/isolate/view controls, and highlight/isolation presentation. No new structural editing behavior.

# Architecture / design constraints

Right side scans as one inspector. Reduce repeated micro-buttons when same existing actions can be represented via row states/contextual actions. Do not remove capability. 3D feels like a working viewport, not image preview. Keep rendering/input exact. Viewport actions live in compact overlay/header chrome. No new Three render features unless purely presentation-related.

# Required steps

1. Audit Parts/Layers/Tool/History/3D grouping. 2. Normalize inspector tabs/section controls using V01. 3. Restyle body-part rows for visibility/selection/isolate clarity. 4. Reduce repetitive row chrome without hiding actions. 5. Restyle History current/saved states. 6. Reframe 3D as integrated viewport. 7. Integrate model/view/outer/isolate/reset controls. 8. Normalize semantic hover/highlight. 9. Verify direct 3D paint/orbit/picking/isolate/outer unchanged.

# Testing and manual QA

Manual QA: Classic/Slim, Base/Outer/All, all body parts, visibility/isolate, History navigation, semantic hover, direct 3D paint, orbit, reset, right vertical resize, min/large window. Preserve behavior tests.

# Out of scope for this task

Pose editor; animation; new 3D materials; new body-part operations; new History features; new tool options.

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

Suggested commit message: `Redesign Technical Studio inspector and 3D viewport`

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
