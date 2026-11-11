import {AnimationController, LoopMode} from './animation';
import {CFrameData} from './data';
import {parseCframe} from './parser';
import {RenderConfig, renderToCanvas} from './render';

export type SizeVariant = {columns: number; rows: number[]};
export type MultiSizeManifest = {
    format: 'cascii-multisize';
    schema_version: number;
    frame_count: number;
    fps: number;
    default_columns: number;
    font_ratio: number;
    color: boolean;
    text: boolean;
    variants: SizeVariant[];
    column_map?: number[];
};
export interface ByteSource {
    readonly byteLength?: number;
    read(offset: number, length: number): Promise<Uint8Array>;
}
export type ResolutionCurve = 'linear' | 'exponential' | 'logarithmic';
export type ResolutionDirection = 'down' | 'up';
export type ResolutionTransition = {curve: ResolutionCurve; direction: ResolutionDirection};
export type FrameSize = {columns: number; rows: number};
export type PlayerSnapshot = FrameSize & {frame: number; frameCount: number; playing: boolean; finished: boolean};
export type CanvasViewport = {width: number; height: number; padding?: number; devicePixelRatio?: number};
export type GlyphMetrics = {width: number; height: number};
export type AdaptivePlayerOptions = {columns?: number; loop?: boolean};
export interface MultiSizeFrameSource {
    readonly manifest: MultiSizeManifest;
    readonly columns: number[];
    nearest(columns: number): number;
    size(frame: number, columns: number): FrameSize;
    frame(frame: number, columns: number): Promise<CFrameData>;
}
export type FrameTile = {url: string; columns: number; start: number; count: number; bytes: number; sha256: string};
export type TiledAnimationManifest = {format: 'cascii-tiled-animation'; version: 1; framesPerTile: number; manifest: MultiSizeManifest; tiles: FrameTile[]};

function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init);
}

function nearestWidth(manifest: MultiSizeManifest, columns: number): number {
    if (!Number.isFinite(columns)) {
        throw new Error('Invalid column count');
    }
    return manifest.variants.map((variant) => variant.columns).reduce((best, value) => (Math.abs(value - columns) < Math.abs(best - columns) ? value : best));
}

function frameSize(manifest: MultiSizeManifest, frame: number, columns: number): FrameSize {
    const variant = manifest.variants.find((value) => value.columns === columns);
    if (!variant || !Number.isInteger(frame) || frame < 0 || frame >= manifest.frame_count) {
        throw new Error('Missing frame or width');
    }
    return {columns, rows: variant.rows[frame]};
}

