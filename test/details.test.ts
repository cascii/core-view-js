import {describe, it, expect} from 'vitest';
import {parseDetailsToml, detailsFrameColors} from '../src/details';

describe('parseDetailsToml', () => {
  it('parses basic fields', () => {
    const toml = `
version = "1.0"
frames = 300
fps = 30
color = "red"
background_color = "#1a1a2e"
`;
    const details = parseDetailsToml(toml);
    expect(details.version).toBe('1.0');
    expect(details.frames).toBe(300);
    expect(details.fps).toBe(30);
    expect(details.color).toBe('red');
    expect(details.background_color).toBe('#1a1a2e');
  });
});

describe('detailsFrameColors', () => {
  it('defaults to white on black', () => {
    const colors = detailsFrameColors({});
    expect(colors.foreground).toEqual([255, 255, 255]);
    expect(colors.background).toEqual([0, 0, 0]);
  });

  it('uses custom colors', () => {
    const colors = detailsFrameColors({color: 'red', background_color: '#1a1a2e'});
    expect(colors.foreground).toEqual([255, 0, 0]);
    expect(colors.background).toEqual([26, 26, 46]);
  });
});
