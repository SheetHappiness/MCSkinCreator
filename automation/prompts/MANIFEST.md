# MANIFEST.md

Minecraft Skin Editor — Roadmap 4 / Technical Studio Visual System

Contents:
- `TECHNICAL_STUDIO_DESIGN.md` — canonical visual contract read by every stage.
- `ROADMAP4.md` — order and scope boundary.
- V00–V07 production prompts.
- `SHA256SUMS.txt`.

Execution: V00 → V01 → V02 → V03 → V04 → V05 → V06 → V07 → STOP.

Every prompt uses current clean `main`, contains no hardcoded baseline SHA, is self-contained for a fresh Codex session, reads the canonical design doc, preserves existing product functionality, and forbids AI / semantic palettes / ramps / palette-to-skin mapping.

Prompt headers record `execution_model: Luna max`; actual runner/CLI configuration remains authoritative for model selection.
