type RGB = [number, number, number];
declare class FrameFile {
    readonly path: string;
    readonly name: string;
    readonly index: number;
    constructor(path: string, name: string, index: number);
    static extractIndex(stem: string, fallback: number): number;
}
declare class CFrameData {
    readonly width: number;
    readonly height: number;
    readonly chars: Uint8Array;
    readonly rgb: Uint8Array;
    constructor(width: number, height: number, chars: Uint8Array, rgb: Uint8Array);
    charAt(row: number, col: number): number | null;
    rgbAt(row: number, col: number): RGB | null;
    shouldSkip(row: number, col: number): boolean;
    pixelCount(): number;
}
declare class Frame {
    readonly content: string;
    cframe: CFrameData | null;
    constructor(content: string, cframe?: CFrameData | null);
    static textOnly(content: string): Frame;
    static withColor(content: string, cframe: CFrameData): Frame;
    hasColor(): boolean;
    dimensions(): [number, number];
}

declare class ParseError extends Error {
    constructor(message: string);
    static fileTooSmall(expected: number, actual: number): ParseError;
    static sizeMismatch(expected: number, actual: number): ParseError;
    static invalidDimensions(width: number, height: number): ParseError;
}
declare function parseCframe(data: Uint8Array): CFrameData;
declare function parseCframeText(data: Uint8Array): string;

declare enum LoopMode {
    Once = "once",
    Loop = "loop"
}
declare enum AnimationState {
    Stopped = "stopped",
    Playing = "playing",
    Finished = "finished"
}
declare class AnimationController {
    private _currentFrame;
    private _frameCount;
    private _fps;
    private _state;
    private _loopMode;
    private _rangeStart;
    private _rangeEnd;
    constructor(fps: number);
    setFrameCount(count: number): void;
    get frameCount(): number;
    setFps(fps: number): void;
    get fps(): number;
    intervalMs(): number;
    setLoopMode(mode: LoopMode): void;
    get loopMode(): LoopMode;
    setRange(start: number, end: number): void;
    range(): [number, number];
    rangeFrames(): [number, number];
    rangeFrameCount(): number;
    play(): void;
    pause(): void;
    toggle(): void;
    stop(): void;
    get state(): AnimationState;
    isPlaying(): boolean;
    get currentFrame(): number;
    setCurrentFrame(frame: number): void;
    seek(percentage: number): void;
    position(): number;
    tick(): boolean;
    stepForward(): void;
    stepBackward(): void;
    reset(): void;
}

declare function parseColor(s: string): RGB | null;
declare class FrameColors {
    readonly foreground: RGB;
    readonly background: RGB;
    constructor(foreground: RGB, background: RGB);
    static fromStrings(fg: string, bg: string): FrameColors;
    foregroundCss(): string;
    backgroundCss(): string;
}

declare class FontSizing {
    charWidthRatio: number;
    lineHeightRatio: number;
    minFontSize: number;
    maxFontSize: number;
    padding: number;
    constructor();
    static calculate(cols: number, rows: number, containerWidth: number, containerHeight: number): number;
    calculateFontSize(cols: number, rows: number, containerWidth: number, containerHeight: number): number;
    charWidth(fontSize: number): number;
    lineHeight(fontSize: number): number;
    canvasDimensions(cols: number, rows: number, fontSize: number): [number, number];
}
declare function charPosition(col: number, row: number, fontSize: number): [number, number];

declare class RenderConfig {
    fontSize: number;
    sizing: FontSizing;
    constructor(fontSize?: number);
    charWidth(): number;
    lineHeight(): number;
}
interface TextBatch {
    text: string;
    x: number;
    y: number;
    color: RGB;
}
declare function textBatchColorString(batch: TextBatch): string;
interface RenderResult {
    width: number;
    height: number;
    batches: TextBatch[];
}
declare function renderCframe(cframe: CFrameData, config: RenderConfig): RenderResult;
declare function renderToCanvas(cframe: CFrameData, canvas: HTMLCanvasElement, config: RenderConfig): void;
declare function renderToOffscreenCanvas(cframe: CFrameData, config: RenderConfig): HTMLCanvasElement;
declare function drawCachedCanvas(target: HTMLCanvasElement, cached: HTMLCanvasElement): void;
declare function drawFrameFromCache(target: HTMLCanvasElement, cache: FrameCanvasCache, frameIndex: number): boolean;
declare function renderTextToCanvas(canvas: HTMLCanvasElement, text: string, config: RenderConfig): void;
declare class FrameCanvasCache {
    private canvases;
    private fontSizeKey;
    constructor(frameCount?: number);
    resize(frameCount: number): void;
    clear(): void;
    invalidateForFontSizeKey(fontSizeKey: number): boolean;
    store(frameIndex: number, canvas: HTMLCanvasElement): void;
    get(frameIndex: number): HTMLCanvasElement | null;
    has(frameIndex: number): boolean;
}

