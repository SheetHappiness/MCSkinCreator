import type { RgbaColor } from '../../engine/document';

function channelToHex(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

export function colorToHex(color: RgbaColor): string {
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`.toUpperCase();
}

export function parseExactHex(
  value: string,
  alpha: number,
): RgbaColor | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    return undefined;
  }

  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
    a: alpha,
  };
}
