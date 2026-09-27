import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { hash2, valueNoise } from './rng';

/**
 * Flat-shaded flagstone ground. Each tile is two triangles with its own colour and a
 * slight height wobble so light catches the edges. Non-indexed so every triangle is flat.
 */
export function buildGround(size = 90, tile = 1.5, seed = 1): BufferGeometry {
  const half = size / 2;
  const n = Math.ceil(size / tile);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const stone = new Color(0x2c2c31);
  const earth = new Color(0x2a231c);
  const moss = new Color(0x1f2a1e);
  const c = new Color();

  const height = (i: number, j: number) => (valueNoise(i * 0.35, j * 0.35, seed) - 0.5) * 0.16 + (hash2(i, j, seed + 9) - 0.5) * 0.05;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -half + i * tile;
      const z0 = -half + j * tile;
      const x1 = x0 + tile;
      const z1 = z0 + tile;
      const y00 = height(i, j);
      const y10 = height(i + 1, j);
      const y01 = height(i, j + 1);
      const y11 = height(i + 1, j + 1);
      const flip = hash2(i, j, seed + 3) > 0.5;

      const blend = valueNoise(i * 0.12, j * 0.12, seed + 5);
      const mossy = valueNoise(i * 0.2 + 7, j * 0.2, seed + 11);
      c.copy(stone).lerp(earth, blend);
      if (mossy > 0.62) c.lerp(moss, (mossy - 0.62) * 2.2);
      const shade = 0.82 + hash2(i, j, seed + 1) * 0.36;
      c.multiplyScalar(shade);

      const tris: [number, number, number][][] = flip
        ? [
            [[x0, y00, z0], [x0, y01, z1], [x1, y11, z1]],
            [[x0, y00, z0], [x1, y11, z1], [x1, y10, z0]],
          ]
        : [
            [[x0, y00, z0], [x0, y01, z1], [x1, y10, z0]],
            [[x1, y10, z0], [x0, y01, z1], [x1, y11, z1]],
          ];
      for (const [a, b, d] of tris as [[number, number, number], [number, number, number], [number, number, number]][]) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const triShade = 1 + (hash2(i * 2 + (flip ? 1 : 0), j * 2, seed + 21) - 0.5) * 0.12;
        for (const v of [a, b, d]) {
          pos.push(v[0], v[1], v[2]);
          nrm.push(nx, ny, nz);
          col.push(c.r * triShade, c.g * triShade, c.b * triShade);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
