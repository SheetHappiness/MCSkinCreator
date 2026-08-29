import { useState, useSyncExternalStore } from 'react';

import type {
  DocumentHistory,
  DocumentHistoryTimelineEntry,
} from '../../engine/history';

interface HistoryTimelineProps {
  readonly history: DocumentHistory;
}

function describeEntry(entry: DocumentHistoryTimelineEntry): string {
  if (entry.kind === 'initial') return 'Baseline';
  if (entry.hasModelChange) return 'Model';
  return `${entry.pixelCount} px`;
}

function describeState(entry: DocumentHistoryTimelineEntry): string {
  if (entry.isCurrent) return 'Current';
  return entry.state === 'undoable' ? 'Undo' : 'Redo';
}

export function HistoryTimeline({ history }: HistoryTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const timeline = useSyncExternalStore(
    (listener) => history.subscribeTimeline(listener),
    () => history.getTimelineState(),
    () => history.getTimelineState(),
  );
  const currentEntry = timeline.entries.find((entry) => entry.isCurrent);
  const currentLabel = currentEntry?.label ?? 'Initial state';
  const currentPosition = timeline.currentIndex + 2;

  return (
    <section className="history-timeline" aria-label="History timeline">
      <button
        type="button"
        className="history-timeline__summary"
        aria-expanded={isExpanded}
        aria-controls="history-timeline-list"
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span className="history-timeline__title">History</span>
        <span className="history-timeline__current" title={currentLabel}>
          {currentLabel}
        </span>
        <span className="history-timeline__position">
          {currentPosition} / {timeline.entries.length}
        </span>
        <span className="history-timeline__toggle" aria-hidden="true">
          {isExpanded ? '−' : '+'}
        </span>
      </button>

      {isExpanded ? (
        <div className="history-timeline__body" id="history-timeline-list">
          <ol className="history-timeline__entries">
            {timeline.entries.map((entry) => (
              <li key={entry.index}>
                <button
                  type="button"
                  className="history-timeline__entry"
                  data-history-index={entry.index}
                  data-history-state={entry.state}
                  aria-current={entry.isCurrent ? 'step' : undefined}
                  aria-label={`${entry.label} · ${describeState(entry)}${entry.isSaved ? ' · Saved' : ''}`}
                  onClick={() => history.jumpTo(entry.index)}
                >
                  <span className="history-timeline__entry-label">
                    {entry.label}
                  </span>
                  <span className="history-timeline__entry-meta">
                    {describeEntry(entry)}
                    <span aria-hidden="true"> · </span>
                    {describeState(entry)}
                    {entry.isSaved ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        Saved
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {timeline.savedIndex === undefined ? (
            <p className="history-timeline__note">
              Saved state is outside the retained history.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
