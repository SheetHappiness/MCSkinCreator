import { useEffect, useRef, useState } from 'react';

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

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function NewSkinDialog({
  isOpen,
  isBusy,
  onCancel,
  onCreate,
}: NewSkinDialogProps) {
  const [model, setModel] = useState<SkinModel>('classic');
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement;
    returnFocusRef.current =
      previouslyFocused instanceof HTMLElement ? previouslyFocused : undefined;

    const dialog = dialogRef.current;
    const firstFocusable =
      dialog === null ? undefined : getFocusableElements(dialog)[0];
    (firstFocusable ?? dialog)?.focus({ preventScroll: true });

    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = undefined;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(event.currentTarget);
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      return;
    }

    const activeElement = document.activeElement;
    const currentIndex = focusable.indexOf(
      activeElement instanceof HTMLElement ? activeElement : focusable[0]!,
    );

    if (currentIndex === -1) {
      event.preventDefault();
      const target = event.shiftKey ? focusable.at(-1) : focusable[0];
      target?.focus({ preventScroll: true });
    } else if (event.shiftKey && currentIndex === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus({ preventScroll: true });
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0]?.focus({ preventScroll: true });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="new-skin-dialog-backdrop">
      <section
        ref={dialogRef}
        className="new-skin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-skin-dialog-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
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
              className="ts-button"
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
          <button
            type="button"
            className="ts-button"
            disabled={isBusy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="new-skin-dialog__create ts-button ts-button--primary"
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
