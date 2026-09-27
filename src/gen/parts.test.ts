import { describe, expect, it } from 'vitest';
import { Part, PartBuilder } from './parts';

describe('PartBuilder', () => {
  it('emits 12 triangles per box with unit normals and part data', () => {
    const b = new PartBuilder();
    b.box({ at: [0, 1, 0], size: [1, 2, 1], color: 0xff0000, part: Part.Torso, pivot: [0, 0, 0] });
    const g = b.build();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const part = g.getAttribute('aPart');
    const pivot = g.getAttribute('aPivot');
    expect(pos.count).toBe(36);
    for (let i = 0; i < nrm.count; i++) {
      const len = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      expect(len).toBeCloseTo(1, 5);
      expect(part.getX(i)).toBe(Part.Torso);
      expect(pivot.getY(i)).toBe(0);
    }
  });

  it('points box normals outward', () => {
    const b = new PartBuilder();
    b.box({ at: [0, 0, 0], size: [2, 2, 2], color: 0xffffff, part: Part.Head });
    const g = b.build();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const dot = pos.getX(i) * nrm.getX(i) + pos.getY(i) * nrm.getY(i) + pos.getZ(i) * nrm.getZ(i);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('points prism normals outward', () => {
    const b = new PartBuilder();
    b.prism([0, 0, 0], 1, 2, 0xffffff);
    const g = b.build();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const dot = pos.getX(i) * nrm.getX(i) + pos.getY(i) * nrm.getY(i) + pos.getZ(i) * nrm.getZ(i);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('tapers the top face', () => {
    const b = new PartBuilder();
    b.box({ at: [0, 0, 0], size: [2, 2, 2], color: 0xffffff, part: Part.Torso, taper: [0.5, 0.5] });
    const g = b.build();
    const pos = g.getAttribute('position');
    let maxTopX = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) maxTopX = Math.max(maxTopX, Math.abs(pos.getX(i)));
    }
    expect(maxTopX).toBeCloseTo(0.5, 5);
  });
});
