import type {RGB} from './data';

export function parseColor(s: string): RGB | null {
  const trimmed = s.trim();
  if (trimmed.startsWith('#')) return parseHex(trimmed);
  return parseNamed(trimmed);
}

function parseHex(s: string): RGB | null {
  const hex = s.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0], 16);
    const g = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r * 17, g * 17, b * 17];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

const NAMED_COLORS: Record<string, RGB> = {
  black:   [0, 0, 0],
  white:   [255, 255, 255],
  red:     [255, 0, 0],
  green:   [0, 128, 0],
  blue:    [0, 0, 255],
  yellow:  [255, 255, 0],
  cyan:    [0, 255, 255],
  magenta: [255, 0, 255],
  gray:    [128, 128, 128],
  grey:    [128, 128, 128],
  orange:  [255, 165, 0],
  purple:  [128, 0, 128],
  pink:    [255, 192, 203],
  brown:   [139, 69, 19],
};

function parseNamed(s: string): RGB | null {
  return NAMED_COLORS[s.toLowerCase()] ?? null;
}

export class FrameColors {
  constructor(
    public readonly foreground: RGB,
    public readonly background: RGB,
  ) {}

  static fromStrings(fg: string, bg: string): FrameColors {
    return new FrameColors(
      parseColor(fg) ?? [255, 255, 255],
      parseColor(bg) ?? [0, 0, 0],
    );
  }

  foregroundCss(): string {
    const [r, g, b] = this.foreground;
    return `rgb(${r},${g},${b})`;
  }

  backgroundCss(): string {
    const [r, g, b] = this.background;
    return `rgb(${r},${g},${b})`;
  }
}
