import { RING_RX, RING_RY, type IsoCamera } from './camera';
import type { Light } from './compositor';

type Layer = 'floor' | 'air';

interface Fx {
  kind: 'ring' | 'disc' | 'anim' | 'slash' | 'strike' | 'link' | 'arrows' | 'light';
  layer: Layer;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  r0: number;
  r1: number;
  css: string;
  css2: string;
  frames: HTMLCanvasElement[] | null;
  ox: number;
  oy: number;
  dirX: number;
  dirZ: number;
  arc: number;
  tx: number;
  ty: number;
  tz: number;
  light: number;
  lightR: number;
  lr: number;
  lg: number;
  lb: number;
  width: number;
  alpha: number;
  seed: number;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function lighten(color: number): number {
  const r = Math.min(255, ((color >> 16) & 255) + 90);
  const g = Math.min(255, ((color >> 8) & 255) + 90);
  const b = Math.min(255, (color & 255) + 90);
  return (r << 16) | (g << 8) | b;
}

/**
 * Short-lived drawn effects: rings and discs on the floor, sprite animations,
 * melee arcs, lightning, beams and arrow volleys. Each one can also cast light.
 */
export class Effects2D {
  private readonly list: Fx[] = [];
  private beam: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; css: string; css2: string; on: boolean } = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, css: '#fff', css2: '#fff', on: false };
  private time = 0;

  private push(partial: Partial<Fx> & { kind: Fx['kind']; layer: Layer; x: number; z: number; life: number }): Fx {
    const fx: Fx = {
      y: 0, t: 0, r0: 0, r1: 0, css: '#fff', css2: '#fff', frames: null, ox: 0, oy: 0, dirX: 1, dirZ: 0, arc: 0, tx: 0, ty: 0, tz: 0, light: 0, lightR: 0, lr: 1, lg: 1, lb: 1, width: 1, alpha: 1, seed: Math.random() * 1000,
      ...partial,
    };
    if (this.list.length > 400) this.list.shift();
    this.list.push(fx);
    return fx;
  }

  private withLight(fx: Fx, color: number, intensity: number, radiusPx: number): Fx {
    fx.light = intensity;
    fx.lightR = radiusPx;
    fx.lr = ((color >> 16) & 255) / 255;
    fx.lg = ((color >> 8) & 255) / 255;
    fx.lb = (color & 255) / 255;
    return fx;
  }

  /** An expanding ring on the floor, from radius r0 to r1 in world units. */
  ring(x: number, z: number, r0: number, r1: number, color: number, life: number, width = 1, light = 0): void {
    const fx = this.push({ kind: 'ring', layer: 'floor', x, z, life, r0, r1, css: css(color), css2: css(lighten(color)), width });
    if (light > 0) this.withLight(fx, color, light, r1 * RING_RX * 1.5);
  }

  /** A filled patch on the floor that fades. */
  disc(x: number, z: number, r: number, color: number, life: number, alpha = 0.5): void {
    this.push({ kind: 'disc', layer: 'floor', x, z, life, r0: r, r1: r, css: css(color), alpha });
  }

  /** A sprite animation played once at a point; `y` lifts it off the floor. */
  anim(frames: HTMLCanvasElement[], x: number, y: number, z: number, ox: number, oy: number, life: number, layer: Layer, light?: { color: number; intensity: number; radius: number }): void {
    const fx = this.push({ kind: 'anim', layer, x, y, z, life, frames, ox, oy });
    if (light) this.withLight(fx, light.color, light.intensity, light.radius);
  }

  /** The arc of a melee swing. */
  slash(x: number, z: number, dirX: number, dirZ: number, range: number, arcDeg: number, color: number): void {
    this.push({ kind: 'slash', layer: 'floor', x, z, life: 0.18, r0: range, dirX, dirZ, arc: (arcDeg * Math.PI) / 180, css: css(color), css2: css(lighten(color)), width: 2 });
  }

  /** Lightning from the sky down to a point. */
  strike(x: number, z: number, color: number): void {
    const fx = this.push({ kind: 'strike', layer: 'air', x, z, life: 0.28, css: css(color), css2: '#ffffff' });
    this.withLight(fx, color, 2.5, 90);
  }

  /** A jagged line between two points for a short while. */
  link(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, life = 0.2): void {
    const fx = this.push({ kind: 'link', layer: 'air', x: x0, y: y0, z: z0, tx: x1, ty: y1, tz: z1, life, css: css(color), css2: '#ffffff' });
    this.withLight(fx, color, 1.4, 60);
  }

  /** Arrows raining on a circle. */
  arrows(frames: HTMLCanvasElement[], x: number, z: number, radius: number, ox: number, oy: number): void {
    this.push({ kind: 'arrows', layer: 'air', x, z, life: 0.7, r0: radius, frames, ox, oy });
  }

  /** Light only. */
  flash(x: number, y: number, z: number, color: number, intensity: number, radiusPx: number, life: number): void {
    const fx = this.push({ kind: 'light', layer: 'air', x, y, z, life });
    this.withLight(fx, color, intensity, radiusPx);
  }

  /** A continuous beam, set every frame while active. */
  beamSet(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    const b = this.beam;
    b.x0 = x0; b.y0 = y0; b.z0 = z0; b.x1 = x1; b.y1 = y1; b.z1 = z1;
    b.css = css(color);
    b.css2 = css(lighten(color));
    b.on = true;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i]!;
      fx.t += dt;
      if (fx.t >= fx.life) this.list.splice(i, 1);
    }
  }

  /** Adds this frame's lights. */
  collectLights(cam: IsoCamera, out: Light[]): void {
    for (const fx of this.list) {
      if (fx.light <= 0) continue;
      const k = 1 - fx.t / fx.life;
      out.push({ x: cam.frameX(fx.x, fx.z), y: cam.frameY(fx.x, fx.y, fx.z), radius: fx.lightR, intensity: fx.light * k, r: fx.lr, g: fx.lg, b: fx.lb });
    }
    if (this.beam.on) {
      const b = this.beam;
      out.push({ x: cam.frameX(b.x1, b.z1), y: cam.frameY(b.x1, b.y1, b.z1), radius: 50, intensity: 1.2, r: 0.5, g: 1, b: 0.6 });
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: IsoCamera, layer: Layer): void {
    for (const fx of this.list) {
      if (fx.layer !== layer) continue;
      const k = fx.t / fx.life;
      const px = Math.round(cam.frameX(fx.x, fx.z));
      const py = Math.round(cam.frameY(fx.x, fx.y, fx.z));
      switch (fx.kind) {
        case 'ring': {
          const r = fx.r0 + (fx.r1 - fx.r0) * k;
          ctx.globalAlpha = 1 - k * 0.7;
          ctx.strokeStyle = k < 0.3 ? fx.css2 : fx.css;
          ctx.lineWidth = fx.width;
          ctx.beginPath();
          ctx.ellipse(px, py, Math.max(1, r * RING_RX), Math.max(1, r * RING_RY), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'disc': {
          ctx.globalAlpha = fx.alpha * (1 - k);
          ctx.fillStyle = fx.css;
          ctx.beginPath();
          ctx.ellipse(px, py, Math.max(1, fx.r0 * RING_RX), Math.max(1, fx.r0 * RING_RY), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'anim': {
          const frames = fx.frames!;
          const f = frames[Math.min(frames.length - 1, Math.floor(k * frames.length))]!;
          ctx.drawImage(f, px - fx.ox, py - fx.oy);
          break;
        }
        case 'slash': {
          // The arc sweeps from one edge of the cone to the other over the life
          const a0 = Math.atan2(fx.dirZ, fx.dirX) - fx.arc / 2;
          const sweep = fx.arc * Math.min(1, k * 1.6);
          ctx.strokeStyle = k < 0.5 ? fx.css2 : fx.css;
          ctx.lineWidth = k < 0.5 ? 2 : 1;
          ctx.globalAlpha = 1 - k * 0.6;
          ctx.beginPath();
          const steps = 10;
          for (let i = 0; i <= steps; i++) {
            const a = a0 + (sweep * i) / steps;
            const wx = fx.x + Math.cos(a) * fx.r0;
            const wz = fx.z + Math.sin(a) * fx.r0;
            const sx = Math.round(cam.frameX(wx, wz));
            const sy = Math.round(cam.frameY(wx, 0.5, wz));
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'strike': {
          const top = py - 140;
          jagged(ctx, px + Math.round(Math.sin(fx.seed) * 30), top, px, py, fx.css, fx.css2, Math.floor(fx.t * 40) + fx.seed, 8);
          break;
        }
        case 'link': {
          const ex = Math.round(cam.frameX(fx.tx, fx.tz));
          const ey = Math.round(cam.frameY(fx.tx, fx.ty, fx.tz));
          jagged(ctx, px, py, ex, ey, fx.css, fx.css2, Math.floor(fx.t * 40) + fx.seed, 5);
          break;
        }
        case 'arrows': {
          const frames = fx.frames!;
          const f = frames[0]!;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const delay = (i / n) * 0.35;
            const tt = (fx.t - delay) / 0.3;
            if (tt < 0 || tt > 1) continue;
            const a = fx.seed + i * 2.4;
            const rr = fx.r0 * Math.sqrt(((i * 7919) % 100) / 100);
            const wx = fx.x + Math.cos(a) * rr;
            const wz = fx.z + Math.sin(a) * rr;
            const h = 6 * (1 - tt);
            const sx = Math.round(cam.frameX(wx, wz));
            const sy = Math.round(cam.frameY(wx, h, wz));
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(Math.PI / 2 - 0.4);
            ctx.drawImage(f, -fx.ox, -fx.oy);
            ctx.restore();
          }
          break;
        }
        case 'light':
          break;
      }
    }
    if (layer === 'air' && this.beam.on) {
      const b = this.beam;
      jagged(ctx, Math.round(cam.frameX(b.x0, b.z0)), Math.round(cam.frameY(b.x0, b.y0, b.z0)), Math.round(cam.frameX(b.x1, b.z1)), Math.round(cam.frameY(b.x1, b.y1, b.z1)), b.css, b.css2, Math.floor(this.time * 30), 4);
      b.on = false;
    }
  }
}

/** A lightning-like line: straight segments with a sideways jitter that changes every few frames. */
function jagged(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, outer: string, inner: string, seed: number, jitter: number): void {
  const segs = 7;
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    pts.push([Math.round(x0 + (x1 - x0) * k + Math.sin(seed * 7.3 + i * 5.1) * jitter), Math.round(y0 + (y1 - y0) * k + Math.cos(seed * 3.7 + i * 2.9) * jitter)]);
  }
  pts.push([x1, y1]);
  for (const [style, w] of [[outer, 3], [inner, 1]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.stroke();
  }
}

