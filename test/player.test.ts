import {describe, it, expect} from 'vitest';
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
});
