import {afterEach, describe, it, expect, vi} from 'vitest';
import {CFrameData} from '../src/data';
import {ParseError} from '../src/parser';
import {FramePlayer} from '../src/player';

function packedBlobBytes(): Uint8Array {
  return new Uint8Array([
    2, 0, 0, 0, // frame count = 2
    2, 0, 0, 0, // width = 2
    1, 0, 0, 0, // height = 1
    0x41, 255, 0, 0,
    0x42, 0, 255, 0,
    0x43, 0, 0, 255,
    0x44, 255, 255, 255,
  ]);
}

function packedBackgroundBlobBytes(): Uint8Array {
  return new Uint8Array([
    2, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
    0x41, 255, 0, 0, 1, 10, 20, 30,
    0x42, 0, 255, 0, 1, 40, 50, 60,
  ]);
}

type FakeCanvas = HTMLCanvasElement & {glyphs: string[]};

function fakeCanvas(): FakeCanvas {
  const canvas = {width: 0, height: 0, style: {width: '', height: ''}, glyphs: [] as string[]} as unknown as FakeCanvas;
  const context = {
    font: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    measureText: () => ({width: 6}),
    setTransform: () => undefined,
    fillRect: () => undefined,
    strokeText: () => undefined,
    clearRect: () => { canvas.glyphs = []; },
    fillText: (text: string) => { canvas.glyphs.push(text); },
    drawImage: (source: FakeCanvas) => { canvas.glyphs.push(...source.glyphs); },
  };
  (canvas as unknown as {getContext: () => unknown}).getContext = () => context;
  return canvas;
}

function stubOffscreenCanvases(): FakeCanvas[] {
  const created: FakeCanvas[] = [];
  vi.stubGlobal('document', {createElement: () => {
    const canvas = fakeCanvas();
    created.push(canvas);
    return canvas;
  }});
  return created;
}

function glyphFrame(char: string): CFrameData {
  return new CFrameData(1, 1, Uint8Array.of(char.charCodeAt(0)), Uint8Array.of(255, 255, 255));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FramePlayer', () => {
  it('sets in-memory text frames', () => {
    const player = new FramePlayer(30);

    player.setTextFrames(['AB\n', 'CD\n']);

    expect(player.frameCount).toBe(2);
    expect(player.currentText()).toBe('AB\n');
    expect(player.frameFiles).toEqual([]);
    expect(player.colorReady).toBe(false);
  });

  it('loads packed colors into an empty player', () => {
    const player = new FramePlayer(30);

    player.loadPackedColors(packedBlobBytes());

    expect(player.frameCount).toBe(2);
    expect(player.colorReady).toBe(true);
    expect(player.currentText()).toBe('AB\n');
    expect(player.getText(1)).toBe('CD\n');
    expect(player.hasColorAt(0)).toBe(true);
    expect(player.hasColorAt(1)).toBe(true);
  });

  it('applies packed colors to existing text frames', () => {
    const player = new FramePlayer(30);
    player.setTextFrames(['AB\n', 'CD\n']);

    player.loadPackedColors(packedBlobBytes());

    expect(player.frameCount).toBe(2);
    expect(player.colorReady).toBe(true);
    expect(player.hasAnyColor()).toBe(true);
    expect(player.getFrames().every(frame => frame.cframe !== null)).toBe(true);
  });

  it('throws when packed frame count does not match loaded text frames', () => {
    const player = new FramePlayer(30);
    player.setTextFrames(['AB\n']);

    expect(() => player.loadPackedColors(packedBlobBytes())).toThrow(ParseError);
  });

  it('loads packed backgrounds into every frame', () => {
    const player = new FramePlayer(30);
    player.loadPackedColors(packedBackgroundBlobBytes());

    expect(player.getText(0)).toBe('A\n');
    expect(player.getText(1)).toBe('B\n');
    expect(player.getFrames()[0].cframe?.bgRgbAt(0, 0)).toEqual([10, 20, 30]);
    expect(player.getFrames()[1].cframe?.bgRgbAt(0, 0)).toEqual([40, 50, 60]);
  });

  it('draws a replaced frame instead of its stale cached canvas', () => {
    const offscreen = stubOffscreenCanvases();
    const target = fakeCanvas();
    const player = new FramePlayer(30);
    player.setTextFrames(['A\n', 'C\n']);
    player.setFrameColor(0, glyphFrame('A'));
    player.setFrameColor(1, glyphFrame('C'));
    player.colorReady = true;

    expect(player.renderFrame(0, target)).toBe(true);
    expect(player.renderFrame(1, target)).toBe(true);
    expect(target.glyphs).toEqual(['C']);
    expect(offscreen).toHaveLength(2);

    expect(player.setFrameColor(0, glyphFrame('B'))).toBe(true);
    player.renderFrame(0, target);
    expect(target.glyphs).toEqual(['B']);
    expect(offscreen).toHaveLength(3);

    player.renderFrame(1, target);
    expect(target.glyphs).toEqual(['C']);
    expect(offscreen).toHaveLength(3);
  });

  it('redraws a frame mutated in place after invalidateFrame', () => {
    stubOffscreenCanvases();
    const target = fakeCanvas();
    const player = new FramePlayer(30);
    const cframe = glyphFrame('A');
    player.setTextFrames(['A\n']);
    player.setFrameColor(0, cframe);
    player.colorReady = true;
    player.renderFrame(0, target);

    cframe.chars[0] = 'Z'.charCodeAt(0);
    player.renderFrame(0, target);
    expect(target.glyphs).toEqual(['A']);

    expect(player.invalidateFrame(0)).toBe(true);
    player.renderFrame(0, target);
    expect(target.glyphs).toEqual(['Z']);
  });

  it('redraws frames after new packed colors with the same frame count', () => {
    stubOffscreenCanvases();
    const target = fakeCanvas();
    const player = new FramePlayer(30);
    player.loadPackedColors(packedBackgroundBlobBytes());
    player.renderFrame(0, target);
    expect(target.glyphs).toEqual(['A']);

    player.loadPackedColors(new Uint8Array([
      2, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
      0x58, 255, 0, 0,
      0x59, 0, 255, 0,
    ]));
    player.renderFrame(0, target);
    expect(target.glyphs).toEqual(['X']);
    expect(player.getFrames()[0].cframe?.bgRgbAt(0, 0)).toBeNull();
  });

  it('ignores invalid frame indices', () => {
    const player = new FramePlayer(30);
    player.setTextFrames(['A\n', 'B\n']);

    for (const index of [-1, 0.5, 2, Number.NaN]) {
      expect(player.setFrameColor(index, glyphFrame('Z'))).toBe(false);
      expect(player.invalidateFrame(index)).toBe(false);
    }
    expect(player.getFrames().every(frame => frame.cframe === null)).toBe(true);
  });

  it('keeps colorReady unchanged when setting a frame color', () => {
    const player = new FramePlayer(30);
    player.setTextFrames(['A\n']);

    player.setFrameColor(0, glyphFrame('A'));
    expect(player.colorReady).toBe(false);
  });
});
