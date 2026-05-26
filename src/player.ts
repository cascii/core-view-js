import {AnimationController} from './animation';
import {CFrameData, Frame, FrameFile} from './data';
import {ParseError, parsePackedCframes} from './parser';
import {FontSizing} from './sizing';
import {
  RenderConfig, FrameCanvasCache, renderToOffscreenCanvas,
  currentRenderKey, drawCachedCanvas, drawFrameFromCache, renderTextToCanvas,
} from './render';
import {FrameDataProvider, loadTextFrames, loadColorFrames, yieldToEventLoop} from './loader';

export async function loadFramesFromUrls(urls: string[]): Promise<Frame[]> {
  const texts = await Promise.all(urls.map(u => fetch(u).then(r => r.text())));
  return texts.map(t => Frame.textOnly(t));
}

export class FramePlayer {
  private frames: Frame[] = [];
  private _frameFiles: FrameFile[] = [];
  private controller: AnimationController;
  private config: RenderConfig;
  private sizing: FontSizing;
  private _colorReady = false;
  private cache: FrameCanvasCache;

  constructor(fps: number) {
    this.controller = new AnimationController(fps);
    this.config = new RenderConfig();
    this.sizing = new FontSizing();
    this.cache = new FrameCanvasCache();
  }

  private replaceFrames(frames: Frame[], frameFiles: FrameFile[]): void {
    this.frames = frames;
    this._frameFiles = frameFiles;
    this._colorReady = false;
    this.controller.reset();
    this.controller.setFrameCount(frames.length);
    this.cache.resize(frames.length);
    this.cache.invalidateAll();
  }

  // ── Loading ───────────────────────────────────────────────────────

  async load(provider: FrameDataProvider, directory: string): Promise<void> {
    const [frames, frameFiles] = await loadTextFrames(provider, directory);
    this.replaceFrames(frames, frameFiles);
  }

  async loadFromUrls(urls: string[]): Promise<void> {
    const frames = await loadFramesFromUrls(urls);
    this.replaceFrames(frames, []);
  }

  setTextFrames(contents: string[]): void {
    this.replaceFrames(contents.map(content => Frame.textOnly(content)), []);
  }

  get frameFiles(): FrameFile[] {
    return this._frameFiles;
  }

  setFrameColor(index: number, cframe: CFrameData): void {
    if (index < this.frames.length) {
      this.frames[index].cframe = cframe;
    }
  }

  loadPackedColors(data: Uint8Array): void {
    const blob = parsePackedCframes(data);
    const frameCount = blob.len();

    if (this.frames.length === 0) {
      const frames: Frame[] = [];
      for (let index = 0; index < frameCount; index++) {
        const cframe = blob.decodeFrame(index);
        if (!cframe) {
          throw new Error(`Packed blob frame ${index} is missing`);
        }
        frames.push(Frame.withColor(cframe.toText(), cframe));
      }
      this.frames = frames;
      this._frameFiles = [];
      this.controller.reset();
      this.controller.setFrameCount(frames.length);
      this.cache.resize(frames.length);
    } else if (this.frames.length !== frameCount) {
      throw ParseError.frameCountMismatch(this.frames.length, frameCount);
    } else {
      for (let index = 0; index < frameCount; index++) {
        const cframe = blob.decodeFrame(index);
        if (!cframe) {
          throw new Error(`Packed blob frame ${index} is missing`);
        }
        this.frames[index].cframe = cframe;
      }
    }

    this._colorReady = true;
    this.cache.invalidateAll();
  }

  get colorReady(): boolean { return this._colorReady; }
  set colorReady(ready: boolean) { this._colorReady = ready; }

  // ── Playback ──────────────────────────────────────────────────────

  play(): void { this.controller.play(); }
  pause(): void { this.controller.pause(); }
  toggle(): void { this.controller.toggle(); }
  stop(): void { this.controller.stop(); }

  tick(): boolean { return this.controller.tick(); }
  stepForward(): void { this.controller.stepForward(); }
  stepBackward(): void { this.controller.stepBackward(); }

  seek(pct: number): void { this.controller.seek(pct); }
  position(): number { return this.controller.position(); }

