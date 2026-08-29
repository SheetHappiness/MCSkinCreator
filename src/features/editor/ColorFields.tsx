import { useState, type KeyboardEvent } from 'react';

import type { RgbaColor } from '../../engine/document';
import { colorToHex, parseExactHex } from './colorHex';

interface ColorFieldsProps {
  readonly color: RgbaColor;
  readonly colorSlot?: 'Primary' | 'Secondary';
  readonly onChange: (color: RgbaColor) => void;
}

export function ColorFields({ color, colorSlot, onChange }: ColorFieldsProps) {
  const canonicalHex = colorToHex(color);
  const [hexDraft, setHexDraft] = useState<
    { readonly source: string; readonly value: string } | undefined
  >();
  const [alphaDraft, setAlphaDraft] = useState<
    { readonly source: number; readonly value: string } | undefined
  >();
  const hexValue =
    hexDraft?.source === canonicalHex ? hexDraft.value : canonicalHex;
  const alphaValue =
    alphaDraft?.source === color.a ? alphaDraft.value : String(color.a);
  const hexIsValid = parseExactHex(hexValue, color.a) !== undefined;
  const parsedAlpha = Number(alphaValue);
  const alphaIsValid =
    /^\d{1,3}$/.test(alphaValue) &&
    Number.isInteger(parsedAlpha) &&
    parsedAlpha >= 0 &&
    parsedAlpha <= 255;

  const commitHex = () => {
    const parsed = parseExactHex(hexValue, color.a);
    if (parsed !== undefined) {
      onChange(parsed);
      setHexDraft(undefined);
    }
  };

  const commitAlpha = () => {
    if (alphaIsValid) {
      onChange({ ...color, a: parsedAlpha });
      setAlphaDraft(undefined);
    }
  };

  const handleCommitKey = (
    event: KeyboardEvent<HTMLInputElement>,
    commit: () => void,
    reset: () => void,
  ) => {
    if (event.key === 'Enter') {
      commit();
      event.currentTarget.select();
    } else if (event.key === 'Escape') {
      reset();
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className="color-fields"
      aria-label={
        colorSlot === undefined
          ? 'Exact paint color'
          : `Exact ${colorSlot.toLowerCase()} paint color`
      }
    >
      <label className="color-field color-field--hex">
        <span>Hex</span>
        <input
          type="text"
          aria-label="Paint hex color"
          aria-invalid={!hexIsValid}
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
          onKeyDown={(event) =>
            handleCommitKey(event, commitHex, () => setHexDraft(undefined))
          }
        />
      </label>
      <label className="color-field color-field--alpha">
        <span>Alpha</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Paint alpha"
          aria-invalid={!alphaIsValid}
          autoComplete="off"
          value={alphaValue}
          onBlur={commitAlpha}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setAlphaDraft({ source: color.a, value: next });
            const numeric = Number(next);
            if (
              /^\d{1,3}$/.test(next) &&
              Number.isInteger(numeric) &&
              numeric >= 0 &&
              numeric <= 255
            ) {
              onChange({ ...color, a: numeric });
            }
          }}
          onKeyDown={(event) =>
            handleCommitKey(event, commitAlpha, () => setAlphaDraft(undefined))
          }
        />
      </label>
    </div>
  );
}
