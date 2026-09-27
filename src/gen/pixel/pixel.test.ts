import { describe, expect, it } from 'vitest';
import { PixelBuffer, ramp } from './pixel';

describe('pixel toolkit', () => {
  it('draws lines between fractional points without hanging', () => {
    const b = new PixelBuffer(16, 16);
    b.line(2.4, 7, 11, 5.2, [255, 255, 255]);
    b.line(0, 0, 15.6, 15.4, [255, 255, 255]);
    expect(b.opaque(2, 7)).toBe(true);
    expect(b.opaque(11, 5)).toBe(true);
    expect(b.opaque(16, 15)).toBe(false);
  });

  it('builds ramps from dark to light', () => {
    const r = ramp(0x808080, 1);
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2];
    expect(lum(r[0])).toBeLessThan(lum(r[1]));
    expect(lum(r[1])).toBeLessThan(lum(r[2]));
    expect(lum(r[2])).toBeLessThan(lum(r[3]));
  });
});
