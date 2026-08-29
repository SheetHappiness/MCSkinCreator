interface CollapsedWorkspacePanelProps {
  readonly side: 'left' | 'right';
  readonly panelLabel: string;
  readonly shortLabel: string;
  readonly onRestore: () => void;
}

/** Keeps a collapsed panel discoverable without unmounting its live content. */
export function CollapsedWorkspacePanel({
  side,
  panelLabel,
  shortLabel,
  onRestore,
}: CollapsedWorkspacePanelProps) {
  return (
    <aside
      className={`workspace-collapsed-panel workspace-collapsed-panel--${side}`}
      aria-label={`Collapsed ${panelLabel} panel`}
    >
      <button
        type="button"
        aria-label={`Expand ${panelLabel}`}
        title={`Expand ${panelLabel}`}
        onClick={onRestore}
      >
        {side === 'left' ? '›' : '‹'}
      </button>
      <span aria-hidden="true">{shortLabel}</span>
    </aside>
  );
}
