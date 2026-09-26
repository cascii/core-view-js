export type RGB = [number, number, number];

export class FrameFile {
  constructor(public readonly path: string, public readonly name: string, public readonly index: number) {}

  static extractIndex(stem: string, fallback: number): number {
    const prefixed = stem.match(/^frame_(\d+)$/);
    if (prefixed) return parseInt(prefixed[1], 10);
    const digits = stem.replace(/\D/g, '');
    return digits.length > 0 ? parseInt(digits, 10) : fallback;
  }
}

export class CFrameData {
  constructor(public readonly width: number, public readonly height: number, public readonly chars: Uint8Array, public readonly rgb: Uint8Array, public readonly bgRgb: Uint8Array | null = null) {}

  static withBackground(width: number, height: number, chars: Uint8Array, rgb: Uint8Array, bgRgb: Uint8Array): CFrameData {
    return new CFrameData(width, height, chars, rgb, bgRgb);
  }

  hasBackground(): boolean {
    return this.bgRgb !== null && this.bgRgb.length === this.chars.length * 3;
  }

  charAt(row: number, col: number): number | null {
    if (!this.isInBounds(row, col)) return null;
    return this.chars[row * this.width + col] ?? null;
  }

  rgbAt(row: number, col: number): RGB | null {
    if (!this.isInBounds(row, col)) return null;
    const idx = (row * this.width + col) * 3;
    if (idx + 2 >= this.rgb.length) return null;
    return [this.rgb[idx], this.rgb[idx + 1], this.rgb[idx + 2]];
  }

  bgRgbAt(row: number, col: number): RGB | null {
    if (!this.bgRgb || !this.isInBounds(row, col)) return null;
    const idx = (row * this.width + col) * 3;
    if (idx + 2 >= this.bgRgb.length) return null;
    return [this.bgRgb[idx], this.bgRgb[idx + 1], this.bgRgb[idx + 2]];
  }

  hasVisibleForeground(row: number, col: number): boolean {
    if (!this.isInBounds(row, col)) return false;
    const idx = row * this.width + col;
    const ch = this.chars[idx];
    if (ch === undefined || ch === 0x20) return false;
    const rgbIdx = idx * 3;
    if (rgbIdx + 2 >= this.rgb.length) return false;
    const r = this.rgb[rgbIdx];
    const g = this.rgb[rgbIdx + 1];
    const b = this.rgb[rgbIdx + 2];
    return !(r < 5 && g < 5 && b < 5);
  }

  hasVisibleBackground(row: number, col: number): boolean {
    if (!this.bgRgb || !this.isInBounds(row, col)) return false;
    const idx = (row * this.width + col) * 3;
    return idx + 2 < this.bgRgb.length;
  }

  isEffectivelyEmpty(row: number, col: number): boolean {
    return !this.hasVisibleForeground(row, col) && !this.hasVisibleBackground(row, col);
  }

  shouldSkip(row: number, col: number): boolean {
    return this.isEffectivelyEmpty(row, col);
  }

  pixelCount(): number {
    return this.width * this.height;
  }

  toText(): string {
    let text = '';
    for (let row = 0; row < this.height; row++) {
      const start = row * this.width;
      const end = start + this.width;
      for (let i = start; i < end; i++) {
        text += String.fromCharCode(this.chars[i]);
      }
      text += '\n';
    }
    return text;
  }

  private isInBounds(row: number, col: number): boolean {
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < this.height && col < this.width;
  }
}

export class PackedCFrameBlob {
  constructor(public readonly frameCount: number, public readonly width: number, public readonly height: number, public readonly frames: Uint8Array, public readonly bgFrames: Uint8Array | null = null) {}

  static withBackground(frameCount: number, width: number, height: number, frames: Uint8Array, bgFrames: Uint8Array): PackedCFrameBlob {
    return new PackedCFrameBlob(frameCount, width, height, frames, bgFrames);
  }

  len(): number {
    return this.frameCount;
  }

  isEmpty(): boolean {
    return this.frameCount === 0;
  }

  frameByteLen(): number {
    return this.width * this.height * 4;
  }

  backgroundFrameByteLen(): number {
    return this.width * this.height * 3;
  }

  hasBackground(): boolean {
    return this.bgFrames !== null && this.bgFrames.length === this.len() * this.backgroundFrameByteLen();
  }

  frameBytes(index: number): Uint8Array | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.frameCount) {
      return null;
    }

    const frameLen = this.frameByteLen();
    const start = index * frameLen;
    return this.frames.subarray(start, start + frameLen);
  }

  backgroundFrameBytes(index: number): Uint8Array | null {
    if (!this.bgFrames || !Number.isInteger(index) || index < 0 || index >= this.frameCount) return null;

    const frameLen = this.backgroundFrameByteLen();
    const start = index * frameLen;
    const end = start + frameLen;
    if (end > this.bgFrames.length) return null;
    return this.bgFrames.subarray(start, end);
  }

  decodeFrame(index: number): CFrameData | null {
    const bytes = this.frameBytes(index);
    if (!bytes) {
      return null;
    }

    const pixelCount = this.width * this.height;
    const chars = new Uint8Array(pixelCount);
    const rgb = new Uint8Array(pixelCount * 3);

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      chars[i] = bytes[offset];
      rgb[i * 3] = bytes[offset + 1];
      rgb[i * 3 + 1] = bytes[offset + 2];
      rgb[i * 3 + 2] = bytes[offset + 3];
    }

    const bgRgb = this.backgroundFrameBytes(index);
    return bgRgb ? CFrameData.withBackground(this.width, this.height, chars, rgb, bgRgb.slice()) : new CFrameData(this.width, this.height, chars, rgb);
  }
}

export class Frame {
  constructor(public readonly content: string, public cframe: CFrameData | null = null) {}

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
    const cols = lines.reduce((max, l) => Math.max(max, Array.from(l).length), 0);
    return [cols, rows];
  }
}
