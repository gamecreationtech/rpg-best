import type { BufferGeometry } from 'three';
import { Part, PartBuilder } from './parts';
import { Rng } from './rng';

const STONE = 0x3a3a40;
const STONE_DARK = 0x26262c;
const STONE_LIGHT = 0x4a4a52;
const EMBER = 0xff8a2a;

/** A broken column. `height` is the surviving height. */
export function buildPillar(height: number, seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const b = new PartBuilder();
  b.prism([0, 0.2, 0], 0.72, 0.4, STONE_DARK, Part.Extra, 8);
  b.prism([0, 0.5, 0], 0.6, 0.2, STONE, Part.Extra, 8);
  b.prism([0, 0.6 + height / 2, 0], 0.46, height, STONE, Part.Extra, 8, 0.44);
  // Broken crown: a few jagged chunks
  const top = 0.6 + height;
  const chunks = rng.int(3, 5);
  for (let i = 0; i < chunks; i++) {
    const a = (i / chunks) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.1, 0.3);
    b.box({
      at: [Math.cos(a) * r, top + rng.range(0.05, 0.25), Math.sin(a) * r],
      size: [rng.range(0.18, 0.32), rng.range(0.15, 0.5), rng.range(0.18, 0.32)],
      taper: [rng.range(0.3, 0.7), rng.range(0.3, 0.7)],
      rotate: [rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)],
      color: STONE_LIGHT,
      part: Part.Extra,
    });
  }
  return b.build();
}

/** A wall segment of stacked stone blocks with some missing. */
export function buildWall(length: number, height: number, seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const b = new PartBuilder();
  const bw = 1.1;
  const bh = 0.55;
  const rows = Math.round(height / bh);
  const cols = Math.ceil(length / bw);
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : bw / 2;
    for (let c = 0; c < cols; c++) {
      const x = -length / 2 + c * bw + offset + bw / 2;
      // Crumble toward the top
      if (r > rows * 0.55 && rng.next() < (r / rows) * 0.7) continue;
      const shade = 0.85 + rng.next() * 0.3;
      const col = (Math.min(255, Math.round(0x3a * shade)) << 16) | (Math.min(255, Math.round(0x3a * shade)) << 8) | Math.min(255, Math.round(0x40 * shade));
      b.box({
        at: [x, r * bh + bh / 2, 0],
        size: [bw * rng.range(0.9, 0.98), bh * rng.range(0.9, 1), rng.range(0.7, 0.85)],
        rotate: [0, rng.range(-0.03, 0.03), 0],
        color: col,
        part: Part.Extra,
      });
    }
  }
  return b.build();
}

export function buildTombstone(seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const b = new PartBuilder();
  const h = rng.range(0.7, 1.1);
  const lean = rng.range(-0.18, 0.18);
  b.box({ at: [0, h / 2, 0], size: [0.6, h, 0.16], taper: [0.8, 0.9], rotate: [0, 0, lean], color: STONE, part: Part.Extra, pivot: [0, 0, 0] });
  b.box({ at: [0, h + 0.08, 0], size: [0.5, 0.2, 0.16], taper: [0.5, 0.8], rotate: [0, 0, lean], color: STONE, part: Part.Extra, pivot: [0, 0, 0] });
  b.box({ at: [0, 0.08, 0], size: [0.8, 0.16, 0.36], color: STONE_DARK, part: Part.Extra });
  return b.build();
}

export function buildRubble(seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const b = new PartBuilder();
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.15, 0.4);
    b.box({
      at: [rng.range(-0.3, 0.3), s * 0.4, rng.range(-0.3, 0.3)],
      size: [s * rng.range(0.8, 1.6), s, s * rng.range(0.8, 1.6)],
      taper: [rng.range(0.5, 0.9), rng.range(0.5, 0.9)],
      rotate: [rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2)],
      color: rng.next() < 0.5 ? STONE : STONE_DARK,
      part: Part.Extra,
    });
  }
  return b.build();
}

/** An iron brazier with glowing coals. Pair it with a point light. */
export function buildBrazier(): BufferGeometry {
  const b = new PartBuilder();
  b.prism([0, 0.06, 0], 0.32, 0.12, 0x1c1a1a, Part.Extra, 6);
  b.prism([0, 0.5, 0], 0.07, 0.8, 0x1c1a1a, Part.Extra, 6);
  b.prism([0, 1.0, 0], 0.36, 0.28, 0x232020, Part.Extra, 8, 0.44);
  b.prism([0, 1.16, 0], 0.3, 0.1, EMBER, Part.Extra, 8, 0.34);
  // Glowing coals: the top surface is emissive
  const g = b.build();
  const glow = g.getAttribute('aGlow');
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 1.18) glow.setX(i, 1);
  return g;
}
