---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A06
title: 2D ↔ 3D Intelligence
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Link the 2D canvas and 3D model as coordinated semantic views: hover correspondence, click-to-focus, isolation, and shared body-part/layer/face targeting.

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
- one shared semantic target model;
- 2D hover → subtle 3D highlight;
- 3D hover → corresponding 2D UV highlight;
- deliberate 3D click/inspect action → 2D focus;
- linked body-part semantic selection;
- view-only isolate/ghost behavior.

Preserve direct 3D painting and orbit input without ambiguity.

# Architecture constraints

- Exchange semantic `bodyPart/layer/face` targets, not renderer-specific coordinates.
- Canvas must not import Three.js; Three renderer must not depend on React editor internals.
- Highlight/isolation state is view state only: no pixel mutation, dirty state, or history.
- Use existing Roadmap 2 3D picking and A5 semantic queries.
- Hidden outer geometry should not unexpectedly intercept 3D hover/picking.

# Required steps

1. Consolidate a shared typed semantic target if one does not already exist.
2. Implement 2D→3D hover highlighting without modifying the skin texture.
3. Implement 3D→2D UV highlighting with seam-stable cleanup.
4. Define unambiguous input arbitration for inspect/focus versus direct 3D paint versus orbit, using a modifier/mode if needed.
5. Link existing parts/layers UI semantic selection to both views.
6. Implement view-only Isolate for a body part; de-emphasize or focus unrelated regions coherently.
7. Ensure blur, document switch, model switch, outer visibility changes, and pointer cancellation clear stale highlight/isolation state.

# Testing / QA

Cover 2D texel→semantic target→3D descriptor, 3D hit→semantic target→UV region, Classic/Slim, left/right, base/outer, hidden outer picking, hover cleanup, isolate, no dirty/history changes, click-to-focus viewport result, and no conflict with direct 3D paint/orbit.

E2E/manual QA: hover both directions, seams, click focus, isolate, outer toggle, Classic/Slim, direct 3D painting and orbit.

# Out of scope

- direct mesh editing;
- arbitrary 3D selections;
- pose editor/animation;
- AI semantic commands.

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

`Link 2D and 3D artist workflows`

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
