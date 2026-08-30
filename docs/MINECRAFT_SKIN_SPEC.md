# Canonical Minecraft Java Modern-Skin Specification

This document defines the repository's renderer-independent contract for a
modern 64×64 Minecraft Java skin. The TypeScript implementation lives in
`src/engine/minecraft-skin-spec`. Future 2D structural tools and the M7 preview
must consume that module instead of defining their own UV coordinates or body
geometry.

## Domain vocabulary

- `SkinModel`: `classic` or `slim`.
- `SkinLayer`: `base` or `outer`.
- `BodyPart`: `head`, `torso`, `rightArm`, `leftArm`, `rightLeg`, or
  `leftLeg`.
- `CubeFace`: `top`, `bottom`, `front`, `back`, `left`, or `right`.
- Left and right are always the **character's** left and right, never the
  viewer's.

`SkinDocument.model` is explicit metadata. The specification does not infer a
model from transparent pixels.

## Texture coordinates

The PNG is exactly 64×64 texels. Its origin `(0, 0)` is the top-left texel; `x`
increases right and `y` increases down.

Every UV rectangle is a `TextureRegion { x, y, width, height }`. Width and
height are positive integer texel counts. Bounds are half-open:

```text
[x, x + width) × [y, y + height)
```

Thus `{ x: 8, y: 8, width: 8, height: 8 }` covers first texel `(8, 8)` and
last texel `(15, 15)`. No consumer may reinterpret these values as inclusive
end coordinates.

## UV tables

Table cells use `(x, y, width, height)`. `Bk` means back and `R`/`L` mean the
character's right/left face. The Classic table is complete. The Slim table
replaces only the four arm rows; all head, torso, and leg mappings are exactly
the Classic mappings.

### Classic / Steve

| Body part | Layer | Top         | Bottom      | Front        | Bk           | L            | R            |
| --------- | ----- | ----------- | ----------- | ------------ | ------------ | ------------ | ------------ |
| Head      | base  | (8,0,8,8)   | (16,0,8,8)  | (8,8,8,8)    | (24,8,8,8)   | (16,8,8,8)   | (0,8,8,8)    |
| Head      | outer | (40,0,8,8)  | (48,0,8,8)  | (40,8,8,8)   | (56,8,8,8)   | (48,8,8,8)   | (32,8,8,8)   |
| Torso     | base  | (20,16,8,4) | (28,16,8,4) | (20,20,8,12) | (32,20,8,12) | (28,20,4,12) | (16,20,4,12) |
| Torso     | outer | (20,32,8,4) | (28,32,8,4) | (20,36,8,12) | (32,36,8,12) | (28,36,4,12) | (16,36,4,12) |
| Right arm | base  | (44,16,4,4) | (48,16,4,4) | (44,20,4,12) | (52,20,4,12) | (48,20,4,12) | (40,20,4,12) |
| Right arm | outer | (44,32,4,4) | (48,32,4,4) | (44,36,4,12) | (52,36,4,12) | (48,36,4,12) | (40,36,4,12) |
| Left arm  | base  | (36,48,4,4) | (40,48,4,4) | (36,52,4,12) | (44,52,4,12) | (40,52,4,12) | (32,52,4,12) |
| Left arm  | outer | (52,48,4,4) | (56,48,4,4) | (52,52,4,12) | (60,52,4,12) | (56,52,4,12) | (48,52,4,12) |
| Right leg | base  | (4,16,4,4)  | (8,16,4,4)  | (4,20,4,12)  | (12,20,4,12) | (8,20,4,12)  | (0,20,4,12)  |
| Right leg | outer | (4,32,4,4)  | (8,32,4,4)  | (4,36,4,12)  | (12,36,4,12) | (8,36,4,12)  | (0,36,4,12)  |
| Left leg  | base  | (20,48,4,4) | (24,48,4,4) | (20,52,4,12) | (28,52,4,12) | (24,52,4,12) | (16,52,4,12) |
| Left leg  | outer | (4,48,4,4)  | (8,48,4,4)  | (4,52,4,12)  | (12,52,4,12) | (8,52,4,12)  | (0,52,4,12)  |

### Slim / Alex arm replacements

| Body part | Layer | Top         | Bottom      | Front        | Bk           | L            | R            |
| --------- | ----- | ----------- | ----------- | ------------ | ------------ | ------------ | ------------ |
| Right arm | base  | (44,16,3,4) | (47,16,3,4) | (44,20,3,12) | (51,20,3,12) | (47,20,4,12) | (40,20,4,12) |
| Right arm | outer | (44,32,3,4) | (47,32,3,4) | (44,36,3,12) | (51,36,3,12) | (47,36,4,12) | (40,36,4,12) |
| Left arm  | base  | (36,48,3,4) | (39,48,3,4) | (36,52,3,12) | (43,52,3,12) | (39,52,4,12) | (32,52,4,12) |
| Left arm  | outer | (52,48,3,4) | (55,48,3,4) | (52,52,3,12) | (59,52,3,12) | (55,52,4,12) | (48,52,4,12) |

Slim changes arm width from four to three model units and texels. Arm depth
remains four, so left/right side-face rectangles remain 4×12.

## Model coordinates and neutral geometry

The canonical model space is right-handed and renderer-independent:

- origin: ground point centered between the feet;
- `+X`: character-left;
- `+Y`: up;
- `+Z`: character-front.

Pivots and cube offsets are model-space vectors. A cube's center is
`pivot + cubeOffset` in the neutral pose.

