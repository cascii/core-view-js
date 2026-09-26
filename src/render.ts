import type {RGB} from './data';
import {CFrameData} from './data';
import {FontSizing} from './sizing';

export class RenderConfig {
  fontSize: number;
  sizing: FontSizing;
  fontFamily: string;
  textStrokeWidth: number;
  backgroundColor: RGB | null;

  constructor(fontSize: number = 10.0) {
    this.fontSize = fontSize;
    this.sizing = new FontSizing();
    this.fontFamily = 'monospace';
    this.textStrokeWidth = 0.0;
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

export interface CellRectBatch {
  x: number;
  y: number;
  width: number;
  height: number;
  color: RGB;
}

export function cellRectBatchColorString(batch: CellRectBatch): string {
  return `rgb(${batch.color[0]},${batch.color[1]},${batch.color[2]})`;
}

export interface RenderResult {
  width: number;
  height: number;
  backgroundBatches: CellRectBatch[];
  batches: TextBatch[];
}

interface CanvasLayout {
  logicalWidth: number;
  logicalHeight: number;
  charWidth: number;
  lineHeight: number;
}

interface CachedCanvas {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
}

function currentDevicePixelRatio(): number {
  if (typeof window === 'undefined' || typeof window.devicePixelRatio !== 'number') {
    return 1.0;
  }
  return Math.max(1.0, window.devicePixelRatio);
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');
  return ctx;
}

function applyLogicalSize(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): void {
  canvas.style.width = `${logicalWidth.toFixed(1)}px`;
  canvas.style.height = `${logicalHeight.toFixed(1)}px`;
}

function stylePixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim().replace(/px$/, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function layoutCanvas(canvas: HTMLCanvasElement, cols: number, rows: number, config: RenderConfig): [CanvasRenderingContext2D, CanvasLayout] {
  const dpr = currentDevicePixelRatio();
  const ctx = get2dContext(canvas);
  ctx.font = config.fontString();
  const measured = ctx.measureText('M').width;
  const charWidth = measured > 0 ? measured : config.charWidth();
  const lineHeight = config.lineHeight();
  const logicalWidth = cols * charWidth;
  const logicalHeight = rows * lineHeight;
  const backingWidth = Math.ceil(logicalWidth * dpr);
  const backingHeight = Math.ceil(logicalHeight * dpr);

  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  applyLogicalSize(canvas, logicalWidth, logicalHeight);

  // Resizing resets context state, so restore it after the conditional resize.
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
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function currentRenderKey(config: RenderConfig): string {
  return JSON.stringify({fontSize: config.fontSize, charWidthRatio: config.sizing.charWidthRatio, lineHeightRatio: config.sizing.lineHeightRatio, fontFamily: config.fontFamily, textStrokeWidth: config.textStrokeWidth, backgroundColor: config.backgroundColor, dpr: currentDevicePixelRatio()});
}

export function renderCframe(cframe: CFrameData, config: RenderConfig): RenderResult {
  return renderCframeWithMetrics(cframe, config.charWidth(), config.lineHeight());
}

export function renderCframeWithMetrics(cframe: CFrameData, charWidth: number, lineHeight: number): RenderResult {
  const width = cframe.width * charWidth;
  const height = cframe.height * lineHeight;
  const backgroundBatches = buildBackgroundBatches(cframe, charWidth, lineHeight);
  const batches = buildTextBatches(cframe, charWidth, lineHeight);
  return {width, height, backgroundBatches, batches};
}

function buildBackgroundBatches(cframe: CFrameData, charWidth: number, lineHeight: number): CellRectBatch[] {
  const {bgRgb, width, height} = cframe;
  if (!bgRgb || bgRgb.length !== width * height * 3) return [];

  const batches: CellRectBatch[] = [];
  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      const rgbIdx = (row * width + col) * 3;
      const r = bgRgb[rgbIdx];
      const g = bgRgb[rgbIdx + 1];
      const b = bgRgb[rgbIdx + 2];
      const startCol = col;
      col++;

      while (col < width) {
        const nextRgbIdx = (row * width + col) * 3;
        if (bgRgb[nextRgbIdx] === r && bgRgb[nextRgbIdx + 1] === g && bgRgb[nextRgbIdx + 2] === b) {
          col++;
        } else {
          break;
        }
      }

      batches.push({x: startCol * charWidth, y: row * lineHeight, width: (col - startCol) * charWidth, height: lineHeight, color: [r, g, b]});
    }
  }
  return batches;
}

function buildTextBatches(cframe: CFrameData, charWidth: number, lineHeight: number): TextBatch[] {
  const batches: TextBatch[] = [];
  const {width, height} = cframe;

  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      if (!cframe.hasVisibleForeground(row, col)) {
        col++;
        continue;
      }

      const idx = row * width + col;
      const r = cframe.rgb[idx * 3];
      const g = cframe.rgb[idx * 3 + 1];
      const b = cframe.rgb[idx * 3 + 2];
      let batchText = String.fromCharCode(cframe.chars[idx]);
      const startCol = col;
      col++;

      while (col < width) {
        if (!cframe.hasVisibleForeground(row, col)) break;
        const nextIdx = row * width + col;
        const nr = cframe.rgb[nextIdx * 3];
        const ng = cframe.rgb[nextIdx * 3 + 1];
        const nb = cframe.rgb[nextIdx * 3 + 2];
        if (nr === r && ng === g && nb === b) {
          batchText += String.fromCharCode(cframe.chars[nextIdx]);
          col++;
        } else {
          break;
        }
      }

      batches.push({text: batchText, x: startCol * charWidth, y: row * lineHeight, color: [r, g, b]});
    }
  }
  return batches;
}

