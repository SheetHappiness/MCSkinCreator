import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

import type { RgbaColor } from '../../engine/document';
import { colorToHex, parseExactHex } from './colorHex';
import {
  canonicalizeRgba,
  hsvToRgba,
  rgbaToHsv,
  type HsvColor,
} from './colorConversions';
import { ColorSwatches } from './ColorSwatches';
import {
  addColorSwatch,
  addColorSwatches,
  moveColorSwatch,
  removeColorSwatch,
  resetColorSwatches,
  useColorSwatches,
  type ColorSwatch,
} from './colorSwatchStore';
import type { ColorSlot } from './editorToolStore';
import { exportGplPalette, parseGplPalette } from './gplPalette';

interface ColorControlsProps {
  readonly primaryColor: RgbaColor;
  readonly secondaryColor: RgbaColor;
  readonly activeSlot: ColorSlot;
  readonly onSelectSlot: (slot: ColorSlot) => void;
  readonly onChange: (slot: ColorSlot, color: RgbaColor) => void;
  readonly onSwap: () => void;
  readonly onReset: () => void;
}

interface NumericFieldProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}

function rgbaCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

function formatNumber(value: number, digits = 1): string {
  return Number(value.toFixed(digits)).toString();
}

function NumericField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
}: NumericFieldProps) {
  const [draft, setDraft] = useState<
    { readonly source: number; readonly value: string } | undefined
  >();
  const valueText = formatNumber(value);
  const displayedValue = draft?.source === value ? draft.value : valueText;

  const commit = () => {
    const parsed = Number(displayedValue);
    if (
      displayedValue.length > 0 &&
      Number.isFinite(parsed) &&
      parsed >= min &&
      parsed <= max
    ) {
      onChange(parsed);
    }
    setDraft(undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit();
      event.currentTarget.select();
    } else if (event.key === 'Escape') {
      setDraft(undefined);
      event.currentTarget.blur();
    }
  };

  return (
    <label className="advanced-color-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={displayedValue}
        onBlur={commit}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft({ source: value, value: next });
          const parsed = Number(next);
          if (
            next.length > 0 &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed <= max
          ) {
            onChange(parsed);
          }
        }}
        onKeyDown={handleKeyDown}
      />
    </label>
  );
}

interface AdvancedColorEditorProps {
  readonly color: RgbaColor;
  readonly onChange: (color: RgbaColor) => void;
}

