export class FontSizing {
  charWidthRatio: number;
  lineHeightRatio: number;
  minFontSize: number;
  maxFontSize: number;
  padding: number;

  constructor() {
    this.charWidthRatio = 0.6;
    this.lineHeightRatio = 1.11;
    this.minFontSize = 1.0;
    this.maxFontSize = 50.0;
    this.padding = 20.0;
  }

  static calculate(cols: number, rows: number, containerWidth: number, containerHeight: number): number {
    return new FontSizing().calculateFontSize(cols, rows, containerWidth, containerHeight);
  }

  calculateFontSize(cols: number, rows: number, containerWidth: number, containerHeight: number): number {
    if (cols === 0 || rows === 0) return this.minFontSize;

    const availableWidth = containerWidth - this.padding;
    const availableHeight = containerHeight - this.padding;

    if (availableWidth <= 0 || availableHeight <= 0) return this.minFontSize;

    const maxFontFromWidth = availableWidth / (cols * this.charWidthRatio);
    const maxFontFromHeight = availableHeight / (rows * this.lineHeightRatio);
    const optimal = Math.min(maxFontFromWidth, maxFontFromHeight);

    return Math.max(this.minFontSize, Math.min(this.maxFontSize, optimal));
  }

  charWidth(fontSize: number): number {
    return fontSize * this.charWidthRatio;
  }

  lineHeight(fontSize: number): number {
    return fontSize * this.lineHeightRatio;
  }

  canvasDimensions(cols: number, rows: number, fontSize: number): [number, number] {
    return [cols * this.charWidth(fontSize), rows * this.lineHeight(fontSize)];
  }
}

export function charPosition(col: number, row: number, fontSize: number): [number, number] {
  const sizing = new FontSizing();
  return [col * sizing.charWidth(fontSize), row * sizing.lineHeight(fontSize)];
}
