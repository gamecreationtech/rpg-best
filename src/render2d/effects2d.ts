import { RING_RX, RING_RY, type IsoCamera } from './camera';
import type { Light } from './compositor';

type Layer = 'floor' | 'air';

interface Fx {
  kind: 'ring' | 'disc' | 'anim' | 'sprite' | 'wave' | 'slash' | 'sweep' | 'smash' | 'shield' | 'gash' | 'cracks' | 'strike' | 'link' | 'light';
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
  private beam: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; css: string; css2: string; lr: number; lg: number; lb: number; on: boolean } = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, css: '#fff', css2: '#fff', lr: 1, lg: 1, lb: 1, on: false };
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

  /** An expanding ring on the floor, from radius r0 to r1 in world units; `delay` holds it back that many seconds. */
  ring(x: number, z: number, r0: number, r1: number, color: number, life: number, width = 1, light = 0, delay = 0): void {
    const fx = this.push({ kind: 'ring', layer: 'floor', x, z, life, r0, r1, css: css(color), css2: css(lighten(color)), width, t: -delay });
    if (light > 0) this.withLight(fx, color, light, r1 * RING_RX * 1.5);
  }

  /** A wave racing out across the floor: a filled band that expands from r0 to r1, its leading edge brightest. */
  wave(x: number, z: number, r0: number, r1: number, color: number, life: number, light = 0, delay = 0): void {
    const fx = this.push({ kind: 'wave', layer: 'floor', x, z, life, r0, r1, css: css(color), css2: css(lighten(color)), t: -delay });
    if (light > 0) this.withLight(fx, color, light, r1 * RING_RX * 1.4);
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

  /** One still frame left at a point that fades out over the second half of its life. */
  sprite(frame: HTMLCanvasElement, x: number, y: number, z: number, ox: number, oy: number, life: number, layer: Layer, rise = 0, light?: { color: number; intensity: number; radius: number }, fall = false, delay = 0): void {
    const fx = this.push({ kind: 'sprite', layer, x, y, z, life, frames: [frame], ox, oy, ty: rise, arc: fall ? 1 : 0, t: -delay });
    if (light) this.withLight(fx, light.color, light.intensity, light.radius);
  }

  /** The arc of a melee swing. */
  slash(x: number, z: number, dirX: number, dirZ: number, range: number, arcDeg: number, color: number): void {
    this.push({ kind: 'slash', layer: 'floor', x, z, life: 0.18, r0: range, dirX, dirZ, arc: (arcDeg * Math.PI) / 180, css: css(color), css2: css(lighten(color)), width: 2 });
  }

  /** A wide filled sweep for a heavy arc attack: a red band from half the reach to the full reach, drawn ahead of a thin edge. */
  sweep(x: number, z: number, dirX: number, dirZ: number, range: number, arcDeg: number, color: number, life = 0.2): void {
    const fx = this.push({ kind: 'sweep', layer: 'floor', x, z, life, r0: range, dirX, dirZ, arc: (arcDeg * Math.PI) / 180, css: css(color), css2: css(lighten(color)) });
    this.withLight(fx, color, 1.6, range * RING_RX * 1.3);
  }

  /** A holy shield raised over the point for a moment, growing in, shining, fading out. */
  shield(x: number, z: number, color: number): void {
    const fx = this.push({ kind: 'shield', layer: 'air', x, y: 0.55, z, life: 0.7, css: css(color), css2: css(lighten(color)) });
    this.withLight(fx, color, 2.2, 60);
  }

  /** Two crossed gashes torn across a body standing at the point, red on dark, brightest as they open. */
  gash(x: number, z: number): void {
    const fx = this.push({ kind: 'gash', layer: 'air', x, y: 0.6, z, life: 0.5, css: '#c01828', css2: '#ff4a58' });
    this.withLight(fx, 0xff2030, 1.4, 40);
  }

  /** Cracks radiating from a point out to `reach` frame pixels, growing fast then fading. */
  cracks(x: number, z: number, reach: number, color: number, life: number, count = 8, delay = 0): void {
    this.push({ kind: 'cracks', layer: 'floor', x, z, life, r0: reach, css: css(color), css2: css(lighten(color)), t: -delay, width: count });
  }

  /**
   * A big weapon brought down from above: a heavy blade drops onto the point
   * for the first part of the life, then the impact cracks the ground and the
   * blade fades where it landed. Takes `SMASH_DROP` seconds to land.
   */
  smash(x: number, z: number, color: number): void {
    const fx = this.push({ kind: 'smash', layer: 'air', x, z, life: SMASH_LIFE, css: css(color), css2: css(lighten(color)), t: 0, light: 0 });
    this.withLight(fx, lighten(color), 0, 70);
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
    b.lr = ((color >> 16) & 255) / 255;
    b.lg = ((color >> 8) & 255) / 255;
    b.lb = (color & 255) / 255;
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
      if (fx.t < 0) continue;
      if (fx.kind === 'smash') {
        // Dark on the way down, a burst of light the instant it lands
        const landed = (fx.t - SMASH_DROP) / (fx.life - SMASH_DROP);
        if (landed < 0) continue;
        out.push({ x: cam.frameX(fx.x, fx.z), y: cam.frameY(fx.x, 0.3, fx.z), radius: fx.lightR, intensity: 2.6 * (1 - landed), r: fx.lr, g: fx.lg, b: fx.lb });
        continue;
      }
      if (fx.light <= 0) continue;
      const k = 1 - fx.t / fx.life;
      out.push({ x: cam.frameX(fx.x, fx.z), y: cam.frameY(fx.x, fx.y, fx.z), radius: fx.lightR, intensity: fx.light * k, r: fx.lr, g: fx.lg, b: fx.lb });
    }
    if (this.beam.on) {
      const b = this.beam;
      out.push({ x: cam.frameX(b.x1, b.z1), y: cam.frameY(b.x1, b.y1, b.z1), radius: 50, intensity: 1.2, r: b.lr, g: b.lg, b: b.lb });
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: IsoCamera, layer: Layer): void {
    for (const fx of this.list) {
      if (fx.layer !== layer || fx.t < 0) continue;
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
        case 'wave': {
          // Ease out: fast at first, slowing as it spreads; the band is a third of the way in
          const e = 1 - (1 - k) * (1 - k);
          const r = fx.r0 + (fx.r1 - fx.r0) * e;
          const inner = Math.max(0, r - Math.max(0.5, fx.r1 * 0.3) * (1 - k * 0.5));
          ctx.globalAlpha = 0.75 * (1 - k * k);
          ctx.fillStyle = fx.css;
          ctx.beginPath();
          ctx.ellipse(px, py, Math.max(1, r * RING_RX), Math.max(1, r * RING_RY), 0, 0, Math.PI * 2);
          ctx.ellipse(px, py, Math.max(1, inner * RING_RX), Math.max(1, inner * RING_RY), 0, 0, Math.PI * 2, true);
          ctx.fill('evenodd');
          ctx.strokeStyle = k < 0.4 ? '#ffffff' : fx.css2;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 1 - k;
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
        case 'sprite': {
          // Fades over the second half; `ty` frame pixels of rise over the life, quick at first
          ctx.globalAlpha = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
          // Rising things ease out; falling things (arc set) speed up on the way down
          const move = fx.arc > 0 ? k * k : 1 - (1 - k) * (1 - k);
          ctx.drawImage(fx.frames![0]!, px - fx.ox, py - fx.oy - Math.round(fx.ty * move));
          ctx.globalAlpha = 1;
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
        case 'sweep':
          drawSweep(ctx, cam, fx, k);
          break;
        case 'smash':
          drawSmash(ctx, px, py, fx);
          break;
        case 'shield':
          drawShield(ctx, px, py, fx, k);
          break;
        case 'gash': {
          // Each gash opens over the first fifth, the second a beat after the first
          const fade = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
          ctx.globalAlpha = fade;
          const cuts: [number, number, number, number, number][] = [[-9, -7, 8, 7, 0], [7, -8, -8, 6, 0.12]];
          for (const [x0, y0, x1, y1, delay] of cuts) {
            const open = Math.min(1, Math.max(0, (k - delay) / 0.2));
            if (open <= 0) continue;
            const ex = px + x0 + Math.round((x1 - x0) * open);
            const ey = py + y0 + Math.round((y1 - y0) * open);
            for (const [style, w] of [['#1a0408', 4], [fx.css, 2], [k < 0.25 ? '#ffffff' : fx.css2, 1]] as const) {
              ctx.strokeStyle = style;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.moveTo(px + x0, py + y0);
              ctx.lineTo(ex, ey);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'cracks': {
          const reach = fx.r0 * Math.min(1, k * 3);
          ctx.globalAlpha = 1 - k * k;
          drawCracks(ctx, px, py, fx.seed, reach, fx.css2, fx.width);
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

/** Seconds the smash weapon takes to come down, and its whole life. */
const SMASH_DROP = 0.1;
const SMASH_LIFE = 0.38;
/** Where the weapon starts, in frame pixels above and beside the target. */
const SMASH_HEIGHT = 58;
const SMASH_LEAN = 14;
const SMASH_CRACKS = 6;
/** The war hammer, measured along the haft from the striking face: head, haft, pommel. The head is a crossbar half as wide as the haft is long. */
const HEAD_LEN = 8;
const HEAD_HALF = 9;
const HAFT_LEN = 26;
const POMMEL_LEN = 3;

/**
 * The heavy-strike weapon: a great maul, haft first, that drops onto the target
 * and buries its head at the feet. On the way down it trails a smear; landed,
 * the ground cracks outward and everything fades.
 */
function drawSmash(ctx: CanvasRenderingContext2D, px: number, py: number, fx: Fx): void {
  const drop = Math.min(1, fx.t / SMASH_DROP);
  const landed = Math.max(0, (fx.t - SMASH_DROP) / (fx.life - SMASH_DROP));
  // Ease in: it starts slow and slams
  const d = drop * drop;
  const tipX = px + SMASH_LEAN * (1 - d);
  const tipY = py - SMASH_HEIGHT * (1 - d);
  // Unit direction of travel in frame pixels, and its sideways normal
  const len = Math.hypot(SMASH_LEAN, SMASH_HEIGHT);
  const ux = -SMASH_LEAN / len;
  const uy = SMASH_HEIGHT / len;
  const sx = -uy;
  const sy = ux;
  // A four-sided piece of the weapon: from u0 to u1 up the haft, half-widths w0 and w1
  const piece = (u0: number, u1: number, w0: number, w1: number, fill: string): void => {
    const ax = tipX - ux * u0;
    const ay = tipY - uy * u0;
    const bx = tipX - ux * u1;
    const by = tipY - uy * u1;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(Math.round(ax - sx * w0), Math.round(ay - sy * w0));
    ctx.lineTo(Math.round(ax + sx * w0), Math.round(ay + sy * w0));
    ctx.lineTo(Math.round(bx + sx * w1), Math.round(by + sy * w1));
    ctx.lineTo(Math.round(bx - sx * w1), Math.round(by - sy * w1));
    ctx.closePath();
    ctx.fill();
  };
  const alpha = landed > 0 ? 1 - landed : 1;
  ctx.globalAlpha = alpha;
  if (landed === 0) {
    // Motion smear behind the head
    ctx.globalAlpha = 0.45;
    piece(-2, -16, HEAD_HALF - 2, 2, fx.css2);
    ctx.globalAlpha = alpha;
  }
  const total = HEAD_LEN + HAFT_LEN + POMMEL_LEN;
  // Outline, one pixel larger all round
  piece(-1, HEAD_LEN + 1, HEAD_HALF + 1, HEAD_HALF + 1, '#1a1410');
  piece(HEAD_LEN, HEAD_LEN + HAFT_LEN, 2.5, 2.5, '#1a1410');
  piece(HEAD_LEN + HAFT_LEN - 1, total + 1, 3, 3, '#1a1410');
  // Head: a steel crossbar across the haft, the striking face bright along its whole width, a dark band where the haft goes through
  const flash = landed > 0 && landed < 0.2;
  piece(0, HEAD_LEN, HEAD_HALF, HEAD_HALF, flash ? '#ffffff' : '#8e98a4');
  piece(0, 2, HEAD_HALF, HEAD_HALF, flash ? '#ffffff' : '#d8e0e8');
  piece(HEAD_LEN - 2, HEAD_LEN, HEAD_HALF, HEAD_HALF, flash ? '#ffffff' : '#6a7480');
  piece(2, HEAD_LEN - 2, 2, 2, flash ? '#ffffff' : '#5a6470');
  // Iron bands at both ends of the head
  const bandA = tipX - ux * 1;
  const bandB = tipX - ux * (HEAD_LEN - 1);
  ctx.strokeStyle = flash ? '#ffffff' : '#c8d0d8';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(Math.round(bandA + sx * side * (HEAD_HALF - 1)), Math.round(tipY - uy * 1 + sy * side * (HEAD_HALF - 1)));
    ctx.lineTo(Math.round(bandB + sx * side * (HEAD_HALF - 1)), Math.round(tipY - uy * (HEAD_LEN - 1) + sy * side * (HEAD_HALF - 1)));
    ctx.stroke();
  }
  // Haft: dark wood with a leather grip near the top
  piece(HEAD_LEN, HEAD_LEN + HAFT_LEN, 1.5, 1.5, '#6a4424');
  piece(HEAD_LEN + HAFT_LEN - 9, HEAD_LEN + HAFT_LEN - 2, 1.5, 1.5, '#3a2414');
  // Pommel
  piece(HEAD_LEN + HAFT_LEN, total, 2, 2, '#8e98a4');
  if (landed > 0) {
    // Ground cracks radiating from the impact, growing then fading
    drawCracks(ctx, px, py, fx.seed, 4 + 14 * Math.min(1, landed * 3), fx.css2, SMASH_CRACKS);
    // Impact flash: a bright cross at the landing point for the first frames
    if (flash) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 8, py - 1, 17, 2);
      ctx.fillRect(px - 1, py - 5, 2, 10);
    }
  }
  ctx.globalAlpha = 1;
}

/** Jagged cracks in the ground: `count` broken lines from a point out to `reach` frame pixels, squashed to the floor. */
function drawCracks(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number, reach: number, bright: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = seed + (i / count) * Math.PI * 2;
    const cx = Math.cos(a);
    const cy = Math.sin(a) * 0.5;
    const mx = Math.round(px + cx * reach * 0.55 + Math.sin(seed + i * 3.1) * 2);
    const my = Math.round(py + cy * reach * 0.55 + Math.cos(seed + i * 2.3) * 1);
    for (const [style, w2] of [['#1a1410', 3], [bright, 1]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mx, my);
      ctx.lineTo(Math.round(px + cx * reach), Math.round(py + cy * reach));
      ctx.stroke();
    }
  }
}

/**
 * The cleave sweep: a filled band on the floor between half and full reach
 * that sweeps across the arc, brightest at its leading edge, with a thin
 * bright rim on the outside. Fades as it finishes.
 */
function drawSweep(ctx: CanvasRenderingContext2D, cam: IsoCamera, fx: Fx, k: number): void {
  const a0 = Math.atan2(fx.dirZ, fx.dirX) - fx.arc / 2;
  const sweep = fx.arc * Math.min(1, k * 2.2);
  const inner = fx.r0 * 0.45;
  const outer = fx.r0 * 1.1;
  const steps = Math.max(6, Math.round(fx.arc * 5));
  const point = (r: number, a: number): [number, number] => {
    const wx = fx.x + Math.cos(a) * r;
    const wz = fx.z + Math.sin(a) * r;
    return [Math.round(cam.frameX(wx, wz)), Math.round(cam.frameY(wx, 0.3, wz))];
  };
  // The band, drawn as a wedge from the trailing edge to the leading edge
  const fade = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
  ctx.globalAlpha = 0.55 * fade;
  ctx.fillStyle = fx.css;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = point(outer, a0 + (sweep * i) / steps);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = point(inner, a0 + (sweep * i) / steps);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Bright rim on the outside and a hot leading edge
  ctx.globalAlpha = fade;
  ctx.strokeStyle = fx.css2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = point(outer, a0 + (sweep * i) / steps);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (k < 0.7) {
    const lead = a0 + sweep;
    const [x0, y0] = point(inner, lead);
    const [x1, y1] = point(outer, lead);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The holy shield: a heater shield with a cross, gold rim, white shine; grows in over the first tenth, then fades. */
function drawShield(ctx: CanvasRenderingContext2D, px: number, py: number, fx: Fx, k: number): void {
  const grow = Math.min(1, k * 8);
  const scale = 0.4 + 0.6 * grow;
  const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
  const hw = Math.max(2, Math.round(8 * scale));
  const hh = Math.max(3, Math.round(11 * scale));
  const top = py - hh;
  const shoulder = top + Math.round(hh * 0.55);
  const shape = (): void => {
    ctx.beginPath();
    ctx.moveTo(px - hw, top);
    ctx.lineTo(px + hw, top);
    ctx.lineTo(px + hw, shoulder);
    ctx.quadraticCurveTo(px + hw, py + hh - 2, px, py + hh);
    ctx.quadraticCurveTo(px - hw, py + hh - 2, px - hw, shoulder);
    ctx.closePath();
  };
  ctx.globalAlpha = fade;
  // Halo behind the shield
  ctx.fillStyle = fx.css2;
  ctx.globalAlpha = fade * 0.35;
  ctx.beginPath();
  ctx.ellipse(px, py, hw + 5, hh + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade;
  // Dark outline, gold rim, pale face
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1a1410';
  shape();
  ctx.stroke();
  ctx.fillStyle = k < 0.15 ? '#ffffff' : '#f4ecd0';
  shape();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = fx.css;
  shape();
  ctx.stroke();
  // The cross
  if (grow >= 1) {
    ctx.fillStyle = fx.css;
    const t = Math.max(1, Math.round(hw * 0.28));
    ctx.fillRect(px - (t >> 1), top + 3, t, hh * 2 - 7);
    ctx.fillRect(px - hw + 3, top + Math.round(hh * 0.55) - (t >> 1), hw * 2 - 6, t);
    // A shine slipping across the face
    const sx = px - hw + Math.round((k * 3) % 1 * hw * 2);
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, top + 2, 2, hh * 2 - 5);
  }
  ctx.globalAlpha = 1;
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

