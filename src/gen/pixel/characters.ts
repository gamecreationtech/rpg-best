import type { ClassId } from '../../data/classes';
import type { WeaponType } from '../../data/items';
import { PLEDGES } from '../../data/pledges';
import type { Palette } from './palettes';
import { PixelBuffer, hex, ramp, type Ramp, type Rgb } from './pixel';
import type { SpriteAnim, SpriteSize } from './sprites';

/**
 * Character sprite sheets for the pixel-art game: every character is drawn from
 * three sides (side view flipped for left and right, a front view and a back
 * view) with idle, walk and attack animations. Everything is drawn into small
 * buffers from a palette; no image files.
 */

export type Facing = 'side' | 'front' | 'back';

export interface AnimSet {
  idle: SpriteAnim;
  walk: SpriteAnim;
  attack: SpriteAnim;
}

export interface CharacterSheet {
  side: AnimSet;
  front: AnimSet;
  back: AnimSet;
  /** Height of the body in pixels, for placing labels and lights. */
  height: number;
}

type Doll = {
  H: number;
  W: number;
  buf: PixelBuffer;
  ramps: Map<string, Ramp>;
  outline: boolean;
};

interface Look {
  skin: string;
  body: string;
  head: string;
  legs: string;
  arms?: string;
  trim?: string;
  belt?: string;
  hood?: boolean;
  helm?: boolean;
  hat?: boolean;
  apron?: string;
  cape?: string;
  /** Glowing eye colour; default is a dark dot. */
  eyes?: Rgb;
  ribs?: boolean;
  horns?: boolean;
  claws?: boolean;
  /** Forward lean of the whole body in side view. */
  hunch?: number;
  /** Wider body. */
  stout?: boolean;
}

interface Pose {
  legL: number;
  legR: number;
  armF: number;
  armB: number;
  bob: number;
  lean: number;
}

const POSES: Record<'idle' | 'walk' | 'attack', Pose[]> = {
  idle: [
    { legL: 0, legR: 0, armF: 0, armB: 0, bob: 0, lean: 0 },
    { legL: 0, legR: 0, armF: 0.1, armB: -0.1, bob: 1, lean: 0 },
  ],
  walk: [
    { legL: 1, legR: -1, armF: -0.6, armB: 0.6, bob: 0, lean: 0.5 },
    { legL: 0, legR: 0, armF: 0, armB: 0, bob: 1, lean: 0.5 },
    { legL: -1, legR: 1, armF: 0.6, armB: -0.6, bob: 0, lean: 0.5 },
    { legL: 0, legR: 0, armF: 0, armB: 0, bob: 1, lean: 0.5 },
  ],
  attack: [
    { legL: 0.5, legR: -0.5, armF: -1.2, armB: 0.3, bob: 0, lean: -0.5 },
    { legL: 0.5, legR: -0.5, armF: -1.6, armB: 0.3, bob: 0, lean: -0.5 },
    { legL: 1, legR: -1, armF: 1.2, armB: -0.3, bob: 1, lean: 1.5 },
    { legL: 1, legR: -1, armF: 0.8, armB: 0, bob: 0, lean: 1 },
  ],
};

function px(v: number): number {
  return Math.round(v);
}

function doll(H: number, W: number, pal: Palette, outline: boolean, materials: Record<string, number>): Doll {
  const ramps = new Map<string, Ramp>();
  for (const [k, v] of Object.entries(materials)) ramps.set(k, ramp(v, pal.contrast));
  return { H, W, buf: new PixelBuffer(W + 4, H + 3), ramps, outline };
}

function base(d: Doll, key: string): Rgb {
  const r = d.ramps.get(key);
  if (!r) throw new Error(`No material ${key}`);
  return r[1];
}

/** Finishes a part-coloured silhouette: edge shading per material, then the outline. */
function finish(d: Doll, outlineColor: Rgb): HTMLCanvasElement {
  const byKey = new Map<string, Ramp>();
  for (const r of d.ramps.values()) byKey.set(r[1].join(','), r);
  d.buf.shadeRamp((c) => byKey.get(c.join(',')) ?? null);
  if (d.outline) d.buf.outline(outlineColor);
  return d.buf.toCanvas();
}

function anim(frames: HTMLCanvasElement[], W: number, H: number, frameTime: number): SpriteAnim {
  return { frames, originX: Math.round(W / 2) + 2, originY: H + 2, frameTime };
}

