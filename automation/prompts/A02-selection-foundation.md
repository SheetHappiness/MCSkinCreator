---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A02
title: Selection Foundation
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Introduce a canonical rectangular pixel-selection workflow with exact move/cut/copy/paste/delete semantics and transactional Undo/Redo.

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

- rectangular selection tool;
- visible selection overlay;
- exact internal RGBA clipboard;
- copy;
- cut;
- paste;
- delete;
- move selected pixels;
- cancel/commit lifecycle;
- Undo/Redo integration.

Selection itself is editor state, not document content.

# Architecture constraints

- Use integer texture coordinates and half-open rectangular bounds.
- Keep selection state renderer-independent and separate from `SkinDocument`.
- Reuse the existing editor transaction/history system for mutations.
- Prefer a floating-selection model for paste/move if it can be implemented coherently.
- Canvas overlay must remain aligned through pan/zoom/DPR and must not mutate source pixels.
- Do not rely solely on the OS clipboard as the canonical internal clipboard.

# Required steps

1. Define typed selection rectangle/state and lifecycle.
2. Add a rectangular selection tool with drag in all directions and safe bounds handling.
3. Render a precise, professional selection outline.
4. Implement an exact internal clipboard preserving width/height/RGBA/transparency.
5. Implement Copy with no mutation/history.
6. Implement Cut as copy + transparent-black source clear in one history transaction.
7. Implement Delete as one transaction.
8. Implement Paste with a coherent placement/move/commit/cancel model.
9. Implement integer Move with exact clipping and rollback on cancel.
10. Add conventional Ctrl+C/X/V and Delete behavior without breaking existing shortcuts.
11. Define cleanup on document replacement, tool change, Undo/Redo, blur, and file lifecycle.

# Testing / QA

Cover rectangle normalization in every drag direction, bounds, first/last texels, exact copy/cut/delete/paste/move RGBA, transparency, clipping, cancel rollback, one operation→one history entry, Undo/Redo, selection state not dirtying document, and document replacement cleanup.

E2E/manual QA: select, copy/paste, cut, delete, move, cancel, Undo/Redo, pan/zoom with selection visible, switch/open document with active transient state.

# Out of scope

- lasso/magic wand;
- feathering;
- scaling/rotation;
- flip/mirror transforms;
- body-aware transfer;
- live symmetry;
- UV-aware selection.

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

`Implement selection foundation`

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
