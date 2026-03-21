import {CFrameData, Frame, FrameFile} from './data';
import {parseCframe} from './parser';

export enum LoadingPhase {
  Idle = 'idle',
  LoadingText = 'loading_text',
  LoadingColors = 'loading_colors',
  Complete = 'complete',
}

export class LoadingProgress {
  textLoaded = 0;
  textTotal = 0;
  colorLoaded = 0;
  colorTotal = 0;

  reset(total: number): void {
    this.textLoaded = 0;
    this.textTotal = total;
    this.colorLoaded = 0;
    this.colorTotal = total;
  }

  textPercent(): number {
    if (this.textTotal === 0) return 0;
    return Math.floor((this.textLoaded / this.textTotal) * 100);
  }

  colorPercent(): number {
    if (this.colorTotal === 0) return 0;
    return Math.floor((this.colorLoaded / this.colorTotal) * 100);
  }

  textComplete(): boolean {
    return this.textTotal > 0 && this.textLoaded >= this.textTotal;
  }

  colorComplete(): boolean {
    return this.colorTotal > 0 && this.colorLoaded >= this.colorTotal;
  }

  textMessage(): string {
    if (this.textTotal > 0) {
      return `Loading frames... ${this.textLoaded} / ${this.textTotal} (${this.textPercent()}%)`;
    }
    return 'Loading frames...';
  }

  colorMessage(): string | null {
    if (this.colorTotal > 0 && !this.colorComplete()) {
      return `Loading colors: ${this.colorPercent()}%`;
    }
    return null;
  }
}

export class FrameLoaderState {
  phase = LoadingPhase.Idle;
  progress = new LoadingProgress();
  frames: Frame[] = [];
  framePaths: string[] = [];
  error: string | null = null;

  reset(): void {
    this.phase = LoadingPhase.Idle;
    this.progress = new LoadingProgress();
    this.frames = [];
    this.framePaths = [];
    this.error = null;
  }

  startLoading(frameFiles: FrameFile[]): void {
    this.reset();
    this.phase = LoadingPhase.LoadingText;
    this.progress.reset(frameFiles.length);
    this.framePaths = frameFiles.map(f => f.path);
  }

  addTextFrame(content: string): void {
    this.frames.push(Frame.textOnly(content));
    this.progress.textLoaded++;
  }

  finishTextLoading(): void {
    if (this.frames.length === 0) {
      this.error = 'No frames found';
      this.phase = LoadingPhase.Idle;
    } else {
      this.phase = LoadingPhase.LoadingColors;
    }
  }

  setFrameColor(index: number, cframe: CFrameData): void {
    if (index < this.frames.length) {
      this.frames[index].cframe = cframe;
    }
    this.progress.colorLoaded++;
    if (this.progress.colorComplete()) {
      this.phase = LoadingPhase.Complete;
    }
  }

  skipFrameColor(): void {
    this.progress.colorLoaded++;
    if (this.progress.colorComplete()) {
      this.phase = LoadingPhase.Complete;
    }
  }

  setError(error: string): void {
    this.error = error;
    this.phase = LoadingPhase.Idle;
  }

  canPlay(): boolean {
    return this.frames.length > 0 && (this.phase === LoadingPhase.LoadingColors || this.phase === LoadingPhase.Complete);
  }

  hasAnyColor(): boolean {
    return this.frames.some(f => f.hasColor());
  }

  getFrame(index: number): Frame | null {
    return this.frames[index] ?? null;
  }

  frameCount(): number {
    return this.frames.length;
  }

  getFramePath(index: number): string | null {
    return this.framePaths[index] ?? null;
  }
}

export interface FrameDataProvider {
  getFrameFiles(directory: string): Promise<FrameFile[]>;
  readFrameText(path: string): Promise<string>;
  readCframeBytes(txtPath: string): Promise<Uint8Array | null>;
}

export async function loadTextFrames(provider: FrameDataProvider, directory: string): Promise<[Frame[], FrameFile[]]> {
  const frameFiles = await provider.getFrameFiles(directory);
  if (frameFiles.length === 0) {
    throw new Error('No frames found in directory');
  }

  const frames: Frame[] = [];
  for (const frameFile of frameFiles) {
    const content = await provider.readFrameText(frameFile.path);
    frames.push(Frame.textOnly(content));
  }

  return [frames, frameFiles];
}

export async function loadColorFrames(
  provider: FrameDataProvider,
  frameFiles: FrameFile[],
  onFrame: (index: number, total: number, cframe: CFrameData | null) => void,
  yieldFn: () => Promise<void>,
): Promise<void> {
  const total = frameFiles.length;
  for (let i = 0; i < total; i++) {
    await yieldFn();

    const bytes = await provider.readCframeBytes(frameFiles[i].path);
    let cframe: CFrameData | null = null;
    if (bytes) {
      try {
        cframe = parseCframe(bytes);
      } catch {
        cframe = null;
      }
    }
    onFrame(i, total, cframe);

    await yieldFn();
  }
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