/** Weapon drawer: hand position, how far the arm is raised (0..1.6) and the facing. */
type WeaponDrawer = (d: Doll, hx: number, hy: number, raise: number, facing: Facing, pal: Palette) => void;

// ---------------------------------------------------------------- the body

/** Side view: the body faces right; the front arm and leg overlap the back ones. */
function sideBody(d: Doll, pal: Palette, look: Look, pose: Pose, weapon: WeaponDrawer | null, shield: 'wooden' | 'iron' | null): void {
  const { H, W } = d;
  const ox = 2;
  const oy = 1 + pose.bob;
  const hw = W / 2;
  const lean = pose.lean + (look.hunch ?? 0);
  const legW = Math.max(2, px(W * 0.2));
  const legTop = px(H * 0.6);
  const legLen = H - legTop;
  const drawLeg = (offset: number) => {
    const x = px(ox + hw - legW - 1 + offset * W * 0.12 + lean);
    const lift = Math.max(0, -offset) * Math.max(1, px(H * 0.03));
    d.buf.rect(x, oy + legTop, legW, legLen - lift, base(d, look.legs));
    d.buf.rect(x, oy + H - Math.max(1, px(H * 0.06)) - lift, legW + 1, Math.max(1, px(H * 0.06)), base(d, look.belt ?? 'leather'));
  };
  const armW = Math.max(2, px(W * 0.16));
  const armTop = px(H * 0.36);
  const armLen = px(H * 0.26);
  const drawArm = (side: number, swing: number) => {
    const x = px(ox + hw + side * (W * 0.32) - armW / 2 + swing * W * 0.1 + lean * 0.5);
    const raise = Math.max(0, -swing) * px(H * 0.12);
    d.buf.rect(x, oy + armTop - raise, armW, armLen, base(d, look.arms ?? look.body));
    d.buf.rect(x, oy + armTop - raise + armLen, armW, Math.max(1, px(H * 0.05)), base(d, look.skin));
  };
  drawLeg(pose.legR);
  drawArm(-1, pose.armB);
  if (shield) {
    // The shield hangs on the back arm, a sliver shows behind the body
    d.buf.rect(px(ox + hw - W * 0.5 + lean), oy + px(H * 0.34), px(W * 0.25), px(H * 0.3), shield === 'wooden' ? base(d, 'wood') : base(d, 'steel'));
  }
  if (look.cape) d.buf.rect(px(ox + hw - W * 0.3 + lean), oy + px(H * 0.3), px(W * 0.45), px(H * 0.4), base(d, look.cape));
  // Torso: broad shoulders, narrower waist, a belt where the legs start
  const torsoTop = px(H * 0.3);
  const torsoH = legTop - torsoTop + 1;
  const torsoW = px(W * (look.stout ? 0.62 : 0.5));
  const tx = px(ox + hw - torsoW / 2 + lean);
  const waist = look.stout ? 0 : Math.max(1, px(W * 0.06));
  d.buf.rect(tx, oy + torsoTop, torsoW, torsoH, base(d, look.body));
  for (let y = oy + torsoTop + px(torsoH * 0.55); y < oy + torsoTop + torsoH; y++) {
    for (let i = 0; i < waist; i++) {
      d.buf.set(tx + i, y, [0, 0, 0], 0);
      d.buf.set(tx + torsoW - 1 - i, y, [0, 0, 0], 0);
    }
  }
  if (look.apron) d.buf.rect(tx + 1, oy + torsoTop + px(torsoH * 0.35), torsoW - 2, px(torsoH * 0.75), base(d, look.apron));
  const shoulderH = Math.max(1, px(H * 0.06));
  d.buf.rect(tx - 1, oy + torsoTop, torsoW + 2, shoulderH, base(d, look.arms ?? look.body));
  if (look.ribs) for (let i = 0; i < 3; i++) d.buf.rect(tx + 1, oy + torsoTop + 2 + i * Math.max(2, px(H * 0.07)), torsoW - 2, 1, base(d, 'boneDark'));
  const beltH = Math.max(1, px(H * 0.05));
  d.buf.rect(tx + waist, oy + legTop - beltH, torsoW - waist * 2, beltH, base(d, look.trim ?? look.belt ?? 'leather'));
  // Head
  const headR = Math.max(2, px(H * 0.12));
  const hx = px(ox + hw + W * 0.05 + lean);
  const hy = oy + px(H * 0.17);
  sideHead(d, pal, look, hx, hy, headR);
  drawLeg(pose.legL);
  drawArm(1, pose.armF);
  if (weapon) {
    const handX = px(ox + hw + W * 0.32 + pose.armF * W * 0.1 + lean * 0.5);
    const raise = Math.max(0, -pose.armF) * px(H * 0.12);
    weapon(d, handX, oy + armTop - raise + armLen, Math.max(0, -pose.armF), 'side', pal);
  }
  if (look.claws) {
    const cy = oy + armTop + armLen + 1;
    d.buf.line(px(ox + hw + W * 0.42), cy, px(ox + hw + W * 0.42) + 2, cy + 2, base(d, 'bone'));
  }
}

