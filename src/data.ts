export type RGB = [number, number, number];

export class FrameFile {
  constructor(
    public readonly path: string,
    public readonly name: string,
    public readonly index: number,
  ) {}

  static extractIndex(stem: string, fallback: number): number {
    const prefixed = stem.match(/^frame_(\d+)$/);
    if (prefixed) return parseInt(prefixed[1], 10);
    const digits = stem.replace(/\D/g, '');
    return digits.length > 0 ? parseInt(digits, 10) : fallback;
  }
}

export class CFrameData {
  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly chars: Uint8Array,
    public readonly rgb: Uint8Array,
  ) {}

  charAt(row: number, col: number): number | null {
    if (row < this.height && col < this.width) {
      return this.chars[row * this.width + col];
    }
    return null;
  }

  rgbAt(row: number, col: number): RGB | null {
    if (row < this.height && col < this.width) {
      const idx = (row * this.width + col) * 3;
      return [this.rgb[idx], this.rgb[idx + 1], this.rgb[idx + 2]];
    }
    return null;
  }

  shouldSkip(row: number, col: number): boolean {
    const idx = row * this.width + col;
    const ch = this.chars[idx];
    const r = this.rgb[idx * 3];
    const g = this.rgb[idx * 3 + 1];
    const b = this.rgb[idx * 3 + 2];
    return ch === 0x20 || (r < 5 && g < 5 && b < 5);
  }

  pixelCount(): number {
    return this.width * this.height;
  }
}

export class Frame {
  constructor(
    public readonly content: string,
    public cframe: CFrameData | null = null,
  ) {}

  static textOnly(content: string): Frame {
    return new Frame(content, null);
  }

  static withColor(content: string, cframe: CFrameData): Frame {
    return new Frame(content, cframe);
  }

  hasColor(): boolean {
    return this.cframe !== null;
  }

  dimensions(): [number, number] {
    const lines = this.content.split('\n');
    // Remove trailing empty line from split if content ends with \n
    const rows = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);
    return [cols, rows];
  }
}
