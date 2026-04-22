import {describe, it, expect} from 'vitest';
import {CFrameData} from '../src/data';
import {FrameCanvasCache, RenderConfig, currentRenderKey, renderCframe} from '../src/render';

describe('renderCframe', () => {
  it('batches same-color chars', () => {
    const cframe = new CFrameData(
      4, 1,
      new Uint8Array([0x41, 0x42, 0x20, 0x43]),
      new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 0]),
    );

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.batches.length).toBe(2);
    expect(result.batches[0].text).toBe('AB');
    expect(result.batches[0].color).toEqual([255, 0, 0]);
    expect(result.batches[1].text).toBe('C');
    expect(result.batches[1].color).toEqual([0, 255, 0]);
  });

  it('skips dark chars', () => {
    const cframe = new CFrameData(
      3, 1,
      new Uint8Array([0x41, 0x42, 0x43]),
      new Uint8Array([255, 0, 0, 2, 2, 2, 0, 255, 0]),
    );

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.batches.length).toBe(2);
    expect(result.batches[0].text).toBe('A');
    expect(result.batches[1].text).toBe('C');
  });

  it('canvas dimensions', () => {
    const cframe = new CFrameData(
      80, 24,
      new Uint8Array(80 * 24).fill(0x20),
      new Uint8Array(80 * 24 * 3).fill(0),
    );

    const result = renderCframe(cframe, new RenderConfig(10));
    expect(result.width).toBe(480); // 80 * 10 * 0.6
    expect(Math.abs(result.height - 266.4)).toBeLessThan(0.01);
  });

  it('includes font family in render config', () => {
    const config = new RenderConfig(12);
    config.fontFamily = 'Menlo, monospace';
    expect(config.fontString()).toBe('12.00px Menlo, monospace');
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
  });
});
