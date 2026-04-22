import {describe, it, expect} from 'vitest';
import {parseCframe, parseCframeText, parsePackedCframes, ParseError} from '../src/parser';

describe('parseCframe', () => {
  it('parses valid cframe', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0, // width = 2
      2, 0, 0, 0, // height = 2
      0x41, 255, 0, 0,     // A red
      0x42, 0, 255, 0,     // B green
      0x43, 0, 0, 255,     // C blue
      0x44, 128, 128, 128, // D gray
    ]);

    const result = parseCframe(bytes);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(Array.from(result.chars)).toEqual([0x41, 0x42, 0x43, 0x44]);
    expect(Array.from(result.rgb)).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128]);
  });

  it('throws on too small', () => {
    expect(() => parseCframe(new Uint8Array([1, 2, 3]))).toThrow(ParseError);
  });

  it('throws on size mismatch', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0,
      2, 0, 0, 0,
      0x41, 255, 0, 0, // only 1 pixel instead of 4
    ]);
    expect(() => parseCframe(bytes)).toThrow(ParseError);
  });

  it('throws on zero dimensions', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0]);
    expect(() => parseCframe(bytes)).toThrow(ParseError);
  });
});

describe('parseCframeText', () => {
  it('extracts text with newlines', () => {
    const bytes = new Uint8Array([
      3, 0, 0, 0, // width = 3
      2, 0, 0, 0, // height = 2
      0x41, 0, 0, 0, 0x42, 0, 0, 0, 0x43, 0, 0, 0,
      0x44, 0, 0, 0, 0x45, 0, 0, 0, 0x46, 0, 0, 0,
    ]);

    expect(parseCframeText(bytes)).toBe('ABC\nDEF\n');
  });
});

describe('parsePackedCframes', () => {
  it('parses a valid packed blob', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0, // frame count = 2
      2, 0, 0, 0, // width = 2
      1, 0, 0, 0, // height = 1
      0x41, 255, 0, 0,
      0x42, 0, 255, 0,
      0x43, 0, 0, 255,
      0x44, 255, 255, 255,
    ]);

    const blob = parsePackedCframes(bytes);
    expect(blob.frameCount).toBe(2);
    expect(blob.width).toBe(2);
    expect(blob.height).toBe(1);
    expect(blob.decodeFrame(0)?.toText()).toBe('AB\n');
    expect(blob.decodeFrame(1)?.toText()).toBe('CD\n');
  });

  it('throws on zero frame count', () => {
    const bytes = new Uint8Array([
      0, 0, 0, 0,
      2, 0, 0, 0,
      1, 0, 0, 0,
    ]);
    expect(() => parsePackedCframes(bytes)).toThrow(ParseError);
  });

  it('throws on size mismatch', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0,
      2, 0, 0, 0,
      1, 0, 0, 0,
      0x41, 255, 0, 0,
    ]);
    expect(() => parsePackedCframes(bytes)).toThrow(ParseError);
  });
});
