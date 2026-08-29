import type { EditorTool } from '../../engine/tools';
import { getToolOptionSummary, toolLabel } from './toolOptions';

interface ToolOptionsInspectorProps {
  readonly activeTool: EditorTool;
}

/**
 * Presents the current core-tool contract without inventing editable inputs.
 * P06 can add real controls while retaining this contextual surface and the
 * typed store boundary.
 */
export function ToolOptionsInspector({
  activeTool,
}: ToolOptionsInspectorProps) {
  const summaries = getToolOptionSummary(activeTool);

  return (
    <section
      className="tool-options-inspector"
      aria-label="Tool options"
      data-tool={activeTool}
    >
      <header className="tool-options-inspector__header">
        <span>Tool options</span>
        <span>{toolLabel(activeTool)}</span>
      </header>
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
    </section>
  );
}
