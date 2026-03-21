import {describe, it, expect} from 'vitest';
import {parseColor, FrameColors} from '../src/color';

describe('parseColor', () => {
  it('named colors', () => {
    expect(parseColor('black')).toEqual([0, 0, 0]);
    expect(parseColor('white')).toEqual([255, 255, 255]);
    expect(parseColor('red')).toEqual([255, 0, 0]);
    expect(parseColor('green')).toEqual([0, 128, 0]);
    expect(parseColor('blue')).toEqual([0, 0, 255]);
    expect(parseColor('yellow')).toEqual([255, 255, 0]);
    expect(parseColor('cyan')).toEqual([0, 255, 255]);
    expect(parseColor('magenta')).toEqual([255, 0, 255]);
    expect(parseColor('gray')).toEqual([128, 128, 128]);
    expect(parseColor('grey')).toEqual([128, 128, 128]);
    expect(parseColor('orange')).toEqual([255, 165, 0]);
    expect(parseColor('purple')).toEqual([128, 0, 128]);
    expect(parseColor('pink')).toEqual([255, 192, 203]);
    expect(parseColor('brown')).toEqual([139, 69, 19]);
  });

  it('case insensitive', () => {
    expect(parseColor('Black')).toEqual([0, 0, 0]);
    expect(parseColor('WHITE')).toEqual([255, 255, 255]);
  });

  it('trims whitespace', () => {
    expect(parseColor('  black  ')).toEqual([0, 0, 0]);
    expect(parseColor('  #ff0000  ')).toEqual([255, 0, 0]);
  });

  it('hex #RRGGBB', () => {
    expect(parseColor('#000000')).toEqual([0, 0, 0]);
    expect(parseColor('#ffffff')).toEqual([255, 255, 255]);
    expect(parseColor('#FF0000')).toEqual([255, 0, 0]);
    expect(parseColor('#f6f6f6')).toEqual([246, 246, 246]);
  });

  it('hex #RGB shorthand', () => {
    expect(parseColor('#000')).toEqual([0, 0, 0]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#f00')).toEqual([255, 0, 0]);
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
  });

  it('invalid colors return null', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('notacolor')).toBeNull();
    expect(parseColor('#')).toBeNull();
    expect(parseColor('#zz')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('#1234567')).toBeNull();
  });
});

describe('FrameColors', () => {
  it('fromStrings with valid colors', () => {
    const c = FrameColors.fromStrings('white', 'black');
    expect(c.foreground).toEqual([255, 255, 255]);
    expect(c.background).toEqual([0, 0, 0]);
  });

  it('fromStrings with hex', () => {
    const c = FrameColors.fromStrings('#f6f6f6', '#1a1a2e');
    expect(c.foreground).toEqual([246, 246, 246]);
    expect(c.background).toEqual([26, 26, 46]);
  });

  it('falls back on invalid', () => {
    const c = FrameColors.fromStrings('invalid', 'alsobad');
    expect(c.foreground).toEqual([255, 255, 255]);
    expect(c.background).toEqual([0, 0, 0]);
  });

  it('css strings', () => {
    const c = FrameColors.fromStrings('white', 'black');
    expect(c.foregroundCss()).toBe('rgb(255,255,255)');
    expect(c.backgroundCss()).toBe('rgb(0,0,0)');
  });
});
