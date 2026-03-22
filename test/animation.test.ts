import {describe, it, expect} from 'vitest';
import {AnimationController, AnimationState, LoopMode} from '../src/animation';

describe('AnimationController', () => {
  it('basic playback', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(10);

    expect(ctrl.state).toBe(AnimationState.Stopped);
    expect(ctrl.currentFrame).toBe(0);

    ctrl.play();
    expect(ctrl.state).toBe(AnimationState.Playing);

    for (let i = 0; i < 5; i++) ctrl.tick();
    expect(ctrl.currentFrame).toBe(5);

    ctrl.pause();
    expect(ctrl.state).toBe(AnimationState.Stopped);
    expect(ctrl.currentFrame).toBe(5);
  });

  it('loop mode wraps around', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(5);
    ctrl.setLoopMode(LoopMode.Loop);
    ctrl.play();

    for (let i = 0; i < 6; i++) ctrl.tick();
    // 0 -> 1 -> 2 -> 3 -> 4 -> 0 -> 1
    expect(ctrl.currentFrame).toBe(1);
    expect(ctrl.state).toBe(AnimationState.Playing);
  });

  it('once mode finishes', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(5);
    ctrl.setLoopMode(LoopMode.Once);
    ctrl.play();

    for (let i = 0; i < 5; i++) ctrl.tick();
    expect(ctrl.currentFrame).toBe(4);
    expect(ctrl.state).toBe(AnimationState.Finished);
  });

  it('range', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(100);
    ctrl.setRange(0.25, 0.75);

    const [start, end] = ctrl.rangeFrames();
    expect(start).toBe(25);
    expect(end).toBe(74);

    ctrl.play();
    expect(ctrl.currentFrame).toBe(25);
  });

  it('step forward/backward', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(10);
    ctrl.setCurrentFrame(5);

    ctrl.stepForward();
    expect(ctrl.currentFrame).toBe(6);
    expect(ctrl.state).toBe(AnimationState.Stopped);

    ctrl.stepBackward();
    expect(ctrl.currentFrame).toBe(5);

    ctrl.setCurrentFrame(9);
    ctrl.stepForward();
    expect(ctrl.currentFrame).toBe(0);

    ctrl.stepBackward();
    expect(ctrl.currentFrame).toBe(9);
  });

  it('seek', () => {
    const ctrl = new AnimationController(24);
    ctrl.setFrameCount(100);

    ctrl.seek(0.5);
    expect(ctrl.currentFrame).toBe(50);

    ctrl.seek(0.0);
    expect(ctrl.currentFrame).toBe(0);

    ctrl.seek(1.0);
    expect(ctrl.currentFrame).toBe(99);
  });

  it('intervalMs', () => {
    expect(new AnimationController(24).intervalMs()).toBe(41);
    expect(new AnimationController(60).intervalMs()).toBe(16);
  });
});
