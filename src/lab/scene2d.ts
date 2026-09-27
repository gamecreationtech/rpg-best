import type { Palette } from '../gen/pixel/palettes';
import { bayer, hex } from '../gen/pixel/pixel';
import type { ClassId } from '../data/classes';
import { heroSheet, monsterSheet, type CharacterSheet, type Facing, type MonsterKind } from '../gen/pixel/characters';
import { effectSprites, isoTiles, propSprites, topTiles, type EffectSprites, type PropSprites, type SpriteAnim, type SpriteSize, type TileSet } from '../gen/pixel/sprites';

export type Projection = 'iso' | 'top';
export type Lighting = 'dither' | 'smooth' | 'off';

export interface SceneConfig {
  palette: Palette;
  projection: Projection;
  size: SpriteSize;
  outline: boolean;
  lighting: Lighting;
  width: number;
  height: number;
  heroClass: ClassId;
}

/** Map cells. */
const FLOOR = 0;
const WALL = 1;
const PILLAR = 2;
const BRAZIER = 3;
const CHEST = 4;

const MAP_W = 18;
const MAP_H = 14;

interface Entity {
  kind: 'hero' | MonsterKind;
  sprites: CharacterSheet;
  x: number;
  y: number;
  faceLeft: boolean;
  facing: Facing;
  anim: 'idle' | 'walk' | 'attack';
  animT: number;
  hp: number;
  flash: number;
  dead: number; // seconds since death, -1 alive
  cooldown: number;
  targetX: number;
  targetY: number;
  wander: number;
  frozen: number;
}

interface Fx {
  type: 'fireball' | 'explosion' | 'frost' | 'bolt';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  tx?: number;
  ty?: number;
}

interface Light {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  r: number;
  g: number;
  b: number;
}

interface DrawItem {
  depth: number;
  draw: () => void;
}

const HERO_SPEED = 3.2;
const LIGHT_LEVELS = 6;
/** How strongly a light's colour tints what it lights. */
const TINT = 0.6;

/**
 * A small 2D diorama rendered at a low resolution with pre-drawn pixel sprites,
 * then scaled up with nearest-neighbour sampling. Supports an isometric (Diablo)
 * projection and a square top-down (16-bit console) projection.
 */
export class Scene2D {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private tiles!: TileSet;
  private props!: PropSprites;
  private fx!: EffectSprites;
  private heroLook!: CharacterSheet;
  private monsterLooks!: Record<MonsterKind, CharacterSheet>;
  private readonly map = new Uint8Array(MAP_W * MAP_H);
  private hero!: Entity;
  private readonly monsters: Entity[] = [];
  private readonly effects: Fx[] = [];
  private readonly lights: Light[] = [];
  private lit!: Float32Array;
  private time = 0;
  private camX = 0;
  private camY = 0;
  private readonly items: DrawItem[] = [];
  readonly stats = { fps: 60, drawn: 0 };
  private fpsAcc = 0;

