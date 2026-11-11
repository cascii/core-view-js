import {describe, expect, it, vi} from 'vitest';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {CFrameData} from '../src/data';
import {encodeCframe} from '../src/parser';
import {AdaptiveFramePlayer, BinaryMultiSizeSource, HttpByteSource, MemoryByteSource, TiledMultiSizeSource, resolutionProgress} from '../src/multisize';
import type {MultiSizeManifest, ResolutionCurve, TiledAnimationManifest} from '../src/multisize';

type Fixture = {bytes: Uint8Array; manifest: MultiSizeManifest; indexStart: number};
type FixtureOptions = {columns?: number[]; frames?: number; mapped?: boolean};

function fixture({columns = [2, 4, 6], frames = 5, mapped = false}: FixtureOptions = {}): Fixture {
    const manifest: MultiSizeManifest = {
        format: 'cascii-multisize', schema_version: mapped ? 2 : 1, frame_count: frames, fps: 10,
        default_columns: columns[columns.length - 1], font_ratio: 0.7, color: true, text: true,
        variants: columns.map(width => ({columns: width, rows: Array(frames).fill(2)})),
        ...(mapped ? {column_map: Array.from({length: frames}, (_, frame) => columns[frame % columns.length])} : {}),
    };
    const metadata = new TextEncoder().encode(JSON.stringify(manifest));
    const payloads = Array.from({length: frames}, (_, frame) => columns.map(width => encodeCframe(CFrameData.withBackground(
        width, 2, new Uint8Array(width * 2).fill(65 + frame), new Uint8Array(width * 6).fill(190), new Uint8Array(width * 6).fill(30),
    )))).flat();
    const indexStart = 16 + metadata.length;
    const payloadStart = indexStart + payloads.length * 24;
    const bytes = new Uint8Array(payloadStart + payloads.reduce((size, payload) => size + payload.length, 0));
    bytes.set(new TextEncoder().encode('CSMV'));
    const view = new DataView(bytes.buffer);
    view.setUint32(4, manifest.schema_version, true);
    view.setUint32(8, metadata.length, true);
    view.setUint32(12, payloads.length, true);
    bytes.set(metadata, 16);
    let offset = 0;
    payloads.forEach((payload, index) => {
        const position = indexStart + index * 24;
        view.setUint32(position, columns[index % columns.length], true);
        view.setUint32(position + 4, Math.floor(index / columns.length), true);
        view.setBigUint64(position + 8, BigInt(offset), true);
        view.setUint32(position + 16, payload.length, true);
        view.setUint32(position + 20, 1, true);
        bytes.set(payload, payloadStart + offset);
        offset += payload.length;
    });
    return {bytes, manifest, indexStart};
}

async function source(): Promise<BinaryMultiSizeSource> {
    return BinaryMultiSizeSource.open(new MemoryByteSource(fixture().bytes));
}

describe('multi-size binary source', () => {
    it('decodes frame-major variants, foregrounds and backgrounds without changing payload data', async () => {
        const animation = await source();
        const frame = await animation.frame(3, 4);
        expect([frame.width, frame.height]).toEqual([4, 2]);
        expect(frame.toText()).toBe('DDDD\nDDDD\n');
        expect(frame.rgbAt(0, 0)).toEqual([190, 190, 190]);
        expect(frame.bgRgbAt(0, 0)).toEqual([30, 30, 30]);
        expect(await animation.frame(3, 4)).toBe(frame);
        expect(animation.nearest(5)).toBe(4);
        expect(animation.nearest(99)).toBe(6);
        await expect(animation.frame(5, 4)).rejects.toThrow('Missing frame');
    });

    it('rejects truncated files and corrupt index offsets before decoding', async () => {
        const data = fixture();
        await expect(BinaryMultiSizeSource.open(new MemoryByteSource(data.bytes.slice(0, -1)))).rejects.toThrow('Truncated');
        new DataView(data.bytes.buffer).setBigUint64(data.indexStart + 8, 99n, true);
        await expect(BinaryMultiSizeSource.open(new MemoryByteSource(data.bytes))).rejects.toThrow('Invalid binary frame index');
    });

    it('preserves schema-two per-frame selections and allows manual override', async () => {
        const animation = await BinaryMultiSizeSource.open(new MemoryByteSource(fixture({mapped: true}).bytes));
        const player = new AdaptiveFramePlayer(animation);
        expect(player.columns).toBe(2);
        player.seek(0.5);
        expect(player.columns).toBe(6);
        player.selectColumns(4);
        player.seek(0);
        expect(player.columns).toBe(4);
        player.followColumnMap();
        expect(player.columns).toBe(2);
    });
});

