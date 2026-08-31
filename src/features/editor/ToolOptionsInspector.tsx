import type { EditorTool } from '../../engine/tools';
import {
  STAMP_PATTERN_LABELS,
  isAdvancedPaintTool,
  type AdvancedPaintTool,
  type NoiseToolOptions,
  type StampPattern,
} from '../../engine/tools/AdvancedPaintTools';
import {
  SYMMETRY_MODE_LABELS,
  SYMMETRY_MODES,
  type SymmetryMode,
} from '../../engine/symmetry';
import { cancelActiveEditorInteraction } from './activeEditorInteraction';
import {
  getToolOptionSummary,
  getToolOptions,
  setToolOptions,
  toolLabel,
  useToolOptions,
} from './toolOptions';
import { setSymmetryMode, useSymmetryMode } from './symmetryStore';

interface ToolOptionsInspectorProps {
  readonly activeTool: EditorTool;
}

interface RangeOptionProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}

function RangeOption({ label, ariaLabel, value, onChange }: RangeOptionProps) {
  const percentage = Math.round(value * 100);
  return (
    <label className="tool-options-inspector__control">
      <span>{label}</span>
      <input
        className="ts-range"
        type="range"
        aria-label={ariaLabel}
        min={0}
        max={100}
        step={1}
        value={percentage}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
      />
      <output aria-label={`${label} value`}>{percentage}%</output>
    </label>
  );
}

function NoiseSeedOption({ options }: { readonly options: NoiseToolOptions }) {
  return (
    <label className="tool-options-inspector__control tool-options-inspector__seed">
      <span>Seed</span>
      <input
        className="ts-field"
        type="number"
        aria-label="Noise seed"
        min={0}
        max={0xffffffff}
        step={1}
        value={options.seed}
        onChange={(event) => {
          const seed = Number(event.currentTarget.value);
          if (Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff) {
            setToolOptions('noise', { ...options, seed });
          }
        }}
      />
    </label>
  );
}

function StampPatternOption() {
  const options = getToolOptions('stamp');
  const patterns = Object.keys(STAMP_PATTERN_LABELS) as StampPattern[];
  return (
    <label className="tool-options-inspector__control tool-options-inspector__select">
      <span>Pattern</span>
      <select
        className="ts-field"
        aria-label="Stamp pattern"
        value={options.pattern}
        onChange={(event) => {
          const pattern = event.currentTarget.value;
          if (pattern in STAMP_PATTERN_LABELS) {
            setToolOptions('stamp', { pattern: pattern as StampPattern });
          }
        }}
      >
        {patterns.map((pattern) => (
          <option key={pattern} value={pattern}>
            {STAMP_PATTERN_LABELS[pattern]}
          </option>
        ))}
      </select>
    </label>
  );
}

function AdvancedToolControls({ tool }: { readonly tool: AdvancedPaintTool }) {
  if (tool === 'lighten') {
    const options = getToolOptions('lighten');
    return (
      <div className="tool-options-inspector__controls">
        <RangeOption
          label="Strength"
          ariaLabel="Lighten strength"
          value={options.strength}
          onChange={(strength) => setToolOptions('lighten', { strength })}
        />
        <p className="tool-options-inspector__note">
          HSV value toward white · alpha preserved
        </p>
      </div>
    );
  }

  if (tool === 'darken') {
    const options = getToolOptions('darken');
    return (
      <div className="tool-options-inspector__controls">
        <RangeOption
          label="Strength"
          ariaLabel="Darken strength"
          value={options.strength}
          onChange={(strength) => setToolOptions('darken', { strength })}
        />
        <p className="tool-options-inspector__note">
          HSV value toward black · alpha preserved
        </p>
      </div>
    );
  }

  if (tool === 'noise') {
    const options = getToolOptions('noise');
    return (
      <div className="tool-options-inspector__controls">
        <RangeOption
          label="Strength"
          ariaLabel="Noise strength"
          value={options.strength}
          onChange={(strength) =>
            setToolOptions('noise', { ...options, strength })
          }
        />
        <RangeOption
          label="Density"
          ariaLabel="Noise density"
          value={options.density}
          onChange={(density) =>
            setToolOptions('noise', { ...options, density })
          }
        />
        <NoiseSeedOption options={options} />
        <p className="tool-options-inspector__note">
          Luminance offset ±64 · alpha preserved
        </p>
      </div>
    );
  }

  return (
    <div className="tool-options-inspector__controls">
      <StampPatternOption />
      <p className="tool-options-inspector__note">
        Anchor is the picked texel; edges clip safely
      </p>
    </div>
  );
}

function symmetrySupportsTool(tool: EditorTool): boolean {
  return tool !== 'selection' && tool !== 'eyedropper';
}

function SymmetryOption({ activeTool }: { readonly activeTool: EditorTool }) {
  const mode = useSymmetryMode();
  const supportsTool = symmetrySupportsTool(activeTool);

  return (
    <div
      className="tool-options-inspector__symmetry"
      data-symmetry-mode={mode}
      data-symmetry-supported={supportsTool ? 'true' : 'false'}
    >
      <label className="tool-options-inspector__control tool-options-inspector__select">
        <span>Symmetry</span>
        <select
          className="ts-field"
          aria-label="Symmetry"
          value={mode}
          onChange={(event) => {
            const nextMode = event.currentTarget.value as SymmetryMode;
            if (!SYMMETRY_MODES.includes(nextMode)) return;
            cancelActiveEditorInteraction();
            setSymmetryMode(nextMode);
          }}
        >
          {SYMMETRY_MODES.map((symmetryMode) => (
            <option key={symmetryMode} value={symmetryMode}>
              {SYMMETRY_MODE_LABELS[symmetryMode]}
            </option>
          ))}
        </select>
      </label>
      <p className="tool-options-inspector__note">
        {supportsTool
          ? mode === 'body-pair'
            ? 'Paired arms and legs · canonical face orientation'
            : mode === 'mirror'
              ? 'Canvas axis · exact RGBA targets'
              : 'Single target · exact RGBA'
          : 'Painting only · sampling and selection are unchanged'}
      </p>
    </div>
  );
}

/**
 * Presents fixed core semantics and real advanced-tool controls through the
 * same typed options source.
 */
export function ToolOptionsInspector({
  activeTool,
}: ToolOptionsInspectorProps) {
  useToolOptions(activeTool);
  const summaries = getToolOptionSummary(activeTool);
  const advanced = isAdvancedPaintTool(activeTool);

  return (
    <section
      className="tool-options-inspector"
      aria-label="Tool options"
      aria-live="polite"
      data-tool={activeTool}
    >
      <header className="tool-options-inspector__header">
        <span>Tool options</span>
        <span>{toolLabel(activeTool)}</span>
      </header>
      <SymmetryOption activeTool={activeTool} />
      {advanced ? (
        <AdvancedToolControls tool={activeTool} />
      ) : (
        <dl className="tool-options-inspector__list">
          {summaries.map((summary) => (
            <div className="tool-options-inspector__row" key={summary.key}>
              <dt>{summary.label}</dt>
              <dd>
                <output
                  aria-label={`${summary.label} option`}
                  data-option={summary.key}
                >
                  {summary.value}
                </output>
                {summary.fixed ? (
                  <span className="tool-options-inspector__fixed">fixed</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
