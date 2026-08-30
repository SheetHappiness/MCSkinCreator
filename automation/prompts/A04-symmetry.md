---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A04
title: Symmetry
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Implement live exact symmetry for painting, including Minecraft-aware paired-arm and paired-leg symmetry that works with the existing 2D and direct-3D editing paths.

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

Implement at minimum:

- symmetry Off;
- a useful generic canvas mirror mode;
- Minecraft Body Pair symmetry;
- shared integration with Pencil and Eraser;
- integration with other existing mutating tools only where semantics are clear;
- 2D and direct-3D input support through one shared target-expansion path.

One gesture remains one history operation.

# Architecture constraints

- Symmetry mode is editor/view preference, not document state/history.
- Expand semantic mutation targets before applying them; do not implement separate 2D and 3D symmetry engines.
- Body Pair mapping must use canonical Minecraft body/face/layer/U/V semantics for Classic and Slim.
- If source and mirrored target are the same texel, mutate once.
- Hidden/isolated preview state must not silently alter canonical symmetry mapping unless an existing durable editing contract requires it.

# Required steps

1. Define a small typed symmetry-mode model.
2. Implement pure generic 64×64 mirror mapping.
3. Implement semantic body-pair arm/leg mapping for base and outer.
4. Integrate symmetry into the existing tool mutation pipeline before transaction commit.
5. Guarantee one stroke/fill/action produces one transaction containing source+mirrored changes.
6. Support 2D and direct 3D painting through the same mapping layer.
7. Expose a compact tool-options control with clear Off / Mirror / Body Pair terminology.
8. Document which advanced Roadmap 2 tools support symmetry and why; do not mirror surprising tools blindly.

# Testing / QA

Cover generic mirror coordinates, arm/leg pair mapping, Classic/Slim, base/outer, representative/all faces, diagnostic orientation markers, source==mirror dedupe, one history entry, Undo/Redo, Pencil/Eraser, and direct-3D mapping where the existing test seam allows it. Prove symmetry preference does not dirty the document.

Manual QA on asymmetric Classic and Slim skins in 2D and 3D.

# Out of scope

- radial/kaleidoscope symmetry;
- arbitrary user-defined axes;
- automatic body repair;
- AI-assisted symmetry.

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

`Implement Minecraft-aware painting symmetry`

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
