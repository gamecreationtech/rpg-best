import { describe, expect, it } from 'vitest';
import { buildGround } from './ground';

describe('buildGround', () => {
  it('produces upward-facing flat triangles', () => {
    const g = buildGround(12, 1.5, 4);
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    expect(pos.count).toBe(8 * 8 * 6);
    for (let i = 0; i < nrm.count; i++) expect(nrm.getY(i)).toBeGreaterThan(0.9);
  });
});
