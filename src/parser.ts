import {CFrameData, PackedCFrameBlob} from './data';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }

  static fileTooSmall(expected: number, actual: number): ParseError {
    return new ParseError(`File too small: expected at least ${expected} bytes, got ${actual}`);
  }

  static sizeMismatch(expected: number, actual: number): ParseError {
    return new ParseError(`File size mismatch: expected ${expected} bytes, got ${actual}`);
  }

  static invalidDimensions(width: number, height: number): ParseError {
    return new ParseError(`Invalid dimensions: ${width}x${height}`);
  }

  static invalidFrameCount(count: number): ParseError {
    return new ParseError(`Invalid frame count: ${count}`);
  }

  static frameCountMismatch(expected: number, actual: number): ParseError {
    return new ParseError(`Frame count mismatch: expected ${expected}, got ${actual}`);
  }
}

const HEADER_SIZE = 8;
const PACKED_HEADER_SIZE = 12;

function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | ((data[offset + 3] << 24) >>> 0);
}

export function parseCframe(data: Uint8Array): CFrameData {
  if (data.length < HEADER_SIZE) {
    throw ParseError.fileTooSmall(HEADER_SIZE, data.length);
  }

  const width = readU32LE(data, 0);
  const height = readU32LE(data, 4);

  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }

  const pixelCount = width * height;
  const expectedSize = HEADER_SIZE + pixelCount * 4;

  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }

  const chars = new Uint8Array(pixelCount);
  const rgb = new Uint8Array(pixelCount * 3);

  for (let i = 0; i < pixelCount; i++) {
    const offset = HEADER_SIZE + i * 4;
    chars[i] = data[offset];
    rgb[i * 3] = data[offset + 1];
    rgb[i * 3 + 1] = data[offset + 2];
    rgb[i * 3 + 2] = data[offset + 3];
  }

  return new CFrameData(width, height, chars, rgb);
}

export function parseCframeText(data: Uint8Array): string {
  if (data.length < HEADER_SIZE) {
    throw ParseError.fileTooSmall(HEADER_SIZE, data.length);
  }

  const width = readU32LE(data, 0);
  const height = readU32LE(data, 4);

  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }

  const pixelCount = width * height;
  const expectedSize = HEADER_SIZE + pixelCount * 4;

  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }

  let text = '';
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const offset = HEADER_SIZE + idx * 4;
      text += String.fromCharCode(data[offset]);
    }
    text += '\n';
  }

  return text;
}

export function parsePackedCframes(data: Uint8Array): PackedCFrameBlob {
  if (data.length < PACKED_HEADER_SIZE) {
    throw ParseError.fileTooSmall(PACKED_HEADER_SIZE, data.length);
  }

  const frameCount = readU32LE(data, 0);
  const width = readU32LE(data, 4);
  const height = readU32LE(data, 8);

  if (frameCount === 0) {
    throw ParseError.invalidFrameCount(frameCount);
  }

  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }

  const frameSize = width * height * 4;
  const expectedSize = PACKED_HEADER_SIZE + frameCount * frameSize;

  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }

  return new PackedCFrameBlob(frameCount, width, height, data.slice(PACKED_HEADER_SIZE, expectedSize));
}
