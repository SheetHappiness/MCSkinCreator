import type { RgbaColor } from '../../engine/document';

export interface GplPaletteEntry {
  readonly color: RgbaColor;
  readonly name?: string;
}

function parseChannel(value: string, lineNumber: number): number {
  const channel = Number(value);
  if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
    throw new Error(`Invalid GPL RGB channel on line ${lineNumber}.`);
  }
  return channel;
}

/** Parses the text subset emitted by GIMP palettes and common GPL tools. */
export function parseGplPalette(text: string): readonly GplPaletteEntry[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === 'gimp palette',
  );
  if (headerIndex < 0) {
    throw new Error('This file is not a GIMP .gpl palette.');
  }

  const entries: GplPaletteEntry[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index]!.trim();
    if (
      line.length === 0 ||
      line.startsWith('#') ||
      /^(name|columns)\s*:/i.test(line)
    ) {
      continue;
    }

    const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s+(.*?))?$/);
    if (match === null) {
      throw new Error(`Invalid GPL palette row on line ${lineNumber}.`);
    }

    const [, red, green, blue, rawName] = match;
    const name = rawName?.trim();
    entries.push({
      color: {
        r: parseChannel(red!, lineNumber),
        g: parseChannel(green!, lineNumber),
        b: parseChannel(blue!, lineNumber),
        a: 255,
      },
      ...(name === undefined || name.length === 0 ? {} : { name }),
    });
  }

  if (entries.length === 0) {
    throw new Error('The GPL palette does not contain any colors.');
  }
  return entries;
}

function safePaletteName(name: string): string {
  const normalized = name.replace(/[\r\n]+/g, ' ').trim();
  return normalized.length === 0
    ? 'Minecraft Skin Editor Swatches'
    : normalized;
}

/** Exports exact RGB channels; GPL has no alpha field, so export documents that limitation. */
export function exportGplPalette(
  entries: readonly GplPaletteEntry[],
  name = 'Minecraft Skin Editor Swatches',
): string {
  const lines = [
    'GIMP Palette',
    `Name: ${safePaletteName(name)}`,
    `Columns: ${Math.min(8, Math.max(1, entries.length))}`,
    '# Alpha is not represented by GPL; exported rows contain RGB only.',
    '#',
  ];

  for (const entry of entries) {
    const label = entry.name?.replace(/[\r\n]+/g, ' ').trim();
    lines.push(
      `${entry.color.r} ${entry.color.g} ${entry.color.b}${label === undefined || label.length === 0 ? '' : ` ${label}`}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