interface ProjectDetails {
    version?: string;
    frames?: number;
    luminance?: number;
    font_ratio?: number;
    columns?: number;
    fps?: number;
    output?: string;
    audio?: boolean;
    background_color?: string;
    color?: string;
}
declare function parseDetailsToml(s: string): ProjectDetails;
declare function detailsFrameColors(details: ProjectDetails): FrameColors;

declare enum LoadingPhase {
    Idle = "idle",
    LoadingText = "loading_text",
    LoadingColors = "loading_colors",
    Complete = "complete"
}
declare class LoadingProgress {
    textLoaded: number;
    textTotal: number;
    colorLoaded: number;
    colorTotal: number;
    reset(total: number): void;
    textPercent(): number;
    colorPercent(): number;
    textComplete(): boolean;
    colorComplete(): boolean;
    textMessage(): string;
    colorMessage(): string | null;
}
declare class FrameLoaderState {
    phase: LoadingPhase;
    progress: LoadingProgress;
    frames: Frame[];
    framePaths: string[];
    error: string | null;
    reset(): void;
    startLoading(frameFiles: FrameFile[]): void;
    addTextFrame(content: string): void;
    finishTextLoading(): void;
    setFrameColor(index: number, cframe: CFrameData): void;
    skipFrameColor(): void;
    setError(error: string): void;
    canPlay(): boolean;
    hasAnyColor(): boolean;
    getFrame(index: number): Frame | null;
    frameCount(): number;
    getFramePath(index: number): string | null;
}
interface FrameDataProvider {
    getFrameFiles(directory: string): Promise<FrameFile[]>;
    readFrameText(path: string): Promise<string>;
    readCframeBytes(txtPath: string): Promise<Uint8Array | null>;
}
declare function loadTextFrames(provider: FrameDataProvider, directory: string): Promise<[Frame[], FrameFile[]]>;
declare function loadColorFrames(provider: FrameDataProvider, frameFiles: FrameFile[], onFrame: (index: number, total: number, cframe: CFrameData | null) => void, yieldFn: () => Promise<void>): Promise<void>;
declare function yieldToEventLoop(): Promise<void>;

declare function loadFramesFromUrls(urls: string[]): Promise<Frame[]>;
declare class FramePlayer {
    private frames;
    private _frameFiles;
    private controller;
    private config;
    private sizing;
    private _colorReady;
    private cache;
    constructor(fps: number);
    load(provider: FrameDataProvider, directory: string): Promise<void>;
    loadFromUrls(urls: string[]): Promise<void>;
    get frameFiles(): FrameFile[];
    setFrameColor(index: number, cframe: CFrameData): void;
    get colorReady(): boolean;
    set colorReady(ready: boolean);
    play(): void;
    pause(): void;
    toggle(): void;
    stop(): void;
    tick(): boolean;
    stepForward(): void;
    stepBackward(): void;
    seek(pct: number): void;
    position(): number;
    setFps(fps: number): void;
    intervalMs(): number;
    isPlaying(): boolean;
    get currentFrame(): number;
    get frameCount(): number;
    currentText(): string | null;
    getText(index: number): string | null;
    hasColorAt(index: number): boolean;
    hasAnyColor(): boolean;
    dimensions(): [number, number] | null;
    getFrames(): Frame[];
    fitToContainer(width: number, height: number): void;
    get fontSize(): number;
    get renderConfig(): RenderConfig;
    fontSizeCss(): string;
    getController(): AnimationController;
    getCache(): FrameCanvasCache;
    renderCurrent(canvas: HTMLCanvasElement): boolean;
    renderFrame(index: number, canvas: HTMLCanvasElement): boolean;
    preCacheFrame(index: number): boolean;
    tickAndRender(canvas: HTMLCanvasElement): void;
    loadColors(provider: FrameDataProvider): Promise<void>;
    preCacheAll(): Promise<void>;
}

export { AnimationController, AnimationState, CFrameData, FontSizing, Frame, FrameCanvasCache, FrameColors, type FrameDataProvider, FrameFile, FrameLoaderState, FramePlayer, LoadingPhase, LoadingProgress, LoopMode, ParseError, type ProjectDetails, type RGB, RenderConfig, type RenderResult, type TextBatch, charPosition, detailsFrameColors, drawCachedCanvas, drawFrameFromCache, loadColorFrames, loadFramesFromUrls, loadTextFrames, parseCframe, parseCframeText, parseColor, parseDetailsToml, renderCframe, renderTextToCanvas, renderToCanvas, renderToOffscreenCanvas, textBatchColorString, yieldToEventLoop };
