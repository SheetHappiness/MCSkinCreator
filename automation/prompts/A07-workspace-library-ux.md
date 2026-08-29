---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A07
title: Workspace / Library UX
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Turn the existing local library and multi-document workspace into a practical artist asset workflow with thumbnails, organization, search, recents, rename, duplicate and Reveal in Explorer.

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
- useful local skin thumbnails;
- folders/collections using the storage model that best matches the existing library;
- local search;
- bounded recent documents;
- safe rename;
- safe duplicate;
- Reveal in Explorer through a narrow Electron API;
- coherent integration with current tabs/multi-document/dirty guards.

Everything remains local-only.

# Architecture constraints

- Audit and extend the Roadmap 2 library instead of replacing it.
- Preserve canonical file/session/document identity and dirty semantics.
- Thumbnails are derived/cacheable state, never document authority.
- Do not expose generic shell or filesystem access to the renderer.
- Avoid a database unless the existing library architecture already justifies one.
- Do not turn the editor into a cloud asset manager or IDE.

# Required steps

1. Audit library storage/indexing, document tabs, drag/drop and current file identity.
2. Add efficient local thumbnails with invalidation when a skin changes.
3. Add lightweight collections/folders; explicitly choose virtual metadata vs filesystem folders and document the semantics.
4. Add case-insensitive search by filename/display name and collection context.
5. Add a bounded recent-document list with de-duplication and graceful missing-file handling.
6. Implement safe atomic Rename with Windows filename validation and active-tab/library updates.
7. Implement Duplicate with new independent file/session/document identity and no shared mutable buffers.
8. Add Reveal in Explorer via intent-specific privileged IPC validated against trusted local state.
9. Refine active-tab, dirty marker, library→document activation and document-close UX without a broad redesign.
10. Keep thumbnail/search paths free of unnecessary repeated decoding/rendering.

# Testing / QA

Cover thumbnail invalidation/cache behavior, search, recents de-dup/missing files, collections persistence, rename success/failure, duplicate identity/ownership, Reveal IPC validation, dirty guard when opening library/recent entries, and multi-document identity.

Manual QA with a realistic set of local skins: browse thumbnails, search, collections, multiple open docs, rename, duplicate, reveal, restart persistence.

# Out of scope

- cloud library;
- login/accounts;
- sharing;
- likes/comments/follows;
- NameMC/browser;
- remote search;
- AI tagging.

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

`Improve local artist library workflow`

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
