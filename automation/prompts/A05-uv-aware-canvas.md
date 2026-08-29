---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A05
title: UV-aware Canvas
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Make the 2D canvas understand Minecraft skin structure by exposing canonical UV boundaries, semantic body/face/layer identification, and focus-to-body-part views.

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
- texel → semantic body part/layer/face query;
- optional UV boundary overlay;
- concise hover identification such as `Head · Front · Base`;
- focus body part / return to whole texture;
- layer-aware overlay/focus behavior.

All semantics must come from the canonical Minecraft skin specification.

# Architecture constraints

- No new magic UV rectangles in React/Canvas code.
- UV overlay and focus are view state only; never mutate pixels or history.
- Use the same texture-coordinate mapping as tools/selections.
- Prefer Canvas overlay/path rendering over hundreds of DOM elements.
- Body left/right terminology is character-relative and must match the canonical spec.

# Required steps

1. Build/reuse a pure semantic hit-test query for Classic/Slim, base/outer and all faces.
2. Define deterministic behavior for unused texels and any intentional overlap.
3. Render an optional subtle UV boundary overlay aligned under pan/zoom/DPR.
4. Add compact status-bar semantic identification on hover.
5. Implement focus controls for Whole Texture, Head, Torso, both Arms and both Legs using canonical UV bounds.
6. Allow layer-aware display/focus for Base, Outer, or Both where consistent with existing layer controls.
7. Ensure overlays never steal pointer input and remain compatible with painting, selection, pan and zoom.

# Testing / QA

Cover representative/exhaustive texel→semantic mappings, unused texels, left/right semantics, Classic/Slim arm regions, base/outer, focus bounds, viewport fit, overlay alignment under zoom/pan/DPR, and no document mutation.

Manual QA: overlay toggle, hover every body region, focus each part, paint/select with overlay enabled, pan/zoom, Classic/Slim, outer/base.

# Out of scope

- 2D↔3D hover linkage;
- 3D click-to-focus;
- 3D isolation driven by 2D;
- UV remapping/editing.

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

`Implement UV-aware 2D canvas`

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
