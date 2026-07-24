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

  static invalidExtensionFlags(frame: number, flags: number): ParseError {
    return new ParseError(`Invalid extension flags for packed frame ${frame}: 0x${flags.toString(16).padStart(2, '0')}`);
  }
}

const HEADER_SIZE = 8;
const PACKED_HEADER_SIZE = 12;
export const CFRAME_EXT_FLAG_HAS_BG = 0b0000_0001;

function readU32LE(data: Uint8Array, offset: number): number {
  return data[offset]
    + data[offset + 1] * 0x100
    + data[offset + 2] * 0x10000
    + data[offset + 3] * 0x1000000;
}

function writeU32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
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

  const extensionOffset = expectedSize;
  const backgroundSize = pixelCount * 3;
  if (data.length > extensionOffset) {
    const trailing = data.length - extensionOffset;
    if (trailing > backgroundSize && (data[extensionOffset] & CFRAME_EXT_FLAG_HAS_BG) !== 0) {
      const start = extensionOffset + 1;
      return CFrameData.withBackground(width, height, chars, rgb, data.slice(start, start + backgroundSize));
    }
    if (trailing === backgroundSize) {
      return CFrameData.withBackground(
        width,
        height,
        chars,
        rgb,
        data.slice(extensionOffset, extensionOffset + backgroundSize),
      );
    }
  }

  return new CFrameData(width, height, chars, rgb);
}

export function encodeCframe(frame: CFrameData): Uint8Array {
  const pixelCount = frame.width * frame.height;
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw ParseError.invalidDimensions(frame.width, frame.height);
  }
  if (frame.chars.length !== pixelCount) {
    throw ParseError.frameCountMismatch(pixelCount, frame.chars.length);
  }
  if (frame.rgb.length !== pixelCount * 3) {
    throw ParseError.sizeMismatch(pixelCount * 3, frame.rgb.length);
  }
  if (frame.bgRgb && frame.bgRgb.length !== pixelCount * 3) {
    throw ParseError.sizeMismatch(pixelCount * 3, frame.bgRgb.length);
  }

  const backgroundSize = frame.bgRgb ? 1 + frame.bgRgb.length : 0;
  const result = new Uint8Array(HEADER_SIZE + pixelCount * 4 + backgroundSize);
  writeU32LE(result, 0, frame.width);
  writeU32LE(result, 4, frame.height);

  for (let i = 0; i < pixelCount; i++) {
    const outputOffset = HEADER_SIZE + i * 4;
    const rgbOffset = i * 3;
    result[outputOffset] = frame.chars[i];
    result[outputOffset + 1] = frame.rgb[rgbOffset];
    result[outputOffset + 2] = frame.rgb[rgbOffset + 1];
    result[outputOffset + 3] = frame.rgb[rgbOffset + 2];
  }

  if (frame.bgRgb) {
    const extensionOffset = HEADER_SIZE + pixelCount * 4;
    result[extensionOffset] = CFRAME_EXT_FLAG_HAS_BG;
    result.set(frame.bgRgb, extensionOffset + 1);
  }
  return result;
}

export function splitCframeExtension(data: Uint8Array): [Uint8Array, Uint8Array] {
  if (data.length < HEADER_SIZE) {
    throw ParseError.fileTooSmall(HEADER_SIZE, data.length);
  }
  const width = readU32LE(data, 0);
  const height = readU32LE(data, 4);
  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }
  const legacySize = HEADER_SIZE + width * height * 4;
  if (data.length < legacySize) {
    throw ParseError.sizeMismatch(legacySize, data.length);
  }
  return [data.subarray(0, legacySize), data.subarray(legacySize)];
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

  const cellCount = width * height;
  const frameSize = cellCount * 4;
  const backgroundSize = cellCount * 3;
  const expectedSize = PACKED_HEADER_SIZE + frameCount * frameSize;

  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }

  const payload = data.subarray(PACKED_HEADER_SIZE);
  const flaggedStride = frameSize + 1 + backgroundSize;
  const legacyBackgroundStride = frameSize + backgroundSize;

  if (payload.length === frameCount * flaggedStride) {
    const frames = new Uint8Array(frameCount * frameSize);
    const backgrounds = new Uint8Array(frameCount * backgroundSize);
    for (let frame = 0; frame < frameCount; frame++) {
      const inputOffset = frame * flaggedStride;
      frames.set(payload.subarray(inputOffset, inputOffset + frameSize), frame * frameSize);
      const flags = payload[inputOffset + frameSize];
      if ((flags & CFRAME_EXT_FLAG_HAS_BG) === 0) {
        throw ParseError.invalidExtensionFlags(frame, flags);
      }
      const backgroundOffset = inputOffset + frameSize + 1;
      backgrounds.set(
        payload.subarray(backgroundOffset, backgroundOffset + backgroundSize),
        frame * backgroundSize,
      );
    }
    return PackedCFrameBlob.withBackground(frameCount, width, height, frames, backgrounds);
  }

  if (payload.length === frameCount * legacyBackgroundStride) {
    const frames = new Uint8Array(frameCount * frameSize);
    const backgrounds = new Uint8Array(frameCount * backgroundSize);
    for (let frame = 0; frame < frameCount; frame++) {
      const inputOffset = frame * legacyBackgroundStride;
      frames.set(payload.subarray(inputOffset, inputOffset + frameSize), frame * frameSize);
      backgrounds.set(
        payload.subarray(inputOffset + frameSize, inputOffset + frameSize + backgroundSize),
        frame * backgroundSize,
      );
    }
    return PackedCFrameBlob.withBackground(frameCount, width, height, frames, backgrounds);
  }

  return new PackedCFrameBlob(
    frameCount,
    width,
    height,
    data.slice(PACKED_HEADER_SIZE, expectedSize),
  );
}
