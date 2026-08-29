import type { CSSProperties } from 'react';

import type { RgbaColor } from '../../engine/document';
import { colorToHex } from './colorHex';
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

function rgbaCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

function swatchStyle(color: RgbaColor): CSSProperties {
  return { backgroundColor: rgbaCss(color) };
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

  return (
    <div className="color-control" aria-label="Paint colors">
      <div className="color-control__heading">
        <span className="color-control__label">Colors</span>
        <span className="color-control__active-slot">
          {activeSlot === 'primary' ? 'Primary' : 'Secondary'}
        </span>
      </div>
      <div className="color-swatch-stack">
        <button
          type="button"
          className="color-swatch-button color-swatch-button--primary"
          aria-label="Primary color"
          aria-pressed={activeSlot === 'primary'}
          title="Primary color · Left action"
          style={swatchStyle(primaryColor)}
          onClick={() => onSelectSlot('primary')}
        />
        <button
          type="button"
          className="color-swatch-button color-swatch-button--secondary"
          aria-label="Secondary color"
          aria-pressed={activeSlot === 'secondary'}
          title="Secondary color · Right action in 2D, Shift+left in 3D"
          style={swatchStyle(secondaryColor)}
          onClick={() => onSelectSlot('secondary')}
        />
      </div>
      <label className="color-editor" title="Edit active color">
        <span className="visually-hidden">Active color</span>
        <input
          type="color"
          aria-label="Paint color"
          value={colorToHex(activeColor)}
          onChange={(event) =>
            onChange(activeSlot, {
              ...activeColor,
              ...(() => {
                const hex = event.currentTarget.value;
                return {
                  r: Number.parseInt(hex.slice(1, 3), 16),
                  g: Number.parseInt(hex.slice(3, 5), 16),
                  b: Number.parseInt(hex.slice(5, 7), 16),
                };
              })(),
            })
          }
        />
      </label>
      <div className="color-control__actions">
        <button
          type="button"
          aria-label="Swap primary and secondary colors"
          title="Swap colors (X)"
          onClick={onSwap}
        >
          ⇄
        </button>
        <button
          type="button"
          aria-label="Reset primary and secondary colors"
          title="Reset colors (D)"
          onClick={onReset}
        >
          D
        </button>
      </div>
    </div>
  );
}