function sideHead(d: Doll, pal: Palette, look: Look, hx: number, hy: number, headR: number): void {
  const eye = look.eyes ?? hex(pal.outline);
  if (look.hood) {
    d.buf.ellipse(hx - 1, hy, headR + 1, headR + 1, base(d, look.head));
    d.buf.rect(hx, hy - px(headR * 0.4), headR, px(headR * 1.1), base(d, look.skin));
    d.buf.set(hx + 1, hy - 1, look.eyes ?? hex(pal.eyeGlow));
  } else if (look.helm) {
    d.buf.ellipse(hx, hy, headR, headR + 1, base(d, look.head));
    d.buf.rect(hx - headR + 1, hy - 1, headR * 2 - 1, Math.max(1, px(headR * 0.5)), hex(pal.outline));
    d.buf.rect(hx - 1, hy - headR - 1, 2, Math.max(1, px(headR * 0.5)), base(d, look.trim ?? look.head));
    d.buf.set(hx + 1, hy - 1, hex(pal.eyeGlow));
  } else if (look.hat) {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    d.buf.rect(hx - headR - 2, hy - headR, headR * 2 + 4, 1, base(d, look.head));
    d.buf.rect(hx - headR + 1, hy - headR - 3, headR * 2 - 1, 3, base(d, look.head));
    d.buf.set(hx + Math.max(1, px(headR * 0.5)), hy, eye);
  } else {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    if (look.head !== look.skin) d.buf.rect(hx - headR, hy - headR, headR * 2, px(headR * 0.8), base(d, look.head));
    d.buf.set(hx + Math.max(1, px(headR * 0.5)), hy, eye);
    if (look.horns) {
      d.buf.line(hx - px(headR * 0.6), hy - headR, hx - px(headR * 1.2), hy - headR - px(headR * 0.8), base(d, 'bone'));
      d.buf.line(hx + px(headR * 0.4), hy - headR, hx + px(headR * 1.0), hy - headR - px(headR * 0.8), base(d, 'bone'));
      d.buf.set(hx + headR - 1, hy + 1, base(d, 'bone'));
    }
  }
}

