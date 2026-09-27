import { BufferGeometry, Color, Float32BufferAttribute } from 'three';

/**
 * Rigid body parts. Each vertex carries its part id and the part's pivot so the
 * vertex shader can pose the character without any CPU skeleton work.
 */
export const Part = {
  Torso: 0,
  Head: 1,
  ArmL: 2,
  ArmR: 3,
  LegL: 4,
  LegR: 5,
  Extra: 6,
} as const;
export type PartId = (typeof Part)[keyof typeof Part];

export type Vec3 = [number, number, number];

export interface BoxSpec {
  /** Centre of the box. */
  at: Vec3;
  /** Width (x), height (y), depth (z). */
  size: Vec3;
  color: number | Color;
  part: PartId;
  /** Joint the part rotates around. Defaults to the box centre. */
  pivot?: Vec3;
  /** Scale of the top face relative to the bottom, per axis (x, z). Makes tapered shapes. */
  taper?: [number, number];
  /** Static rotation in radians applied about the pivot (x, y, z order). */
  rotate?: Vec3;
  /** Shift of the top face relative to the bottom (x, z). Makes leaning shapes. */
  shear?: [number, number];
  /** 0 = lit normally, 1 = self-illuminated (bloom picks it up). */
  glow?: number;
}

const tmp = new Color();

function toRgb(c: number | Color): [number, number, number] {
  const col = typeof c === 'number' ? tmp.setHex(c) : c;
  return [col.r, col.g, col.b];
}

function rotateVec(v: Vec3, r: Vec3): Vec3 {
  let [x, y, z] = v;
  // X
  let c = Math.cos(r[0]);
  let s = Math.sin(r[0]);
  [y, z] = [c * y - s * z, s * y + c * z];
  // Y
  c = Math.cos(r[1]);
  s = Math.sin(r[1]);
  [x, z] = [c * x + s * z, -s * x + c * z];
  // Z
  c = Math.cos(r[2]);
  s = Math.sin(r[2]);
  [x, y] = [c * x - s * y, s * x + c * y];
  return [x, y, z];
}

/** Accumulates flat-shaded triangles for a character or prop. */
export class PartBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private part: number[] = [];
  private pivot: number[] = [];
  private glow: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Adds a triangle (a, b, c counter-clockwise seen from outside). */
  tri(a: Vec3, b: Vec3, c: Vec3, rgb: [number, number, number], part: number, pivot: Vec3, glow: number): void {
    this.emit([a, b, c], rgb, part, pivot, glow);
  }

  /** Adds a quad (a, b, c, d counter-clockwise seen from outside). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, rgb: [number, number, number], part: number, pivot: Vec3, glow: number): void {
    this.emit([a, b, c, a, c, d], rgb, part, pivot, glow);
  }

  private emit(verts: Vec3[], rgb: [number, number, number], part: number, pivot: Vec3, glow: number): void {
    const [a, b, c] = verts as [Vec3, Vec3, Vec3];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const v of verts) {
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(rgb[0], rgb[1], rgb[2]);
      this.part.push(part);
      this.pivot.push(pivot[0], pivot[1], pivot[2]);
      this.glow.push(glow);
    }
  }

  /** Adds a hexahedron from 8 corners: bottom 4 then top 4, each counter-clockwise seen from above. */
  hexa(corners: Vec3[], color: number | Color, part: number, pivot: Vec3, glow = 0): void {
    const rgb = toRgb(color);
    const c = corners as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
    const [b0, b1, b2, b3, t0, t1, t2, t3] = c;
    this.quad(b0, b1, b2, b3, rgb, part, pivot, glow); // bottom
    this.quad(t0, t3, t2, t1, rgb, part, pivot, glow); // top
    this.quad(b0, t0, t1, b1, rgb, part, pivot, glow); // -z (back)
    this.quad(b1, t1, t2, b2, rgb, part, pivot, glow); // +x
    this.quad(b2, t2, t3, b3, rgb, part, pivot, glow); // +z (front)
    this.quad(b3, t3, t0, b0, rgb, part, pivot, glow); // -x
  }

  box(spec: BoxSpec): void {
    const [cx, cy, cz] = spec.at;
    const [w, h, d] = spec.size;
    const pivot: Vec3 = spec.pivot ?? [cx, cy, cz];
    const [tx, tz] = spec.taper ?? [1, 1];
    const [sx, sz] = spec.shear ?? [0, 0];
    const hw = w / 2;
    const hd = d / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const corners: Vec3[] = [
      [cx - hw, y0, cz - hd],
      [cx + hw, y0, cz - hd],
      [cx + hw, y0, cz + hd],
      [cx - hw, y0, cz + hd],
      [cx - hw * tx + sx, y1, cz - hd * tz + sz],
      [cx + hw * tx + sx, y1, cz - hd * tz + sz],
      [cx + hw * tx + sx, y1, cz + hd * tz + sz],
      [cx - hw * tx + sx, y1, cz + hd * tz + sz],
    ];
    const rotated = spec.rotate
      ? corners.map((v) => {
          const local: Vec3 = [v[0] - pivot[0], v[1] - pivot[1], v[2] - pivot[2]];
          const r = rotateVec(local, spec.rotate as Vec3);
          return [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]] as Vec3;
        })
      : corners;
    this.hexa(rotated, spec.color, spec.part, pivot, spec.glow ?? 0);
  }

  /** A low-poly prism (octagon by default) standing on its base. */
  prism(at: Vec3, radius: number, height: number, color: number | Color, part = Part.Extra, sides = 8, radiusTop = radius, pivot?: Vec3): void {
    const rgb = toRgb(color);
    const pv: Vec3 = pivot ?? at;
    const [cx, cy, cz] = at;
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    const ring = (r: number, y: number): Vec3[] => {
      const pts: Vec3[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
        pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
      }
      return pts;
    };
    const bottom = ring(radius, y0);
    const top = ring(radiusTop, y1);
    const centreB: Vec3 = [cx, y0, cz];
    const centreT: Vec3 = [cx, y1, cz];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const b0 = bottom[i] as Vec3;
      const b1 = bottom[j] as Vec3;
      const t0 = top[i] as Vec3;
      const t1 = top[j] as Vec3;
      this.quad(b0, t0, t1, b1, rgb, part, pv, 0);
      this.tri(centreT, t1, t0, rgb, part, pv, 0);
      this.tri(centreB, b0, b1, rgb, part, pv, 0);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new Float32BufferAttribute(this.pivot, 3));
    g.setAttribute('aGlow', new Float32BufferAttribute(this.glow, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
