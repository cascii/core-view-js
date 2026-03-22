export enum LoopMode {
  Once = 'once',
  Loop = 'loop',
}

export enum AnimationState {
  Stopped = 'stopped',
  Playing = 'playing',
  Finished = 'finished',
}

export class AnimationController {
  private _currentFrame = 0;
  private _frameCount = 0;
  private _fps: number;
  private _state = AnimationState.Stopped;
  private _loopMode = LoopMode.Loop;
  private _rangeStart = 0.0;
  private _rangeEnd = 1.0;

  constructor(fps: number) {
    this._fps = Math.max(1, fps);
  }

  setFrameCount(count: number): void {
    this._frameCount = count;
    if (this._currentFrame >= count && count > 0) {
      this._currentFrame = count - 1;
    }
  }

  get frameCount(): number { return this._frameCount; }

  setFps(fps: number): void { this._fps = Math.max(1, fps); }
  get fps(): number { return this._fps; }

  intervalMs(): number {
    return Math.max(1, Math.floor(1000 / this._fps));
  }

  setLoopMode(mode: LoopMode): void {
    this._loopMode = mode;
    if (mode === LoopMode.Loop && this._state === AnimationState.Finished) {
      this._state = AnimationState.Stopped;
    }
  }

  get loopMode(): LoopMode { return this._loopMode; }

  setRange(start: number, end: number): void {
    this._rangeStart = Math.max(0, Math.min(1, start));
    this._rangeEnd = Math.max(this._rangeStart + 0.01, Math.max(0, Math.min(1, end)));

    const [startFrame, endFrame] = this.rangeFrames();
    if (this._currentFrame < startFrame || this._currentFrame > endFrame) {
      this._currentFrame = startFrame;
    }
  }

  range(): [number, number] {
    return [this._rangeStart, this._rangeEnd];
  }

  rangeFrames(): [number, number] {
    if (this._frameCount === 0) return [0, 0];
    const maxIdx = this._frameCount - 1;
    const start = Math.round(this._rangeStart * maxIdx);
    const end = Math.round(this._rangeEnd * maxIdx);
    return [start, end];
  }

  rangeFrameCount(): number {
    const [start, end] = this.rangeFrames();
    return Math.max(0, end - start) + 1;
  }

  play(): void {
    if (this._frameCount > 0 && this._state !== AnimationState.Finished) {
      this._state = AnimationState.Playing;
    }
  }

  pause(): void {
    if (this._state === AnimationState.Playing) {
      this._state = AnimationState.Stopped;
    }
  }

  toggle(): void {
    switch (this._state) {
      case AnimationState.Playing:
        this.pause();
        break;
      case AnimationState.Stopped:
        this.play();
        break;
      case AnimationState.Finished: {
        const [start] = this.rangeFrames();
        this._currentFrame = start;
        this._state = AnimationState.Playing;
        break;
      }
    }
  }

  stop(): void {
    this._state = AnimationState.Stopped;
    const [start] = this.rangeFrames();
    this._currentFrame = start;
  }

  get state(): AnimationState { return this._state; }

  isPlaying(): boolean {
    return this._state === AnimationState.Playing;
  }

  get currentFrame(): number { return this._currentFrame; }

  setCurrentFrame(frame: number): void {
    if (this._frameCount === 0) {
      this._currentFrame = 0;
      return;
    }
    const [start, end] = this.rangeFrames();
    this._currentFrame = Math.max(start, Math.min(end, frame));
  }

  seek(percentage: number): void {
    if (this._frameCount === 0) return;
    const [start, end] = this.rangeFrames();
    const rangeLen = end - start;
    const target = Math.round(start + Math.max(0, Math.min(1, percentage)) * rangeLen);
    this._currentFrame = Math.max(start, Math.min(end, target));
  }

  position(): number {
    const [start, end] = this.rangeFrames();
    if (end <= start) return 0.0;
    return (this._currentFrame - start) / (end - start);
  }

  tick(): boolean {
    if (this._state !== AnimationState.Playing || this._frameCount === 0) {
      return false;
    }

    const [start, end] = this.rangeFrames();

    if (this._currentFrame < start) {
      this._currentFrame = start;
      return true;
    }

    if (this._currentFrame >= end) {
      if (this._loopMode === LoopMode.Loop) {
        this._currentFrame = start;
        return true;
      } else {
        this._state = AnimationState.Finished;
        return false;
      }
    }

    this._currentFrame += 1;
    return true;
  }

  stepForward(): void {
    if (this._frameCount === 0) return;
    this.pause();
    const [start, end] = this.rangeFrames();
    this._currentFrame = this._currentFrame >= end ? start : this._currentFrame + 1;
  }

  stepBackward(): void {
    if (this._frameCount === 0) return;
    this.pause();
    const [start, end] = this.rangeFrames();
    this._currentFrame = this._currentFrame <= start ? end : this._currentFrame - 1;
  }

  reset(): void {
    this._currentFrame = 0;
    this._state = AnimationState.Stopped;
    this._rangeStart = 0.0;
    this._rangeEnd = 1.0;
  }
}
