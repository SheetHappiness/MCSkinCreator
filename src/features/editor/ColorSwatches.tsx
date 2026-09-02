import type { RgbaColor } from '../../engine/document';
import { colorToHex, parseExactHex } from './colorHex';
import { rgbaSurfaceStyle } from './colorSurfaceStyle';
import type { ColorSlot } from './editorToolStore';

interface ColorSwatchesProps {
  readonly primaryColor: RgbaColor;
  readonly secondaryColor: RgbaColor;
  readonly activeSlot: ColorSlot;
  readonly onSelectSlot: (slot: ColorSlot) => void;
  readonly onChange: (slot: ColorSlot, color: RgbaColor) => void;
  readonly onSwap: () => void;
  readonly onReset: () => void;
}

interface ColorSlotButtonProps {
  readonly slot: ColorSlot;
  readonly color: RgbaColor;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function ColorSlotButton({
  slot,
  color,
  active,
  onSelect,
}: ColorSlotButtonProps) {
  const label = slot === 'primary' ? 'Primary' : 'Secondary';
  const shortcut = slot === 'primary' ? 'P' : 'S';
  const action =
    slot === 'primary'
      ? 'Left action in 2D'
      : 'Right action in 2D, Shift+left in 3D';

  return (
    <button
      type="button"
      className={`color-slot-button ts-button color-slot-button--${slot}`}
      aria-label={`${label} color`}
      aria-pressed={active}
      title={`${label} ${colorToHex(color)} · Alpha ${color.a} · ${action}`}
      data-color={colorToHex(color)}
      onClick={onSelect}
    >
      <span className="color-slot-button__heading">
        <span className="color-slot-button__key">{shortcut}</span>
        <span>{label}</span>
        {active ? (
          <span className="color-slot-button__active">ACTIVE</span>
        ) : null}
      </span>
      <span className="color-slot-button__value">
        <span
          className="color-slot-button__chip"
          aria-hidden="true"
          style={rgbaSurfaceStyle(color)}
        />
        <code>{colorToHex(color)}</code>
      </span>
      <span className="color-slot-button__alpha">Alpha {color.a}</span>
    </button>
  );
}

export function ColorSwatches({
  primaryColor,
  secondaryColor,
  activeSlot,
  onSelectSlot,
  onChange,
  onSwap,
  onReset,
}: ColorSwatchesProps) {
  const activeColor = activeSlot === 'primary' ? primaryColor : secondaryColor;
  const activeLabel = activeSlot === 'primary' ? 'Primary' : 'Secondary';

  return (
    <div className="color-control" aria-label="Paint colors">
      <div className="color-control__heading">
        <span className="color-control__label">Color Studio</span>
        <span className="color-control__active-slot">
          Active: {activeLabel}
        </span>
      </div>
      <div
        className="color-slot-list"
        role="group"
        aria-label="Primary and secondary color slots"
      >
        <ColorSlotButton
          slot="primary"
          color={primaryColor}
          active={activeSlot === 'primary'}
          onSelect={() => onSelectSlot('primary')}
        />
        <ColorSlotButton
          slot="secondary"
          color={secondaryColor}
          active={activeSlot === 'secondary'}
          onSelect={() => onSelectSlot('secondary')}
        />
      </div>
      <div className="color-control__utility-row">
        <label
          className="color-editor"
          title="Open the native color picker for the active color"
        >
          <span className="color-editor__label">Quick</span>
          <span className="visually-hidden">Active color</span>
          <input
            type="color"
            aria-label="Paint color"
            value={colorToHex(activeColor)}
            onChange={(event) => {
              const parsed = parseExactHex(
                event.currentTarget.value,
                activeColor.a,
              );
              if (parsed !== undefined) onChange(activeSlot, parsed);
            }}
          />
        </label>
        <div className="color-control__actions">
          <button
            type="button"
            className="ts-icon-button ts-icon-button--compact"
            aria-label="Swap primary and secondary colors"
            title="Swap colors (X)"
            onClick={onSwap}
          >
            ⇄
          </button>
          <button
            type="button"
            className="ts-icon-button ts-icon-button--compact"
            aria-label="Reset primary and secondary colors"
            title="Reset colors (D)"
            onClick={onReset}
          >
            D
          </button>
        </div>
      </div>
    </div>
  );
}
