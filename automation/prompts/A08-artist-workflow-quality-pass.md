---
roadmap: 3
roadmap_title: Artist Workflow
task_id: A08
title: Artist Workflow Quality Pass
repo: C:\MinecraftSkinCreator
branch: main
execution_model: Luna
execution_reasoning: xhigh
---

# Goal

Finish Roadmap 3 by auditing and hardening A0–A7 into one coherent professional artist workflow, then STOP without starting Roadmap 4.

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

Audit and improve only existing Roadmap 3 functionality:

- resizable workspace;
- professional manual color workflow;
- selections;
- selection transforms;
- symmetry;
- UV-aware canvas;
- 2D↔3D semantic linkage;
- library/multi-document UX;
- lifecycle, shortcuts, performance, accessibility and visual consistency.

Fix concrete defects/friction. Do not add a new feature family.

# Architecture constraints

- Preserve established domain, history, PNG, Electron security, Three.js resource, library and Roadmap 3 architecture.
- Fix semantic bugs at their shared source instead of renderer-specific patches.
- Add regression tests for defects found.
- Performance work must respond to measured/obvious issues, not bundle-warning aesthetics.
- Documentation changes should describe durable completed behavior only.

# Required steps

1. Perform a code + hands-on UX audit and list findings by correctness, friction, visual consistency, lifecycle, performance/resource and accessibility severity.
2. Stress workspace splitters/collapse/persistence/reset across large, `1200×760`, and minimum supported windows.
3. Stress Primary/Secondary, HSV, hex, alpha, recents, swatches, eyedropper and input focus.
4. Stress selection create/move/cut/copy/paste/delete/cancel, transforms, body transfers and Undo/Redo.
5. Stress symmetry on Classic/Slim, base/outer, 2D/direct-3D and every supported tool.
6. Stress UV overlays/focus/body-face identification while painting/selecting/panning/zooming.
7. Stress 2D↔3D hover, seam cleanup, focus, isolate, outer visibility, direct 3D painting and orbit.
8. Stress library thumbnails/search/collections/recents/rename/duplicate/reveal/multi-document dirty lifecycle.
9. Audit the complete shortcut map for conflicts; document durable shortcuts if useful.
10. Stress blur/pointercancel/document switch/close during paint, pan, splitter drag, selection move and 3D orbit.
11. Audit high-frequency paths for unnecessary React rerenders, scene rebuilds, thumbnail storms, continuous RAFs, duplicate subscriptions/listeners/observers.
12. Normalize visibly inconsistent control heights, spacing, focus, selected states, panel headers, splitters, highlights, library rows and status bar without a redesign.
13. Verify accessibility of icon controls, splitters, selection/symmetry states, color controls, library controls and contrast.
14. Update README/docs with a concise `Roadmap 3 — Artist Workflow complete` note if all validation passes.
15. STOP. Do not create or implement Roadmap 4.

# Testing / QA

Add focused regression tests for every defect fixed where practical. Avoid giant snapshot tests.

Manual QA matrix:

- layout: large / 1200×760 / minimum + persisted custom layout;
- color: primary/secondary, HSV, hex, alpha, recents, swatches;
- selection: copy/cut/paste/delete/move/transforms/body transfer;
- symmetry: Classic/Slim, base/outer, 2D/3D;
- UV/3D: hover linkage, focus, isolate, orbit/paint isolation;
- library: multiple files, search, recents, collections, rename/duplicate/reveal;
- lifecycle: dirty Open/Close, multi-document switching/closing, save-failure paths where testable.

# Out of scope

- AI;
- smart/semantic palette generation;
- OKLCH ramp intelligence;
- reference analysis;
- browser/NameMC;
- social/community;
- cloud accounts;
- plugins/marketplace;
- any new Roadmap 4 feature.

After successful A8, Roadmap 3 is complete and the automation must stop.

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

`Complete artist workflow quality pass`

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
