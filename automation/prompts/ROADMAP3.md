# Roadmap 3 — Artist Workflow

## Goal

Build a professional artist workflow on top of the completed core editor and MCSkin3D-parity functionality.

## Order

1. A00 — Resizable Workspace
2. A01 — Professional Color Workspace
3. A02 — Selection Foundation
4. A03 — Selection Transformations
5. A04 — Symmetry
6. A05 — UV-aware Canvas
7. A06 — 2D ↔ 3D Intelligence
8. A07 — Workspace / Library UX
9. A08 — Artist Workflow Quality Pass
10. STOP

## Dependency logic

- A00 provides workspace sizing/persistence for later panels.
- A01 finishes manual color UX before future color intelligence.
- A02 creates canonical selection/clipboard semantics.
- A03 builds transforms on A02.
- A04 builds live symmetry on canonical Minecraft mappings and existing editing pipelines.
- A05 exposes canonical UV semantics in 2D.
- A06 links the semantic 2D and 3D views.
- A07 refines the already-existing local library/multi-document workflow.
- A08 is a mandatory quality gate and STOP.

## Explicit boundary

Roadmap 3 does not implement AI, smart/semantic palette generation, reference intelligence, browser/NameMC, community/social, cloud accounts, plugins or marketplace functionality.
