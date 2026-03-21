import {describe, it, expect} from 'vitest';
import {FontSizing, charPosition} from '../src/sizing';

describe('FontSizing', () => {
  it('calculates font size constrained by width', () => {
    const sizing = new FontSizing();
    const fs = sizing.calculateFontSize(80, 24, 800, 600);
    // Width: (800-20) / (80 * 0.6) ≈ 16.25
    // Height: (600-20) / (24 * 1.11) ≈ 21.77
    expect(fs).toBeGreaterThan(15);
    expect(fs).toBeLessThan(17);
  });

  it('returns min for zero dimensions', () => {
    const sizing = new FontSizing();
    expect(sizing.calculateFontSize(0, 24, 800, 600)).toBe(1.0);
    expect(sizing.calculateFontSize(80, 0, 800, 600)).toBe(1.0);
  });

  it('static calculate works', () => {
    const fs = FontSizing.calculate(80, 24, 800, 600);
    expect(fs).toBeGreaterThan(15);
    expect(fs).toBeLessThan(17);
  });

  it('canvasDimensions', () => {
    const sizing = new FontSizing();
    const [w, h] = sizing.canvasDimensions(80, 24, 10);
    expect(w).toBe(80 * 10 * 0.6);
    expect(h).toBe(24 * 10 * 1.11);
  });
});

describe('charPosition', () => {
  it('calculates correct position', () => {
    const [x, y] = charPosition(10, 5, 12);
    expect(Math.abs(x - 72)).toBeLessThan(0.001);
    expect(Math.abs(y - 66.6)).toBeLessThan(0.001);
  });
});
