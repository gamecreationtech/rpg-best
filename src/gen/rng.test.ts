import { describe, expect, it } from 'vitest';
import { Rng, valueNoise } from './rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays inside [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int covers the whole inclusive range', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('valueNoise', () => {
  it('is continuous and bounded', () => {
    let prev = valueNoise(0, 1.3);
    for (let i = 1; i < 200; i++) {
      const v = valueNoise(i * 0.05, 1.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.15);
      prev = v;
    }
  });
});
