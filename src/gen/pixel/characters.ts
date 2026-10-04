import { kinOf, type ClassId } from '../../data/classes';
import type { MonsterLook } from '../../data/monsters';
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
  /** Facing left, when the sheet has its own drawing for it (hand-made sprites); otherwise `side` is mirrored. */
  left?: AnimSet;
  /** Built from the producer's drawings: the attack is paced to the hero's attack rate so every frame shows each swing. */
  handMade?: boolean;
  /** Height of the body in pixels, for placing labels and lights. */
  height: number;
}

type Doll = {
  H: number;
  W: number;
  buf: PixelBuffer;
  ramps: Map<string, Ramp>;
  outline: boolean;
  /** Extra rows above the head, for tall hats. */
  top: number;
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
  /** A tall pointed hat with a brim, in the `head` colour with a `trim` band. */
  wizardHat?: boolean;
  apron?: string;
  cape?: string;
  /** Glowing eye colour; default is a dark dot. */
  eyes?: Rgb;
  ribs?: boolean;
  horns?: boolean;
  claws?: boolean;
  /** Forward lean of the whole body in side view. */
  hunch?: number;
  /** A long robe from the shoulders to the ground instead of a torso and legs; `robeFold` shades its folds. */
  robe?: boolean;
  robeFold?: string;
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

function doll(H: number, W: number, pal: Palette, outline: boolean, materials: Record<string, number>, top = 0): Doll {
  const ramps = new Map<string, Ramp>();
  for (const [k, v] of Object.entries(materials)) ramps.set(k, ramp(v, pal.contrast));
  return { H, W, buf: new PixelBuffer(W + 4, H + 3 + top), ramps, outline, top };
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

/** What hangs in the shield slot: one of the four shields, or one of the offhands. */
export type OffhandLook = 'wooden' | 'iron' | 'tower' | 'energy' | 'lantern' | 'skull' | 'quiver';

type ShieldLook = 'wooden' | 'iron' | 'tower' | 'energy';
const ENERGY_GLOW = hex(0x6fd0ff);
const ENERGY_CORE = hex(0xc8f0ff);

function isShield(o: OffhandLook | null): o is ShieldLook {
  return o === 'wooden' || o === 'iron' || o === 'tower' || o === 'energy';
}

/** Face colour, boss colour and how tall each shield is relative to the hero. */
function shieldStyle(d: Doll, kind: ShieldLook): { face: [number, number, number]; boss: [number, number, number]; tall: number; wide: number } {
  switch (kind) {
    case 'wooden': return { face: base(d, 'wood'), boss: base(d, 'steel'), tall: 0.3, wide: 1 };
    case 'iron': return { face: base(d, 'steel'), boss: base(d, 'wood'), tall: 0.3, wide: 1 };
    case 'tower': return { face: base(d, 'steelDark'), boss: base(d, 'steel'), tall: 0.46, wide: 1.3 };
    default: return { face: ENERGY_GLOW, boss: ENERGY_CORE, tall: 0.3, wide: 1 };
  }
}

const LANTERN_GLOW = hex(0xffd868);

/** A lantern or skull held low in the off hand: x is the hand's column, y its top. */
function drawOffhandHand(d: Doll, kind: 'lantern' | 'skull', x: number, y: number): void {
  const w = Math.max(2, px(d.W * 0.16));
  if (kind === 'lantern') {
    d.buf.rect(x, y, w, 1, base(d, 'steel'));
    d.buf.rect(x, y + 1, w, Math.max(2, px(d.H * 0.12)), base(d, 'steelDark'));
    d.buf.set(x + (w >> 1), y + 2, LANTERN_GLOW);
  } else {
    d.buf.rect(x, y, w, w, base(d, 'bone'));
    d.buf.set(x, y + 1, base(d, 'steelDark'));
  }
}

/** Side view: the offhand sits on the back arm, x is the column just behind the body. */
function drawOffhandSide(d: Doll, kind: 'lantern' | 'skull' | 'quiver', x: number, oy: number): void {
  if (kind === 'quiver') drawQuiver(d, x, oy + px(d.H * 0.28), px(d.H * 0.34));
  else drawOffhandHand(d, kind, x, oy + px(d.H * 0.5));
}

/** A quiver: a wooden tube with two bone arrow tips poking out of the top. */
function drawQuiver(d: Doll, x: number, y: number, h: number): void {
  const w = Math.max(2, px(d.W * 0.16));
  d.buf.rect(x, y, w, h, base(d, 'wood'));
  d.buf.rect(x, y + (h >> 1), w, 1, base(d, 'leather'));
  d.buf.set(x, y - 1, base(d, 'bone'));
  d.buf.set(x + w - 1, y - 2, base(d, 'bone'));
}

// ---------------------------------------------------------------- the body

/** Side view: the body faces right; the front arm and leg overlap the back ones. */
function sideBody(d: Doll, pal: Palette, look: Look, pose: Pose, weapon: WeaponDrawer | null, offhand: OffhandLook | null): void {
  const { H, W } = d;
  const ox = 2;
  const oy = 1 + pose.bob + d.top;
  const hw = W / 2;
  const lean = pose.lean + (look.hunch ?? 0);
  // Seen from the side a body is about two thirds as wide as from the front:
  // a slimmer chest and thicker legs, the back leg a step behind the front one
  const legW = Math.max(3, px(W * 0.28));
  const legTop = px(H * 0.58);
  const legLen = H - legTop;
  const drawLeg = (offset: number, back: boolean) => {
    const x = px(ox + hw - legW / 2 - (back ? 1 : 0) + offset * W * 0.1 + lean);
    const lift = Math.max(0, -offset) * Math.max(1, px(H * 0.03));
    d.buf.rect(x, oy + legTop, legW - (back ? 1 : 0), legLen - lift, base(d, look.legs));
    d.buf.rect(x, oy + H - Math.max(1, px(H * 0.06)) - lift, legW + (back ? 0 : 1), Math.max(1, px(H * 0.06)), base(d, look.belt ?? 'leather'));
  };
  const armW = Math.max(2, px(W * 0.16));
  const armTop = px(H * 0.36);
  const armLen = px(H * 0.26);
  const sleeve = look.robe ? 1 : 0;
  const reach = look.robe || look.stout ? 0.32 : 0.24;
  const drawArm = (side: number, swing: number) => {
    const x = px(ox + hw + side * (W * reach) - armW / 2 + swing * W * 0.1 + lean * 0.5);
    const raise = Math.max(0, -swing) * px(H * 0.12);
    d.buf.rect(x - sleeve, oy + armTop - raise, armW + sleeve, armLen, base(d, look.arms ?? look.body));
    d.buf.rect(x, oy + armTop - raise + armLen, armW, Math.max(1, px(H * 0.05)), base(d, look.skin));
  };
  if (!look.robe) drawLeg(pose.legR, true);
  drawArm(-1, pose.armB);
  if (isShield(offhand)) {
    // The shield hangs on the back arm, a sliver shows behind the body
    const st = shieldStyle(d, offhand);
    d.buf.rect(px(ox + hw - W * 0.5 + lean), oy + px(H * 0.34), px(W * 0.25 * st.wide), px(H * st.tall), st.face);
  } else if (offhand) {
    drawOffhandSide(d, offhand, px(ox + hw - W * 0.5 + lean), oy);
  }
  if (look.cape) d.buf.rect(px(ox + hw - W * 0.34 + lean), oy + px(H * 0.3), px(W * 0.36), px(H * 0.42), base(d, look.cape));
  // Torso: broad shoulders, narrower waist, a belt where the legs start
  const torsoTop = px(H * 0.3);
  const torsoH = legTop - torsoTop + 1;
  const torsoW = px(W * (look.stout ? 0.56 : look.robe ? 0.5 : 0.4));
  const tx = px(ox + hw - torsoW / 2 + lean);
  const waist = look.stout || look.robe ? 0 : 1;
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
  if (look.robe) {
    // A robe: widens from the shoulders to a hem at the ground that sways with the stride
    const cx = ox + hw + lean;
    const fold = base(d, look.robeFold ?? look.legs);
    const top = oy + torsoTop + shoulderH;
    const bottom = oy + H;
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top);
      const half = Math.round(torsoW / 2 + t * (W * 0.42 - torsoW / 2));
      const back = Math.round(cx - half + pose.legR * t * 1.5);
      const front = Math.round(cx + half + pose.legL * t * 1.5);
      d.buf.rect(back, y, front - back + 1, 1, base(d, look.body));
      // Two folds down the front and the back edge in shadow
      if (t > 0.3 && y % 2 === 0) d.buf.set(front - Math.round(half * 0.6), y, fold);
      if (t > 0.2) d.buf.set(back, y, fold);
    }
    d.buf.rect(Math.round(cx - W * 0.42 + pose.legR * 1.5), bottom - 1, Math.round(W * 0.84) + 1, 1, fold);
    const sashY = oy + px(H * 0.52);
    d.buf.rect(Math.round(cx - torsoW * 0.55), sashY, px(torsoW * 1.1), Math.max(1, px(H * 0.05)), base(d, look.trim ?? look.belt ?? 'leather'));
  } else {
    const beltH = Math.max(1, px(H * 0.05));
    d.buf.rect(tx + waist, oy + legTop - beltH, torsoW - waist * 2, beltH, base(d, look.trim ?? look.belt ?? 'leather'));
  }
  // Head
  const headR = Math.max(2, px(H * 0.12));
  const hx = px(ox + hw + W * 0.05 + lean);
  const hy = oy + px(H * 0.17);
  sideHead(d, pal, look, hx, hy, headR);
  if (!look.robe) drawLeg(pose.legL, false);
  drawArm(1, pose.armF);
  if (weapon) {
    const handX = px(ox + hw + W * reach + pose.armF * W * 0.1 + lean * 0.5);
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
  if (look.wizardHat) {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    d.buf.set(hx + Math.max(1, px(headR * 0.5)), hy, eye);
    wizardHat(d, look, hx, hy - headR + 1, headR, 'side');
  } else if (look.hood) {
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
function frontBody(d: Doll, pal: Palette, look: Look, pose: Pose, weapon: WeaponDrawer | null, offhand: OffhandLook | null, back: boolean): void {
  const { H, W } = d;
  const ox = 2;
  const oy = 1 + pose.bob + d.top;
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
  // A quiver rides on the back: seen from the front only the arrow tips show over the shoulder
  if (offhand === 'quiver' && !back) drawQuiver(d, px(tx + torsoW * 0.6), oy + torsoTop, px(H * 0.3));
  // Legs side by side; a walking leg lifts
  const drawLeg = (side: number, lift: number) => {
    const x = px(cx + side * (gap / 2 + legW / 2) - legW / 2);
    const up = Math.max(0, lift) * Math.max(1, px(H * 0.04));
    d.buf.rect(x, oy + legTop, legW, legLen - up, base(d, look.legs));
    d.buf.rect(x, oy + H - Math.max(1, px(H * 0.06)) - up, legW, Math.max(1, px(H * 0.06)), base(d, look.belt ?? 'leather'));
  };
  if (!look.robe) {
    drawLeg(-1, pose.legL);
    drawLeg(1, pose.legR);
  }
  // Cape shows from the back and covers the torso
  d.buf.rect(tx, oy + torsoTop, torsoW, torsoH, base(d, look.body));
  if (look.robe) {
    const fold = base(d, look.robeFold ?? look.legs);
    const top = oy + torsoTop + Math.max(1, px(H * 0.06));
    const bottom = oy + H;
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top);
      const half = Math.round(torsoW / 2 + t * (W * 0.46 - torsoW / 2));
      const sway = Math.round((pose.legL - pose.legR) * t * 0.7);
      d.buf.rect(Math.round(cx - half + sway), y, half * 2 + 1, 1, base(d, look.body));
      if (t > 0.3 && y % 2 === 0) {
        d.buf.set(Math.round(cx + sway), y, fold);
        d.buf.set(Math.round(cx - half + sway), y, fold);
      }
    }
    d.buf.rect(Math.round(cx - W * 0.46), bottom - 1, Math.round(W * 0.92) + 1, 1, fold);
    if (!back) d.buf.rect(Math.round(cx - torsoW * 0.55), oy + px(H * 0.52), px(torsoW * 1.1), Math.max(1, px(H * 0.05)), base(d, look.trim ?? look.belt ?? 'leather'));
  } else if (!look.stout) {
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
  if (!back && !look.robe) {
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
  if (isShield(offhand)) {
    const st = shieldStyle(d, offhand);
    const sw = px(W * 0.3 * st.wide);
    const sh = px(H * st.tall);
    d.buf.rect(shieldX - (back ? 0 : sw - armW), oy + armTop + 1, sw, sh, st.face);
    d.buf.set(shieldX - (back ? 0 : sw - armW) + (sw >> 1), oy + armTop + 1 + (sh >> 1), st.boss);
  } else if (offhand === 'quiver') {
    if (back) drawQuiver(d, px(tx + torsoW * 0.55), oy + torsoTop + 1, px(H * 0.3));
  } else if (offhand) {
    drawOffhandHand(d, offhand, shieldX, oy + armTop + armLen);
  }
  if (!back && weapon) weapon(d, weaponX, oy + armTop + armLen - Math.round(raise * px(H * 0.12)), raise, 'front', pal);
}

function frontHead(d: Doll, pal: Palette, look: Look, hx: number, hy: number, headR: number, back: boolean): void {
  const eye = look.eyes ?? hex(pal.outline);
  const glow = look.eyes ?? hex(pal.eyeGlow);
  const eyeY = hy - 1;
  const eyeDx = Math.max(1, px(headR * 0.5));
  if (look.wizardHat) {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    if (!back) {
      d.buf.set(hx - eyeDx, eyeY, eye);
      d.buf.set(hx + eyeDx, eyeY, eye);
    }
    wizardHat(d, look, hx, hy - headR + 1, headR, back ? 'back' : 'front');
  } else if (look.hood) {
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

/** A pointed hat: a wide brim at `brimY`, a cone above it whose tip bends over. */
function wizardHat(d: Doll, look: Look, hx: number, brimY: number, headR: number, facing: Facing): void {
  const c = base(d, look.head);
  const band = base(d, look.trim ?? look.head);
  // A wide brim, its upper edge in the trim colour, and a thick band where the cone meets it (after the producer's witch, 2026-10-04)
  // One row thick so the brim sits above the eyes instead of over them
  const brimHalf = headR + 4;
  const cone = d.top;
  d.buf.rect(hx - brimHalf, brimY, brimHalf * 2 + 1, 1, c);
  d.buf.rect(hx - brimHalf + 2, brimY - 1, brimHalf * 2 - 3, 1, band);
  d.buf.rect(hx - headR, brimY - 2, headR * 2 + 1, 1, band);
  // Cone: each row narrower than the one below, the tip bending over, back (side) or to one side (front)
  const lean = facing === 'side' ? -1 : 1;
  for (let i = 3; i <= cone; i++) {
    const t = (i - 2) / (cone - 2);
    const half = Math.max(0, Math.round(headR * (1 - t * 0.9) - (t > 0.8 ? 1 : 0)));
    const shift = Math.round(lean * t * t * t * headR * 1.4);
    d.buf.rect(hx - half + shift, brimY - 1 - i, half * 2 + 1, 1, c);
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
  bardiche: (d, hx, hy, raise, facing) => {
    // Long pole whose butt rests on the floor, with a tall curved axe head on one side
    const len = px(d.H * 0.7);
    pole(d, hx, hy, raise, facing, len, 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
    const wood = base(d, 'wood');
    const floor = d.top + d.H + 1;
    if (ty < hy && floor > hy) {
      // Continue the shaft past the hand along the same line until it meets the floor
      const t = Math.min(1, (floor - hy) / (hy - ty));
      const bx = Math.round(hx - (tx - hx) * t);
      const by = Math.round(hy + (hy - ty) * t);
      d.buf.line(hx, hy, bx, by, wood);
      if (facing !== 'side') d.buf.line(hx + 1, hy, bx + 1, by, wood);
    }
    const s = base(d, 'steel');
    const side = facing === 'back' ? -1 : 1;
    d.buf.rect(tx, ty - 2, 1, 8, s);
    d.buf.rect(tx + side, ty - 3, 2, 10, s);
    d.buf.rect(tx + side * 3, ty - 2, 2, 8, s);
    d.buf.rect(tx + side * 5, ty, 1, 4, s);
  },
  spellbook: (d, hx, hy, _raise, facing) => {
    // A small tome held open in front of the hand
    const cover = base(d, 'leather');
    const page = base(d, 'bone');
    const x = facing === 'side' ? hx + 1 : hx - 1;
    d.buf.rect(x, hy - 2, 4, 5, cover);
    d.buf.rect(x + 1, hy - 1, 2, 3, page);
  },
  warfork: (d, hx, hy, raise, facing) => {
    // A short pole ending in two tines
    const len = px(d.H * 0.5);
    pole(d, hx, hy, raise, facing, len, 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
    const s = base(d, 'steel');
    d.buf.rect(tx - 1, ty - 3, 1, 4, s);
    d.buf.rect(tx + 1, ty - 3, 1, 4, s);
    d.buf.rect(tx - 1, ty, 3, 1, s);
  },
  javelin: (d, hx, hy, raise, facing) => {
    // A light throwing spear: a thin shaft with a small steel head
    const len = px(d.H * 0.55);
    pole(d, hx, hy, raise, facing, len, 'wood');
    const [tx, ty] = poleTip(d, hx, hy, raise, facing, len);
    d.buf.rect(tx, ty - 2, 1, 3, base(d, 'steel'));
  },
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
    // Overhead on the wind-up; otherwise carried upright so it stays inside the frame
    if (raise > 0.8) return [hx - px(len * 0.3), hy - len];
    return [hx + 1, hy - len];
  }
  if (raise > 0.8) return [hx, hy - len - 2];
  if (raise > 0) return [hx + (facing === 'back' ? -px(len * 0.5) : px(len * 0.5)), hy + px(len * 0.6)];
  return [hx, hy - len];
}

function blade(d: Doll, hx: number, hy: number, raise: number, facing: Facing, len: number, width: number, steel: string, grip: string): void {
  const s = base(d, steel);
  const g = base(d, grip);
  // Blades swing forward and down on the walk and the follow-through
  const [tx, ty] = facing === 'side' && raise > 0 && raise <= 0.8 ? [hx + px(len * 0.6), hy + px(len * 0.5)] : poleTip(d, hx, hy, raise, facing, len);
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

function sheet(pal: Palette, H: number, W: number, outline: boolean, materials: Record<string, number>, look: Look, weapon: WeaponDrawer | null, offhand: OffhandLook | null, extra?: (d: Doll, facing: Facing, frame: number) => void, speed = 1): CharacterSheet {
  const top = look.wizardHat ? Math.round(H * 0.32) : 0;
  const make = (facing: Facing, poses: Pose[]) =>
    poses.map((p, i) => {
      const d = doll(H, W, pal, outline, materials, top);
      if (facing === 'side') sideBody(d, pal, look, p, weapon, offhand);
      else frontBody(d, pal, look, p, weapon, offhand, facing === 'back');
      extra?.(d, facing, i);
      return finish(d, hex(pal.outline));
    });
  const set = (facing: Facing): AnimSet => ({
    idle: anim(make(facing, POSES.idle), W, H + top, 0.5),
    walk: anim(make(facing, POSES.walk), W, H + top, 0.12 / speed),
    attack: anim(make(facing, POSES.attack), W, H + top, 0.08),
  });
  return { side: set('side'), front: set('front'), back: set('back'), height: H + top };
}

export interface HeroLook {
  classId: ClassId;
  pledgeId: string | null;
  weapon: WeaponType | null;
  /** The shield or offhand in the shield slot. */
  offhand: OffhandLook | null;
}

export function heroLookKey(look: HeroLook): string {
  return `${look.classId}:${look.pledgeId ?? ''}:${look.weapon ?? ''}:${look.offhand ?? ''}`;
}

function darken(hex6: number, k: number): number {
  const r = ((hex6 >> 16) & 255) * k;
  const g = ((hex6 >> 8) & 255) * k;
  const b = (hex6 & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** A hero: class silhouette, pledge colour on the cloth and trim, the equipped weapon and shield or offhand. */
export function heroSheet(look: HeroLook, pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const H = size === 'large' ? 44 : 22;
  const W = Math.round(H * 0.7);
  const pledge = look.pledgeId ? PLEDGES[look.pledgeId] : null;
  // A twin class dresses as its kin
  const kin = kinOf(look.classId);
  // The unsworn sorcerer wears the producer's witch colours: a maroon robe, orange trim, a darker hat
  const bright = pledge?.color ?? (kin === 'knight' ? 0x3858c8 : kin === 'sorcerer' ? 0x5a2846 : 0x4a6a3a);
  const cloth = pledge ? (pledge.cloth ?? darken(pledge.color, 0.55)) : bright;
  const materials = {
    skin: kin === 'sorcerer' ? 0xf0c0a8 : pal.skin,
    cloth,
    trim: pledge?.armor?.trim ?? (pledge ? pledge.color : kin === 'sorcerer' ? 0xe8923a : pal.heroTrim),
    // A rogue's leathers and a knight's plate take the pledge's colours once sworn
    leather: kin === 'rogue' && pledge?.armor ? pledge.armor.plate : pal.leather,
    leatherDark: kin === 'rogue' && pledge?.armor ? pledge.armor.dark : darken(pal.leather, 0.8),
    steel: kin === 'knight' && pledge?.armor ? pledge.armor.plate : pal.steel,
    wood: pal.wood,
    bone: pal.bone,
    cape: kin === 'knight' && pledge?.armor ? pledge.armor.dark : kin === 'knight' ? 0x5a6070 : cloth,
    steelDark: kin === 'knight' && pledge?.armor ? pledge.armor.dark : 0x5a6070,
    hood: kin === 'sorcerer' ? darken(cloth, 0.7) : kin === 'rogue' && pledge?.armor ? pledge.armor.dark : pal.leather,
  };
  // The knight is plate from head to foot, grey all round, with only the belt in the pledge colour
  const heroLook: Look =
    kin === 'knight'
      ? { skin: 'skin', body: 'steel', head: 'steel', legs: 'steelDark', arms: 'steel', trim: 'trim', belt: 'steelDark', helm: true, cape: 'cape' }
      : kin === 'sorcerer'
        ? { skin: 'skin', body: 'cloth', head: 'hood', legs: 'cloth', arms: 'cloth', trim: 'trim', wizardHat: true, robe: true, robeFold: 'trim' }
        : { skin: 'skin', body: 'leather', head: 'hood', legs: 'leatherDark', arms: 'skin', trim: 'trim', hood: true };
  // Only what is actually equipped is drawn: no weapon means empty hands
  const weapon = look.weapon ? WEAPONS[look.weapon] : null;
  return sheet(pal, H, W, outline, materials, heroLook, weapon, look.offhand);
}

export type MonsterKind = MonsterLook;

/** Every monster look. Humanoids share the body drawer; beasts have their own. */
export function monsterSheet(kind: MonsterKind, pal: Palette, size: SpriteSize, outline: boolean): CharacterSheet {
  const scale = size === 'large' ? 2 : 1;
  switch (kind) {
    case 'wraith': return wraithSheet(pal, scale, outline, pal.wraith, [0x9f, 0xe0, 0xff]);
    case 'frostwraith': return wraithSheet(pal, scale, outline, 0x6aa8c8, [0xe0, 0xf8, 0xff]);
    case 'bat': return batSheet(pal, scale, outline);
    case 'spider': return spiderSheet(pal, scale, outline);
    case 'rat': return ratSheet(pal, scale, outline);
    case 'crawler': return crawlerSheet(pal, scale, outline);
    case 'wisp': return wispSheet(pal, scale, outline);
    default: break;
  }
  const H = (kind === 'golem' ? 34 : kind === 'troll' ? 32 : kind === 'brute' ? 28 : kind === 'ghoul' ? 18 : kind === 'revenant' ? 24 : 22) * scale;
  const W = Math.round(H * (kind === 'brute' || kind === 'troll' ? 0.9 : kind === 'golem' ? 0.95 : 0.7));
  const materials = {
    skin: pal.ghoul, dark: pal.ghoulDark, bone: pal.bone, boneDark: 0x9a9078, brute: pal.brute, bruteDark: pal.bruteDark,
    leather: pal.leather, steel: pal.steel, wood: pal.wood, troll: 0x5a7a4a, trollDark: 0x3a5230, stone: 0x6a7a90, stoneDark: 0x4a5670,
    robe: 0x3a2a5a, robeDark: 0x2a1e42, pale: 0xc8c0b8, darkSteel: 0x5a6070,
  };
  let look: Look;
  let weapon: WeaponDrawer | null = null;
  let speed = 1;
  switch (kind) {
    case 'ghoul':
      look = { skin: 'skin', body: 'skin', head: 'skin', legs: 'dark', belt: 'dark', eyes: hex(pal.eyeGlow), claws: true, hunch: 1.5 };
      speed = 1.2;
      break;
    case 'skeleton':
      look = { skin: 'bone', body: 'bone', head: 'bone', legs: 'boneDark', belt: 'boneDark', eyes: [0x40, 0xff, 0x90], ribs: true };
      break;
    case 'archer':
      look = { skin: 'bone', body: 'bone', head: 'leather', legs: 'boneDark', belt: 'leather', eyes: [0x40, 0xff, 0x90], ribs: true, hood: true };
      weapon = WEAPONS.bow;
      break;
    case 'bone_archer':
      look = { skin: 'bone', body: 'bone', head: 'leather', legs: 'boneDark', belt: 'leather', eyes: [0xff, 0x30, 0x30], ribs: true, hood: true };
      weapon = WEAPONS.bow;
      break;
    case 'brute':
      look = { skin: 'brute', body: 'brute', head: 'bruteDark', legs: 'bruteDark', trim: 'leather', belt: 'leather', eyes: [0xff, 0x70, 0x20], horns: true, stout: true };
      speed = 0.65;
      break;
    case 'troll':
      look = { skin: 'troll', body: 'troll', head: 'trollDark', legs: 'trollDark', belt: 'leather', eyes: [0xff, 0xe0, 0x40], claws: true, hunch: 2, stout: true };
      speed = 0.7;
      break;
    case 'revenant':
      look = { skin: 'darkSteel', body: 'darkSteel', head: 'darkSteel', legs: 'darkSteel', arms: 'steel', trim: 'boneDark', belt: 'boneDark', helm: true, cape: 'robeDark', eyes: [0x7f, 0xd8, 0xff] };
      weapon = WEAPONS.sword;
      break;
    case 'golem':
      look = { skin: 'stone', body: 'stone', head: 'stoneDark', legs: 'stoneDark', arms: 'stone', belt: 'stoneDark', eyes: [0x7f, 0xd8, 0xff], stout: true };
      speed = 0.55;
      break;
    case 'necromancer':
      look = { skin: 'pale', body: 'robe', head: 'robeDark', legs: 'robeDark', arms: 'robe', trim: 'boneDark', hood: true, robe: true, robeFold: 'robeDark', eyes: [0x66, 0xe0, 0x70] };
      weapon = WEAPONS.staff;
      break;
    default:
      look = { skin: 'skin', body: 'skin', head: 'skin', legs: 'dark' };
  }
  return sheet(pal, H, W, outline, materials, look, weapon, null, undefined, speed);
}

function wraithSheet(pal: Palette, scale: number, outline: boolean, cloth: number, eyes: Rgb): CharacterSheet {
  const H = 24 * scale;
  const W = 14 * scale;
  const materials = { cloth, dark: pal.outline };
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
        d.buf.set(ex - 1, 1 + px(H * 0.2) + bob, eyes);
        d.buf.set(ex + 1, 1 + px(H * 0.2) + bob, eyes);
      } else d.buf.set(ex + 1, 1 + px(H * 0.2) + bob, eyes);
    }
    return finish(d, hex(pal.outline));
  };
  const set = (facing: Facing): AnimSet => {
    const idle = [frame(0, 0, facing), frame(1, 1, facing), frame(0, 2, facing), frame(-1, 3, facing)];
    return { idle: anim(idle, W, H, 0.2), walk: anim(idle, W, H, 0.15), attack: anim([frame(-2, 0, facing), frame(-2, 1, facing)], W, H, 0.12) };
  };
  return { side: set('side'), front: set('front'), back: set('back'), height: H };
}

// ---------------------------------------------------------------- beasts

/** Beasts are drawn from the side only; the same frames serve every facing. */
function beastSheet(W: number, H: number, frames: { idle: HTMLCanvasElement[]; walk: HTMLCanvasElement[]; attack: HTMLCanvasElement[] }, times: [number, number, number]): CharacterSheet {
  const set: AnimSet = { idle: anim(frames.idle, W, H, times[0]), walk: anim(frames.walk, W, H, times[1]), attack: anim(frames.attack, W, H, times[2]) };
  return { side: set, front: set, back: set, height: H };
}

/** A bat: round body, ears, two wings that beat. */
function batSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 18 * scale;
  const H = 12 * scale;
  const materials = { fur: 0x4a3a5a, wing: 0x3a2a48 };
  const frame = (beat: number) => {
    const d = doll(H, W, pal, outline, materials);
    const fur = base(d, 'fur');
    const wing = base(d, 'wing');
    const cx = 2 + W / 2;
    const cy = 1 + H * 0.6;
    // Wings: a fan of lines from the shoulder to a tip that rises and falls
    for (const side of [-1, 1]) {
      const tipX = cx + side * px(W * 0.45);
      const tipY = cy - px(H * 0.45) + beat * px(H * 0.35);
      for (let k = 0; k < 3; k++) {
        const ex = cx + side * px(W * (0.2 + k * 0.12));
        const ey = tipY + (k + 1) * px(H * 0.12);
        d.buf.line(px(cx + side * 2), px(cy - 1), ex, ey, wing);
      }
      d.buf.line(px(cx + side * 2), px(cy - 1), tipX, tipY, wing);
      d.buf.line(tipX, tipY, cx + side * px(W * 0.2), tipY + px(H * 0.36), wing);
    }
    d.buf.ellipse(cx, cy, px(W * 0.14), px(H * 0.3), fur);
    d.buf.set(px(cx - 2), px(cy - H * 0.35), fur);
    d.buf.set(px(cx + 1), px(cy - H * 0.35), fur);
    d.buf.set(px(cx - 1), px(cy - H * 0.15), [0xff, 0x40, 0x40]);
    d.buf.set(px(cx + 1), px(cy - H * 0.15), [0xff, 0x40, 0x40]);
    return finish(d, hex(pal.outline));
  };
  const flap = [frame(0), frame(0.5), frame(1), frame(0.5)];
  return beastSheet(W, H, { idle: flap, walk: flap, attack: [frame(1), frame(0)] }, [0.08, 0.07, 0.08]);
}

/** A spider: fat abdomen, small head, four legs a side that scuttle. */
function spiderSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 20 * scale;
  const H = 11 * scale;
  const materials = { body: 0x3a3a40, leg: 0x2a2a30, mark: 0x8a3a3a };
  const frame = (step: number, lunge: number) => {
    const d = doll(H, W, pal, outline, materials);
    const body = base(d, 'body');
    const leg = base(d, 'leg');
    const cx = 2 + W * 0.45;
    const cy = 1 + H * 0.55;
    for (let k = 0; k < 4; k++) {
      const spread = (k - 1.5) * px(W * 0.14);
      const lift = (k + step) % 2 ? 0 : 1;
      for (const side of [-1, 1]) {
        const kneeX = px(cx + spread + side * px(W * 0.18));
        const kneeY = px(cy - H * 0.35 - lift);
        d.buf.line(px(cx + spread * 0.5), px(cy), kneeX, kneeY, leg);
        d.buf.line(kneeX, kneeY, px(kneeX + side * px(W * 0.08)), 1 + H - 1 - lift, leg);
      }
    }
    d.buf.ellipse(cx - px(W * 0.12), cy, px(W * 0.24), px(H * 0.32), body);
    d.buf.ellipse(cx + px(W * 0.2) + lunge, cy + 1, px(W * 0.12), px(H * 0.22), body);
    d.buf.set(px(cx - W * 0.12), px(cy - 1), base(d, 'mark'));
    d.buf.set(px(cx + W * 0.28 + lunge), px(cy), [0xff, 0x40, 0x40]);
    d.buf.set(px(cx + W * 0.28 + lunge), px(cy + 1), [0xff, 0x40, 0x40]);
    return finish(d, hex(pal.outline));
  };
  return beastSheet(W, H, { idle: [frame(0, 0), frame(1, 0)], walk: [frame(0, 0), frame(1, 0)], attack: [frame(0, 1), frame(1, 2), frame(0, 1)] }, [0.3, 0.08, 0.08]);
}

/** A rat: long body, pointed head, a curling tail. */
/** The dev-menu pet: a small red crab, legs scuttling on alternate frames, claws out front. */
export function crabSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 14 * scale;
  const H = 8 * scale;
  const materials = { shell: 0xc84a2a, dark: 0x8a2e1a, claw: 0xe06a3a };
  const frame = (step: number) => {
    const d = doll(H, W, pal, outline, materials);
    const shell = base(d, 'shell');
    const dark = base(d, 'dark');
    const claw = base(d, 'claw');
    const cx = 2 + W * 0.5;
    const cy = 1 + H * 0.55;
    // Legs: three a side, the front and back pairs lifting on alternate steps
    for (let k = 0; k < 3; k++) {
      const lift = (k % 2 === 0 ? step : 1 - step) * px(H * 0.2);
      for (const side of [-1, 1]) {
        const lx = px(cx + side * W * (0.22 + k * 0.1));
        d.buf.line(px(cx + side * W * 0.18), px(cy), lx, px(cy + H * 0.35) - lift, dark);
      }
    }
    d.buf.ellipse(cx, cy, px(W * 0.28), px(H * 0.3), shell);
    d.buf.rect(px(cx - W * 0.12), px(cy - H * 0.3), px(W * 0.24), 1, dark);
    // Claws out in front, one open on each step
    d.buf.rect(px(cx + W * 0.28), px(cy - H * 0.15), px(W * 0.14), 2, claw);
    d.buf.rect(px(cx + W * 0.36), px(cy - H * 0.15) - (step > 0.5 ? 1 : 0), 2, 1, claw);
    d.buf.rect(px(cx - W * 0.42), px(cy - H * 0.15), px(W * 0.14), 2, claw);
    // Eyes on stalks
    d.buf.set(px(cx - 1), px(cy - H * 0.55), dark);
    d.buf.set(px(cx + 1), px(cy - H * 0.55), dark);
    d.buf.set(px(cx - 1), px(cy - H * 0.55) - 1, [0xf0, 0xf0, 0xf0]);
    d.buf.set(px(cx + 1), px(cy - H * 0.55) - 1, [0xf0, 0xf0, 0xf0]);
    return finish(d, hex(pal.outline));
  };
  const idle = [frame(0.5)];
  const walk = [frame(0), frame(1)];
  return beastSheet(W, H, { idle, walk, attack: walk }, [0.4, 0.09, 0.1]);
}

function ratSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 16 * scale;
  const H = 8 * scale;
  const materials = { fur: 0x6a5a4a, dark: 0x4a3a2a, tail: 0x8a6a5a };
  const frame = (step: number) => {
    const d = doll(H, W, pal, outline, materials);
    const fur = base(d, 'fur');
    const cx = 2 + W * 0.5;
    const cy = 1 + H * 0.55;
    d.buf.ellipse(cx, cy, px(W * 0.26), px(H * 0.28), fur);
    d.buf.ellipse(cx + px(W * 0.32), cy + 1, px(W * 0.14), px(H * 0.2), fur);
    d.buf.set(px(cx + W * 0.28), px(cy - H * 0.3), base(d, 'dark'));
    d.buf.set(px(cx + W * 0.44), px(cy), [0xff, 0x40, 0x40]);
    // Tail
    for (let i = 0; i < px(W * 0.3); i++) d.buf.set(px(cx - W * 0.26) - i, px(cy + Math.sin(i * 0.6 + step) * 1.2), base(d, 'tail'));
    // Legs
    for (const ox of [-px(W * 0.14), px(W * 0.14)]) d.buf.rect(px(cx + ox + step), px(cy + H * 0.2), 1, px(H * 0.3), base(d, 'dark'));
    return finish(d, hex(pal.outline));
  };
  return beastSheet(W, H, { idle: [frame(0), frame(0)], walk: [frame(0), frame(1), frame(0), frame(-1)], attack: [frame(1), frame(-1)] }, [0.4, 0.06, 0.08]);
}

/** A bog crawler: three fat segments, six legs and mandibles. */
function crawlerSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 26 * scale;
  const H = 13 * scale;
  const materials = { shell: 0x4a5a3a, dark: 0x3a4a2a, leg: 0x2e3a22, under: 0x6a7a4a };
  const frame = (step: number, bite: number) => {
    const d = doll(H, W, pal, outline, materials);
    const shell = base(d, 'shell');
    const cy = 1 + H * 0.55;
    for (let seg = 0; seg < 3; seg++) {
      const sx = 2 + W * (0.2 + seg * 0.26);
      for (const side of [-1, 1]) {
        const lift = (seg + step) % 2 ? 1 : 0;
        d.buf.line(px(sx), px(cy), px(sx + side * 2), px(cy + H * 0.3 - lift), base(d, 'leg'));
        d.buf.line(px(sx + side * 2), px(cy + H * 0.3 - lift), px(sx + side * 3), 1 + H - 1 - lift, base(d, 'leg'));
      }
      d.buf.ellipse(sx, cy, px(W * 0.14), px(H * 0.3), seg === 2 ? base(d, 'dark') : shell);
      d.buf.rect(px(sx - W * 0.08), px(cy + H * 0.1), px(W * 0.16), 1, base(d, 'under'));
    }
    const hx = 2 + W * 0.78;
    d.buf.line(px(hx), px(cy - 1), px(hx + 3 + bite), px(cy - 3), base(d, 'dark'));
    d.buf.line(px(hx), px(cy + 1), px(hx + 3 + bite), px(cy + 3), base(d, 'dark'));
    d.buf.set(px(hx), px(cy - 2), [0xe0, 0xff, 0x60]);
    return finish(d, hex(pal.outline));
  };
  return beastSheet(W, H, { idle: [frame(0, 0), frame(0, 0)], walk: [frame(0, 0), frame(1, 0)], attack: [frame(0, 1), frame(1, -1), frame(0, 1)] }, [0.4, 0.12, 0.1]);
}

/** A wisp: a glowing orb with a flickering halo and a wisp of trail. */
function wispSheet(pal: Palette, scale: number, outline: boolean): CharacterSheet {
  const W = 12 * scale;
  const H = 12 * scale;
  const glow = ramp(0x8fffc0, pal.contrast);
  const frame = (pulse: number) => {
    const d = doll(H, W, pal, false, { glow: 0x8fffc0 });
    const cx = 2 + W / 2;
    const cy = 1 + H / 2;
    d.buf.ellipse(cx, cy, px(W * 0.3 + pulse), px(H * 0.3 + pulse), glow[1]);
    d.buf.ellipse(cx, cy, px(W * 0.15), px(H * 0.15), glow[3]);
    for (let i = 0; i < 3; i++) d.buf.set(px(cx - W * 0.35 - i + pulse), px(cy + H * 0.2 + i), glow[0]);
    d.buf.set(px(cx + W * 0.2 * pulse), px(cy - H * 0.4), glow[2]);
    void outline;
    return d.buf.toCanvas();
  };
  const flicker = [frame(0), frame(1), frame(0), frame(-1)];
  return beastSheet(W, H, { idle: flicker, walk: flicker, attack: [frame(2), frame(1)] }, [0.12, 0.12, 0.1]);
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