| Part      | Model   | Base dimensions W×H×D | Pivot (x,y,z) | Cube offset (x,y,z) |
| --------- | ------- | --------------------- | ------------- | ------------------- |
| Head      | both    | 8×8×8                 | (0,24,0)      | (0,4,0)             |
| Torso     | both    | 8×12×4                | (0,24,0)      | (0,-6,0)            |
| Right arm | Classic | 4×12×4                | (-5,22,0)     | (-1,-4,0)           |
| Left arm  | Classic | 4×12×4                | (5,22,0)      | (1,-4,0)            |
| Right arm | Slim    | 3×12×4                | (-5,21.5,0)   | (-0.5,-4,0)         |
| Left arm  | Slim    | 3×12×4                | (5,21.5,0)    | (0.5,-4,0)          |
| Right leg | both    | 4×12×4                | (-1.9,12,0)   | (0,-6,0)            |
| Left leg  | both    | 4×12×4                | (1.9,12,0)    | (0,-6,0)            |

The half-unit lower Slim shoulder is intentional. Geometry values describe the
neutral Java player model; animation is outside M6.

## Face orientation

Each `FaceUvDefinition` contains a texture region and explicit directions for
increasing texture U (`x`) and V (`y`) in canonical model space. This captures
rotation and inversion without renderer-specific flags.

| Face   | U increases toward | V increases toward |
| ------ | ------------------ | ------------------ |
| top    | +X                 | +Z                 |
| bottom | +X                 | -Z                 |
| front  | +X                 | -Y                 |
| back   | -X                 | -Y                 |
| left   | -Z                 | -Y                 |
| right  | +Z                 | -Y                 |

M7 must derive its geometry-vertex UV order from these directions and its own
coordinate conversion. It must not silently swap limbs, mirror back faces, or
add per-face corrective offsets.

## Base and outer geometry

The outer layer has a semantic relationship and a canonical Java box expansion
per side:

| Part  | Outer meaning | Expansion per side |
| ----- | ------------- | ------------------ |
| Head  | hat           | 0.5                |
| Torso | jacket        | 0.25               |
| Arms  | sleeves       | 0.25               |
| Legs  | pants         | 0.25               |

These are model-space values, not Three.js scale factors. M7 remains
responsible for constructing separate outer boxes and transparency-capable
materials. It must not render outer UVs on the base box.

## Query and validation APIs

Consumers should use:

```ts
getFaceDefinition({ model, bodyPart, layer, face });
getFaceRegion({ model, bodyPart, layer, face });
getBodyPartRegions({ model, bodyPart, layer });
getBodyPartGeometry({ model, bodyPart });
queryTextureSemantic({ model, x, y, layer });
queryTextureSemantics({ model, x, y, layer });
getBodyPartTextureBounds({ model, bodyPart, layer });
getTextureFocusBounds({ model, target, layer });
```

Semantic queries return no match for unused or out-of-bounds texels. The
`layer` filter accepts `base`, `outer`, or `both`; when `both` is used, the
plural query returns all matches in deterministic base-before-outer order and
the singular query returns the first one. Classic and Slim are mutually
exclusive model interpretations, so a query never combines their mappings.
Focus bounds are half-open bounding boxes around the selected canonical face
regions and may include gaps between faces.

`validateSkinSpecification()` checks every supported combination for complete
face coverage, valid 64×64 integer rectangles, and geometry-consistent face
dimensions. `auditCanonicalRegions(model)` detects duplicates and unintended
overlap within one model interpretation. Classic and Slim are mutually
exclusive interpretations that intentionally reuse atlas coordinates, so the
collision audit does not compare one model against the other.

## Diagnostic fixture

`createDiagnosticSkinFixture(model)` generates an original deterministic 64×64
RGBA buffer. Every semantic face receives a unique base color. Its four corners
use distinct red, green, yellow, and blue markers in clockwise order from
top-left. The combination exposes wrong-face, horizontal/vertical flip, and
rotation errors. Separate fixtures are generated for Classic and Slim because
their arm rectangles intentionally overlap while using different widths.

The fixture contains no downloaded player artwork and round-trips losslessly
through the existing PNG codec.

## References consulted

- [Minecraft: What is a Minecraft Skin?](https://www.minecraft.net/en-us/article/what-is-minecraft-skin) — official Classic/Slim terminology, explicit model selection, four-pixel Classic arms, three-pixel Slim arms, and the lower Slim shoulder.
- [Minecraft Java `PlayerModel` mappings](https://mappings.dev/1.21/net/minecraft/client/model/PlayerModel.html) and [`HumanoidModel` mappings](https://mappings.dev/1.21.4/net/minecraft/client/model/HumanoidModel.html) — mapped canonical Java model parts, Slim switch, outer parts, and mesh contracts.
- [skinview3d `model.ts`](https://github.com/bs-community/skinview3d/blob/master/src/model.ts) — established independent implementation used to cross-check 64×64 cuboid UV origins, dimensions, limb sides, and outer-layer construction.

Coordinates were independently expanded into explicit face rectangles and
audited by exhaustive table-driven tests; the application does not import or
depend on any reference implementation.

## Intentionally deferred to M7

M6 does not contain Three.js, mesh construction, texture objects, materials,
camera behavior, animation, preview UI, or direct 3D painting. M7 must choose
the renderer-specific vertex order, convert canonical model coordinates to the
Three.js scene, apply nearest-neighbor sampling, and refresh from the canonical
`SkinDocument` while preserving this specification.