async function inflateVerified(response: Response, bytes: number, sha256: string): Promise<Uint8Array> {
    if (!response.ok) {
        throw new Error(`Animation request failed (${response.status})`);
    }
    const encoded = new Uint8Array(await response.arrayBuffer());
    let data = encoded;
    if (encoded[0] === 0x1f && encoded[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('This browser does not support gzip decompression');
        }
        const stream = new Blob([encoded as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (data.length !== bytes) {
        throw new Error('Truncated animation data');
    }
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
    const digest = Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
    if (digest !== sha256) {
        throw new Error('Animation checksum mismatch');
    }
    return data;
}

/** Small standard CSMV files grouped by width and a short time interval. */
export class TiledMultiSizeSource implements MultiSizeFrameSource {
    readonly manifest: MultiSizeManifest;
    private readonly tiles: Map<string, FrameTile>;
    private readonly cache = new Map<string, BinaryMultiSizeSource>();
    private readonly pending = new Map<string, Promise<BinaryMultiSizeSource>>();

    private constructor(private readonly asset: TiledAnimationManifest, private readonly baseUrl: string, private readonly fetcher: typeof fetch) {
        this.manifest = asset.manifest;
        this.tiles = new Map(asset.tiles.map((tile) => [`${tile.columns}:${tile.start}`, tile]));
    }

    static async open(url: string, fetcher: typeof fetch = browserFetch): Promise<TiledMultiSizeSource> {
        const response = await fetcher(url);
        if (!response.ok) {
            throw new Error(`Animation metadata failed (${response.status})`);
        }
        const asset = (await response.json()) as TiledAnimationManifest;
        validateMultiSizeManifest(asset.manifest);
        if (
            asset.format !== 'cascii-tiled-animation' ||
            asset.version !== 1 ||
            !Number.isInteger(asset.framesPerTile) ||
            asset.framesPerTile < 1 ||
            asset.framesPerTile > 64 ||
            !Array.isArray(asset.tiles)
        ) {
            throw new Error('Invalid animation tiles');
        }
        const keys = new Set<string>();
        for (const tile of asset.tiles) {
            const key = `${tile.columns}:${tile.start}`;
            if (
                !asset.manifest.variants.some((variant) => variant.columns === tile.columns) ||
                !Number.isInteger(tile.start) ||
                tile.start < 0 ||
                tile.start >= asset.manifest.frame_count ||
                tile.start % asset.framesPerTile !== 0 ||
                tile.count !== Math.min(asset.framesPerTile, asset.manifest.frame_count - tile.start) ||
                !Number.isInteger(tile.bytes) ||
                tile.bytes < 16 ||
                tile.bytes > 16 * 1024 * 1024 ||
                !/^[a-z0-9-]+\.bin\.gz$/.test(tile.url) ||
                !/^[a-f0-9]{64}$/.test(tile.sha256) ||
                keys.has(key)
            ) {
                throw new Error('Invalid animation tile index');
            }
            keys.add(key);
        }
        if (asset.tiles.length !== asset.manifest.variants.length * Math.ceil(asset.manifest.frame_count / asset.framesPerTile)) {
            throw new Error('Missing animation tiles');
        }
        const absolute = response.url || new URL(url, typeof location === 'undefined' ? 'http://localhost/' : location.href).href;
        return new TiledMultiSizeSource(asset, absolute, fetcher);
    }

    get columns(): number[] {
        return this.manifest.variants.map((variant) => variant.columns);
    }

    nearest(columns: number): number {
        return nearestWidth(this.manifest, columns);
    }

    size(frame: number, columns: number): FrameSize {
        return frameSize(this.manifest, frame, columns);
    }

    async frame(frame: number, columns: number): Promise<CFrameData> {
        this.size(frame, columns);
        const start = Math.floor(frame / this.asset.framesPerTile) * this.asset.framesPerTile;
        const key = `${columns}:${start}`;
        const tile = this.tiles.get(key)!;
        let source = this.cache.get(key);
        if (source) {
            this.cache.delete(key);
            this.cache.set(key, source);
        } else {
            let task = this.pending.get(key);
            if (!task) {
                task = (async () => {
                    const data = await inflateVerified(await this.fetcher(new URL(tile.url, this.baseUrl).href), tile.bytes, tile.sha256);
                    const loaded = await BinaryMultiSizeSource.open(new MemoryByteSource(data));
                    const variant = this.manifest.variants.find((value) => value.columns === columns)!;
                    if (
                        loaded.manifest.frame_count !== tile.count ||
                        loaded.manifest.fps !== this.manifest.fps ||
                        loaded.manifest.color !== this.manifest.color ||
                        loaded.columns.length !== 1 ||
                        loaded.columns[0] !== columns ||
                        loaded.manifest.variants[0].rows.some((rows, index) => rows !== variant.rows[start + index])
                    ) {
                        throw new Error('Animation tile metadata mismatch');
                    }
                    this.cache.set(key, loaded);
                    while (this.cache.size > 24) {
                        this.cache.delete(this.cache.keys().next().value!);
                    }
                    return loaded;
                })();
                this.pending.set(key, task);
            }
            try {
                source = await task;
            } finally {
                this.pending.delete(key);
            }
        }
        return source.frame(frame - start, columns);
    }
}

function assertRange(offset: number, length: number, size?: number): void {
    if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length <= 0 ||
        !Number.isSafeInteger(offset + length) ||
        (size !== undefined && offset + length > size)
    ) {
        throw new Error('Invalid binary byte range');
    }
}

export function validateMultiSizeManifest(manifest: MultiSizeManifest): void {
    if (
        manifest?.format !== 'cascii-multisize' ||
        ![1, 2].includes(manifest.schema_version) ||
        !Number.isInteger(manifest.frame_count) ||
        manifest.frame_count < 1 ||
        manifest.frame_count > 1_000_000 ||
        !Number.isInteger(manifest.fps) ||
        manifest.fps < 1 ||
        manifest.fps > 1000 ||
        !Number.isFinite(manifest.font_ratio) ||
        manifest.font_ratio <= 0 ||
        typeof manifest.color !== 'boolean' ||
        typeof manifest.text !== 'boolean' ||
        !(manifest.color || manifest.text)
    ) {
        throw new Error('Invalid multi-size manifest');
    }
    if (!Array.isArray(manifest.variants) || manifest.variants.length < 1 || manifest.variants.length > 256) {
        throw new Error('Invalid width variants');
    }
    let previous = 0;
    for (const variant of manifest.variants) {
        if (
            !Number.isInteger(variant.columns) ||
            variant.columns <= previous ||
            variant.columns > 4096 ||
            !Array.isArray(variant.rows) ||
            variant.rows.length !== manifest.frame_count ||
            variant.rows.some((rows) => !Number.isInteger(rows) || rows < 1 || rows * variant.columns > 16_777_216)
        ) {
            throw new Error('Invalid variant dimensions or order');
        }
        previous = variant.columns;
    }
    const widths = manifest.variants.map((variant) => variant.columns);
    if (!widths.includes(manifest.default_columns)) {
        throw new Error('Default columns are missing');
    }
    if (manifest.schema_version === 2) {
        if (!Array.isArray(manifest.column_map) || manifest.column_map.length !== manifest.frame_count || manifest.column_map.some((columns) => !widths.includes(columns))) {
            throw new Error('Invalid per-frame column map');
        }
    } else if (manifest.column_map !== undefined) {
        throw new Error('Per-frame maps require schema 2');
    }
}

export class MemoryByteSource implements ByteSource {
    readonly byteLength: number;
    constructor(private readonly data: Uint8Array) {
        this.byteLength = data.byteLength;
    }
    async read(offset: number, length: number): Promise<Uint8Array> {
        assertRange(offset, length, this.byteLength);
        return this.data.slice(offset, offset + length);
    }
}

/** Requests exact file ranges. Large assets require an actual 206 response. */
export class HttpByteSource implements ByteSource {
    byteLength?: number;
    private wholeFile?: Uint8Array;
    constructor(private readonly url: string, private readonly fetcher: typeof fetch = browserFetch) {}
    async read(offset: number, length: number): Promise<Uint8Array> {
        assertRange(offset, length, this.byteLength);
        if (this.wholeFile) {
            return this.wholeFile.slice(offset, offset + length);
        }
        const response = await this.fetcher(this.url, {headers: {Range: `bytes=${offset}-${offset + length - 1}`}});
        if (response.status === 206) {
            const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
            if (!match || Number(match[1]) !== offset || Number(match[2]) !== offset + length - 1 || !Number.isSafeInteger(Number(match[3]))) {
                throw new Error('Invalid Content-Range');
            }
            if (this.byteLength !== undefined && this.byteLength !== Number(match[3])) {
                throw new Error('Binary changed while loading');
            }
            this.byteLength = Number(match[3]);
            const data = new Uint8Array(await response.arrayBuffer());
            if (data.length !== length) {
                throw new Error('Truncated range response');
            }
            return data;
        }
        if (response.status !== 200) {
            throw new Error(`Binary request failed (${response.status})`);
        }
        const size = Number(response.headers.get('Content-Length'));
        if (!size || size > 32 * 1024 * 1024) {
            await response.body?.cancel();
            throw new Error('Large binaries need HTTP Range support or chunked transport');
        }
        this.wholeFile = new Uint8Array(await response.arrayBuffer());
        this.byteLength = this.wholeFile.length;
        assertRange(offset, length, this.byteLength);
        return this.wholeFile.slice(offset, offset + length);
    }
}

export class BinaryMultiSizeSource {
    private readonly decoded = new Map<string, CFrameData>();
    private readonly pending = new Map<string, Promise<CFrameData>>();
    private constructor(
        public readonly manifest: MultiSizeManifest,
        private readonly bytes: ByteSource,
        private readonly index: DataView,
        private readonly payloadStart: number,
    ) {}
    static async open(bytes: ByteSource): Promise<BinaryMultiSizeSource> {
        const header = await bytes.read(0, 16);
        const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
        const version = view.getUint32(4, true);
        if (new TextDecoder().decode(header.subarray(0, 4)) !== 'CSMV' || ![1, 2].includes(version)) {
            throw new Error('Unsupported CSMV binary');
        }
        const metadataLength = view.getUint32(8, true);
        const count = view.getUint32(12, true);
        if (!metadataLength || metadataLength > 16 * 1024 * 1024 || !count || count > 2_000_000) {
            throw new Error('Excessive binary metadata');
        }
        const manifest = JSON.parse(new TextDecoder().decode(await bytes.read(16, metadataLength))) as MultiSizeManifest;
        validateMultiSizeManifest(manifest);
        if (manifest.schema_version !== version || count !== manifest.frame_count * manifest.variants.length) {
            throw new Error('Binary manifest/index mismatch');
        }
        const data = await bytes.read(16 + metadataLength, count * 24);
        const index = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const payloadStart = 16 + metadataLength + count * 24;
        let expected = 0;
        for (let i = 0; i < count; i++) {
            const position = i * 24;
            const offset = Number(index.getBigUint64(position + 8, true));
            const length = index.getUint32(position + 16, true);
            if (
                index.getUint32(position, true) !== manifest.variants[i % manifest.variants.length].columns ||
                index.getUint32(position + 4, true) !== Math.floor(i / manifest.variants.length) ||
                index.getUint32(position + 20, true) !== Number(manifest.color) ||
                !Number.isSafeInteger(offset) ||
                offset !== expected ||
                !length
            ) {
                throw new Error('Invalid binary frame index');
            }
            expected = offset + length;
        }
        if (bytes.byteLength !== undefined && payloadStart + expected !== bytes.byteLength) {
            throw new Error('Truncated or trailing binary payload');
        }
        return new BinaryMultiSizeSource(manifest, bytes, index, payloadStart);
    }
    get columns(): number[] {
        return this.manifest.variants.map((variant) => variant.columns);
    }
    nearest(columns: number): number {
        if (!Number.isFinite(columns)) {
            throw new Error('Invalid column count');
        }
        return this.columns.reduce((best, value) => (Math.abs(value - columns) < Math.abs(best - columns) ? value : best));
    }
    size(frame: number, columns: number): FrameSize {
        const variant = this.manifest.variants.find((value) => value.columns === columns);
        if (!variant || !Number.isInteger(frame) || frame < 0 || frame >= this.manifest.frame_count) {
            throw new Error('Missing frame or width');
        }
        return {columns, rows: variant.rows[frame]};
    }
    async frame(frame: number, columns: number): Promise<CFrameData> {
        const dimensions = this.size(frame, columns);
        const key = `${frame}:${columns}`;
        const cached = this.decoded.get(key);
        if (cached) {
            this.decoded.delete(key);
            this.decoded.set(key, cached);
            return cached;
        }
        const inflight = this.pending.get(key);
        if (inflight) {
            return inflight;
        }
        const task = (async () => {
            const variant = this.manifest.variants.findIndex((value) => value.columns === columns);
            const position = (frame * this.manifest.variants.length + variant) * 24;
            const offset = Number(this.index.getBigUint64(position + 8, true));
            const length = this.index.getUint32(position + 16, true);
            const payload = await this.bytes.read(this.payloadStart + offset, length);
            let decoded: CFrameData;
            if (this.manifest.color) {
                decoded = parseCframe(payload);
            } else {
                const text = new TextDecoder('utf-8', {fatal: true}).decode(payload).replace(/\n$/, '');
                const lines = text.split('\n');
                if (lines.length !== dimensions.rows || lines.some((line) => line.length !== columns || /[^\x20-\x7e]/.test(line))) {
                    throw new Error('Text dimensions mismatch');
                }
                decoded = new CFrameData(columns, dimensions.rows, new TextEncoder().encode(lines.join('')), new Uint8Array(columns * dimensions.rows * 3).fill(255));
            }
            if (decoded.width !== columns || decoded.height !== dimensions.rows) {
                throw new Error('Color dimensions mismatch');
            }
            this.decoded.set(key, decoded);
            while (this.decoded.size > 128) {
                this.decoded.delete(this.decoded.keys().next().value!);
            }
            return decoded;
        })();
        this.pending.set(key, task);
        try {
            return await task;
        } finally {
            this.pending.delete(key);
        }
    }
}

export function resolutionProgress(progress: number, curve: ResolutionCurve): number {
    const t = Math.max(0, Math.min(1, progress));
    if (curve === 'exponential') {
        return Math.expm1(4 * t) / Math.expm1(4);
    }
    if (curve === 'logarithmic') {
        return Math.log1p(Math.expm1(4) * t) / 4;
    }
    return t;
}

/** One animation clock; selecting another generated grid never resets it. */
export class AdaptiveFramePlayer {
    readonly controller: AnimationController;
    private manualColumns: number | null;
    private transition: ResolutionTransition | null = null;
    private lastTick: number | null = null;
    private drawTicket = 0;
    private destroyed = false;
    private scratch: HTMLCanvasElement | null = null;
    constructor(public readonly source: MultiSizeFrameSource, options: AdaptivePlayerOptions = {}) {
        this.controller = new AnimationController(source.manifest.fps);
        this.controller.setFrameCount(source.manifest.frame_count);
        this.controller.setLoopMode(options.loop === false ? LoopMode.Once : LoopMode.Loop);
        this.manualColumns = options.columns === undefined ? null : source.nearest(options.columns);
    }
    get columns(): number {
        if (this.transition) {
            const widths = this.source.columns;
            const t = resolutionProgress(this.controller.currentFrame / Math.max(1, this.controller.frameCount - 1), this.transition.curve);
            const value = this.transition.direction === 'up' ? t : 1 - t;
            return this.source.nearest(widths[0] + (widths[widths.length - 1] - widths[0]) * value);
        }
        return this.manualColumns ?? this.source.manifest.column_map?.[this.controller.currentFrame] ?? this.source.manifest.default_columns;
    }
    selectColumns(columns: number): number {
        this.transition = null;
        this.manualColumns = this.source.nearest(columns);
        return this.manualColumns;
    }
    followColumnMap(): void {
        this.manualColumns = null;
        this.transition = null;
    }
    setTransition(transition: ResolutionTransition): void {
        this.transition = transition;
    }
    fitToContainer(viewport: CanvasViewport, metrics: GlyphMetrics = {width: 2.8, height: 4}): number {
        if (![viewport.width, viewport.height, metrics.width, metrics.height].every((value) => Number.isFinite(value) && value > 0)) {
            throw new Error('Invalid container dimensions');
        }
        const padding = viewport.padding ?? 16;
        const fitting = this.source.manifest.variants.filter(
            (variant) =>
                variant.columns * metrics.width <= viewport.width - padding * 2 && variant.rows[this.controller.currentFrame] * metrics.height <= viewport.height - padding * 2,
        );
        return this.selectColumns(fitting[fitting.length - 1]?.columns ?? this.source.columns[0]);
    }
    play(): void {
        this.lastTick = null;
        this.controller.play();
    }
    pause(): void {
        this.lastTick = null;
        this.controller.pause();
    }
    replay(): void {
        this.controller.stop();
        this.play();
    }
    seek(progress: number): void {
        if (this.controller.state === 'finished') {
            this.controller.stop();
        }
        this.controller.seek(progress);
        this.lastTick = null;
    }
    advance(now: number): boolean {
        if (!this.controller.isPlaying()) {
            this.lastTick = null;
            return false;
        }
        if (this.lastTick === null) {
            this.lastTick = now;
            return false;
        }
        const duration = 1000 / this.controller.fps;
        const steps = Math.floor((now - this.lastTick) / duration);
        if (steps < 1) {
            return false;
        }
        this.lastTick += steps * duration;
        let changed = false;
        const ticks = this.controller.loopMode === LoopMode.Loop ? (steps - 1) % this.controller.frameCount + 1 : Math.min(steps, this.controller.frameCount);
        for (let i = 0; i < ticks; i++) {
            changed = this.controller.tick() || changed;
        }
        return changed || !this.controller.isPlaying();
    }
    snapshot(): PlayerSnapshot {
        return {
            ...this.source.size(this.controller.currentFrame, this.columns),
            frame: this.controller.currentFrame,
            frameCount: this.controller.frameCount,
            playing: this.controller.isPlaying(),
            finished: this.controller.state === 'finished',
        };
    }
    async drawToCanvas(canvas: HTMLCanvasElement, viewport: CanvasViewport): Promise<PlayerSnapshot | null> {
        const ticket = ++this.drawTicket;
        const snapshot = this.snapshot();
        const frame = await this.source.frame(snapshot.frame, snapshot.columns);
        if (this.destroyed || ticket !== this.drawTicket || snapshot.frame !== this.controller.currentFrame || snapshot.columns !== this.columns) {
            return null;
        }
        const padding = viewport.padding ?? 12;
        const reference = this.source.manifest.variants[this.source.manifest.variants.length - 1];
        const aspect = (reference.columns * this.source.manifest.font_ratio) / reference.rows[0];
        const imageWidth = Math.max(1, Math.min(viewport.width - padding * 2, (viewport.height - padding * 2) * aspect));
        const imageHeight = imageWidth / aspect;
        const config = new RenderConfig(Math.max(0.75, imageWidth / (snapshot.columns * 0.6)));
        config.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        config.backgroundColor = [8, 10, 14];
        this.scratch ??= document.createElement('canvas');
        renderToCanvas(frame, this.scratch, config);
        const dpr = Math.min(2, viewport.devicePixelRatio ?? window.devicePixelRatio ?? 1);
        const width = Math.max(1, Math.round(viewport.width * dpr));
        const height = Math.max(1, Math.round(viewport.height * dpr));
        if (canvas.width !== width) {
            canvas.width = width;
        }
        if (canvas.height !== height) {
            canvas.height = height;
        }
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas rendering is unavailable');
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = '#080a0e';
        context.fillRect(0, 0, viewport.width, viewport.height);
        context.drawImage(this.scratch, (viewport.width - imageWidth) / 2, (viewport.height - imageHeight) / 2, imageWidth, imageHeight);
        return snapshot;
    }
    destroy(): void {
        this.destroyed = true;
        this.drawTicket++;
        this.pause();
        this.scratch = null;
    }
}
