# Tool Options Contract

P05 establishes one typed application-state boundary for tool options in
`src/features/editor/toolOptions.ts`. `SkinDocument` and `DocumentHistory`
remain concerned only with document content and reversible document mutations.

The current Pencil, Eraser, Fill, and Eyedropper options describe their
existing fixed semantics. Lighten, Darken, Noise, and Stamp add the first
configurable options. Fixed core semantics are presented as read-only
contextual facts; the UI does not expose controls that cannot change behavior.
The 2D and 3D adapters read the same `getToolOptions()` source.

Options are session-scoped. Each tool owns its own option entry, so changing
the active tool does not overwrite another tool's options. `resetToolOptions()`
is an explicit application-state reset and does not dirty a document or add a
history operation. Options remain session-scoped rather than being written to
local storage; this keeps the configurable tool options small and avoids
another settings format.

## Symmetry

Symmetry is a session-scoped editor preference, separate from `SkinDocument`
and `DocumentHistory`. The compact control exposes three exact modes:

- `Off` writes only the source texel.
- `Mirror` writes the source texel and its generic 64×64 canvas reflection,
  `(63 - x, y)`.
- `Body Pair` writes the source texel and the corresponding character-relative
  texel on the paired arm or leg. It uses the canonical model, face, layer, and
  U/V orientation from `src/engine/minecraft-skin-spec` for both Classic and
  Slim models. Head and torso texels are unchanged by this mode.

The target expansion happens before a mutation is applied, and duplicate
targets are removed before writing. A complete 2D or direct-3D gesture remains
one history transaction. Preview visibility and isolation do not change the
mapping.

Symmetry support follows the existing tool semantics:

- Pencil, Eraser, Fill, Lighten, Darken, and Stamp support all three modes.
- Noise supports all three modes with one shared deterministic noise sample
  per symmetry group, preserving exact paired results while retaining the
  tool's seeded behavior.
- Eyedropper and Selection do not mutate paint targets, so symmetry does not
  alter them. Their current sample and selection contracts remain unchanged.

Future tools may add genuinely configurable, validated fields to the typed
map and use `setToolOptions()`; they must not turn fixed core semantics into
fake controls or store option state in `SkinDocument`.

## Advanced tool semantics

Lighten and Darken convert the current RGB bytes to HSV, preserve hue and
saturation, and adjust value `V` in the range 0–100:

```text
Lighten: V' = V + (100 - V) * strength
Darken:  V' = V * (1 - strength)
```

The result is rounded to exact RGB bytes and the source alpha byte is retained.

Noise first accepts a texel when the seeded random value is below `density`.
It then computes `range = round(64 * strength)` and one signed offset
`floor(random * (2 * range + 1)) - range`. That same offset is added to R, G,
and B and clamped to byte range; alpha is retained. The committed history
operation stores the resulting bytes, so Undo and Redo never regenerate noise.
The default session source is a 32-bit unsigned linear-congruential generator
with `state = (1664525 * state + 1013904223) mod 2^32`; tests can inject a
source directly.

Stamp currently provides two predefined local patterns: a 2×2 checker and a
3×3 three-row stripe. The picked texel is the pattern's top-left anchor,
primary and secondary colors fill the pattern, and out-of-bounds cells are
clipped. Lighten, Darken, and Noise visit each texel once per stroke; Stamp
places each new anchor once. Each gesture remains one transactional history
operation, and a 3D face change breaks transform interpolation before the new
hit is applied.
