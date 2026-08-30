---
roadmap: 4
roadmap_title: Technical Studio Visual System
task_id: V05
title: Library + Document UX
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna max
---

# Goal

Polish the already-functional compact local library and document presentation so they remain secondary, fast and visually consistent with Technical Studio.

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

Restyle compact Library header/current skin, expanded Library, search/filter, thumbnails/rows, collections, recent documents, rename/duplicate/reveal/delete actions, Add Active, document tab states, Library/empty states. Preserve all existing behavior.

# Architecture / design constraints

Library is secondary and normal state remains compact. Expanded state dense/readable. Thumbnails useful and not drowned in borders. Destructive/secondary actions do not compete with skin. Missing-file state restrained. Preserve dirty guards/session identity/file behavior. No new metadata/capabilities.

# Required steps

1. Audit compact/expanded Library. 2. Restyle active skin summary. 3. Normalize search/filter. 4. Restyle recent/library rows and thumbnails. 5. Normalize missing-file treatment. 6. Restyle collection headers/empty states. 7. Consolidate action presentation without removing actions. 8. Ensure tabs/library activation feel consistent. 9. Verify persistence/lifecycle unchanged.

# Testing and manual QA

Manual QA with multiple skins: collapse/expand, search/filter, recent, missing files, collections, rename/duplicate/reveal/delete, Add Active, multiple documents, dirty markers/guards, restart persistence.

# Out of scope for this task

New collection behavior; tags; favorites; cloud; NameMC; remote search; AI tagging.

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

Suggested commit message: `Polish Technical Studio library and documents`

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
