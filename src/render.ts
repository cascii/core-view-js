import type {RGB} from './data';
import {CFrameData} from './data';
import {FontSizing} from './sizing';

export class RenderConfig {
  fontSize: number;
  sizing: FontSizing;

  constructor(fontSize: number = 10.0) {
    this.fontSize = fontSize;
    this.sizing = new FontSizing();
  }

  charWidth(): number {
    return this.sizing.charWidth(this.fontSize);
  }

  lineHeight(): number {
    return this.sizing.lineHeight(this.fontSize);
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
  const result = renderCframe(cframe, config);
  canvas.width = Math.ceil(result.width);
  canvas.height = Math.ceil(result.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  ctx.clearRect(0, 0, result.width, result.height);
  ctx.font = `${config.fontSize.toFixed(2)}px monospace`;
  ctx.textBaseline = 'top';

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

  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
  const lines = text.split('\n');
  const rows = lines.length;
  const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);

  const charWidth = config.charWidth();
  const lineHeight = config.lineHeight();
  const canvasWidth = cols * charWidth;
  const canvasHeight = rows * lineHeight;

  canvas.width = Math.ceil(canvasWidth);
  canvas.height = Math.ceil(canvasHeight);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.font = `${config.fontSize.toFixed(2)}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';

  for (let row = 0; row < lines.length; row++) {
    if (lines[row].length > 0) {
      ctx.fillText(lines[row], 0, row * lineHeight);
    }
  }
}

export class FrameCanvasCache {
  private canvases: (HTMLCanvasElement | null)[];
  private fontSizeKey = 0;

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
    this.fontSizeKey = 0;
  }

  invalidateForFontSizeKey(fontSizeKey: number): boolean {
    if (this.fontSizeKey === fontSizeKey) return false;
    this.fontSizeKey = fontSizeKey;
    this.canvases.fill(null);
    return true;
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
