import {describe, it, expect} from 'vitest';
import {FrameFile, CFrameData, Frame} from '../src/data';

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
  const cframe = new CFrameData(
    2, 2,
    new Uint8Array([0x41, 0x42, 0x43, 0x44]),
    new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128]),
  );

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

  it('pixelCount', () => {
    expect(cframe.pixelCount()).toBe(4);
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
