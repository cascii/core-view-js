import type {RGB} from './data';
import {CFrameData} from './data';
import {FontSizing} from './sizing';

export class RenderConfig {
  fontSize: number;
  sizing: FontSizing;
  fontFamily: string;
  backgroundColor: RGB | null;

  constructor(fontSize: number = 10.0) {
    this.fontSize = fontSize;
    this.sizing = new FontSizing();
    this.fontFamily = 'monospace';
    this.backgroundColor = null;
  }

  charWidth(): number {
    return this.sizing.charWidth(this.fontSize);
  }

  lineHeight(): number {
    return this.sizing.lineHeight(this.fontSize);
  }

  fontString(): string {
    return `${this.fontSize.toFixed(2)}px ${this.fontFamily}`;
  }
}

export interface TextBatch {
  text: string;
  x: number;
  y: number;
  color: RGB;
}

export function textBatchColorString(batch: TextBatch): string {
  return `rgb(${batch.color[0]},${batch.color[1]},${batch.color[2]})`;
}

export interface RenderResult {
  width: number;
  height: number;
  batches: TextBatch[];
}

interface CanvasLayout {
  logicalWidth: number;
  logicalHeight: number;
  charWidth: number;
  lineHeight: number;
}

function cloneFontSizing(sizing: FontSizing): FontSizing {
  const copy = new FontSizing();
  copy.charWidthRatio = sizing.charWidthRatio;
  copy.lineHeightRatio = sizing.lineHeightRatio;
  copy.minFontSize = sizing.minFontSize;
  copy.maxFontSize = sizing.maxFontSize;
  copy.padding = sizing.padding;
  return copy;
}

function currentDevicePixelRatio(): number {
  if (typeof window === 'undefined' || typeof window.devicePixelRatio !== 'number') {
    return 1.0;
  }
  return Math.max(1.0, window.devicePixelRatio);
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }
  return ctx;
}

function applyLogicalSize(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): void {
  canvas.style.width = `${logicalWidth.toFixed(1)}px`;
  canvas.style.height = `${logicalHeight.toFixed(1)}px`;
}

function measureCharWidth(canvas: HTMLCanvasElement, config: RenderConfig): number {
  const ctx = get2dContext(canvas);
  ctx.font = config.fontString();
  const measured = ctx.measureText('M').width;
  return measured > 0 ? measured : config.charWidth();
}

function layoutCanvas(
  canvas: HTMLCanvasElement,
  cols: number,
  rows: number,
  config: RenderConfig,
): [CanvasRenderingContext2D, CanvasLayout] {
  const dpr = currentDevicePixelRatio();
  const charWidth = measureCharWidth(canvas, config);
  const lineHeight = config.lineHeight();
  const logicalWidth = cols * charWidth;
  const logicalHeight = rows * lineHeight;

  canvas.width = Math.ceil(logicalWidth * dpr);
  canvas.height = Math.ceil(logicalHeight * dpr);
  applyLogicalSize(canvas, logicalWidth, logicalHeight);

  const ctx = get2dContext(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = config.fontString();
  ctx.textBaseline = 'top';

  return [ctx, {logicalWidth, logicalHeight, charWidth, lineHeight}];
}

function clearOrFillBackground(ctx: CanvasRenderingContext2D, layout: CanvasLayout, config: RenderConfig): void {
  if (config.backgroundColor) {
    ctx.fillStyle = `rgb(${config.backgroundColor[0]},${config.backgroundColor[1]},${config.backgroundColor[2]})`;
    ctx.fillRect(0, 0, layout.logicalWidth, layout.logicalHeight);
  } else {
    ctx.clearRect(0, 0, layout.logicalWidth, layout.logicalHeight);
  }
}

function splitTextLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function currentRenderKey(config: RenderConfig): string {
  return JSON.stringify({
    fontSize: config.fontSize,
    charWidthRatio: config.sizing.charWidthRatio,
    lineHeightRatio: config.sizing.lineHeightRatio,
    fontFamily: config.fontFamily,
    backgroundColor: config.backgroundColor,
    dpr: currentDevicePixelRatio(),
  });
}

export function renderCframe(cframe: CFrameData, config: RenderConfig): RenderResult {
  const charWidth = config.charWidth();
  const lineHeight = config.lineHeight();
  const canvasWidth = cframe.width * charWidth;
  const canvasHeight = cframe.height * lineHeight;
  const batches: TextBatch[] = [];
  const {width, height} = cframe;

  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      const idx = row * width + col;
      const ch = cframe.chars[idx];
      const r = cframe.rgb[idx * 3];
      const g = cframe.rgb[idx * 3 + 1];
      const b = cframe.rgb[idx * 3 + 2];

      if (ch === 0x20 || (r < 5 && g < 5 && b < 5)) {
        col++;
        continue;
      }

      let batchText = String.fromCharCode(ch);
      const startCol = col;
      col++;

      while (col < width) {
        const nextIdx = row * width + col;
        const nextCh = cframe.chars[nextIdx];
        const nr = cframe.rgb[nextIdx * 3];
        const ng = cframe.rgb[nextIdx * 3 + 1];
        const nb = cframe.rgb[nextIdx * 3 + 2];

        if (nr === r && ng === g && nb === b && nextCh !== 0x20 && !(nr < 5 && ng < 5 && nb < 5)) {
          batchText += String.fromCharCode(nextCh);
          col++;
        } else {
          break;
        }
      }

      batches.push({text: batchText, x: startCol * charWidth, y: row * lineHeight, color: [r, g, b]});
    }
  }

  return {width: canvasWidth, height: canvasHeight, batches};
}