/** Front and back views share one drawing; the back has no face and shows the cape. */
function frontBody(d: Doll, pal: Palette, look: Look, pose: Pose, weapon: WeaponDrawer | null, shield: 'wooden' | 'iron' | null, back: boolean): void {
  const { H, W } = d;
  const ox = 2;
  const oy = 1 + pose.bob;
  const cx = ox + W / 2;
  const legW = Math.max(2, px(W * 0.2));
  const legTop = px(H * 0.6);
  const legLen = H - legTop;
  const gap = Math.max(1, px(W * 0.06));
  const armW = Math.max(2, px(W * 0.16));
  const armTop = px(H * 0.36);
  const armLen = px(H * 0.26);
  const torsoW = px(W * (look.stout ? 0.66 : 0.52));
  const torsoTop = px(H * 0.3);
  const torsoH = legTop - torsoTop + 1;
  const tx = px(cx - torsoW / 2);
  const raise = Math.max(0, -pose.armF);
  // Weapon and shield behind the body when seen from the back
  const weaponX = back ? px(tx - armW) : px(tx + torsoW + 1);
  const shieldX = back ? px(tx + torsoW) : px(tx - armW - 1);
  if (back && weapon) weapon(d, weaponX, oy + armTop + armLen, raise, 'back', pal);
  // Legs side by side; a walking leg lifts
  const drawLeg = (side: number, lift: number) => {
    const x = px(cx + side * (gap / 2 + legW / 2) - legW / 2);
    const up = Math.max(0, lift) * Math.max(1, px(H * 0.04));
    d.buf.rect(x, oy + legTop, legW, legLen - up, base(d, look.legs));
    d.buf.rect(x, oy + H - Math.max(1, px(H * 0.06)) - up, legW, Math.max(1, px(H * 0.06)), base(d, look.belt ?? 'leather'));
  };
  drawLeg(-1, pose.legL);
  drawLeg(1, pose.legR);
  // Cape shows from the back and covers the torso
  d.buf.rect(tx, oy + torsoTop, torsoW, torsoH, base(d, look.body));
  if (!look.stout) {
    const waist = Math.max(1, px(W * 0.06));
    for (let y = oy + torsoTop + px(torsoH * 0.55); y < oy + torsoTop + torsoH; y++) {
      for (let i = 0; i < waist; i++) {
        d.buf.set(tx + i, y, [0, 0, 0], 0);
        d.buf.set(tx + torsoW - 1 - i, y, [0, 0, 0], 0);
      }
    }
  }
  if (back && look.cape) d.buf.rect(tx, oy + torsoTop + 1, torsoW, px(torsoH * 0.95), base(d, look.cape));
  if (!back && look.apron) d.buf.rect(tx + 1, oy + torsoTop + px(torsoH * 0.35), torsoW - 2, px(torsoH * 0.75), base(d, look.apron));
  const shoulderH = Math.max(1, px(H * 0.06));
  d.buf.rect(tx - 1, oy + torsoTop, torsoW + 2, shoulderH, base(d, look.arms ?? look.body));
  if (!back && look.ribs) for (let i = 0; i < 3; i++) d.buf.rect(tx + 1, oy + torsoTop + 2 + i * Math.max(2, px(H * 0.07)), torsoW - 2, 1, base(d, 'boneDark'));
  if (!back) {
    const beltH = Math.max(1, px(H * 0.05));
    d.buf.rect(tx + 1, oy + legTop - beltH, torsoW - 2, beltH, base(d, look.trim ?? look.belt ?? 'leather'));
  }
  // Arms at the sides; they bob opposite to each other while walking
  const drawArm = (side: number, swing: number) => {
    const x = side < 0 ? tx - armW : tx + torsoW;
    const up = swing < 0 ? Math.round(-swing * px(H * 0.12)) : 0;
    const down = swing > 0 ? Math.round(swing * 1.5) : 0;
    d.buf.rect(x, oy + armTop - up + down, armW, armLen, base(d, look.arms ?? look.body));
    d.buf.rect(x, oy + armTop - up + down + armLen, armW, Math.max(1, px(H * 0.05)), base(d, look.skin));
  };
  drawArm(back ? 1 : -1, pose.armB);
  drawArm(back ? -1 : 1, pose.armF);
  if (look.claws) {
    const cy = oy + armTop + armLen + 1;
    d.buf.rect(tx - armW, cy, 1, 2, base(d, 'bone'));
    d.buf.rect(tx + torsoW + armW - 1, cy, 1, 2, base(d, 'bone'));
  }
  // Head
  const headR = Math.max(2, px(H * 0.12));
  const hx = px(cx);
  const hy = oy + px(H * 0.17);
  frontHead(d, pal, look, hx, hy, headR, back);
  if (shield) {
    const c = shield === 'wooden' ? base(d, 'wood') : base(d, 'steel');
    const sw = px(W * 0.3);
    const sh = px(H * 0.3);
    d.buf.rect(shieldX - (back ? 0 : sw - armW), oy + armTop + 1, sw, sh, c);
    d.buf.set(shieldX - (back ? 0 : sw - armW) + (sw >> 1), oy + armTop + 1 + (sh >> 1), shield === 'wooden' ? base(d, 'steel') : base(d, 'wood'));
  }
  if (!back && weapon) weapon(d, weaponX, oy + armTop + armLen - Math.round(raise * px(H * 0.12)), raise, 'front', pal);
}

