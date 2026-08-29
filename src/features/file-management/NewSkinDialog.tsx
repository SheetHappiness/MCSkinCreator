import { useEffect, useState } from 'react';

import type { SkinModel } from '../../engine/document';

interface NewSkinDialogProps {
  readonly isOpen: boolean;
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onCreate: (model: SkinModel) => void;
}

const MODEL_OPTIONS: readonly {
  readonly model: SkinModel;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    model: 'classic',
    label: 'Classic',
    description: 'Standard 4-pixel arms',
  },
  { model: 'slim', label: 'Slim', description: 'Narrow 3-pixel arms' },
];

export function NewSkinDialog({
  isOpen,
  isBusy,
  onCancel,
  onCreate,
}: NewSkinDialogProps) {
  const [model, setModel] = useState<SkinModel>('classic');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="new-skin-dialog-backdrop">
      <section
        className="new-skin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-skin-dialog-title"
      >
        <header className="new-skin-dialog__header">
          <h2 id="new-skin-dialog-title">New Skin</h2>
          <span>64×64 · transparent blank</span>
        </header>
        <div
          className="new-skin-dialog__models"
          role="group"
          aria-label="Skin model"
        >
          {MODEL_OPTIONS.map(({ model: option, label, description }) => (
            <button
              key={option}
              type="button"
              aria-label={`${label} skin model`}
              aria-pressed={model === option}
              disabled={isBusy}
              onClick={() => setModel(option)}
            >
              <span>{label}</span>
              <small>{description}</small>
            </button>
          ))}
        </div>
        <footer className="new-skin-dialog__actions">
          <button type="button" disabled={isBusy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="new-skin-dialog__create"
            disabled={isBusy}
            onClick={() => onCreate(model)}
          >
            Create
          </button>
        </footer>
      </section>
    </div>
  );
}
