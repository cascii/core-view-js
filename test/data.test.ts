import {describe, it, expect} from 'vitest';
import {FrameFile, CFrameData, PackedCFrameBlob, Frame} from '../src/data';

describe('FrameFile.extractIndex', () => {
  it('parses frame_ prefix', () => {
    expect(FrameFile.extractIndex('frame_0001', 0)).toBe(1);
    expect(FrameFile.extractIndex('frame_42', 0)).toBe(42);
  });

  it('extracts digits from arbitrary stems', () => {
    expect(FrameFile.extractIndex('0042', 0)).toBe(42);
    expect(FrameFile.extractIndex('my_frame_3', 0)).toBe(3);
  });

  it('returns fallback for no digits', () => {
    expect(FrameFile.extractIndex('no_digits', 99)).toBe(99);
  });
});

describe('CFrameData', () => {
  const cframe = new CFrameData(2, 2, new Uint8Array([0x41, 0x42, 0x43, 0x44]), new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128]));

  it('charAt returns correct values', () => {
    expect(cframe.charAt(0, 0)).toBe(0x41);
    expect(cframe.charAt(1, 1)).toBe(0x44);
    expect(cframe.charAt(2, 0)).toBeNull();
  });

  it('rgbAt returns correct values', () => {
    expect(cframe.rgbAt(0, 0)).toEqual([255, 0, 0]);
    expect(cframe.rgbAt(0, 1)).toEqual([0, 255, 0]);
    expect(cframe.rgbAt(1, 1)).toEqual([128, 128, 128]);
  });

  it('handles short color buffers safely', () => {
    const short = new CFrameData(2, 1, new Uint8Array([0x41, 0x42]), new Uint8Array([255, 255, 255]));
    expect(short.rgbAt(0, 1)).toBeNull();
    expect(short.hasVisibleForeground(0, 0)).toBe(true);
    expect(short.hasVisibleForeground(0, 1)).toBe(false);
    expect(short.charAt(-1, 0)).toBeNull();
  });

  it('preserves visible per-cell backgrounds, including black', () => {
    const background = CFrameData.withBackground(2, 1, new Uint8Array([0x20, 0x58]), new Uint8Array([0, 0, 0, 255, 255, 255]), new Uint8Array([0, 0, 0, 0, 0, 255]));
    expect(background.hasBackground()).toBe(true);
    expect(background.bgRgbAt(0, 1)).toEqual([0, 0, 255]);
    expect(background.hasVisibleBackground(0, 0)).toBe(true);
    expect(background.shouldSkip(0, 0)).toBe(false);
  });

  it('pixelCount', () => {
    expect(cframe.pixelCount()).toBe(4);
  });

  it('toText reconstructs frame text', () => {
    expect(cframe.toText()).toBe('AB\nCD\n');
  });
});

describe('PackedCFrameBlob', () => {
  const frameBytes = new Uint8Array([
    0x41, 255, 0, 0,
    0x42, 0, 255, 0,
    0x43, 0, 0, 255,
    0x44, 255, 255, 255,
  ]);
  const blob = new PackedCFrameBlob(2, 2, 1, frameBytes);

  it('reports frame metadata', () => {
    expect(blob.len()).toBe(2);
    expect(blob.isEmpty()).toBe(false);
    expect(blob.frameByteLen()).toBe(8);
  });

  it('decodes an individual frame', () => {
    const frame = blob.decodeFrame(1);
    expect(frame?.width).toBe(2);
    expect(frame?.height).toBe(1);
    expect(Array.from(frame?.chars ?? [])).toEqual([0x43, 0x44]);
    expect(Array.from(frame?.rgb ?? [])).toEqual([0, 0, 255, 255, 255, 255]);
  });

  it('decodes packed per-frame backgrounds', () => {
    const backgroundBlob = PackedCFrameBlob.withBackground(2, 1, 1, new Uint8Array([0x41, 255, 0, 0, 0x42, 0, 255, 0]), new Uint8Array([10, 20, 30, 40, 50, 60]));
    expect(backgroundBlob.hasBackground()).toBe(true);
    expect(Array.from(backgroundBlob.backgroundFrameBytes(1) ?? [])).toEqual([40, 50, 60]);
    expect(backgroundBlob.decodeFrame(0)?.bgRgbAt(0, 0)).toEqual([10, 20, 30]);
  });
});

describe('Frame', () => {
  it('dimensions from text', () => {
    expect(Frame.textOnly('ABC\nDEF\nGHI').dimensions()).toEqual([3, 3]);
    expect(Frame.textOnly('ABCD\nEF').dimensions()).toEqual([4, 2]);
  });

  it('hasColor', () => {
    expect(Frame.textOnly('A').hasColor()).toBe(false);
    const cframe = new CFrameData(1, 1, new Uint8Array([0x41]), new Uint8Array([255, 0, 0]));
    expect(Frame.withColor('A', cframe).hasColor()).toBe(true);
  });
});
