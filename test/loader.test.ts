import {describe, it, expect} from 'vitest';
import {LoadingProgress, FrameLoaderState, LoadingPhase} from '../src/loader';
import {FrameFile, CFrameData} from '../src/data';

describe('LoadingProgress', () => {
  it('tracks percentages', () => {
    const progress = new LoadingProgress();
    progress.reset(10);
    expect(progress.textPercent()).toBe(0);
    expect(progress.textComplete()).toBe(false);

    progress.textLoaded = 5;
    expect(progress.textPercent()).toBe(50);

    progress.textLoaded = 10;
    expect(progress.textComplete()).toBe(true);
    expect(progress.textPercent()).toBe(100);
  });
});

describe('FrameLoaderState', () => {
  it('phases progress correctly', () => {
    const state = new FrameLoaderState();
    expect(state.phase).toBe(LoadingPhase.Idle);
    expect(state.canPlay()).toBe(false);

    const files = [
      new FrameFile('frame_0001.txt', 'frame_0001.txt', 1),
      new FrameFile('frame_0002.txt', 'frame_0002.txt', 2),
    ];

    state.startLoading(files);
    expect(state.phase).toBe(LoadingPhase.LoadingText);
    expect(state.canPlay()).toBe(false);

    state.addTextFrame('Frame 1');
    state.addTextFrame('Frame 2');
    state.finishTextLoading();

    expect(state.phase).toBe(LoadingPhase.LoadingColors);
    expect(state.canPlay()).toBe(true);
    expect(state.frameCount()).toBe(2);

    state.skipFrameColor();
    state.skipFrameColor();
    expect(state.phase).toBe(LoadingPhase.Complete);
  });

  it('handles color data', () => {
    const state = new FrameLoaderState();
    const files = [new FrameFile('frame_0001.txt', 'frame_0001.txt', 1)];

    state.startLoading(files);
    state.addTextFrame('Frame 1');
    state.finishTextLoading();
    expect(state.hasAnyColor()).toBe(false);

    const cframe = new CFrameData(2, 1, new Uint8Array([0x41, 0x42]), new Uint8Array([255, 0, 0, 0, 255, 0]));
    state.setFrameColor(0, cframe);

    expect(state.hasAnyColor()).toBe(true);
    expect(state.frames[0].hasColor()).toBe(true);
    expect(state.phase).toBe(LoadingPhase.Complete);
  });
});
