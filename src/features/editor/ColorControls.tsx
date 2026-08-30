import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { RgbaColor } from '../../engine/document';
import { colorToHex, colorToHexRgba, parseExactHex } from './colorHex';
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
  MAX_RECENT_COLORS,
  moveColorSwatch,
  recordRecentColor,
  removeColorSwatch,
  resetColorSwatches,
  resetRecentColors,
  useColorSwatches,
  useRecentColors,
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
  readonly integer?: boolean;
  readonly onChange: (value: number) => void;
}

function rgbaCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

function formatNumber(value: number, digits = 1): string {
  return Number(value.toFixed(digits)).toString();
}

function isNumericValueValid(
  text: string,
  min: number,
  max: number,
  integer: boolean,
): boolean {
  const parsed = Number(text);
  return (
    text.length > 0 &&
    Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max &&
    (!integer || Number.isInteger(parsed))
  );
}

function NumericField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
}: NumericFieldProps) {
  const [draft, setDraft] = useState<
    { readonly source: number; readonly value: string } | undefined
  >();
  const ignoreNextBlurRef = useRef(false);
  const valueText = formatNumber(value, integer ? 0 : 1);
  const displayedValue = draft?.source === value ? draft.value : valueText;
  const isValid = isNumericValueValid(displayedValue, min, max, integer);

  const commit = () => {
    if (isValid) onChange(Number(displayedValue));
    setDraft(undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit();
      event.currentTarget.select();
    } else if (event.key === 'Escape') {
      ignoreNextBlurRef.current = true;
      event.stopPropagation();
      setDraft(undefined);
      event.currentTarget.blur();
    }
  };

  return (
    <label className="advanced-color-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        aria-label={ariaLabel}
        aria-invalid={!isValid}
        min={min}
        max={max}
        step={step}
        value={displayedValue}
        onBlur={() => {
          if (ignoreNextBlurRef.current) {
            ignoreNextBlurRef.current = false;
            setDraft(undefined);
            return;
          }
          commit();
        }}
        onFocus={() => {
          ignoreNextBlurRef.current = false;
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft({ source: value, value: next });
          if (isNumericValueValid(next, min, max, integer)) {
            onChange(Number(next));
          }
        }}
        onKeyDown={handleKeyDown}
      />
    </label>
  );
}

interface SaturationValuePickerProps {
  readonly hsv: HsvColor;
  readonly onChange: (hsv: HsvColor) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pickerHsvFromPointer(
  element: HTMLDivElement,
  clientX: number,
  clientY: number,
  hsv: HsvColor,
): HsvColor {
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return hsv;
  return {
    ...hsv,
    s: clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100),
    v: clamp(100 - ((clientY - bounds.top) / bounds.height) * 100, 0, 100),
  };
}

function SaturationValuePicker({ hsv, onChange }: SaturationValuePickerProps) {
  const activePointerIdRef = useRef<number | undefined>(undefined);

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    onChange(
      pickerHsvFromPointer(
        event.currentTarget,
        event.clientX,
        event.clientY,
        hsv,
      ),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? 10 : 1;
    let saturation = hsv.s;
    let value = hsv.v;
    if (event.key === 'ArrowLeft') saturation -= amount;
    else if (event.key === 'ArrowRight') saturation += amount;
    else if (event.key === 'ArrowDown') value -= amount;
    else if (event.key === 'ArrowUp') value += amount;
    else if (event.key === 'Home') saturation = 0;
    else if (event.key === 'End') saturation = 100;
    else return;

    event.preventDefault();
    onChange({
      ...hsv,
      s: clamp(saturation, 0, 100),
      v: clamp(value, 0, 100),
    });
  };

  return (
    <div
      className="advanced-color-sv-picker"
      role="slider"
      aria-label="Visual color picker"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s)}
      aria-valuetext={`Saturation ${formatNumber(hsv.s)}%, Value ${formatNumber(hsv.v)}%`}
      tabIndex={0}
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
      }}
      onKeyDown={handleKeyDown}
      onPointerCancel={(event) => {
        if (activePointerIdRef.current === event.pointerId) {
          activePointerIdRef.current = undefined;
        }
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        activePointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (
          activePointerIdRef.current === event.pointerId ||
          event.currentTarget.hasPointerCapture?.(event.pointerId)
        ) {
          updateFromPointer(event);
        }
      }}
      onPointerUp={(event) => {
        if (
          activePointerIdRef.current === event.pointerId ||
          event.currentTarget.hasPointerCapture?.(event.pointerId)
        ) {
          updateFromPointer(event);
          activePointerIdRef.current = undefined;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
      }}
    >
      <span
        className="advanced-color-sv-picker__cursor"
        aria-hidden="true"
        style={{
          left: `${hsv.s}%`,
          top: `${100 - hsv.v}%`,
        }}
      />
    </div>
  );
}