function frontHead(d: Doll, pal: Palette, look: Look, hx: number, hy: number, headR: number, back: boolean): void {
  const eye = look.eyes ?? hex(pal.outline);
  const glow = look.eyes ?? hex(pal.eyeGlow);
  const eyeY = hy - 1;
  const eyeDx = Math.max(1, px(headR * 0.5));
  if (look.hood) {
    d.buf.ellipse(hx, hy, headR + 1, headR + 1, base(d, look.head));
    if (!back) {
      d.buf.rect(hx - px(headR * 0.6), hy - px(headR * 0.3), px(headR * 1.2) + 1, px(headR * 1.0), base(d, look.skin));
      d.buf.set(hx - eyeDx + 1, eyeY, glow);
      d.buf.set(hx + eyeDx - 1, eyeY, glow);
    }
  } else if (look.helm) {
    d.buf.ellipse(hx, hy, headR, headR + 1, base(d, look.head));
    d.buf.rect(hx - 1, hy - headR - 1, 2, headR + 2, base(d, look.trim ?? look.head));
    if (!back) {
      d.buf.rect(hx - headR + 1, eyeY, headR * 2 - 1, Math.max(1, px(headR * 0.5)), hex(pal.outline));
      d.buf.set(hx - eyeDx, eyeY, hex(pal.eyeGlow));
      d.buf.set(hx + eyeDx, eyeY, hex(pal.eyeGlow));
    }
  } else if (look.hat) {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    d.buf.rect(hx - headR - 2, hy - headR, headR * 2 + 5, 1, base(d, look.head));
    d.buf.rect(hx - headR + 1, hy - headR - 3, headR * 2 - 1, 3, base(d, look.head));
    if (!back) {
      d.buf.set(hx - eyeDx, eyeY, eye);
      d.buf.set(hx + eyeDx, eyeY, eye);
    }
  } else {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    if (look.head !== look.skin) d.buf.rect(hx - headR, hy - headR, headR * 2 + 1, px(headR * 0.8), base(d, look.head));
    if (!back) {
      d.buf.set(hx - eyeDx, eyeY, eye);
      d.buf.set(hx + eyeDx, eyeY, eye);
    }
    if (look.horns) {
      d.buf.line(hx - headR, hy - headR + 1, hx - headR - 1, hy - headR - px(headR * 0.8), base(d, 'bone'));
      d.buf.line(hx + headR, hy - headR + 1, hx + headR + 1, hy - headR - px(headR * 0.8), base(d, 'bone'));
      if (!back) {
        d.buf.set(hx - 1, hy + headR - 1, base(d, 'bone'));
        d.buf.set(hx + 1, hy + headR - 1, base(d, 'bone'));
      }
    }
  }
}

// ---------------------------------------------------------------- weapons

