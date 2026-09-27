import type { IsoCamera } from './camera';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  gravity: number;
  drag: number;
  css: string;
  /** Alpha at birth; fades out over the last third of the life. */
  alpha: number;
}

export interface SpawnOptions {
  gravity?: number;
  drag?: number;
  up?: number;
  alpha?: number;
  size?: number;
  /** Below this, spawns are dropped first when the pool is full. */
  priority?: number;
}

/**
 * A fixed pool of square pixel particles drawn into the frame. World positions,
 * simple physics, no allocation while running.
 */
export class Particles2D {
  private readonly pool: Particle[] = [];
  private count = 0;
  private readonly cssCache = new Map<number, string>();

  constructor(private readonly capacity = 1500) {
    for (let i = 0; i < capacity; i++) this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, gravity: 0, drag: 0, css: '#fff', alpha: 1 });
  }

  get alive(): number {
    return this.count;
  }

  private css(color: number): string {
    let s = this.cssCache.get(color);
    if (!s) {
      s = `#${color.toString(16).padStart(6, '0')}`;
      this.cssCache.set(color, s);
    }
    return s;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, o: SpawnOptions = {}): void {
    if (this.count >= this.capacity) {
      if ((o.priority ?? 0.5) < 0.6) return;
      this.count--; // drop the oldest survivor's slot
    }
    const p = this.pool[this.count++]!;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy + (o.up ?? 0);
    p.vz = vz;
    p.age = 0;
    p.life = life;
    p.size = o.size ?? 1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.css = this.css(color);
    p.alpha = o.alpha ?? 1;
  }

  /** A burst of particles flying out from a point. */
  burst(x: number, y: number, z: number, n: number, speed: number, color: number, life: number, o: SpawnOptions = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s, (Math.random() - 0.3) * speed * 0.6, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), color, o);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        // Swap with the last live particle
        const last = this.pool[this.count - 1]!;
        this.pool[this.count - 1] = p;
        this.pool[i] = last;
        this.count--;
        i--;
        continue;
      }
      p.vy -= p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0) {
        p.y = 0;
        p.vy = 0;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: IsoCamera): void {
    let lastCss = '';
    let lastAlpha = -1;
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i]!;
      const t = p.age / p.life;
      const alpha = p.alpha * (t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34);
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }
      if (p.css !== lastCss) {
        ctx.fillStyle = p.css;
        lastCss = p.css;
      }
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(cam.frameX(p.x, p.z)) - (s >> 1), Math.round(cam.frameY(p.x, p.y, p.z)) - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
