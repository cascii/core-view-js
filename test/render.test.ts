import {describe, it, expect} from 'vitest';
import {CFrameData} from '../src/data';
import {
  FrameCanvasCache,
  RenderConfig,
  currentRenderKey,
  renderCframe,
  renderCframeWithMetrics,
  renderToCanvas,
} from '../src/render';

describe('renderCframe', () => {
  it('batches same-color chars', () => {
    const cframe = new CFrameData(4, 1, new Uint8Array([0x41, 0x42, 0x20, 0x43]), new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 0]));

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.batches.length).toBe(2);
    expect(result.backgroundBatches).toEqual([]);
    expect(result.batches[0].text).toBe('AB');
    expect(result.batches[0].color).toEqual([255, 0, 0]);
    expect(result.batches[1].text).toBe('C');
    expect(result.batches[1].color).toEqual([0, 255, 0]);
  });

  it('skips dark chars', () => {
    const cframe = new CFrameData(3, 1, new Uint8Array([0x41, 0x42, 0x43]), new Uint8Array([255, 0, 0, 2, 2, 2, 0, 255, 0]));

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.batches.length).toBe(2);
    expect(result.batches[0].text).toBe('A');
    expect(result.batches[1].text).toBe('C');
  });

  it('canvas dimensions', () => {
    const cframe = new CFrameData(80, 24, new Uint8Array(80 * 24).fill(0x20), new Uint8Array(80 * 24 * 3).fill(0));

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.width).toBe(480); // 80 * 10 * 0.6
    expect(Math.abs(result.height - 266.4)).toBeLessThan(0.01);
  });

  it('includes font family in render config', () => {
    const config = new RenderConfig(12);
    config.fontFamily = 'Menlo, monospace';
    expect(config.fontString()).toBe('12.00px Menlo, monospace');
  });

  it('batches same-color cell backgrounds and keeps black visible', () => {
    const cframe = CFrameData.withBackground(3, 1, new Uint8Array([0x20, 0x41, 0x20]), new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0]), new Uint8Array([0, 0, 0, 0, 0, 0, 12, 12, 12]));
    const result = renderCframeWithMetrics(cframe, 6, 11);
    expect(result.backgroundBatches).toHaveLength(2);
    expect(result.backgroundBatches[0]).toMatchObject({x: 0, y: 0, width: 12, height: 11, color: [0, 0, 0]});
    expect(result.backgroundBatches[1].color).toEqual([12, 12, 12]);
    expect(result.batches).toHaveLength(1);
  });

  it('draws cell backgrounds before stroked foreground text', () => {
    const calls: string[] = [];
    const context = {
      font: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      measureText: () => ({width: 6}),
      setTransform: () => undefined,
      clearRect: () => calls.push('clear'),
      fillRect: () => calls.push('background'),
      strokeText: () => calls.push('stroke'),
      fillText: () => calls.push('text'),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      style: {width: '', height: ''},
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const cframe = CFrameData.withBackground(1, 1, new Uint8Array([0x41]), new Uint8Array([255, 255, 255]), new Uint8Array([0, 0, 0]));
    const config = new RenderConfig(10);
    config.textStrokeWidth = 0.5;

    renderToCanvas(cframe, canvas, config);
    expect(calls).toEqual(['clear', 'background', 'stroke', 'text']);
  });
});

describe('FrameCanvasCache', () => {
  it('invalidates on render key changes', () => {
    const config = new RenderConfig(10);
    const cache = new FrameCanvasCache(2);

    expect(cache.invalidateForRenderKey(currentRenderKey(config))).toBe(true);
    expect(cache.invalidateForRenderKey(currentRenderKey(config))).toBe(false);

    config.backgroundColor = [0, 0, 0];
    expect(cache.invalidateForRenderKey(currentRenderKey(config))).toBe(true);

    config.textStrokeWidth = 0.5;
    expect(cache.invalidateForRenderKey(currentRenderKey(config))).toBe(true);
  });
});