describe('adaptive playback', () => {
    it('changes grids and fits both box dimensions without restarting the clock', async () => {
        const player = new AdaptiveFramePlayer(await source());
        player.play();
        player.advance(0);
        player.advance(200);
        player.selectColumns(2);
        expect(player.snapshot()).toMatchObject({frame: 2, columns: 2, playing: true});
        player.advance(300);
        expect(player.snapshot().frame).toBe(3);
        expect(player.fitToContainer({width: 72, height: 52}, {width: 10, height: 10})).toBe(4);
        expect(player.fitToContainer({width: 100, height: 40}, {width: 10, height: 10})).toBe(2);
        expect(player.snapshot().frame).toBe(3);
    });

    it('catches up correctly across multiple full loops', async () => {
        const player = new AdaptiveFramePlayer(await source());
        player.play();
        player.advance(0);
        player.advance(1200);
        expect(player.snapshot().frame).toBe(2);
    });

    it('reports completion, supports replay, and lets seeking resume a finished clip', async () => {
        const player = new AdaptiveFramePlayer(await source(), {loop: false});
        player.play();
        player.advance(0);
        player.advance(400);
        expect(player.snapshot()).toMatchObject({frame: 4, finished: false});
        expect(player.advance(500)).toBe(true);
        expect(player.snapshot()).toMatchObject({frame: 4, playing: false, finished: true});
        player.seek(0.5);
        player.play();
        expect(player.snapshot()).toMatchObject({frame: 2, playing: true, finished: false});
        player.replay();
        expect(player.snapshot().frame).toBe(0);
    });

    it.each<ResolutionCurve>(['linear', 'exponential', 'logarithmic'])('reaches exact endpoints in both directions with %s', async curve => {
        const player = new AdaptiveFramePlayer(await source());
        for (const direction of ['up', 'down'] as const) {
            player.seek(0);
            player.setTransition({curve, direction});
            expect(player.columns).toBe(direction === 'up' ? 2 : 6);
            player.seek(1);
            expect(player.columns).toBe(direction === 'up' ? 6 : 2);
        }
        expect(resolutionProgress(0, curve)).toBe(0);
        expect(resolutionProgress(1, curve)).toBe(1);
        const values = Array.from({length: 101}, (_, index) => resolutionProgress(index / 100, curve));
        expect(values).toEqual([...values].sort((a, b) => a - b));
    });

    it('gives logarithmic motion a fast start and exponential motion a slow start', () => {
        expect(resolutionProgress(0.25, 'logarithmic')).toBeGreaterThan(0.6);
        expect(resolutionProgress(0.25, 'exponential')).toBeLessThan(0.1);
        expect(resolutionProgress(0.25, 'linear')).toBe(0.25);
    });
});

describe('web transports', () => {
    it('fetches exact ranges, rejecting malformed or truncated responses', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), {status: 206, headers: {'Content-Range': 'bytes 4-5/20'}}));
        expect(await new HttpByteSource('/animation.bin', fetcher).read(4, 2)).toEqual(new Uint8Array([1, 2]));
        expect(fetcher).toHaveBeenCalledWith('/animation.bin', {headers: {Range: 'bytes=4-5'}});
        fetcher.mockResolvedValue(new Response(new Uint8Array([1]), {status: 206, headers: {'Content-Range': 'bytes 4-5/20'}}));
        await expect(new HttpByteSource('/animation.bin', fetcher).read(4, 2)).rejects.toThrow('Truncated');
        fetcher.mockResolvedValue(new Response(new Uint8Array([1, 2]), {status: 206, headers: {'Content-Range': 'bytes 0-1/20'}}));
        await expect(new HttpByteSource('/animation.bin', fetcher).read(4, 2)).rejects.toThrow('Content-Range');
    });

    it('does not silently download a large file when a server ignores Range', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('', {headers: {'Content-Length': String(426_000_000)}}));
        await expect(new HttpByteSource('/animation.bin', fetcher).read(0, 16)).rejects.toThrow('Range support');
    });

    it('decompresses and verifies tiles, deduplicates simultaneous loads, and rejects corrupt bytes', async () => {
        const tile = fixture({columns: [4], frames: 5});
        const manifest: TiledAnimationManifest = {
            format: 'cascii-tiled-animation', version: 1, framesPerTile: 8, manifest: tile.manifest,
            tiles: [{url: 'width-4-time-0000.bin.gz', columns: 4, start: 0, count: 5, bytes: tile.bytes.length, sha256: createHash('sha256').update(tile.bytes).digest('hex')}],
        };
        const fetcher = vi.fn(async (url: string) => url.endsWith('.json') ? Response.json(manifest) : new Response(gzipSync(tile.bytes)));
        const animation = await TiledMultiSizeSource.open('http://localhost/transport.json', fetcher as typeof fetch);
        const [first, second] = await Promise.all([animation.frame(0, 4), animation.frame(3, 4)]);
        expect(first.toText()).toBe('AAAA\nAAAA\n');
        expect(second.toText()).toBe('DDDD\nDDDD\n');
        expect(fetcher).toHaveBeenCalledTimes(2);
        manifest.tiles[0].sha256 = '0'.repeat(64);
        const corrupted = await TiledMultiSizeSource.open('http://localhost/transport.json', fetcher as typeof fetch);
        await expect(corrupted.frame(0, 4)).rejects.toThrow('checksum');
    });
});