// Canvas rendering functions

export function renderToCanvas(cframe: CFrameData, canvas: HTMLCanvasElement, config: RenderConfig): void {
  const [ctx, layout] = layoutCanvas(canvas, cframe.width, cframe.height, config);
  const measuredConfig = new RenderConfig(config.fontSize);
  measuredConfig.sizing = cloneFontSizing(config.sizing);
  measuredConfig.fontFamily = config.fontFamily;
  measuredConfig.backgroundColor = config.backgroundColor;
  if (config.fontSize > 0) {
    measuredConfig.sizing.charWidthRatio = layout.charWidth / config.fontSize;
  }
  const result = renderCframe(cframe, measuredConfig);

  clearOrFillBackground(ctx, layout, config);

  for (const batch of result.batches) {
    ctx.fillStyle = textBatchColorString(batch);
    ctx.fillText(batch.text, batch.x, batch.y);
  }
}

export function renderToOffscreenCanvas(cframe: CFrameData, config: RenderConfig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderToCanvas(cframe, canvas, config);
  return canvas;
}

export function drawCachedCanvas(target: HTMLCanvasElement, cached: HTMLCanvasElement): void {
  target.width = cached.width;
  target.height = cached.height;
  target.style.width = cached.style.width;
  target.style.height = cached.style.height;

  const ctx = get2dContext(target);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(cached, 0, 0);
}

export function drawFrameFromCache(target: HTMLCanvasElement, cache: FrameCanvasCache, frameIndex: number): boolean {
  const cached = cache.get(frameIndex);
  if (cached) {
    drawCachedCanvas(target, cached);
    return true;
  }
  return false;
}

export function renderTextToCanvas(canvas: HTMLCanvasElement, text: string, config: RenderConfig): void {
  const lines = splitTextLines(text);
  const rows = lines.length;
  const cols = lines.reduce((max, l) => Math.max(max, Array.from(l).length), 0);
  const [ctx, layout] = layoutCanvas(canvas, cols, rows, config);

  clearOrFillBackground(ctx, layout, config);
  ctx.fillStyle = 'white';

  for (let row = 0; row < lines.length; row++) {
    if (lines[row].length > 0) {
      ctx.fillText(lines[row], 0, row * layout.lineHeight);
    }
  }
}

export class FrameCanvasCache {
  private canvases: (HTMLCanvasElement | null)[];
  private renderKey = '';

  constructor(frameCount: number = 0) {
    this.canvases = new Array(frameCount).fill(null);
  }

  resize(frameCount: number): void {
    if (this.canvases.length !== frameCount) {
      const newCanvases = new Array(frameCount).fill(null);
      for (let i = 0; i < Math.min(this.canvases.length, frameCount); i++) {
        newCanvases[i] = this.canvases[i];
      }
      this.canvases = newCanvases;
    }
  }

  clear(): void {
    this.canvases = [];
    this.renderKey = '';
  }

  invalidateAll(): void {
    this.canvases.fill(null);
    this.renderKey = '';
  }

  invalidateForRenderKey(renderKey: string): boolean {
    if (this.renderKey === renderKey) return false;
    this.renderKey = renderKey;
    this.canvases.fill(null);
    return true;
  }

  invalidateForFontSizeKey(fontSizeKey: number): boolean {
    return this.invalidateForRenderKey(String(fontSizeKey));
  }

  store(frameIndex: number, canvas: HTMLCanvasElement): void {
    if (frameIndex < this.canvases.length) {
      this.canvases[frameIndex] = canvas;
    }
  }

  get(frameIndex: number): HTMLCanvasElement | null {
    return this.canvases[frameIndex] ?? null;
  }

  has(frameIndex: number): boolean {
    return this.canvases[frameIndex] != null;
  }
}
