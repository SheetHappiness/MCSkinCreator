---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A03
title: Selection Transformations
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Build deterministic pixel transformations on the A2 selection system, including Minecraft-aware transfer between paired limbs.

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
- flip horizontal;
- flip vertical;
- duplicate;
- mirror workflow using selection transforms;
- body-aware `Right Arm ↔ Left Arm` and `Right Leg ↔ Left Leg` transfer for base/outer and Classic/Slim.

All transforms must be exact pixel operations and fully Undoable/Redoable.

# Architecture constraints

- Reuse A2 selection/floating-selection architecture; no second transform system.
- No interpolation, resampling, or fractional coordinates.
- Body transfer must use the canonical Minecraft skin specification and face U/V orientation.
- Never implement paired-limb transfer as a naive whole-PNG rectangle mirror.
- Respect character-left/right semantics from the canonical spec.

# Required steps

1. Implement pure exact horizontal and vertical selection flips.
2. Implement duplicate as a movable copy with cancel/commit semantics.
3. Expose a compact transform UI via selection options/menu/context actions rather than toolbar clutter.
4. Implement typed body-aware transfer commands for paired arms and legs.
5. Map every involved face using canonical body/layer/face orientation.
6. Respect current Classic/Slim model and do not rescale between models.
7. Allow explicit base-only / outer-only behavior; never silently overwrite both.
8. Ensure unrelated texels remain untouched and each committed transform is one history operation.

# Testing / QA

Cover H/V flip odd/even sizes and transparency, duplicate/cancel/history, right↔left arms, right↔left legs, Classic, Slim, base, outer, all relevant face orientation markers using the canonical diagnostic fixture, and unchanged unrelated texels.

Manual QA on an intentionally asymmetric skin, including Undo/Redo for every transform.

# Out of scope

- arbitrary scaling;
- arbitrary rotation/free transform;
- live painting symmetry;
- body-pair symmetry while drawing;
- UV overlay/focus UI except minimal target selection needed for transfer.

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

`Implement selection transformations`

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