const WEAPONS: Record<WeaponType, WeaponDrawer> = {
  sword: (d, hx, hy, raise, facing) => blade(d, hx, hy, raise, facing, px(d.H * 0.42), 2, 'steel', 'wood'),
  dagger: (d, hx, hy, raise, facing) => blade(d, hx, hy, raise, facing, px(d.H * 0.22), 1, 'steel', 'wood'),
  axe: (d, hx, hy, raise, facing) => {
    pole(d, hx, hy, raise, facing, px(d.H * 0.4), 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, px(d.H * 0.4));
    d.buf.rect(tx - 1, ty, 3, 3, base(d, 'steel'));
    d.buf.rect(tx + (facing === 'back' ? -3 : 1), ty - 1, 3, 4, base(d, 'steel'));
  },
  mace: (d, hx, hy, raise, facing) => {
    pole(d, hx, hy, raise, facing, px(d.H * 0.36), 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, px(d.H * 0.36));
    d.buf.ellipse(tx + 0.5, ty + 0.5, 2, 2, base(d, 'steel'));
  },
  spear: (d, hx, hy, raise, facing) => {
    pole(d, hx, hy, raise, facing, px(d.H * 0.75), 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, px(d.H * 0.75));
    d.buf.rect(tx, ty - 3, 1, 4, base(d, 'steel'));
    d.buf.set(tx - 1, ty - 1, base(d, 'steel'));
    d.buf.set(tx + 1, ty - 1, base(d, 'steel'));
  },
  bow: (d, hx, hy, _raise, facing, pal) => bowShape(d, hx, hy, facing, pal, false),
  crossbow: (d, hx, hy, _raise, facing, pal) => bowShape(d, hx, hy, facing, pal, true),
  wand: (d, hx, hy, raise, facing, pal) => {
    pole(d, hx, hy, raise, facing, px(d.H * 0.25), 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, px(d.H * 0.25));
    d.buf.set(tx, ty - 1, ramp(pal.ice, pal.contrast)[3]);
  },
  staff: (d, hx, hy, raise, facing, pal) => {
    const len = px(d.H * 0.75);
    pole(d, hx, hy, raise, facing, len, 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
    const ice = ramp(pal.ice, pal.contrast);
    d.buf.ellipse(tx + 0.5, ty - 0.5, 2, 2.5, ice[2]);
    d.buf.set(tx, ty - 1, ice[3]);
  },
  blowgun: (d, hx, hy, raise, facing) => pole(d, hx, hy, raise, facing, px(d.H * 0.4), 'wood'),
};

/** A straight shaft from the hand; up when idle, overhead when raised, swung forward on the follow-through. */
function pole(d: Doll, hx: number, hy: number, raise: number, facing: Facing, len: number, mat: string): void {
  const c = base(d, mat);
  const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
  d.buf.line(hx, hy, tx, ty, c);
  if (facing !== 'side') d.buf.line(hx + 1, hy, tx + 1, ty, c);
}

function poleTip(d: Doll, hx: number, hy: number, raise: number, facing: Facing, len: number): [number, number] {
  if (facing === 'side') {
    if (raise > 0.8) return [hx - px(len * 0.3), hy - len];
    if (raise > 0) return [hx + len, hy - px(len * 0.4)];
    return [hx + 1, hy - len];
  }
  if (raise > 0.8) return [hx, hy - len - 2];
  if (raise > 0) return [hx + (facing === 'back' ? -px(len * 0.5) : px(len * 0.5)), hy + px(len * 0.6)];
  return [hx, hy - len];
}

function blade(d: Doll, hx: number, hy: number, raise: number, facing: Facing, len: number, width: number, steel: string, grip: string): void {
  const s = base(d, steel);
  const g = base(d, grip);
  const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
  for (let i = 0; i < width; i++) d.buf.line(hx + i, hy, tx + i, ty, s);
  // Crossguard at the hand
  if (facing === 'side' && raise > 0 && raise <= 0.8) d.buf.rect(hx, hy - 1, 2, 3, g);
  else d.buf.rect(hx - 1, hy, width + 2, 1, g);
}

function bowShape(d: Doll, hx: number, hy: number, facing: Facing, pal: Palette, cross: boolean): void {
  const wood = base(d, 'wood');
  const string = hex(pal.bone);
  const len = px(d.H * 0.4);
  if (cross) {
    // Crossbow: a stock with a short horizontal bow
    d.buf.rect(hx - 1, hy - 2, 3, 6, wood);
    d.buf.rect(hx - px(len * 0.4), hy - 2, px(len * 0.8) + 1, 1, string);
    d.buf.set(hx, hy - 3, base(d, 'steel'));
    return;
  }
  const cx = facing === 'side' ? hx + 2 : hx;
  for (let i = -len / 2; i <= len / 2; i++) {
    const bend = px(Math.sqrt(Math.max(0, 1 - (i / (len / 2)) ** 2)) * d.W * 0.18);
    d.buf.set(cx + (facing === 'back' ? -bend : bend), px(hy - d.H * 0.1 + i), wood);
  }
  d.buf.line(cx, px(hy - d.H * 0.1 - len / 2), cx, px(hy - d.H * 0.1 + len / 2), string);
}

// ---------------------------------------------------------------- sheets

function sheet(pal: Palette, H: number, W: number, outline: boolean, materials: Record<string, number>, look: Look, weapon: WeaponDrawer | null, shield: 'wooden' | 'iron' | null, extra?: (d: Doll, facing: Facing, frame: number) => void, speed = 1): CharacterSheet {
  const make = (facing: Facing, poses: Pose[]) =>
    poses.map((p, i) => {
      const d = doll(H, W, pal, outline, materials);
      if (facing === 'side') sideBody(d, pal, look, p, weapon, shield);
      else frontBody(d, pal, look, p, weapon, shield, facing === 'back');
      extra?.(d, facing, i);
      return finish(d, hex(pal.outline));
    });
  const set = (facing: Facing): AnimSet => ({
    idle: anim(make(facing, POSES.idle), W, H, 0.5),
    walk: anim(make(facing, POSES.walk), W, H, 0.12 / speed),
    attack: anim(make(facing, POSES.attack), W, H, 0.08),
  });
  return { side: set('side'), front: set('front'), back: set('back'), height: H };
}

export interface HeroLook {
  classId: ClassId;
  pledgeId: string | null;
  weapon: WeaponType | null;
  shield: 'wooden' | 'iron' | null;
}

export function heroLookKey(look: HeroLook): string {
  return `${look.classId}:${look.pledgeId ?? ''}:${look.weapon ?? ''}:${look.shield ?? ''}`;
}

function darken(hex6: number, k: number): number {
  const r = ((hex6 >> 16) & 255) * k;
  const g = ((hex6 >> 8) & 255) * k;
  const b = (hex6 & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** A hero: class silhouette, pledge colour on the cloth and trim, the equipped weapon and shield. */
export function heroSheet(look: HeroLook, pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const H = size === 'large' ? 44 : 22;
  const W = Math.round(H * 0.7);
  const pledge = look.pledgeId ? PLEDGES[look.pledgeId] : null;
  const bright = pledge?.color ?? (look.classId === 'knight' ? 0x3858c8 : look.classId === 'sorcerer' ? 0x5a3a8a : 0x4a6a3a);
  const cloth = pledge ? darken(pledge.color, 0.55) : bright;
  const materials = {
    skin: pal.skin,
    cloth,
    trim: pledge ? pledge.color : pal.heroTrim,
    leather: pal.leather,
    steel: pal.steel,
    wood: pal.wood,
    bone: pal.bone,
    cape: look.classId === 'knight' ? 0x7a2a2a : cloth,
    hood: look.classId === 'sorcerer' ? darken(cloth, 0.8) : pal.leather,
  };
  const heroLook: Look =
    look.classId === 'knight'
      ? { skin: 'skin', body: 'cloth', head: 'steel', legs: 'leather', arms: 'steel', trim: 'trim', helm: true, cape: 'cape' }
      : look.classId === 'sorcerer'
        ? { skin: 'skin', body: 'cloth', head: 'hood', legs: 'cloth', arms: 'cloth', trim: 'trim', hood: true }
        : { skin: 'skin', body: 'leather', head: 'hood', legs: 'leather', arms: 'skin', trim: 'trim', hood: true };
  const weapon = look.weapon ? WEAPONS[look.weapon] : look.classId === 'knight' ? WEAPONS.sword : look.classId === 'sorcerer' ? WEAPONS.staff : WEAPONS.bow;
  return sheet(pal, H, W, outline, materials, heroLook, weapon, look.shield);
}

export type MonsterKind = 'ghoul' | 'skeleton' | 'brute' | 'wraith';

export function monsterSheet(kind: MonsterKind, pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const scale = size === 'large' ? 2 : 1;
  if (kind === 'wraith') return wraithSheet(pal, scale, outline);
  const H = (kind === 'brute' ? 28 : kind === 'ghoul' ? 18 : 22) * scale;
  const W = Math.round(H * (kind === 'brute' ? 0.9 : 0.7));
  const materials = { skin: pal.ghoul, dark: pal.ghoulDark, bone: pal.bone, boneDark: 0x9a9078, brute: pal.brute, bruteDark: pal.bruteDark, leather: pal.leather, steel: pal.steel, wood: pal.wood };
  const look: Look =
    kind === 'ghoul'
      ? { skin: 'skin', body: 'skin', head: 'skin', legs: 'dark', belt: 'dark', eyes: hex(pal.eyeGlow), claws: true, hunch: 1.5 }
      : kind === 'skeleton'
        ? { skin: 'bone', body: 'bone', head: 'bone', legs: 'boneDark', belt: 'boneDark', eyes: [0x40, 0xff, 0x90], ribs: true }
        : { skin: 'brute', body: 'brute', head: 'bruteDark', legs: 'bruteDark', trim: 'leather', belt: 'leather', eyes: [0xff, 0x70, 0x20], horns: true, stout: true };
  return sheet(pal, H, W, outline, materials, look, null, null, undefined, kind === 'brute' ? 0.65 : kind === 'ghoul' ? 1.2 : 1);
}

function wraithSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const H = 24 * scale;
  const W = 14 * scale;
  const materials = { cloth: pal.wraith, dark: pal.outline };
  const frame = (bob: number, flutter: number, facing: Facing) => {
    const d = doll(H, W, pal, outline, materials);
    const c = base(d, 'cloth');
    const hw = W / 2 + 2;
    d.buf.ellipse(hw, 1 + px(H * 0.2) + bob, px(W * 0.35), px(H * 0.16), c);
    for (let y = px(H * 0.3); y < H - px(H * 0.08); y++) {
      const t = (y - H * 0.3) / (H * 0.62);
      const half = px(W * 0.4 * (1 - t * 0.5));
      const wave = Math.round(Math.sin(y * 0.6 + flutter) * (t > 0.6 ? 1 : 0));
      d.buf.rect(hw - half + wave, 1 + y + bob, half * 2, 1, c);
    }
    for (let x = hw - px(W * 0.3); x <= hw + px(W * 0.3); x += 2) d.buf.rect(x + (flutter > 0 ? 1 : 0), 1 + H - px(H * 0.08) + bob, 1, px(H * 0.06), c);
    if (facing !== 'back') {
      const ex = facing === 'side' ? hw : hw - 1;
      d.buf.rect(ex - 1, 1 + px(H * 0.2) + bob, 3, 2, hex(pal.outline));
      if (facing === 'front') {
        d.buf.set(ex - 1, 1 + px(H * 0.2) + bob, [0x9f, 0xe0, 0xff]);
        d.buf.set(ex + 1, 1 + px(H * 0.2) + bob, [0x9f, 0xe0, 0xff]);
      } else d.buf.set(ex + 1, 1 + px(H * 0.2) + bob, [0x9f, 0xe0, 0xff]);
    }
    return finish(d, hex(pal.outline));
  };
  const set = (facing: Facing): AnimSet => {
    const idle = [frame(0, 0, facing), frame(1, 1, facing), frame(0, 2, facing), frame(-1, 3, facing)];
    return { idle: anim(idle, W, H, 0.2), walk: anim(idle, W, H, 0.15), attack: anim([frame(-2, 0, facing), frame(-2, 1, facing)], W, H, 0.12) };
  };
  return { side: set('side'), front: set('front'), back: set('back'), height: H };
}

/** The merchant: stout, aproned, wide hat. */
export function vendorSheet(pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const H = size === 'large' ? 44 : 22;
  const W = Math.round(H * 0.8);
  const materials = { skin: pal.skin, coat: 0x6a3a2a, apron: 0xc8b89a, hat: 0x3a2a1a, leather: pal.leather, steel: pal.steel, wood: pal.wood, bone: pal.bone };
  const look: Look = { skin: 'skin', body: 'coat', head: 'hat', legs: 'leather', arms: 'coat', apron: 'apron', belt: 'hat', hat: true, stout: true };
  return sheet(pal, H, W, outline, materials, look, null, null, undefined, 0.8);
}

/** Training dummy: a post, a crossbar and a straw body with an element-coloured band. It wobbles when it strikes. */
export function dummySheet(color: number, pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const H = size === 'large' ? 44 : 22;
  const W = Math.round(H * 0.7);
  const materials = { wood: pal.wood, straw: 0xb89a5a, band: color, leather: pal.leather };
  const frame = (tilt: number) => {
    const d = doll(H, W, pal, outline, materials);
    const cx = 2 + W / 2;
    const wood = base(d, 'wood');
    d.buf.rect(px(cx - 1), 1 + px(H * 0.5), 2, px(H * 0.5), wood);
    d.buf.rect(px(cx - W * 0.3), 1 + H - 2, px(W * 0.6), 2, wood);
    const bx = px(cx + tilt);
    d.buf.ellipse(bx, 1 + px(H * 0.42), px(W * 0.28), px(H * 0.2), base(d, 'straw'));
    d.buf.rect(px(bx - W * 0.42), 1 + px(H * 0.3), px(W * 0.84), 2, wood);
    d.buf.rect(px(bx - W * 0.2), 1 + px(H * 0.42), px(W * 0.4) + 1, 2, base(d, 'band'));
    d.buf.ellipse(bx, 1 + px(H * 0.16), px(W * 0.16), px(H * 0.1), base(d, 'straw'));
    return finish(d, hex(pal.outline));
  };
  const set = (): AnimSet => ({
    idle: anim([frame(0), frame(0)], W, H, 0.5),
    walk: anim([frame(0), frame(0)], W, H, 0.5),
    attack: anim([frame(-2), frame(-3), frame(2), frame(1)], W, H, 0.08),
  });
  return { side: set(), front: set(), back: set(), height: H };
}