  setFps(fps: number): void { this.controller.setFps(fps); }
  intervalMs(): number { return this.controller.intervalMs(); }
  isPlaying(): boolean { return this.controller.isPlaying(); }
  get currentFrame(): number { return this.controller.currentFrame; }
  get frameCount(): number { return this.frames.length; }

  // ── Content access ────────────────────────────────────────────────

  currentText(): string | null {
    return this.frames[this.controller.currentFrame]?.content ?? null;
  }

  getText(index: number): string | null {
    return this.frames[index]?.content ?? null;
  }

  hasColorAt(index: number): boolean {
    return this.frames[index]?.hasColor() ?? false;
  }

  hasAnyColor(): boolean {
    return this.frames.some(f => f.hasColor());
  }

  dimensions(): [number, number] | null {
    if (this.frames.length === 0) return null;
    return this.frames[0].dimensions();
  }

  getFrames(): Frame[] {
    return this.frames;
  }

  // ── Sizing ────────────────────────────────────────────────────────

  fitToContainer(width: number, height: number): void {
    const dims = this.dimensions();
    if (!dims) return;
    const [cols, rows] = dims;
    const fontSize = this.sizing.calculateFontSize(cols, rows, width, height);
    this.config.fontSize = fontSize;
    this.config.sizing = this.sizing;
    this.cache.invalidateForRenderKey(currentRenderKey(this.config));
  }

  get fontSize(): number { return this.config.fontSize; }

  get renderConfig(): RenderConfig { return this.config; }

  setRenderConfig(config: RenderConfig): void {
    this.sizing = config.sizing;
    this.config = config;
    this.cache.invalidateAll();
  }

  fontSizeCss(): string {
    const dims = this.dimensions();
    if (!dims) return '';
    const [cols, rows] = dims;
    const fs = this.config.fontSize;
    const lh = this.config.lineHeight();
    const [w, h] = this.sizing.canvasDimensions(cols, rows, fs);
    return `font-size: ${fs.toFixed(2)}px; line-height: ${lh.toFixed(2)}px; width: ${w.toFixed(2)}px; height: ${h.toFixed(2)}px;`;
  }

  // ── Advanced access ───────────────────────────────────────────────

  getController(): AnimationController { return this.controller; }
  getCache(): FrameCanvasCache { return this.cache; }

  // ── Canvas rendering ──────────────────────────────────────────────

  renderCurrent(canvas: HTMLCanvasElement): boolean {
    return this.renderFrame(this.controller.currentFrame, canvas);
  }

  renderFrame(index: number, canvas: HTMLCanvasElement): boolean {
    if (!this._colorReady) return false;
    this.cache.invalidateForRenderKey(currentRenderKey(this.config));

    if (drawFrameFromCache(canvas, this.cache, index)) return true;

    const cframe = this.frames[index]?.cframe;
    if (!cframe) return false;

    const offscreen = renderToOffscreenCanvas(cframe, this.config);
    this.cache.store(index, offscreen);
    drawCachedCanvas(canvas, offscreen);
    return true;
  }

  preCacheFrame(index: number): boolean {
    this.cache.invalidateForRenderKey(currentRenderKey(this.config));
    if (this.cache.has(index)) return false;
    const cframe = this.frames[index]?.cframe;
    if (!cframe) return false;
    try {
      const offscreen = renderToOffscreenCanvas(cframe, this.config);
      this.cache.store(index, offscreen);
      return true;
    } catch {
      return false;
    }
  }

  tickAndRender(canvas: HTMLCanvasElement): void {
    if (!this.isPlaying()) return;
    this.tick();
    const idx = this.currentFrame;
    if (!this.renderCurrent(canvas)) {
      const text = this.frames[idx]?.content;
      if (text) {
        renderTextToCanvas(canvas, text, this.config);
      }
    }
  }

  async loadColors(provider: FrameDataProvider): Promise<void> {
    const frameFiles = [...this._frameFiles];
    await loadColorFrames(
      provider,
      frameFiles,
      (index, _total, cframe) => {
        if (cframe) this.setFrameColor(index, cframe);
      },
      yieldToEventLoop,
    );
  }

  async preCacheAll(): Promise<void> {
    const count = this.frameCount;
    for (let i = 0; i < count; i++) {
      this.preCacheFrame(i);
      await yieldToEventLoop();
    }
    this._colorReady = true;
  }
}
