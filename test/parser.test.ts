import {describe, it, expect} from 'vitest';
import {
  CFRAME_EXT_FLAG_HAS_BG,
  encodeCframe,
  parseCframe,
  parseCframeText,
  parsePackedCframes,
  ParseError,
  splitCframeExtension,
} from '../src/parser';
import {CFrameData} from '../src/data';

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

  it('parses flagged and legacy background extensions', () => {
    const body = [
      2, 0, 0, 0,
      1, 0, 0, 0,
      0x41, 255, 0, 0,
      0x42, 0, 255, 0,
    ];
    const background = [200, 100, 50, 50, 100, 200];
    const flagged = parseCframe(new Uint8Array([...body, CFRAME_EXT_FLAG_HAS_BG, ...background]));
    const legacy = parseCframe(new Uint8Array([...body, ...background]));
    expect(Array.from(flagged.bgRgb ?? [])).toEqual(background);
    expect(Array.from(legacy.bgRgb ?? [])).toEqual(background);
  });

  it('encodes foreground and background frames losslessly', () => {
    const frame = CFrameData.withBackground(2, 1, new Uint8Array([0x41, 0x42]), new Uint8Array([255, 0, 0, 0, 255, 0]), new Uint8Array([10, 20, 30, 40, 50, 60]));
    const bytes = encodeCframe(frame);
    const [legacy, extension] = splitCframeExtension(bytes);
    expect(legacy.length).toBe(16);
    expect(extension[0]).toBe(CFRAME_EXT_FLAG_HAS_BG);

    const decoded = parseCframe(bytes);
    expect(Array.from(decoded.chars)).toEqual([0x41, 0x42]);
    expect(Array.from(decoded.rgb)).toEqual([255, 0, 0, 0, 255, 0]);
    expect(Array.from(decoded.bgRgb ?? [])).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('validates frame buffers before encoding', () => {
    const invalid = new CFrameData(2, 1, new Uint8Array([0x41]), new Uint8Array([255, 0, 0]));
    expect(() => encodeCframe(invalid)).toThrow(ParseError);
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

  it('parses flagged packed backgrounds without corrupting later frames', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
      0x41, 255, 0, 0, CFRAME_EXT_FLAG_HAS_BG, 10, 20, 30,
      0x42, 0, 255, 0, CFRAME_EXT_FLAG_HAS_BG, 40, 50, 60,
    ]);
    const blob = parsePackedCframes(bytes);
    expect(blob.hasBackground()).toBe(true);
    expect(blob.decodeFrame(0)?.toText()).toBe('A\n');
    expect(blob.decodeFrame(1)?.toText()).toBe('B\n');
    expect(blob.decodeFrame(1)?.bgRgbAt(0, 0)).toEqual([40, 50, 60]);
  });

  it('parses legacy packed backgrounds', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
      0x41, 255, 0, 0, 10, 20, 30,
      0x42, 0, 255, 0, 40, 50, 60,
    ]);
    const blob = parsePackedCframes(bytes);
    expect(blob.decodeFrame(1)?.toText()).toBe('B\n');
    expect(blob.decodeFrame(0)?.bgRgbAt(0, 0)).toEqual([10, 20, 30]);
  });

  it('rejects a malformed mixed flagged background payload', () => {
    const bytes = new Uint8Array([
      2, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
      0x41, 255, 0, 0, CFRAME_EXT_FLAG_HAS_BG, 10, 20, 30,
      0x42, 0, 255, 0, 0, 40, 50, 60,
    ]);
    expect(() => parsePackedCframes(bytes)).toThrow(/Invalid extension flags/);
  });
});
