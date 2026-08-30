# MCSkin3D parity audit

Audit date: 2026-08-29
Roadmap baseline: `a966f9aadf9573b7558aab0d830ced5564ea0e1c`
Audit disposition: Roadmap 2 closed after P11; no P12 is created.

## Target recovery

The historical target was recovered from the preserved MCSkin3D source rather
than from memory or screenshots:

- [MCSkin3D source README](https://raw.githubusercontent.com/Paril/mcskin3d/master/README.md)
  establishes the original 2D/3D skin-management-studio context.
- [Historical changelog](https://github.com/Paril/mcskin3d/blob/master/setup_files/changes.txt)
  records the evolution of picking, 2D navigation, tools, options, colors,
  swatches, history, file workflows, PopOut, and legacy compatibility modes.
- [Historical roadmap](https://raw.githubusercontent.com/Paril/mcskin3d/master/roadmap.txt)
  distinguishes finished work from unresolved and explicitly abandoned
  proposals.
- The [historical tool source](https://raw.githubusercontent.com/Paril/mcskin3d/master/Tools/Tools.cs)
  and [tool index](https://raw.githubusercontent.com/Paril/mcskin3d/master/Tools/ToolIndex.cs)
  confirm the core and advanced tool families.
- The [historical swatch source](https://github.com/Paril/mcskin3d/tree/master/Swatches)
  confirms the broader palette-file surface that existed historically.

This repository does not target a feature-for-feature clone of that older
.NET application. The current target is the finite modern player-skin
workflow defined by P00–P11: valid 64×64 modern Java skins, Classic/Slim
geometry, exact pixel editing in 2D and 3D, deterministic artist controls,
local document workflows, and a derived preview. Historical compatibility
modes and non-player model formats are recorded explicitly below rather than
being silently treated as implemented.

## Status vocabulary

Every audited capability has exactly one disposition:

- `PARITY` — the useful capability exists within the current supported scope.
- `INTENTIONALLY MODERNIZED` — the useful capability exists through a
  deliberately narrower or safer current design.
- `LEGACY / OUT OF SCOPE` — the capability is not part of the finite target;
  the rationale is recorded and it is not counted as completed parity.

## Capability matrix

| Area                         | Audited capability                                                                          | Disposition                | Evidence and boundary                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2D editing                   | Exact 64×64 canvas editing, zoom, pan, grid, and source coordinates                         | `PARITY`                   | Canvas rendering remains nearest-neighbor and the source remains exact 64×64 RGBA.                                                                                                                                   |
| 3D editing                   | UV-correct model preview, texel picking, direct painting, camera orbit, and zoom            | `PARITY`                   | Three.js derives from the canonical document and centralized Minecraft UV specification.                                                                                                                             |
| Core tools                   | Pencil, Eraser, Eyedropper, Fill, and camera navigation                                     | `PARITY`                   | The tools use shared coordinate adapters and exact byte writes.                                                                                                                                                      |
| Advanced tools               | Lighten, Darken, Noise, and Stamp                                                           | `INTENTIONALLY MODERNIZED` | Historical Dodge/Burn, Darken/Lighten, Noise, and Stamp ideas are represented by deterministic RGBA operations, fixed pixel-art semantics, and one transaction per gesture. No soft or antialiased brush is implied. |
| Primary/secondary            | Two color slots, slot switching, swap/reset, 2D secondary action, and 3D secondary modifier | `PARITY`                   | The selected slot is application state; painting still mutates only the canonical document.                                                                                                                          |
| Advanced color               | Exact Hex, RGB, Alpha, HSV, and visual color-picker controls                                | `PARITY`                   | UI conversions terminate in canonical 8-bit RGBA; alpha is preserved explicitly.                                                                                                                                     |
| Swatches                     | Local swatches, add/apply/remove/reorder, persistence, and GPL import/export                | `INTENTIONALLY MODERNIZED` | The current typed local store persists exact RGBA in `localStorage` and supports GPL. Historical binary formats such as ACO/ACT are not required.                                                                    |
| Tool options                 | Contextual options inspector with validated advanced-tool values                            | `INTENTIONALLY MODERNIZED` | One typed application-state source is consumed by both 2D and 3D adapters; fixed semantics are shown as fixed rather than exposed as fake controls.                                                                  |
| History                      | Undo/Redo timeline, saved checkpoint, exact restoration, and transactional gestures         | `PARITY`                   | `DocumentHistory` stores reversible before/after content; a stroke or tool gesture is one logical operation.                                                                                                         |
| Model/layer/body parts       | Classic/Slim, base/outer layers, body-part visibility, and isolation                        | `PARITY`                   | Geometry and visibility are derived from the canonical model/document state.                                                                                                                                         |
| New/Open/Save/Save All       | New Classic/Slim skin, validated PNG open, Save, Save As, and ordered Save All              | `PARITY`                   | Unsupported dimensions and corrupt input are rejected; no implicit resize is performed.                                                                                                                              |
| Drag/drop                    | PNG drop into a new document tab                                                            | `PARITY`                   | Dropped bytes pass through the same canonical 64×64 decoder as Open.                                                                                                                                                 |
| Multi-document/local library | Independent tabs, per-document history, app-managed local PNG library, and Save All         | `INTENTIONALLY MODERNIZED` | The local workspace is deliberately bounded and offline; it does not index the whole computer or expose a generic filesystem bridge.                                                                                 |
| 3D pop-out                   | Separate preview window, multi-monitor use, stable document binding, and reset view         | `INTENTIONALLY MODERNIZED` | The pop-out is read-only and receives typed derived state, so it cannot become a second editable document authority.                                                                                                 |
| Screenshot                   | Explicit PNG snapshot of the current 3D viewport                                            | `INTENTIONALLY MODERNIZED` | Snapshot uses the current physical viewport resolution, neutral background, and native PNG Save dialog without scene/pose state.                                                                                     |

All capabilities in the finite matrix are either `PARITY` or
`INTENTIONALLY MODERNIZED`; none is a missing capability hidden by the audit.
The modernizations are intentional product and architecture decisions, not
claims that the current app implements every historical file format or tool
variant.

## Explicit exclusions

These exclusions are part of the closure boundary. A useful feature listed
here is not being reclassified as complete; it is being kept visible as
future or historical scope.

| Historical or adjacent capability                                                                  | Disposition             | Rationale                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 64×32, 128×128, 256×128, or 4096×4096 texture modes                                                | `LEGACY / OUT OF SCOPE` | The current product contract is exact 64×64 modern Java skins. The historical changelog's larger texture support is incompatible with that bounded v0.1 source contract.                                                                                                                                                                                                       |
| Legacy 1.0/1.8 modes and old model compatibility                                                   | `LEGACY / OUT OF SCOPE` | The current model builder follows one documented modern player-skin specification rather than retaining version-specific UV variants.                                                                                                                                                                                                                                          |
| Mine Little Pony, Techne/TCN, arbitrary custom models, and mob-model workflows                     | `LEGACY / OUT OF SCOPE` | These are historical extensions outside the current player-skin Classic/Slim product boundary.                                                                                                                                                                                                                                                                                 |
| Updater, uploader/import-from-Minecraft integrations, external file watching, and network services | `LEGACY / OUT OF SCOPE` | The current app is an offline explicit-open/save workflow with no account, cloud, browser, or telemetry surface.                                                                                                                                                                                                                                                               |
| ACO, ACT, and other historical binary swatch formats                                               | `LEGACY / OUT OF SCOPE` | GPL is the supported simple interchange format; implementing every historical binary importer is not required for the current target.                                                                                                                                                                                                                                          |
| Symmetry, smudge, feathering, pressure, posing, and lighting-studio controls                       | `LEGACY / OUT OF SCOPE` | These are useful artist features, but they are not in the finite P00–P11 target. P06 explicitly excludes symmetry/mirror, softness, and related studio controls; the historical roadmap also records several proposals as unresolved or not going forward. Roadmap 3 A02/A03 separately adds bounded rectangular selection, exact copy/paste, and selection mirror transforms. |

The exclusions are intentionally explicit so that closing Roadmap 2 cannot be
read as a claim of full historical compatibility. They do not create a later
task automatically.

## Architecture and invariants

- `SkinDocument` is the only editable pixel/model authority.
- Canvas 2D, Three.js, pop-out preview, and PNG encoding are derived views of
  that document; they are not independent editable copies.
- All reversible document mutations use the shared transaction/history path,
  preserve exact RGBA bytes, and define one logical history record per
  gesture or command.
- Tool options, active colors, visibility, and swatches are application or
  view state. Swatch and option changes never dirty a document or create
  document history.
- Modern player UV coordinates and geometry remain centralized and tested;
  Classic/Slim and base/outer mapping is not reimplemented in UI code.
- Native file and preview IPC remains narrow and typed. Preview windows are
  read-only, sandboxed, and cannot write to the canonical document.

## Validation and QA

The final audit validation was run against the P10 baseline plus this
documentary closure. Automated results and manual status are kept separate:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — pass; 33 test files and 307 tests.
- `npm run build` — pass; Vite emitted its existing chunk-size warning.
- `npm run test:e2e` — pass; 11 tests.
- `git diff --check` — pass.
- Targeted Prettier checks for the changed documentation — pass.
- Full `npm run format:check` — fails only on the inherited user-supplied
  prompt archive: `automation/prompts/MANIFEST.md` and
  `automation/prompts/P10-popout-screenshot.md`. Those files were not changed
  or staged by P11.
- `npm run validate` — stops at that same prompt-only format check after its
  typecheck and lint stages.

Manual QA was partially performed in the running Electron application: New
Classic 64×64, exact Hex and Alpha entry, swatch add/apply to Secondary,
active-tool switching, Pencil, Fill, coordinates, and opening the bound
pop-out were observed. A complete human visual pass across every tool,
model/layer combination, drag/drop, local-library mutation, and snapshot
file-save path remains unverified and should be performed by the user.

No later Roadmap 2 or Roadmap 3 functionality was implemented by P11. This
stage closes the documented audit and stops.