function AdvancedColorEditor({ color, onChange }: AdvancedColorEditorProps) {
  const hsv = rgbaToHsv(color);
  const canonicalHex = colorToHex(color);
  const [hexDraft, setHexDraft] = useState<
    { readonly source: string; readonly value: string } | undefined
  >();
  const hexValue =
    hexDraft?.source === canonicalHex ? hexDraft.value : canonicalHex;

  const commitHex = () => {
    const parsed = parseExactHex(hexValue, color.a);
    if (parsed !== undefined) onChange(parsed);
    setHexDraft(undefined);
  };

  const updateRgb = (channel: 'r' | 'g' | 'b', value: number) => {
    onChange(canonicalizeRgba({ ...color, [channel]: value }));
  };

  const updateHsv = (channel: keyof HsvColor, value: number) => {
    onChange(hsvToRgba({ ...hsv, [channel]: value }, color.a));
  };

  return (
    <div className="advanced-color-editor">
      <div className="advanced-color-preview-row">
        <div
          className="advanced-color-preview"
          aria-label="Current exact color"
          style={{ backgroundColor: rgbaCss(color) }}
        />
        <label className="advanced-color-picker">
          <span>Picker</span>
          <input
            type="color"
            aria-label="Visual color picker"
            value={canonicalHex}
            onChange={(event) => {
              const parsed = parseExactHex(event.currentTarget.value, color.a);
              if (parsed !== undefined) onChange(parsed);
            }}
          />
        </label>
        <span className="advanced-color-rgba">
          {canonicalHex} · A {color.a}
        </span>
      </div>

      <label className="advanced-hex-field">
        <span>Hex</span>
        <input
          type="text"
          aria-label="Advanced hex color"
          aria-invalid={parseExactHex(hexValue, color.a) === undefined}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={hexValue}
          onBlur={commitHex}
          onChange={(event) =>
            setHexDraft({
              source: canonicalHex,
              value: event.currentTarget.value,
            })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitHex();
              event.currentTarget.select();
            } else if (event.key === 'Escape') {
              setHexDraft(undefined);
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      <div
        className="advanced-color-group"
        role="group"
        aria-label="RGB channels"
      >
        <span className="advanced-color-group__label">RGB</span>
        <NumericField
          label="R"
          ariaLabel="Red channel"
          min={0}
          max={255}
          step={1}
          value={color.r}
          onChange={(value) => updateRgb('r', value)}
        />
        <NumericField
          label="G"
          ariaLabel="Green channel"
          min={0}
          max={255}
          step={1}
          value={color.g}
          onChange={(value) => updateRgb('g', value)}
        />
        <NumericField
          label="B"
          ariaLabel="Blue channel"
          min={0}
          max={255}
          step={1}
          value={color.b}
          onChange={(value) => updateRgb('b', value)}
        />
      </div>

      <div
        className="advanced-color-group"
        role="group"
        aria-label="HSV channels"
      >
        <span className="advanced-color-group__label">HSV</span>
        <NumericField
          label="H°"
          ariaLabel="Hue channel"
          min={0}
          max={360}
          step={1}
          value={hsv.h}
          onChange={(value) => updateHsv('h', value)}
        />
        <NumericField
          label="S%"
          ariaLabel="Saturation channel"
          min={0}
          max={100}
          step={1}
          value={hsv.s}
          onChange={(value) => updateHsv('s', value)}
        />
        <NumericField
          label="V%"
          ariaLabel="Value channel"
          min={0}
          max={100}
          step={1}
          value={hsv.v}
          onChange={(value) => updateHsv('v', value)}
        />
      </div>

      <NumericField
        label="Alpha"
        ariaLabel="Advanced alpha channel"
        min={0}
        max={255}
        step={1}
        value={color.a}
        onChange={(value) => onChange({ ...color, a: Math.round(value) })}
      />
    </div>
  );
}

function swatchStyle(color: RgbaColor): CSSProperties {
  return { backgroundColor: rgbaCss(color) };
}

function swatchLabel(swatch: ColorSwatch): string {
  return swatch.name ?? colorToHex(swatch.color);
}

export function ColorControls({
  primaryColor,
  secondaryColor,
  activeSlot,
  onSelectSlot,
  onChange,
  onSwap,
  onReset,
}: ColorControlsProps) {
  const swatches = useColorSwatches();
  const activeColor = activeSlot === 'primary' ? primaryColor : secondaryColor;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [status, setStatus] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const addCurrentSwatch = () => {
    const swatch = addColorSwatch({ color: activeColor });
    setStatus(`Swatch ${colorToHex(swatch.color)} ready.`);
  };

  const applySwatch = (swatch: ColorSwatch, slot: ColorSlot) => {
    onChange(slot, swatch.color);
    setStatus(`${swatchLabel(swatch)} applied to ${slot}.`);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    try {
      const entries = parseGplPalette(await file.text());
      const added = addColorSwatches(entries);
      setStatus(`Imported ${added} new swatch${added === 1 ? '' : 'es'}.`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'The GPL palette could not be imported.',
      );
    } finally {
      input.value = '';
    }
  };

  const exportSwatches = () => {
    const text = exportGplPalette(
      swatches.map(({ color, name }) => ({ color, name })),
    );
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'minecraft-skin-editor-swatches.gpl';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(
      `Exported ${swatches.length} swatch${swatches.length === 1 ? '' : 'es'}.`,
    );
  };

  return (
    <div className="color-controls" aria-label="Color controls">
      <ColorSwatches
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        activeSlot={activeSlot}
        onSelectSlot={onSelectSlot}
        onChange={onChange}
        onSwap={onSwap}
        onReset={onReset}
      />
      <button
        type="button"
        className="color-controls__button"
        aria-expanded={isAdvancedOpen}
        aria-controls="advanced-color-controls"
        onClick={() => setIsAdvancedOpen((open) => !open)}
      >
        {isAdvancedOpen ? 'Close color' : 'Color controls'}
      </button>
      <button
        type="button"
        className="color-controls__button"
        aria-label="Add current color to swatches"
        title={`Add ${activeSlot} color to local swatches`}
        onClick={addCurrentSwatch}
      >
        + Swatch
      </button>

      {isAdvancedOpen ? (
        <div
          id="advanced-color-controls"
          className="color-advanced-panel"
          role="dialog"
          aria-label="Advanced color controls"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsAdvancedOpen(false);
          }}
        >
          <header className="color-advanced-panel__header">
            <span>Advanced color</span>
            <span>{activeSlot}</span>
          </header>
          <AdvancedColorEditor
            color={activeColor}
            onChange={(color) => onChange(activeSlot, color)}
          />

          <section className="color-swatch-library" aria-label="Local swatches">
            <div className="color-swatch-library__header">
              <span>Local swatches</span>
              <button type="button" onClick={addCurrentSwatch}>
                Add current
              </button>
            </div>
            {swatches.length === 0 ? (
              <p className="color-swatch-library__empty">No saved swatches.</p>
            ) : (
              <ol className="color-swatch-list">
                {swatches.map((swatch, index) => {
                  const label = swatchLabel(swatch);
                  return (
                    <li className="color-swatch-list__item" key={swatch.id}>
                      <button
                        type="button"
                        className="color-swatch-list__chip"
                        aria-label={`Apply ${label} swatch to active color`}
                        title={`Apply ${label} to ${activeSlot}`}
                        style={swatchStyle(swatch.color)}
                        onClick={() => applySwatch(swatch, activeSlot)}
                      />
                      <span className="color-swatch-list__name">{label}</span>
                      <button
                        type="button"
                        className="color-swatch-list__slot"
                        aria-label={`Apply ${label} swatch to Primary`}
                        title="Apply to Primary"
                        onClick={() => applySwatch(swatch, 'primary')}
                      >
                        P
                      </button>
                      <button
                        type="button"
                        className="color-swatch-list__slot"
                        aria-label={`Apply ${label} swatch to Secondary`}
                        title="Apply to Secondary"
                        onClick={() => applySwatch(swatch, 'secondary')}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        className="color-swatch-list__icon"
                        aria-label={`Move ${label} swatch up`}
                        disabled={index === 0}
                        onClick={() => moveColorSwatch(swatch.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="color-swatch-list__icon"
                        aria-label={`Move ${label} swatch down`}
                        disabled={index === swatches.length - 1}
                        onClick={() => moveColorSwatch(swatch.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="color-swatch-list__icon"
                        aria-label={`Remove ${label} swatch`}
                        onClick={() => removeColorSwatch(swatch.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <div className="color-palette-actions">
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              Import GPL
            </button>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept=".gpl,text/plain"
              aria-label="Import GPL palette"
              onChange={(event) => void handleImport(event)}
            />
            <button
              type="button"
              disabled={swatches.length === 0}
              onClick={exportSwatches}
            >
              Export GPL
            </button>
            <button type="button" onClick={resetColorSwatches}>
              Restore defaults
            </button>
          </div>
          <output className="color-control-status" aria-live="polite">
            {status}
          </output>
        </div>
      ) : null}
    </div>
  );
}
