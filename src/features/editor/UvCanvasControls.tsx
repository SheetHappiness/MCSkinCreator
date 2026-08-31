import {
  TEXTURE_FOCUS_TARGETS,
  type TextureFocusTarget,
  type TextureLayerFilter,
} from '../../engine/minecraft-skin-spec';

interface UvCanvasControlsProps {
  readonly showUvOverlay: boolean;
  readonly layer: TextureLayerFilter;
  readonly focusTarget: TextureFocusTarget;
  readonly onToggleUvOverlay: () => void;
  readonly onLayerChange: (layer: TextureLayerFilter) => void;
  readonly onFocusChange: (target: TextureFocusTarget) => void;
}

const LAYER_OPTIONS: readonly {
  readonly value: TextureLayerFilter;
  readonly label: string;
}[] = [
  { value: 'base', label: 'Base' },
  { value: 'outer', label: 'Outer' },
  { value: 'both', label: 'Both' },
];

const FOCUS_OPTIONS: readonly {
  readonly value: TextureFocusTarget;
  readonly label: string;
}[] = [
  { value: 'whole', label: 'Whole Texture' },
  { value: 'head', label: 'Head' },
  { value: 'torso', label: 'Torso' },
  { value: 'arms', label: 'Both Arms' },
  { value: 'rightArm', label: 'Right Arm' },
  { value: 'leftArm', label: 'Left Arm' },
  { value: 'legs', label: 'Both Legs' },
  { value: 'rightLeg', label: 'Right Leg' },
  { value: 'leftLeg', label: 'Left Leg' },
];

function isTextureFocusTarget(value: string): value is TextureFocusTarget {
  return (TEXTURE_FOCUS_TARGETS as readonly string[]).includes(value);
}

export function UvCanvasControls({
  showUvOverlay,
  layer,
  focusTarget,
  onToggleUvOverlay,
  onLayerChange,
  onFocusChange,
}: UvCanvasControlsProps) {
  return (
    <div
      className="canvas-structure-controls"
      data-testid="canvas-structure-controls"
      data-uv-state={showUvOverlay ? 'visible' : 'hidden'}
      data-uv-layer={layer}
      role="group"
      aria-label="Canvas structure"
    >
      <button
        type="button"
        className="ts-button"
        aria-label="UV boundaries"
        aria-pressed={showUvOverlay}
        title="Toggle canonical UV boundaries"
        onClick={onToggleUvOverlay}
      >
        UV
      </button>
      <span className="canvas-structure-controls__divider" aria-hidden="true" />
      <div
        className="canvas-layer-controls ts-segmented"
        role="group"
        aria-label="UV layer"
      >
        {LAYER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ts-button"
            aria-label={option.label}
            aria-pressed={layer === option.value}
            title={`Use ${option.label} layer for UV overlay and focus`}
            onClick={() => onLayerChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="canvas-structure-controls__divider" aria-hidden="true" />
      <label className="canvas-focus-control">
        <span>Focus</span>
        <select
          className="ts-field"
          aria-label="Canvas focus"
          value={focusTarget}
          onChange={(event) => {
            const target = event.currentTarget.value;
            if (isTextureFocusTarget(target)) onFocusChange(target);
          }}
        >
          {FOCUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