  constructor(public config: SceneConfig) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d')!;
    this.buildMap();
    this.rebuild(config);
    this.hero = this.makeEntity('hero', MAP_W / 2, MAP_H / 2);
    for (let i = 0; i < 6; i++) this.spawnMonster(i);
  }

  /** Regenerates every sprite for a new look. Entities keep their positions. */
  rebuild(config: SceneConfig): void {
    this.config = config;
    const { palette: pal, size, outline, width, height } = config;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
    this.lit = new Float32Array(width * height);
    const seed = 7;
    this.tiles = config.projection === 'iso' ? isoTiles(pal, size, seed) : topTiles(pal, size, seed);
    this.props = propSprites(pal, size, outline);
    this.fx = effectSprites(pal, size);
    this.heroLook = heroSheet({ classId: config.heroClass, pledgeId: null, weapon: null, shield: null }, pal, size, outline);
    this.monsterLooks = {
      ghoul: monsterSheet('ghoul', pal, size, outline),
      skeleton: monsterSheet('skeleton', pal, size, outline),
      brute: monsterSheet('brute', pal, size, outline),
      wraith: monsterSheet('wraith', pal, size, outline),
    };
    if (this.hero) this.hero.sprites = this.heroLook;
    for (const m of this.monsters) m.sprites = this.monsterLooks[m.kind as MonsterKind];
  }

  private buildMap(): void {
    this.map.fill(FLOOR);
    for (let x = 0; x < MAP_W; x++) {
      this.map[x] = WALL;
      this.map[(MAP_H - 1) * MAP_W + x] = WALL;
    }
    for (let y = 0; y < MAP_H; y++) {
      this.map[y * MAP_W] = WALL;
      this.map[y * MAP_W + MAP_W - 1] = WALL;
    }
    // A short inner wall, four pillars, braziers and a chest
    for (let x = 6; x <= 9; x++) this.map[3 * MAP_W + x] = WALL;
    for (let y = 8; y <= 10; y++) this.map[y * MAP_W + 13] = WALL;
    for (const [x, y] of [
      [4, 5],
      [12, 5],
      [4, 10],
      [12, 10],
    ] as const) this.map[y * MAP_W + x] = PILLAR;
    for (const [x, y] of [
      [3, 3],
      [14, 3],
      [3, 11],
      [14, 11],
      [8, 7],
    ] as const) this.map[y * MAP_W + x] = BRAZIER;
    this.map[2 * MAP_W + 9] = CHEST;
  }

  private cell(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return WALL;
    return this.map[cy * MAP_W + cx]!;
  }

  private walkable(x: number, y: number): boolean {
    return this.cell(x, y) === FLOOR;
  }

  private makeEntity(kind: Entity['kind'], x: number, y: number): Entity {
    const sprites = kind === 'hero' ? this.heroLook : this.monsterLooks[kind];
    return { kind, sprites, x, y, faceLeft: false, facing: 'front', anim: 'idle', animT: Math.random(), hp: 3, flash: 0, dead: -1, cooldown: 0, targetX: x, targetY: y, wander: 0, frozen: 0 };
  }

  private spawnMonster(i: number): void {
    const kinds: MonsterKind[] = ['ghoul', 'skeleton', 'brute', 'wraith', 'ghoul', 'skeleton'];
    const spots = [
      [2, 2],
      [15, 2],
      [2, 12],
      [15, 12],
      [9, 12],
      [15, 7],
    ] as const;
    const [sx, sy] = spots[i % spots.length]!;
    const m = this.makeEntity(kinds[i % kinds.length]!, sx + 0.5, sy + 0.5);
    m.hp = m.kind === 'brute' ? 5 : 3;
    m.wander = Math.random() * 3;
    this.monsters.push(m);
  }

  // ------------------------------------------------------------ input

  /** Walk the hero toward a point given in low-res canvas pixels. */
  walkTo(px: number, py: number): void {
    const [wx, wy] = this.unproject(px + this.camX, py + this.camY);
    this.hero.targetX = wx;
    this.hero.targetY = wy;
  }

  cast(spell: 'fireball' | 'frost' | 'bolt'): void {
    const h = this.hero;
    h.anim = 'attack';
    h.animT = 0;
    if (spell === 'frost') {
      this.effects.push({ type: 'frost', x: h.x, y: h.y, vx: 0, vy: 0, t: 0, life: 0.5 });
      for (const m of this.monsters) if (m.dead < 0 && Math.hypot(m.x - h.x, m.y - h.y) < 3.2) this.hit(m, 2, 2.5);
      return;
    }
    const target = this.nearestMonster(h.x, h.y, 12) ?? { x: h.x + (h.faceLeft ? -4 : 4), y: h.y };
    if (spell === 'bolt') {
      this.effects.push({ type: 'bolt', x: h.x, y: h.y, vx: 0, vy: 0, t: 0, life: 0.25, tx: target.x, ty: target.y });
      if ('hp' in target) this.hit(target as Entity, 3, 0);
      return;
    }
    const dx = target.x - h.x;
    const dy = target.y - h.y;
    const len = Math.hypot(dx, dy) || 1;
    this.face(h, dx, dy);
    this.effects.push({ type: 'fireball', x: h.x, y: h.y, vx: (dx / len) * 7, vy: (dy / len) * 7, t: 0, life: 3 });
  }

  private nearestMonster(x: number, y: number, range: number): Entity | null {
    let best: Entity | null = null;
    let bestD = range;
    for (const m of this.monsters) {
      if (m.dead >= 0) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  private hit(m: Entity, dmg: number, freeze: number): void {
    m.hp -= dmg;
    m.flash = 0.12;
    if (freeze > 0) m.frozen = Math.max(m.frozen, freeze);
    if (m.hp <= 0) m.dead = 0;
  }

  // ------------------------------------------------------------ simulation

  update(dt: number): void {
    this.time += dt;
    this.fpsAcc += (1 / Math.max(dt, 1e-3) - this.fpsAcc) * 0.05;
    this.stats.fps = Math.round(this.fpsAcc);
    const h = this.hero;

    // Hero: walk to target, attack anything in reach
    this.advanceAnim(h, dt);
    if (h.anim !== 'attack') {
      const dx = h.targetX - h.x;
      const dy = h.targetY - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.08) {
        this.moveEntity(h, (dx / d) * HERO_SPEED * dt, (dy / d) * HERO_SPEED * dt);
        h.anim = 'walk';
      } else {
        h.anim = 'idle';
        h.cooldown -= dt;
        const m = this.nearestMonster(h.x, h.y, 1.3);
        if (m && h.cooldown <= 0) {
          h.anim = 'attack';
          h.animT = 0;
          h.cooldown = 0.55;
          this.face(h, m.x - h.x, m.y - h.y);
          this.hit(m, 1, 0);
        }
      }
    }

    // Monsters: shamble toward the hero, swing when close, come back after dying
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]!;
      if (m.flash > 0) m.flash -= dt;
      if (m.dead >= 0) {
        m.dead += dt;
        if (m.dead > 4) {
          this.monsters.splice(i, 1);
          this.spawnMonster(i);
          i--;
        }
        continue;
      }
      this.advanceAnim(m, dt);
      if (m.frozen > 0) {
        m.frozen -= dt;
        m.anim = 'idle';
        continue;
      }
      if (m.anim === 'attack') continue;
      const dx = h.x - m.x;
      const dy = h.y - m.y;
      const d = Math.hypot(dx, dy);
      const speed = m.kind === 'brute' ? 1.1 : m.kind === 'wraith' ? 1.9 : 1.5;
      m.cooldown -= dt;
      if (d < 1.1) {
        m.anim = 'idle';
        if (m.cooldown <= 0) {
          m.anim = 'attack';
          m.animT = 0;
          m.cooldown = 1.4 + Math.random();
        }
        this.face(m, dx, dy);
      } else if (d < 6) {
        this.moveEntity(m, (dx / d) * speed * dt, (dy / d) * speed * dt);
        m.anim = 'walk';
      } else {
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 1 + Math.random() * 2;
          const a = Math.random() * Math.PI * 2;
          m.targetX = Math.cos(a);
          m.targetY = Math.sin(a);
        }
        this.moveEntity(m, m.targetX * speed * 0.5 * dt, m.targetY * speed * 0.5 * dt);
        m.anim = 'walk';
      }
    }

    // Effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i]!;
      f.t += dt;
      if (f.type === 'fireball') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const m = this.nearestMonster(f.x, f.y, 0.6);
        if (m || !this.walkable(f.x, f.y) || f.t > f.life) {
          if (m) this.hit(m, 3, 0);
          for (const o of this.monsters) if (o !== m && o.dead < 0 && Math.hypot(o.x - f.x, o.y - f.y) < 1.5) this.hit(o, 2, 0);
          this.effects.splice(i, 1);
          this.effects.push({ type: 'explosion', x: f.x, y: f.y, vx: 0, vy: 0, t: 0, life: 0.45 });
        }
      } else if (f.t > f.life) this.effects.splice(i, 1);
    }

    // Camera follows the hero, snapped to whole pixels
    const [hx, hy] = this.project(h.x, h.y);
    this.camX = Math.round(hx - this.canvas.width / 2);
    this.camY = Math.round(hy - this.canvas.height / 2 + this.heroLook.height * 0.3);
  }

  private advanceAnim(e: Entity, dt: number): void {
    const a = e.sprites[e.facing][e.anim];
    e.animT += dt;
    if (e.anim === 'attack' && e.animT >= a.frames.length * a.frameTime) {
      e.anim = 'idle';
      e.animT = 0;
    }
  }

  private moveEntity(e: Entity, dx: number, dy: number): void {
    const r = 0.3;
    if (this.walkable(e.x + dx + Math.sign(dx) * r, e.y)) e.x += dx;
    if (this.walkable(e.x, e.y + dy + Math.sign(dy) * r)) e.y += dy;
    // Keep monsters from stacking on one spot
    for (const o of this.monsters) {
      if (o === e || o.dead >= 0) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d > 0 && d < 0.6) {
        e.x += (ox / d) * (0.6 - d) * 0.5;
        e.y += (oy / d) * (0.6 - d) * 0.5;
      }
    }
    this.face(e, dx, dy);
  }

  // ------------------------------------------------------------ projection

  private project(x: number, y: number): [number, number] {
    const { tileW, tileH } = this.tiles;
    if (this.config.projection === 'iso') return [(x - y) * (tileW / 2), (x + y) * (tileH / 2)];
    return [x * tileW, y * tileH];
  }

  private unproject(sx: number, sy: number): [number, number] {
    const { tileW, tileH } = this.tiles;
    if (this.config.projection === 'iso') {
      const a = sx / (tileW / 2);
      const b = sy / (tileH / 2);
      return [(a + b) / 2, (b - a) / 2];
    }
    return [sx / tileW, sy / tileH];
  }

  /** Horizontal screen component of a world direction, for choosing the facing. */
  private screenDx(dx: number, dy: number): number {
    return this.config.projection === 'iso' ? dx - dy : dx;
  }

  /** Picks side, front or back from a world direction. */
  private face(e: Entity, dx: number, dy: number): void {
    const sdx = this.screenDx(dx, dy);
    const sdy = this.config.projection === 'iso' ? (dx + dy) / 2 : dy;
    if (Math.abs(sdx) < 1e-4 && Math.abs(sdy) < 1e-4) return;
    const a = Math.atan2(sdy, sdx);
    if (a > Math.PI * 0.25 && a < Math.PI * 0.75) e.facing = 'front';
    else if (a < -Math.PI * 0.25 && a > -Math.PI * 0.75) e.facing = 'back';
    else {
      e.facing = 'side';
      e.faceLeft = sdx < 0;
    }
  }

  private depth(x: number, y: number): number {
    return this.config.projection === 'iso' ? x + y : y;
  }

  // ------------------------------------------------------------ rendering

  render(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const { tileW, tileH, wallH } = this.tiles;
    const iso = this.config.projection === 'iso';
    ctx.fillStyle = `#${this.config.palette.background.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    this.items.length = 0;
    this.lights.length = 0;
    let drawn = 0;

    // Floor first: every tile that touches the screen
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const [sx, sy] = this.project(x + 0.5, y + 0.5);
        const px = Math.round(sx - this.camX - tileW / 2);
        const py = Math.round(sy - this.camY - tileH / 2);
        if (px + tileW < 0 || py + tileH < 0 || px > W || py > H) continue;
        const c = this.map[y * MAP_W + x]!;
        if (c !== WALL) {
          ctx.drawImage(this.tiles.floor[(x * 7 + y * 13) % this.tiles.floor.length]!, px, py);
          drawn++;
        }
        if (c === WALL) {
          this.items.push({ depth: this.depth(x + 0.5, y + 0.5), draw: () => ctx.drawImage(this.tiles.wall, px, py - wallH) });
        } else if (c === PILLAR) {
          const s = this.props.pillar;
          this.items.push({ depth: this.depth(x + 0.5, y + 0.5), draw: () => ctx.drawImage(s, Math.round(px + tileW / 2 - s.width / 2), Math.round(py + tileH / 2 - s.height + (iso ? 3 : 2))) });
        } else if (c === BRAZIER) {
          const frames = this.props.brazier;
          const s = frames[Math.floor(this.time * 8 + x) % frames.length]!;
          const bx = Math.round(px + tileW / 2);
          const by = Math.round(py + tileH / 2);
          this.items.push({ depth: this.depth(x + 0.5, y + 0.5), draw: () => ctx.drawImage(s, bx - (s.width >> 1), by - s.height + 2) });
          const flicker = 0.9 + 0.1 * Math.sin(this.time * 13 + x * 3 + y);
          this.lights.push({ x: bx, y: by - s.height * 0.6, radius: tileW * 4.6 * flicker, intensity: 1.2, r: 1, g: 0.86, b: 0.68 });
        } else if (c === CHEST) {
          const s = this.props.chest;
          this.items.push({ depth: this.depth(x + 0.5, y + 0.5), draw: () => ctx.drawImage(s, Math.round(px + tileW / 2 - s.width / 2), Math.round(py + tileH / 2 - s.height + 2)) });
        }
      }
    }

    // Characters
    const pushEntity = (e: Entity) => {
      const [sx, sy] = this.project(e.x, e.y);
      const fx = Math.round(sx - this.camX);
      const fy = Math.round(sy - this.camY);
      const anim: SpriteAnim = e.sprites[e.facing][e.anim];
      const flip = e.facing === 'side' && e.faceLeft;
      const frame = anim.frames[Math.floor(e.animT / anim.frameTime) % anim.frames.length]!;
      const flash = e.flash > 0;
      const frozen = e.frozen > 0;
      const dying = e.dead >= 0;
      this.items.push({
        depth: this.depth(e.x, e.y),
        draw: () => {
          const sh = this.fx.shadow;
          if (!dying) ctx.drawImage(sh, fx - (sh.width >> 1), fy - (sh.height >> 1));
          if (dying) {
            // Fall over and sink into the floor
            const k = Math.min(1, e.dead * 3);
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate((flip ? 1 : -1) * k * Math.PI * 0.5);
            ctx.globalAlpha = Math.max(0, 1 - Math.max(0, e.dead - 2.5) / 1.5);
            ctx.scale(flip ? -1 : 1, 1);
            ctx.drawImage(frame, -anim.originX, -anim.originY);
            ctx.restore();
            return;
          }
          if (flash || frozen) {
            this.drawTinted(frame, fx, fy, anim, flip, flash ? '#ffffff' : '#9fe0ff', flash ? 1 : 0.55);
          } else {
            this.drawSprite(frame, fx, fy, anim, flip);
          }
        },
      });
      drawn++;
    };
    pushEntity(this.hero);
    for (const m of this.monsters) pushEntity(m);
    const [hsx, hsy] = this.project(this.hero.x, this.hero.y);
    this.lights.push({ x: hsx - this.camX, y: hsy - this.camY - this.heroLook.height * 0.5, radius: tileW * 3.4, intensity: 0.9, r: 1, g: 0.9, b: 0.75 });

    // Spell effects
    for (const f of this.effects) {
      const [sx, sy] = this.project(f.x, f.y);
      const px = Math.round(sx - this.camX);
      const py = Math.round(sy - this.camY);
      if (f.type === 'fireball') {
        const frames = this.fx.fireball;
        const s = frames[Math.floor(f.t * 16) % frames.length]!;
        const [vx, vy] = this.project(f.vx, f.vy);
        const ang = Math.atan2(vy, vx);
        this.items.push({
          depth: this.depth(f.x, f.y) + 0.01,
          draw: () => {
            ctx.save();
            ctx.translate(px, py - this.heroLook.height * 0.45);
            ctx.rotate(ang);
            ctx.drawImage(s, -s.width + 4, -(s.height >> 1));
            ctx.restore();
          },
        });
        this.lights.push({ x: px, y: py - this.heroLook.height * 0.45, radius: tileW * 2.2, intensity: 1.2, r: 1, g: 0.6, b: 0.25 });
      } else if (f.type === 'explosion') {
        const frames = this.fx.explosion;
        const s = frames[Math.min(frames.length - 1, Math.floor((f.t / f.life) * frames.length))]!;
        this.items.push({ depth: this.depth(f.x, f.y) + 0.02, draw: () => ctx.drawImage(s, px - (s.width >> 1), py - (s.height >> 1) - this.heroLook.height * 0.2) });
        const k = 1 - f.t / f.life;
        this.lights.push({ x: px, y: py, radius: tileW * (3 + 3 * (1 - k)), intensity: 2.2 * k, r: 1, g: 0.65, b: 0.3 });
      } else if (f.type === 'frost') {
        const frames = this.fx.frostRing;
        const s = frames[Math.min(frames.length - 1, Math.floor((f.t / f.life) * frames.length))]!;
        // The ring lies on the floor: flat in isometric, round from above
        this.items.push({
          depth: this.depth(f.x, f.y) - 0.5,
          draw: () => {
            ctx.save();
            ctx.translate(px, py);
            if (!iso) ctx.scale(1, 2);
            ctx.globalAlpha = 1 - (f.t / f.life) * 0.6;
            ctx.drawImage(s, -(s.width >> 1), -(s.height >> 1));
            ctx.restore();
          },
        });
        this.lights.push({ x: px, y: py, radius: tileW * 4, intensity: 1.2 * (1 - f.t / f.life), r: 0.6, g: 0.85, b: 1 });
      } else if (f.type === 'bolt') {
        const [tx, ty] = this.project(f.tx!, f.ty!);
        const ex = Math.round(tx - this.camX);
        const ey = Math.round(ty - this.camY);
        const lift = this.heroLook.height * 0.5;
        this.items.push({
          depth: this.depth(f.x, f.y) + 0.03,
          draw: () => this.drawBolt(px, py - lift, ex, ey - lift * 0.6, f.t),
        });
        this.lights.push({ x: ex, y: ey, radius: tileW * 3, intensity: 2 * (1 - f.t / f.life), r: 0.7, g: 0.8, b: 1 });
      }
    }

    // Painter's order: back to front
    this.items.sort((a, b) => a.depth - b.depth);
    for (const it of this.items) it.draw();
    drawn += this.items.length;
    this.stats.drawn = drawn;

    if (this.config.lighting !== 'off' && this.config.palette.darkness > 0) this.applyLighting();
  }

  private drawSprite(frame: HTMLCanvasElement, fx: number, fy: number, anim: SpriteAnim, flip: boolean): void {
    const ctx = this.ctx;
    if (!flip) {
      ctx.drawImage(frame, fx - anim.originX, fy - anim.originY);
      return;
    }
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(-1, 1);
    ctx.drawImage(frame, -anim.originX, -anim.originY);
    ctx.restore();
  }

  /** Draws a sprite with a flat colour blended over its opaque pixels (hit flash, freeze tint). */
  private drawTinted(frame: HTMLCanvasElement, fx: number, fy: number, anim: SpriteAnim, flip: boolean, color: string, amount: number): void {
    const s = this.scratch;
    if (s.width !== frame.width || s.height !== frame.height) {
      s.width = frame.width;
      s.height = frame.height;
    }
    const c = this.sctx;
    c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, s.width, s.height);
    c.drawImage(frame, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = amount;
    c.fillStyle = color;
    c.fillRect(0, 0, s.width, s.height);
    c.globalAlpha = 1;
    this.drawSprite(s, fx, fy, anim, flip);
  }

  /** A jagged lightning line between two points, redrawn every frame. */
  private drawBolt(x0: number, y0: number, x1: number, y1: number, t: number): void {
    const ctx = this.ctx;
    const ice = hex(this.config.palette.ice);
    const core = hex(this.config.palette.fireCore);
    const segs = 7;
    const seed = Math.floor(t * 30);
    ctx.fillStyle = `rgb(${ice[0]},${ice[1]},${ice[2]})`;
    let px = x0;
    let py = y0;
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      const jitter = i === segs ? 0 : 6;
      const nx = Math.round(x0 + (x1 - x0) * k + (Math.sin(seed * 7.3 + i * 5.1) * jitter));
      const ny = Math.round(y0 + (y1 - y0) * k + (Math.cos(seed * 3.7 + i * 2.9) * jitter));
      this.pixelLine(px, py, nx, ny, `rgb(${ice[0]},${ice[1]},${ice[2]})`, 2);
      this.pixelLine(px, py, nx, ny, `rgb(${core[0]},${core[1]},${core[2]})`, 1);
      px = nx;
      py = ny;
    }
  }

  private pixelLine(x0: number, y0: number, x1: number, y1: number, style: string, size: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = style;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4096; n++) {
      ctx.fillRect(x0, y0, size, size);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Darkens the frame away from light sources. "dither" quantizes the light into
   * a few bands and breaks the edges with a Bayer pattern, the classic look;
   * "smooth" is the same falloff without banding.
   */
  private applyLighting(): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const lit = this.lit;
    lit.fill(0);
    const iso = this.config.projection === 'iso';
    const stretch = iso ? 2 : 1;
    // Per-channel tint accumulates alongside the intensity
    const img = this.ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const tintR = new Float32Array(W * H);
    const tintG = new Float32Array(W * H);
    const tintB = new Float32Array(W * H);
    for (const l of this.lights) {
      const ry = l.radius / stretch;
      const x0 = Math.max(0, Math.floor(l.x - l.radius));
      const x1 = Math.min(W - 1, Math.ceil(l.x + l.radius));
      const y0 = Math.max(0, Math.floor(l.y - ry));
      const y1 = Math.min(H - 1, Math.ceil(l.y + ry));
      const inv = 1 / l.radius;
      for (let y = y0; y <= y1; y++) {
        const dy = (y - l.y) * stretch * inv;
        const row = y * W;
        for (let x = x0; x <= x1; x++) {
          const dx = (x - l.x) * inv;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= 1) continue;
          const f = (1 - dist) * (1 - dist) * l.intensity;
          const i = row + x;
          lit[i] = lit[i]! + f;
          tintR[i] = tintR[i]! + f * l.r;
          tintG[i] = tintG[i]! + f * l.g;
          tintB[i] = tintB[i]! + f * l.b;
        }
      }
    }
    const darkness = this.config.palette.darkness;
    const dither = this.config.lighting === 'dither';
    const ambient = 1 - darkness;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const f = lit[i]!;
        const l = Math.min(1, f);
        let b = ambient + (1 - ambient) * l;
        let tr = 1;
        let tg = 1;
        let tb = 1;
        if (f > 0) {
          // Colour of the light, weighted by how much of the pixel it lights
          const k = (l / f) * TINT;
          tr = 1 - l * TINT + tintR[i]! * k;
          tg = 1 - l * TINT + tintG[i]! * k;
          tb = 1 - l * TINT + tintB[i]! * k;
        }
        if (dither) b = Math.floor(b * LIGHT_LEVELS + bayer(x, y)) / LIGHT_LEVELS;
        const j = i * 4;
        d[j] = d[j]! * b * tr;
        d[j + 1] = d[j + 1]! * b * tg;
        d[j + 2] = d[j + 2]! * b * tb;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }
}