interface AdvancedColorEditorProps {
  readonly color: RgbaColor;
  readonly onChange: (color: RgbaColor) => void;
}

function AdvancedColorEditor({ color, onChange }: AdvancedColorEditorProps) {
  const hsv = rgbaToHsv(color);
  const canonicalHex = colorToHexRgba(color);
  const ignoreHexBlurRef = useRef(false);
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

  const updatePickerHsv = (nextHsv: HsvColor) => {
    onChange(hsvToRgba(nextHsv, color.a));
  };

  return (
    <div className="advanced-color-editor">
      <div className="advanced-color-preview-row">
        <div
          className="advanced-color-preview"
          aria-label="Current exact color"
          style={{ backgroundColor: rgbaCss(color) }}
        />
        <div className="advanced-color-preview-copy">
          <strong>{colorToHex(color)}</strong>
          <span>RGBA alpha {color.a}</span>
        </div>
      </div>

      <div className="advanced-color-picker-field">
        <SaturationValuePicker hsv={hsv} onChange={updatePickerHsv} />
        <label className="advanced-color-hue-picker">
          <span>Hue</span>
          <input
            type="range"
            aria-label="Hue picker"
            min={0}
            max={360}
            step={1}
            value={hsv.h}
            style={{
              background:
                'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
            onChange={(event) =>
              updateHsv('h', Number(event.currentTarget.value))
            }
          />
        </label>
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
          placeholder="#RRGGBB or #RRGGBBAA"
          value={hexValue}
          onBlur={() => {
            if (ignoreHexBlurRef.current) {
              ignoreHexBlurRef.current = false;
              setHexDraft(undefined);
              return;
            }
            commitHex();
          }}
          onFocus={() => {
            ignoreHexBlurRef.current = false;
          }}
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
              ignoreHexBlurRef.current = true;
              event.stopPropagation();
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
          integer
          value={color.r}
          onChange={(value) => updateRgb('r', value)}
        />
        <NumericField
          label="G"
          ariaLabel="Green channel"
          min={0}
          max={255}
          step={1}
          integer
          value={color.g}
          onChange={(value) => updateRgb('g', value)}
        />
        <NumericField
          label="B"
          ariaLabel="Blue channel"
          min={0}
          max={255}
          step={1}
          integer
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
        integer
        value={color.a}
        onChange={(value) => onChange({ ...color, a: value })}
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

function slotLabel(slot: ColorSlot): string {
  return slot === 'primary' ? 'Primary' : 'Secondary';
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
  const recentColors = useRecentColors();
  const activeColor = activeSlot === 'primary' ? primaryColor : secondaryColor;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [status, setStatus] = useState('');
  const colorControlsRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const advancedPanelRef = useRef<HTMLDivElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);

  const closeAdvanced = (restoreFocus = true) => {
    setIsAdvancedOpen(false);
    if (restoreFocus) {
      advancedTriggerRef.current?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    if (!isAdvancedOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        colorControlsRef.current?.contains(target) ||
        advancedPanelRef.current?.contains(target) ||
        advancedTriggerRef.current?.contains(target)
      ) {
        return;
      }
      closeAdvanced(false);
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () =>
      window.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [isAdvancedOpen]);

  useEffect(() => {
    if (!isAdvancedOpen) return;
    advancedPanelRef.current?.focus({ preventScroll: true });
  }, [isAdvancedOpen]);

  const handleColorChange = (slot: ColorSlot, color: RgbaColor) => {
    onChange(slot, color);
    recordRecentColor(color);
  };

  const addCurrentSwatch = () => {
    recordRecentColor(activeColor);
    const swatch = addColorSwatch({ color: activeColor });
    setStatus(`Swatch ${colorToHex(swatch.color)} ready.`);
  };

  const applyRecent = (color: RgbaColor) => {
    handleColorChange(activeSlot, color);
    setStatus(`${colorToHex(color)} applied to ${slotLabel(activeSlot)}.`);
  };

  const applySwatch = (swatch: ColorSwatch, slot: ColorSlot) => {
    handleColorChange(slot, swatch.color);
    setStatus(`${swatchLabel(swatch)} applied to ${slotLabel(slot)}.`);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
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
    <div
      ref={colorControlsRef}
      className="color-controls"
      aria-label="Color controls"
    >
      <ColorSwatches
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        activeSlot={activeSlot}
        onSelectSlot={onSelectSlot}
        onChange={handleColorChange}
        onSwap={onSwap}
        onReset={onReset}
      />
      <button
        ref={advancedTriggerRef}
        type="button"
        className="color-controls__button"
        aria-expanded={isAdvancedOpen}
        aria-controls="advanced-color-controls"
        aria-haspopup="dialog"
        onClick={() => {
          if (isAdvancedOpen) closeAdvanced();
          else setIsAdvancedOpen(true);
        }}
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
          ref={advancedPanelRef}
          id="advanced-color-controls"
          className="color-advanced-panel"
          role="dialog"
          aria-label="Advanced color controls"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeAdvanced();
            }
          }}
        >
          <header className="color-advanced-panel__header">
            <span>Advanced color</span>
            <span>{slotLabel(activeSlot)}</span>
          </header>
          <AdvancedColorEditor
            color={activeColor}
            onChange={(color) => handleColorChange(activeSlot, color)}
          />

          <section className="color-recent-library" aria-label="Recent colors">
            <div className="color-library__header">
              <span>Recent colors</span>
              <span>
                {recentColors.length}/{MAX_RECENT_COLORS}
              </span>
            </div>
            {recentColors.length === 0 ? (
              <p className="color-library__empty">
                Colors you use will appear here.
              </p>
            ) : (
              <div className="color-recent-list">
                {recentColors.map((color, index) => {
                  const hex = colorToHex(color);
                  return (
                    <button
                      key={`${colorToHexRgba(color)}-${index}`}
                      type="button"
                      className="color-recent-list__chip"
                      aria-label={`Apply recent ${hex} color to ${slotLabel(activeSlot)}`}
                      title={`${hex} · A ${color.a} · Apply to ${slotLabel(activeSlot)}`}
                      data-color={colorToHexRgba(color)}
                      style={swatchStyle(color)}
                      onClick={() => applyRecent(color)}
                    />
                  );
                })}
              </div>
            )}
            <button
              type="button"
              className="color-library__clear"
              disabled={recentColors.length === 0}
              onClick={resetRecentColors}
            >
              Clear recent
            </button>
          </section>

          <section className="color-swatch-library" aria-label="Local swatches">
            <div className="color-library__header">
              <span>Local swatches</span>
              <button type="button" onClick={addCurrentSwatch}>
                Add current
              </button>
            </div>
            {swatches.length === 0 ? (
              <p className="color-library__empty">No saved swatches.</p>
            ) : (
              <ol className="color-swatch-list">
                {swatches.map((swatch, index) => {
                  const label = swatchLabel(swatch);
                  const exactColor = colorToHexRgba(swatch.color);
                  return (
                    <li className="color-swatch-list__item" key={swatch.id}>
                      <button
                        type="button"
                        className="color-swatch-list__chip"
                        aria-label={`Apply ${label} swatch to active color`}
                        title={`${label} · ${exactColor} · Apply to ${slotLabel(activeSlot)}`}
                        data-color={exactColor}
                        style={swatchStyle(swatch.color)}
                        onClick={() => applySwatch(swatch, activeSlot)}
                      />
                      <span
                        className="color-swatch-list__name"
                        title={exactColor}
                      >
                        {label}
                      </span>
                      <button
                        type="button"
                        className="color-swatch-list__slot"
                        aria-label={`Apply ${label} swatch to Primary`}
                        title={`Apply ${exactColor} to Primary`}
                        onClick={() => applySwatch(swatch, 'primary')}
                      >
                        P
                      </button>
                      <button
                        type="button"
                        className="color-swatch-list__slot"
                        aria-label={`Apply ${label} swatch to Secondary`}
                        title={`Apply ${exactColor} to Secondary`}
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