export function renderToCanvas(cframe: CFrameData, canvas: HTMLCanvasElement, config: RenderConfig): void {
  const [ctx, layout] = layoutCanvas(canvas, cframe.width, cframe.height, config);
  const result = renderCframeWithMetrics(cframe, layout.charWidth, layout.lineHeight);

  clearOrFillBackground(ctx, layout, config);

  let lastBackgroundColor = '';
  for (const batch of result.backgroundBatches) {
    const color = cellRectBatchColorString(batch);
    if (color !== lastBackgroundColor) {
      ctx.fillStyle = color;
      lastBackgroundColor = color;
    }
    ctx.fillRect(batch.x, batch.y, batch.width, batch.height);
  }

  const stroke = config.textStrokeWidth > 0;
  if (stroke) ctx.lineWidth = config.textStrokeWidth;
  let lastTextColor = '';
  for (const batch of result.batches) {
    const color = textBatchColorString(batch);
    if (color !== lastTextColor) {
      ctx.fillStyle = color;
      if (stroke) ctx.strokeStyle = color;
      lastTextColor = color;
    }
    if (stroke) ctx.strokeText(batch.text, batch.x, batch.y);
    ctx.fillText(batch.text, batch.x, batch.y);
  }
}

export function renderToOffscreenCanvas(cframe: CFrameData, config: RenderConfig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderToCanvas(cframe, canvas, config);
  return canvas;
}

function drawCachedCanvasSized(target: HTMLCanvasElement, cached: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): void {
  if (target.width !== cached.width) target.width = cached.width;
  if (target.height !== cached.height) target.height = cached.height;
  applyLogicalSize(target, logicalWidth, logicalHeight);

  const ctx = get2dContext(target);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(cached, 0, 0);
}

export function drawCachedCanvas(target: HTMLCanvasElement, cached: HTMLCanvasElement): void {
  drawCachedCanvasSized(target, cached, stylePixels(cached.style.width, cached.width), stylePixels(cached.style.height, cached.height));
}

export function drawFrameFromCache(target: HTMLCanvasElement, cache: FrameCanvasCache, frameIndex: number): boolean {
  const cached = cache.getCached(frameIndex);
  if (!cached) return false;
  drawCachedCanvasSized(target, cached.canvas, cached.logicalWidth, cached.logicalHeight);
  return true;
}

export function renderTextToCanvas(canvas: HTMLCanvasElement, text: string, config: RenderConfig): void {
  const lines = splitTextLines(text);
  const rows = lines.length;
  const cols = lines.reduce((max, line) => Math.max(max, Array.from(line).length), 0);
  const [ctx, layout] = layoutCanvas(canvas, cols, rows, config);

  clearOrFillBackground(ctx, layout, config);
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(0, config.textStrokeWidth);

  for (let row = 0; row < lines.length; row++) {
    if (lines[row].length > 0) {
      const y = row * layout.lineHeight;
      if (config.textStrokeWidth > 0) ctx.strokeText(lines[row], 0, y);
      ctx.fillText(lines[row], 0, y);
    }
  }
}

export class FrameCanvasCache {
  private entries: (CachedCanvas | null)[];
  private renderKey = '';

  constructor(frameCount: number = 0) {
    this.entries = new Array(frameCount).fill(null);
  }

  resize(frameCount: number): void {
    if (this.entries.length === frameCount) return;
    const entries: (CachedCanvas | null)[] = new Array(frameCount).fill(null);
    for (let i = 0; i < Math.min(this.entries.length, frameCount); i++) {
      entries[i] = this.entries[i];
    }
    this.entries = entries;
  }

  clear(): void {
    this.entries = [];
    this.renderKey = '';
  }

  invalidateAll(): void {
    this.entries.fill(null);
    this.renderKey = '';
  }

  invalidateForRenderKey(renderKey: string): boolean {
    if (this.renderKey === renderKey) return false;
    this.renderKey = renderKey;
    this.entries.fill(null);
    return true;
  }

  invalidateForFontSizeKey(fontSizeKey: number): boolean {
    return this.invalidateForRenderKey(String(fontSizeKey));
  }

  store(frameIndex: number, canvas: HTMLCanvasElement): void {
    if (frameIndex < 0 || frameIndex >= this.entries.length) return;
    this.entries[frameIndex] = {canvas, logicalWidth: stylePixels(canvas.style.width, canvas.width), logicalHeight: stylePixels(canvas.style.height, canvas.height)};
  }

  get(frameIndex: number): HTMLCanvasElement | null {
    return this.entries[frameIndex]?.canvas ?? null;
  }

  getCached(frameIndex: number): CachedCanvas | null {
    return this.entries[frameIndex] ?? null;
  }

  has(frameIndex: number): boolean {
    return this.entries[frameIndex] != null;
  }
}
