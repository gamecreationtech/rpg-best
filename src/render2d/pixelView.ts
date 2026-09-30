import { DUMMIES } from '../data/dummies';
import { RARITIES } from '../data/items';
import { PX } from '../data/units';
import { PLEDGES } from '../data/pledges';
import { SKILLS, orbiterPlace } from '../data/skills';
import { ELEMENT_COLORS, type Element } from '../data/stats';
import { crabSheet, dummySheet, heroLookKey, heroSheet, monsterSheet, vendorSheet, type CharacterSheet, type Facing, type HeroLook, type MonsterKind, type OffhandLook } from '../gen/pixel/characters';
import { PALETTES, type Palette } from '../gen/pixel/palettes';
import { arcanaProp, bloodFountainProp, decorProp, dropProp, forgeProp, portalProp, projectileProp, rubbleProp, type Prop } from '../gen/pixel/props';
import { zoneById } from '../data/zones';
import { effectSprites, isoTiles, propSprites, type EffectSprites, type PropSprites, type SpriteAnim, type TileSet } from '../gen/pixel/sprites';
import { Tile } from '../sim/map/tilemap';
import type { Drop, Enemy, ProjectileShape, SimEvent, Zone } from '../sim/types';

/** Which shield drawing each shield base gets on the hero. */
const SHIELD_LOOKS: Record<string, OffhandLook> = { wooden_shield: 'wooden', wooden_shield_base: 'wooden', iron_shield: 'iron', tower_shield: 'tower', energy_shield: 'energy' };
import type { World } from '../sim/world';
import { IsoCamera, RING_RX, RING_RY, TILE_H, TILE_W } from './camera';
import { Compositor, type Light } from './compositor';
import { DamageNumbers } from './damageNumbers';
import { DropLabels } from './dropLabels';
import { Effects2D } from './effects2d';
import { INTERACT_INFO, InteractLabels } from './interactLabels';
import { Minimap } from './minimap';
import { Particles2D } from './particles2d';

type AnimName = 'idle' | 'walk' | 'attack';

interface Puppet {
  sheet: CharacterSheet;
  anim: AnimName;
  animT: number;
  facing: Facing;
  faceLeft: boolean;
  flash: number;
  /** Seconds into the death fall, or -1. */
  dying: number;
}

interface Placed {
  prop: Prop;
  x: number;
  z: number;
  /** Keyed to an interactable id so hover can highlight it, or -1. */
  interactId: number;
}

interface StaticLight {
  x: number;
  z: number;
  y: number;
  radius: number;
  intensity: number;
  color: number;
  flicker: boolean;
}

interface Item {
  depth: number;
  draw: () => void;
}

const SIZE = 'small';
const OUTLINE = true;
const DEATH_FALL = 0.35;
/** Rim colour of the targeted monster and its life bar. */
const TARGET_COLOR = '#ffd860';

function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}

function cssOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Draws a World as isometric pixel art: tiles and walls from the map, town
 * stations, the hero and enemies as generated sprite sheets, projectiles, drops,
 * zones and effects into a small frame that the compositor lights and scales up.
 */
export class PixelView {
  readonly view = new IsoCamera();
  readonly numbers: DamageNumbers;
  readonly labels: DropLabels;
  readonly minimap: Minimap;
  readonly interactLabels: InteractLabels;
  readonly particles = new Particles2D(1500);
  readonly effects = new Effects2D();
  /** Interactable under the mouse, set by the game each frame. */
  hoverInteractable = -1;
  /** 1 while a menu covers the game: the frame darkens in dithered bands behind it. */
  dim = 0;
  readonly stats = { drawn: 0 };

  private readonly frame: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private readonly compositor: Compositor;
  private readonly pal: Palette;
  private tiles: TileSet;
  private readonly townTiles: TileSet;
  private readonly zoneTiles = new Map<string, TileSet>();
  private readonly props: PropSprites;
  private readonly fx: EffectSprites;
  private readonly monsters = new Map<MonsterKind, CharacterSheet>();
  private readonly dummies = new Map<string, CharacterSheet>();
  private readonly vendor: CharacterSheet;
  private readonly heroSheets = new Map<string, CharacterSheet>();
  private readonly projectiles = new Map<string, Prop>();
  private readonly drops = new Map<string, Prop>();
  /** Loot-filter check for the labels, bound once so the frame loop allocates nothing. */
  private readonly dropVisible = (d: Drop) => this.world.dropVisible(d);
  private readonly stations: Record<string, Prop>;
  private readonly rubble: Prop[];
  private readonly decor = new Map<string, Prop[]>();
  private readonly puppets = new Map<number, Puppet>();
  private hero: Puppet;
  /** The dev-menu crab. */
  private pet: Puppet | null = null;
  private heroKey = '';
  private areaKey = '';
  private readonly placed: Placed[] = [];
  private readonly staticLights: StaticLight[] = [];
  private readonly lights: Light[] = [];
  private readonly items: Item[] = [];
  /** Life bars to draw this frame: frame x, frame y, fraction, targeted, four numbers each. */
  private readonly bars: number[] = [];
  private beamTarget = -1;
  /** Rocks shown by Rock Solid last frame, so a lost one can shatter. */
  private rockCount = -1;
  private time = 0;
  private lastW = 0;
  private lastH = 0;
  private lastZoom = 0;
  private lastDpr = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, private readonly world: World, private readonly mobile: boolean, onPickDrop: (id: number) => void) {
    this.pal = PALETTES.find((p) => p.id === 'grim')!;
    const pal = this.pal;
    this.frame = document.createElement('canvas');
    this.ctx = this.frame.getContext('2d', { alpha: false, willReadFrequently: false })!;
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d')!;
    this.compositor = new Compositor(canvas);
    this.compositor.background = rgb(pal.background);

    this.townTiles = isoTiles(pal, SIZE, 11);
    this.tiles = this.townTiles;
    this.props = propSprites(pal, SIZE, OUTLINE);
    this.fx = effectSprites(pal, SIZE);
    for (const look of ['ghoul', 'skeleton', 'brute', 'wraith'] as MonsterKind[]) this.monsterSheet(look);
    for (const d of DUMMIES) this.dummies.set(d.id, dummySheet(d.color, pal, SIZE, OUTLINE));
    this.vendor = vendorSheet(pal, SIZE, OUTLINE);
    this.stations = {
      forge: forgeProp(pal, SIZE, OUTLINE),
      bloodfountain: bloodFountainProp(pal, SIZE, OUTLINE),
      arcana: arcanaProp(pal, SIZE, OUTLINE),
      waypoint: portalProp(0xffd060, pal, SIZE, OUTLINE),
      return_portal: portalProp(0x6fa8ff, pal, SIZE, OUTLINE),
      town_portal: portalProp(0xb070ff, pal, SIZE, OUTLINE),
      stash: { frames: [this.props.chest], originX: this.props.chest.width >> 1, originY: this.props.chest.height - 1, frameTime: 1 },
      pillar: { frames: [this.props.pillar], originX: this.props.pillar.width >> 1, originY: this.props.pillar.height - 1, frameTime: 1 },
      brazier: { frames: this.props.brazier, originX: this.props.brazier[0]!.width >> 1, originY: this.props.brazier[0]!.height - 1, frameTime: 0.12 },
    };
    this.rubble = [1, 2, 3, 4].map((s) => rubbleProp(s, pal, SIZE, OUTLINE));

    this.numbers = new DamageNumbers(ui, this.view, 48);
    this.labels = new DropLabels(ui, this.view, onPickDrop);
    this.minimap = new Minimap(ui, world, mobile ? 112 : 200);
    this.interactLabels = new InteractLabels(ui, this.view, mobile);

    this.hero = { sheet: this.heroSheetFor(), anim: 'idle', animT: 0, facing: 'front', faceLeft: false, flash: 0, dying: -1 };
    this.fit();
    this.rebuildArea();
    this.view.snapTo(world.px, world.pz);
  }

  /** A whole-number pixel scale from the settings; 0 lets the screen size decide. */
  zoom = 0;

  private fit(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    if (W === this.lastW && H === this.lastH && this.zoom === this.lastZoom && dpr === this.lastDpr) return;
    this.lastW = W;
    this.lastH = H;
    this.lastZoom = this.zoom;
    this.lastDpr = dpr;
    // Phones aim for fewer pixels across, though a narrow screen still lands on 1x unless the zoom is set
    this.view.fit(W, H, this.mobile ? 400 : 640, this.mobile ? 225 : 360, this.zoom, dpr);
    this.frame.width = this.view.width;
    this.frame.height = this.view.height;
  }

  // ---------------------------------------------------------------- sprites

  private heroLook(): HeroLook {
    const p = this.world.player;
    const weapon = p.equipment.get('weapon')?.weapon?.type ?? null;
    const off = p.equipment.get('shield');
    const offhand = off ? (off.offhand ?? SHIELD_LOOKS[off.baseId] ?? 'iron') : null;
    return { classId: p.classId, pledgeId: p.pledgeId, weapon, offhand };
  }

  private heroSheetFor(): CharacterSheet {
    const look = this.heroLook();
    const key = heroLookKey(look);
    this.heroKey = key;
    let sheet = this.heroSheets.get(key);
    if (!sheet) {
      sheet = heroSheet(look, this.pal, SIZE, OUTLINE);
      this.heroSheets.set(key, sheet);
    }
    return sheet;
  }

  /** Monster sheets are drawn the first time a look appears and kept. */
  private monsterSheet(look: MonsterKind): CharacterSheet {
    let sheet = this.monsters.get(look);
    if (!sheet) {
      sheet = monsterSheet(look, this.pal, SIZE, OUTLINE);
      this.monsters.set(look, sheet);
    }
    return sheet;
  }

  private projectileProp(shape: ProjectileShape, color: number): Prop {
    const key = `${shape}:${color}`;
    let p = this.projectiles.get(key);
    if (!p) {
      p = projectileProp(shape, color, this.pal, SIZE);
      this.projectiles.set(key, p);
    }
    return p;
  }

  private dropProp(color: number | null): Prop {
    const key = String(color);
    let p = this.drops.get(key);
    if (!p) {
      p = dropProp(color, this.pal, SIZE, OUTLINE);
      this.drops.set(key, p);
    }
    return p;
  }

  // ---------------------------------------------------------------- area

  rebuildArea(): void {
    const w = this.world;
    const zone = w.zone;
    const key = w.area + ':' + zone.id + ':' + w.map.cols + ':' + (w.arenaVisited ? 1 : 0);
    if (key === this.areaKey) return;
    this.areaKey = key;
    this.placed.length = 0;
    this.staticLights.length = 0;
    this.labels.clear();
    this.interactLabels.clear();
    if (w.area === 'town') this.tiles = this.townTiles;
    else {
      let tiles = this.zoneTiles.get(zone.id);
      if (!tiles) {
        tiles = isoTiles({ ...this.pal, ...zone.tiles }, SIZE, 23 + zone.level);
        this.zoneTiles.set(zone.id, tiles);
      }
      this.tiles = tiles;
    }
    this.compositor.darkness = w.area === 'town' ? 0.42 : zone.darkness;
    const place = (prop: Prop, x: number, z: number, interactId = -1) => this.placed.push({ prop, x, z, interactId });
    const light = (x: number, z: number, color: number, intensity: number, radius: number, flicker = false, y = 1.2) => this.staticLights.push({ x, z, y, color, intensity, radius, flicker });
    const idOf = (kind: string) => w.interactables.find((i) => i.kind === kind)?.id ?? -1;
    if (w.area === 'town') {
      const t = w.town;
      place(this.stations.stash!, t.stash.x, t.stash.z, idOf('stash'));
      place(this.stations.forge!, t.forge.x, t.forge.z, idOf('forge'));
      place(this.stations.bloodfountain!, t.bloodfountain.x, t.bloodfountain.z, idOf('bloodfountain'));
      place(this.stations.arcana!, t.arcana.x, t.arcana.z, idOf('arcana'));
      place(this.stations.waypoint!, t.waypoint.x, t.waypoint.z, idOf('waypoint'));
      if (w.arenaVisited) place(this.stations.return_portal!, t.returnPortal.x, t.returnPortal.z, idOf('return_portal'));
      light(t.forge.x, t.forge.z, 0xff8a30, 1.3, 3.2, true);
      light(t.bloodfountain.x, t.bloodfountain.z, 0xff3a3a, 1.0, 2.6);
      light(t.arcana.x, t.arcana.z, 0xb066ff, 1.1, 3);
      light(t.waypoint.x, t.waypoint.z, 0xffd060, 1.1, 3);
      if (w.arenaVisited) light(t.returnPortal.x, t.returnPortal.z, 0x6fa8ff, 1.1, 3);
      const brazierSpots: [number, number][] = [[6, 6], [38, 6], [6, 27], [38, 27], [22, 4], [14, 17], [30, 14]];
      for (const [x, z] of brazierSpots) {
        place(this.stations.brazier!, x + 0.5, z + 0.5);
        light(x + 0.5, z + 0.5, 0xff8a3a, 1.2, 4.2, true, 1.0);
      }
      for (let i = 0; i < 10; i++) place(this.stations.pillar!, 3 + ((i * 7) % 38) + 0.5, i % 2 ? 3.5 : 29.5);
      for (let i = 0; i < 6; i++) place(this.stations.pillar!, i % 2 ? 3.5 : 40.5, 6 + i * 4);
      for (let i = 0; i < 24; i++) place(this.rubble[i % this.rubble.length]!, 4 + ((i * 11) % 36) + 0.5, 4 + ((i * 7) % 25) + 0.5);
      // The merchant's stall: two chests beside him
      place(this.stations.stash!, t.vendor.x - 1.2, t.vendor.z + 0.2);
      place(this.stations.stash!, t.vendor.x + 1.3, t.vendor.z + 0.1);
    } else {
      const s = w.arena!.spawn;
      place(this.stations.town_portal!, s.x - 2, s.z, idOf('town_portal'));
      light(s.x - 2, s.z, 0xb070ff, 1.2, 3.4);
      const map = w.map;
      const decor = this.decorFor(zone.id);
      const scatter = Math.round((map.cols * map.rows) / 70);
      for (let i = 0; i < scatter; i++) {
        const c = 3 + ((i * 13 + zone.level) % (map.cols - 6));
        const r = 3 + ((i * 29 + zone.level * 3) % (map.rows - 6));
        if (map.get(c, r) !== Tile.Floor) continue;
        place(decor[i % decor.length]!, c + 0.5, r + 0.5);
      }
      // Fixed lights scattered where the floor is open, in the zone's colour
      const lamps = Math.round((map.cols * map.rows) / 300);
      for (let i = 0; i < lamps; i++) {
        const c = 4 + ((i * 17 + 5) % (map.cols - 8));
        const r = 4 + ((i * 23 + 3) % (map.rows - 8));
        if (map.get(c, r) !== Tile.Floor) continue;
        place(this.stations.brazier!, c + 0.5, r + 0.5);
        light(c + 0.5, r + 0.5, zone.lightColor, 1.1, 4, true, 1.0);
      }
    }
    this.puppets.clear();
    this.view.snapTo(w.px, w.pz);
  }

  /** Scattered decoration per zone: stones, bones, mushrooms or ice, drawn once and kept. */
  private decorFor(zoneId: string): Prop[] {
    let d = this.decor.get(zoneId);
    if (!d) {
      const kind = zoneById(zoneId).decor;
      d = [1, 2, 3, 4].map((seed) => decorProp(kind, seed, this.pal, SIZE, OUTLINE));
      this.decor.set(zoneId, d);
    }
    return d;
  }

  // ---------------------------------------------------------------- sync

  private face(p: Puppet, dx: number, dz: number): void {
    const sdx = dx - dz;
    const sdy = (dx + dz) / 2;
    if (Math.abs(sdx) < 1e-4 && Math.abs(sdy) < 1e-4) return;
    const a = Math.atan2(sdy, sdx);
    if (a > Math.PI * 0.25 && a < Math.PI * 0.75) p.facing = 'front';
    else if (a < -Math.PI * 0.25 && a > -Math.PI * 0.75) p.facing = 'back';
    else {
      p.facing = 'side';
      p.faceLeft = sdx < 0;
    }
  }

  private advance(p: Puppet, dt: number, moving: boolean): void {
    p.animT += dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.anim === 'attack') {
      const a = p.sheet[p.facing].attack;
      if (p.animT >= a.frames.length * a.frameTime) {
        p.anim = 'idle';
        p.animT = 0;
      }
      return;
    }
    const want: AnimName = moving ? 'walk' : 'idle';
    if (p.anim !== want) {
      p.anim = want;
      p.animT = 0;
    }
  }

  private play(p: Puppet, anim: AnimName): void {
    p.anim = anim;
    p.animT = 0;
  }

  private syncHero(dt: number): void {
    const w = this.world;
    const h = this.hero;
    if (heroLookKey(this.heroLook()) !== this.heroKey) h.sheet = this.heroSheetFor();
    this.face(h, Math.sin(w.pyaw), Math.cos(w.pyaw));
    if (w.playerDead) {
      if (h.dying < 0) h.dying = 0;
      h.dying += dt;
    } else {
      h.dying = -1;
      this.advance(h, dt, w.moving);
    }
  }

  private syncEnemies(dt: number): void {
    const w = this.world;
    for (const e of w.enemies) {
      if (!e.alive) {
        this.puppets.delete(e.id);
        continue;
      }
      let p = this.puppets.get(e.id);
      if (!p) {
        const sheet = e.dummy ? this.dummies.get(e.dummy.id)! : this.monsterSheet(e.recipeId as MonsterKind);
        p = { sheet, anim: 'idle', animT: Math.random(), facing: 'front', faceLeft: Math.random() < 0.5, flash: 0, dying: -1 };
        this.puppets.set(e.id, p);
      }
      if (e.dead) {
        if (p.dying < 0) p.dying = 0;
        p.dying += dt;
        continue;
      }
      if (e.moving) this.face(p, e.moveX, e.moveZ);
      else if (!e.dummy) this.face(p, Math.sin(e.yaw), Math.cos(e.yaw));
      this.advance(p, dt, e.moving);
      if (e.status.burn && Math.random() < dt * 12) this.particles.spawn(e.x, 0.6, e.z, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 0.5, 0xff8a2a, { priority: 0.4 });
      if (e.status.bleed && Math.random() < dt * 9) this.particles.spawn(e.x, 0.8, e.z, (Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2, 0.5, 0x9a1818, { gravity: 6, priority: 0.4 });
      if (e.status.poison && Math.random() < dt * 6) this.particles.spawn(e.x, 0.9, e.z, 0, 0.6, 0, 0.7, 0x66e070, { priority: 0.3 });
    }
  }

  // ---------------------------------------------------------------- events

  handleEvent(ev: SimEvent): void {
    const w = this.world;
    const pt = this.particles;
    switch (ev.type) {
      case 'damage': {
        if (ev.kind === 'dodge') this.numbers.show('dodge', ev.x, ev.y, ev.z, 'miss');
        else if (ev.kind === 'block') this.numbers.show('block', ev.x, ev.y, ev.z, 'miss');
        else if (ev.kind === 'absorb') this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, 'absorb');
        else if (ev.target === 'player') this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, 'player');
        else this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, ev.crit ? 'crit' : 'el-' + ev.element, ev.crit ? 1.1 : 0.8);
        break;
      }
      case 'heal':
        this.numbers.show('+' + ev.amount, w.px, 2.2, w.pz, 'heal');
        break;
      case 'enemy_hit': {
        const p = this.puppets.get(ev.id);
        if (p) p.flash = 0.12;
        const e = w.enemies[ev.id];
        if (e) pt.burst(e.x, 0.7, e.z, 5, 1.5, 0x9a1818, 0.4, { gravity: 6, priority: 0.5 });
        break;
      }
      case 'enemy_died': {
        pt.burst(ev.x, 0.6, ev.z, 18, 2.5, 0x8a1818, 0.7, { gravity: 7, up: 1.5, priority: 0.8 });
        pt.burst(ev.x, 0.3, ev.z, 6, 1.2, 0x2a2228, 0.9, { up: 0.6, priority: 0.5, size: 2 });
        break;
      }
      case 'enemy_attack': {
        const p = this.puppets.get(ev.id);
        if (p && p.dying < 0) this.play(p, 'attack');
        break;
      }
      case 'player_attack':
        this.play(this.hero, 'attack');
        break;
      case 'player_hit':
        this.hero.flash = 0.12;
        this.view.kick(0.08);
        break;
      case 'player_died':
        pt.burst(w.px, 0.8, w.pz, 30, 2.5, 0x8a1818, 0.9, { gravity: 7, up: 2 });
        break;
      case 'player_respawn':
        this.hero.dying = -1;
        this.play(this.hero, 'idle');
        this.levelUp(w.px, w.pz);
        break;
      case 'cast': {
        const def = SKILLS[ev.skillId];
        this.play(this.hero, 'attack');
        const color = def && def.pledgeId ? PLEDGES[def.pledgeId]!.color : ELEMENT_COLORS[ev.element];
        this.effects.flash(ev.x + ev.dirX * 0.5, 1.2, ev.z + ev.dirZ * 0.5, color, 1.2, 40, 0.2);
        pt.burst(ev.x + ev.dirX * 0.5, 1.2, ev.z + ev.dirZ * 0.5, 6, 1.5, color, 0.35, { priority: 0.5 });
        break;
      }
      case 'melee_swing':
        if (ev.visual === 'cleave') this.cleave(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc);
        else if (ev.visual === 'void') this.voidSlash(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc);
        else this.effects.slash(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc, ELEMENT_COLORS[ev.element]);
        break;
      case 'melee_impact':
        if (ev.visual === 'overhead') this.smash(ev.x, ev.z, ELEMENT_COLORS[ev.element]);
        else if (ev.visual === 'bloody') this.bloodyHit(ev.x, ev.z);
        else this.holyShield(ev.x, ev.z);
        break;
      case 'aoe':
        this.aoeVisual(ev.visual, ev.x, ev.z, ev.radius, ev.element);
        break;
      case 'projectile_hit': {
        const color = ELEMENT_COLORS[ev.element];
        if (ev.splash > 0) this.explode(ev.x, ev.z, Math.max(0.5, ev.splash / 2.5), ev.element);
        else {
          pt.burst(ev.x, 0.8, ev.z, ev.shape === 'boulder' ? 16 : 8, 2, color, 0.35, { priority: 0.5 });
          this.effects.flash(ev.x, 0.8, ev.z, color, 0.9, 30, 0.15);
        }
        break;
      }
      case 'zone_start': {
        const z = ev.zone;
        if (z.type === 'fire_prison') this.effects.ring(z.x, z.z, 0.3, z.radius, 0xff7a2a, 0.4, 2, 1.5);
        if (z.type === 'sanctuary') this.effects.ring(z.x, z.z, 0.3, z.radius, 0xffe87a, 0.6, 2, 1.2);
        if (z.type === 'wind') this.effects.ring(z.x, z.z, 0.3, z.radius, 0x8fd0ff, 0.5, 1);
        if (z.type === 'poison') this.effects.ring(z.x, z.z, 0.3, z.radius, 0x66e070, 0.5, 1);
        break;
      }
      case 'zone_tick':
        this.iceImpact(ev.x, ev.z);
        break;
      case 'buff_start': {
        if (ev.id === 'rite_of_blood') {
          // The change: a black-red eruption round the hero and a hard red flash
          pt.burst(w.px, 0.2, w.pz, 36, 1.8, 0x1a0a14, 1.0, { up: 3, drag: 1, priority: 0.8, size: 2 });
          pt.burst(w.px, 0.4, w.pz, 20, 2.4, 0xc01828, 0.7, { up: 2, gravity: 4, priority: 0.8, size: 2 });
          this.effects.ring(w.px, w.pz, 0.2, 1.8, 0xff2040, 0.5, 2, 2);
          this.effects.disc(w.px, w.pz, 1.2, 0x2a0410, 1.2, 0.6);
          this.effects.flash(w.px, 1, w.pz, 0xff2030, 3, 90, 0.4);
          this.view.kick(0.15);
          break;
        }
        if (ev.id === 'rock_solid') {
          // Rocks tear out of the ground round the hero
          this.effects.cracks(w.px, w.pz, 22, 0x9a8a70, 0.6, 6);
          pt.burst(w.px, 0.1, w.pz, 20, 1.6, 0x8a7a68, 0.6, { up: 2, gravity: 5, priority: 0.7, size: 2 });
          this.view.kick(0.1);
          break;
        }
        if (ev.id === 'prayer') {
          pt.burst(w.px, 0.2, w.pz, 30, 1.2, 0x8aff8a, 1.2, { up: 2.5, drag: 1, priority: 0.8, size: 2 });
          this.effects.ring(w.px, w.pz, 0.2, 1.6, 0x8aff8a, 0.6, 2, 1.5);
          break;
        }
        pt.burst(w.px, 0.3, w.pz, 24, 1.5, ev.color, 0.8, { up: 2, drag: 1.5, priority: 0.8 });
        this.effects.ring(w.px, w.pz, 0.2, 1.4, ev.color, 0.4, 1, 0.8);
        break;
      }
      case 'leap':
        this.stomp(ev.fromX, ev.fromZ, 0.8, 0x6a6058);
        pt.burst(ev.fromX, 0.2, ev.fromZ, 10, 1.2, 0x8a7a68, 0.6, { up: 2.5, gravity: 4, priority: 0.5, size: 2 });
        break;
      case 'teleport': {
        const color = w.player.pledgeId ? PLEDGES[w.player.pledgeId]!.color : 0x9fd0ff;
        this.puff(ev.fromX, ev.fromZ, color);
        this.puff(ev.toX, ev.toZ, color);
        break;
      }
      case 'beam':
        this.beamTarget = ev.on ? ev.targetId : -1;
        break;
      case 'level_up':
        this.levelUp(w.px, w.pz);
        break;
      case 'pickup':
        if (ev.item) pt.burst(ev.x ?? w.px, 0.6, ev.z ?? w.pz, 8, 1.2, RARITIES[ev.item.rarity].color, 0.5, { up: 1.5, priority: 0.5 });
        // The crab shows what it brought in over its head
        if (ev.by === 'pet' && ev.gold > 0) this.numbers.show(`+${ev.gold}`, ev.x ?? w.px, 0.5, ev.z ?? w.pz, 'gold', 1.1);
        break;
      case 'kick':
        this.view.kick(ev.k);
        break;
      case 'status': {
        const e = w.enemies[ev.id]!;
        if (ev.status === 'frozen') pt.burst(e.x, 0.8, e.z, 12, 1.5, 0x9fe0ff, 0.5, { drag: 2, priority: 0.6 });
        if (ev.status === 'stunned') pt.burst(e.x, 1.8, e.z, 6, 0.8, 0xffe066, 0.5, { priority: 0.5 });
        break;
      }
      case 'zone_end':
      default:
        break;
    }
  }

  private explode(x: number, z: number, radius: number, element: Element): void {
    const color = ELEMENT_COLORS[element];
    const frames = this.fx.explosion;
    const big = frames[frames.length - 1]!;
    this.effects.anim(frames, x, 0.4, z, big.width >> 1, big.height >> 1, 0.4, 'air', { color, intensity: 2.2, radius: 60 * radius });
    this.particles.burst(x, 0.5, z, 20, 3 * radius, color, 0.6, { gravity: 4, up: 2, priority: 0.7 });
    this.effects.ring(x, z, 0.2, radius * 1.4, color, 0.35, 1);
    this.view.kick(0.12 * radius);
  }

  private iceImpact(x: number, z: number): void {
    this.particles.burst(x, 0.3, z, 6, 1.5, 0x9fe0ff, 0.5, { drag: 2, up: 1.5, priority: 0.3 });
  }

  /** How high the hero is off the floor: a leap arcs higher the further it goes. */
  private heroHeight(): number {
    const l = this.world.leap;
    if (!l || !l.arc) return 0;
    const k = Math.min(1, l.t / l.duration);
    const dist = Math.hypot(l.toX - l.fromX, l.toZ - l.fromZ);
    return Math.sin(k * Math.PI) * (1.6 + Math.min(2.6, dist * 0.32));
  }

  /** Boulder Toss: the rock lands. It stays a moment, the ground cracks, waves of dust go out and shards fly. */
  private boulderLand(x: number, z: number, radius: number): void {
    const rock = this.fx.boulder;
    this.effects.sprite(rock, x, 0, z, rock.width >> 1, rock.height - 6, 1.0, 'air');
    this.effects.cracks(x, z, 36, 0x9a8a70, 0.8, 10);
    this.effects.ring(x, z, 0.1, radius * 0.6, 0xfff0d0, 0.18, 3, 1.5);
    this.effects.ring(x, z, 0.3, radius, 0xc8b8a0, 0.45, 3, 1);
    this.effects.ring(x, z, 0.3, radius * 1.2, 0x9a8a70, 0.6, 1, 0, 0.1);
    this.particles.burst(x, 0.3, z, 22, 3.5, 0x6a6058, 0.7, { up: 3, gravity: 8, priority: 0.7, size: 2 });
    this.particles.burst(x, 0.3, z, 10, 2.5, 0x8a7a68, 0.8, { up: 3.5, gravity: 8, priority: 0.6, size: 3 });
    this.particles.burst(x, 0.1, z, 26, 3 * radius, 0xc8b8a0, 0.6, { up: 1.5, gravity: 5, priority: 0.5, size: 2 });
    this.view.kick(0.35);
  }

  /** Rock Solid: six rocks torn from the ground circle the hero; one leaves for each sixth of the shield that breaks. */
  private drawRockSolid(): void {
    const w = this.world;
    const rs = w.buffs.find((b) => b.id === 'rock_solid');
    if (!rs) {
      this.rockCount = -1;
      return;
    }
    const full = (w.derived.maxHp * (rs.mods.shieldPct ?? 100)) / 100;
    const n = rs.shield > 0 ? Math.max(1, Math.ceil((6 * rs.shield) / full)) : 0;
    const age = rs.duration - rs.remaining;
    const rise = Math.min(1, age / 0.35);
    const cam = this.view;
    const ctx = this.ctx;
    const heroY = this.heroHeight();
    const place = (i: number): [number, number, number] => {
      const a = this.time * 1.8 + (i * Math.PI) / 3;
      const r = 0.85 * rise;
      return [w.px + Math.sin(a) * r, heroY + 0.1 + rise * (0.5 + Math.sin(this.time * 2.5 + i * 1.3) * 0.15), w.pz + Math.cos(a) * r];
    };
    if (this.rockCount > n && this.rockCount <= 6) {
      // A rock shatters
      const [x, y, z] = place(this.rockCount - 1);
      this.particles.burst(x, y, z, 10, 1.5, 0x6a6058, 0.5, { gravity: 6, priority: 0.7, size: 2 });
    }
    this.rockCount = n;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = place(i);
      const rock = this.fx.rocks[i % this.fx.rocks.length]!;
      const fx = Math.round(cam.frameX(x, z));
      const fy = Math.round(cam.frameY(x, y, z));
      this.items.push({ depth: cam.depth(x, z), draw: () => ctx.drawImage(rock, fx - (rock.width >> 1), fy - (rock.height >> 1)) });
    }
  }

  /** Prayer's healing: twelve small crosses rising round the hero in turn, brightest halfway up, plus a soft green light. */
  private drawPrayer(): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, 0.7, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.02,
      draw: () => {
        for (let i = 0; i < 12; i++) {
          const phase = (this.time * 0.55 + i * 0.29) % 1;
          const a = i * 2.4 + Math.floor(this.time * 0.55 + i * 0.29) * 1.7;
          const r = 9 + (i % 3) * 3;
          const x = fx + Math.round(Math.cos(a) * r);
          const y = fy + 14 - Math.round(phase * 30);
          const bright = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
          ctx.globalAlpha = 0.35 + bright * 0.65;
          ctx.fillStyle = bright > 0.7 ? '#ffffff' : '#8aff8a';
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        }
        ctx.globalAlpha = 1;
      },
    });
    this.lights.push({ x: fx, y: fy, radius: 44, intensity: 0.9 + Math.sin(this.time * 4) * 0.2, r: 0.55, g: 1, b: 0.55 });
  }

  /** Cleave: a wide red sweep across the arc with sparks flung along its edge. */
  private cleave(x: number, z: number, dirX: number, dirZ: number, range: number, arc: number): void {
    this.effects.sweep(x, z, dirX, dirZ, range, arc, 0xe03a2a);
    const a0 = Math.atan2(dirZ, dirX) - (arc * Math.PI) / 360;
    const n = Math.max(6, Math.round(arc / 20));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((arc * Math.PI) / 180) * ((i + 0.5) / n);
      this.particles.spawn(x + Math.cos(a) * range * 0.9, 0.4, z + Math.sin(a) * range * 0.9, Math.cos(a) * 2.5, 1.5, Math.sin(a) * 2.5, 0.35, i % 2 ? 0xff6a4a : 0xffd0a0, { gravity: 6, priority: 0.6, delay: (i / n) * 0.06 });
    }
    this.view.kick(0.08);
  }

  /** Void Slash: a wide purple sweep, and a splash of void bursting out all round the hero from where the cut began. */
  private voidSlash(x: number, z: number, dirX: number, dirZ: number, range: number, arc: number): void {
    this.effects.sweep(x, z, dirX, dirZ, range * 1.15, arc, 0x9a40ff, 0.28);
    this.effects.disc(x, z, range * 0.6, 0x3a1060, 0.5, 0.5);
    this.effects.ring(x, z, 0.2, range * 0.9, 0xc080ff, 0.35, 2, 1.5);
    this.effects.ring(x, z, 0.2, range * 1.2, 0x9a40ff, 0.5, 1, 0, 0.08);
    this.particles.burst(x, 0.3, z, 30, 3.5, 0x9a40ff, 0.5, { up: 1.5, drag: 1.5, priority: 0.7, size: 2 });
    this.particles.burst(x, 0.5, z, 14, 2, 0xe0c0ff, 0.4, { up: 2, drag: 1, priority: 0.6 });
    this.effects.flash(x, 0.8, z, 0x9a40ff, 2, 70, 0.3);
    this.view.kick(0.1);
  }

  /** Hemorrhage: two gashes across the enemy, blood flung out and a dark pool left on the floor. */
  private bloodyHit(x: number, z: number): void {
    this.effects.gash(x, z);
    this.particles.burst(x, 0.8, z, 22, 2.2, 0xc01828, 0.6, { up: 2, gravity: 7, priority: 0.7, size: 2 });
    this.particles.burst(x, 0.9, z, 10, 1.4, 0x6a0810, 0.8, { up: 2.5, gravity: 7, priority: 0.6, size: 3, delay: 0.1 });
    this.effects.disc(x, z, 0.7, 0x5a0810, 2.5, 0.6);
    this.view.kick(0.08);
  }

  /** Rite of Blood: the hero as a daemon. Horns, burning eyes, a dark red skin and outline, black smoke and a red light. */
  private drawRite(): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const heroY = this.heroHeight();
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, heroY, w.pz));
    const top = fy - this.hero.sheet.height;
    const back = this.hero.facing === 'back';
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        // Horns curving up and out from the crown
        ctx.fillStyle = '#1a1014';
        for (const side of [-1, 1]) {
          const bx = fx + side * 4;
          ctx.fillRect(bx - 1, top - 1, 3, 3);
          ctx.fillRect(bx + side - 1, top - 4, 3, 4);
          ctx.fillRect(bx + side * 2 - 1, top - 7, 3, 4);
          ctx.fillRect(bx + side * 3, top - 9, 2, 3);
        }
        ctx.fillStyle = '#e8d8c0';
        for (const side of [-1, 1]) {
          const bx = fx + side * 4;
          ctx.fillRect(bx, top, 1, 2);
          ctx.fillRect(bx + side, top - 3, 1, 3);
          ctx.fillRect(bx + side * 2, top - 6, 1, 3);
        }
        ctx.fillStyle = '#ff3030';
        for (const side of [-1, 1]) ctx.fillRect(fx + side * 3, top - 8, 1, 1);
        // Burning eyes, unless the hero has turned away
        if (!back) {
          const blink = Math.sin(this.time * 9) > -0.9;
          ctx.fillStyle = blink ? '#ff2020' : '#800000';
          const ey = top + 5;
          if (this.hero.facing === 'front') {
            ctx.fillRect(fx - 2, ey, 1, 1);
            ctx.fillRect(fx + 2, ey, 1, 1);
          } else {
            ctx.fillRect(fx + (this.hero.faceLeft ? -2 : 2), ey, 1, 1);
          }
        }
      },
    });
    if (Math.random() < 0.5) this.particles.spawn(w.px + (Math.random() - 0.5) * 0.6, heroY + 0.2 + Math.random() * 0.8, w.pz + (Math.random() - 0.5) * 0.6, 0, 0.8, 0, 0.8, Math.random() < 0.7 ? 0x1a0a14 : 0x8a1020, { alpha: 0.7, priority: 0.5, size: 2 });
    this.lights.push({ x: fx, y: fy - 8, radius: 46, intensity: 1.1 + Math.sin(this.time * 7) * 0.2, r: 1, g: 0.15, b: 0.2 });
  }

  /** Shield Bash: a holy shield springs up over the enemy, with gold motes rising off it. */
  private holyShield(x: number, z: number): void {
    this.effects.shield(x, z, 0xffd860);
    this.particles.burst(x, 0.8, z, 12, 0.8, 0xfff0a0, 0.6, { up: 1.5, drag: 1, priority: 0.6, delay: 0.1 });
    this.view.kick(0.06);
  }

  /** Ground Stomp: the landing. Cracks under the hero, a hard bright ring then two slower waves out to the reach, dirt thrown up. */
  private shockwave(x: number, z: number, radius: number): void {
    const dust = 0xc8b8a0;
    this.effects.cracks(x, z, 26, 0x9a8a70, 0.6, 8);
    this.effects.ring(x, z, 0.1, radius * 0.5, 0xfff0d0, 0.18, 3, 1.5);
    this.effects.ring(x, z, 0.2, radius, dust, 0.4, 3, 1);
    this.effects.ring(x, z, 0.2, radius, 0x9a8a70, 0.5, 2, 0, 0.08);
    this.effects.ring(x, z, 0.2, radius * 1.15, dust, 0.55, 1, 0, 0.16);
    this.particles.burst(x, 0.1, z, 24, 3 * radius, dust, 0.5, { up: 1.5, gravity: 6, priority: 0.6, size: 2 });
    this.particles.burst(x, 0.1, z, 16, 1.5, 0x7a6a58, 0.7, { up: 2.5, gravity: 5, priority: 0.5, size: 2, delay: 0.05 });
    this.view.kick(0.22);
  }

  /** Heavy Strike: a big weapon dropped from above; dust and a ring when it lands. */
  private smash(x: number, z: number, color: number): void {
    this.effects.smash(x, z, color);
    this.effects.ring(x, z, 0.15, 1.1, 0xc8b8a0, 0.3, 1, 0, 0.1);
    this.particles.burst(x, 0.1, z, 12, 1.6, 0xc8b8a0, 0.45, { up: 1.4, gravity: 6, priority: 0.6, size: 2, delay: 0.1 });
    this.particles.burst(x, 0.3, z, 6, 2.2, color, 0.3, { up: 2, gravity: 8, priority: 0.5, delay: 0.1 });
    this.view.kick(0.16);
  }

  private stomp(x: number, z: number, radius: number, color: number): void {
    this.effects.ring(x, z, 0.2, radius, color, 0.4, 2);
    this.particles.burst(x, 0.1, z, 14, 2.5 * radius, color, 0.5, { up: 1, gravity: 5, priority: 0.5, size: 2 });
    this.view.kick(0.1);
  }

  private puff(x: number, z: number, color: number): void {
    this.particles.burst(x, 0.8, z, 16, 1.2, color, 0.5, { drag: 2, priority: 0.6 });
    this.effects.flash(x, 1, z, color, 1.2, 40, 0.25);
  }

  private levelUp(x: number, z: number): void {
    this.effects.ring(x, z, 0.2, 2.2, 0xffe066, 0.8, 2, 1.5);
    this.particles.burst(x, 0.2, z, 40, 1.5, 0xffe066, 1.2, { up: 3, drag: 0.5, priority: 0.9 });
  }

  private aoeVisual(visual: string, x: number, z: number, radius: number, element: Element): void {
    const color = ELEMENT_COLORS[element];
    switch (visual) {
      case 'stomp':
        this.shockwave(x, z, radius);
        break;
      case 'nova_cold': {
        const frames = this.fx.frostRing;
        const big = frames[frames.length - 1]!;
        this.effects.anim(frames, x, 0, z, big.width >> 1, big.height >> 1, 0.45, 'floor', { color: 0x9fe0ff, intensity: 1.5, radius: 70 });
        this.particles.burst(x, 0.3, z, 30, 4, 0xd0f0ff, 0.6, { drag: 1, priority: 0.7 });
        break;
      }
      case 'nova_poison':
        this.effects.ring(x, z, 0.2, radius, 0x66e070, 0.5, 2, 1);
        this.effects.disc(x, z, radius, 0x2a7a30, 0.6, 0.35);
        this.particles.burst(x, 0.3, z, 30, 3, 0x66e070, 0.9, { up: 0.5, priority: 0.7, size: 2 });
        break;
      case 'boulder':
        this.boulderLand(x, z, radius);
        break;
      case 'lightning':
        this.effects.strike(x, z, 0xa8c8ff);
        this.particles.burst(x, 0.2, z, 10, 2, 0xd8e8ff, 0.3, { priority: 0.6 });
        break;
      case 'arrow_rain': {
        const arrow = this.projectileProp('arrow', 0xd8d0c0);
        this.effects.arrows(arrow.frames, x, z, Math.min(radius, 6), arrow.originX, arrow.originY);
        break;
      }
      case 'trap':
        this.particles.burst(x, 0.3, z, 12, 2, 0xd8d0c0, 0.4, { priority: 0.5 });
        this.effects.ring(x, z, 0.2, radius, 0xd8d0c0, 0.3, 1);
        break;
      case 'curse':
        this.effects.ring(x, z, radius, 0.2, 0xb060ff, 0.6, 2, 1);
        this.particles.burst(x, 0.2, z, 20, 1, 0xb060ff, 1.0, { up: 1.5, priority: 0.6 });
        break;
      default:
        this.particles.burst(x, 0.6, z, 10, 2, color, 0.4, { priority: 0.5 });
        this.effects.ring(x, z, 0.2, radius, color, 0.35, 1);
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, time: number): void {
    this.time = time;
    this.fit();
    this.rebuildArea();
    const w = this.world;
    const lead = w.moving ? 0.6 : 0;
    this.view.lookAt(w.px + Math.sin(w.pyaw) * lead, w.pz + Math.cos(w.pyaw) * lead);
    this.view.update(dt);
    this.syncHero(dt);
    if (w.pet.active) {
      if (!this.pet) this.pet = { sheet: crabSheet(this.pal, 1, OUTLINE), anim: 'idle', animT: 0, facing: 'side', faceLeft: false, flash: 0, dying: -1 };
      const c = this.pet;
      this.face(c, Math.sin(w.pet.yaw), Math.cos(w.pet.yaw));
      c.facing = 'side';
      this.advance(c, dt, w.pet.moving);
    }
    this.syncEnemies(dt);
    this.syncZoneParticles(dt);
    this.effects.update(dt);
    this.particles.update(dt);
    if (this.beamTarget >= 0) {
      const t = w.enemies[this.beamTarget];
      if (t && t.alive && !t.dead) this.effects.beamSet(w.px, 1.2, w.pz, t.x, 0.8, t.z, 0x60ff90);
    }
    this.numbers.update(dt);
    this.labels.update(w.drops, this.dropVisible);
    this.minimap.update(dt);
    const near = w.nearestInteractable();
    const hover = w.interactables.find((i) => i.id === this.hoverInteractable && i.active) ?? null;
    this.interactLabels.update(w.interactables, near, hover);
  }

  private syncZoneParticles(dt: number): void {
    const pt = this.particles;
    // A leaping hero leaves a trail of dust in the air behind
    if (this.world.leap && this.world.leap.arc && Math.random() < dt * 50) pt.spawn(this.world.px, this.heroHeight() + 0.2, this.world.pz, 0, -0.5, 0, 0.35, 0x8a7a68, { alpha: 0.7, priority: 0.5, size: 2 });
    for (const z of this.world.zones) {
      if (z.type === 'fire_prison' && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        pt.spawn(z.x + Math.cos(a) * z.radius, 0.1, z.z + Math.sin(a) * z.radius, 0, 1.5 + Math.random(), 0, 0.5, 0xff8a2a, { priority: 0.5 });
      }
      if ((z.type === 'poison' || z.type === 'smoke') && Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * z.radius;
        pt.spawn(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, 0, 0.5, 0, 1.2, z.type === 'poison' ? 0x66e070 : 0x9090a0, { alpha: 0.6, priority: 0.4, size: 2 });
      }
      if (z.type === 'wind' && Math.random() < dt * 25) {
        const a = Math.random() * Math.PI * 2;
        pt.spawn(z.x + Math.cos(a) * z.radius * 0.9, 0.4 + Math.random(), z.z + Math.sin(a) * z.radius * 0.9, -Math.sin(a) * 4, 0, Math.cos(a) * 4, 0.5, 0x9fd8ff, { alpha: 0.6, priority: 0.4 });
      }
      if (z.type === 'sanctuary' && Math.random() < dt * 30) {
        // Motes drifting up everywhere inside, and sparks off the candles at the rim
        const a = Math.random() * Math.PI * 2;
        const rim = Math.random() < 0.35;
        const r = rim ? z.radius : Math.sqrt(Math.random()) * z.radius * 0.9;
        pt.spawn(z.x + Math.cos(a) * r, rim ? 0.5 : 0.1, z.z + Math.sin(a) * r, 0, rim ? 1.6 : 0.8, 0, rim ? 0.5 : 1.6, Math.random() < 0.5 ? 0xfff4c0 : 0xffe87a, { priority: 0.4, alpha: 0.9 });
      }
      if (z.type === 'storm' && Math.random() < dt * 3) pt.spawn(z.x + (Math.random() - 0.5) * 4, 4, z.z + (Math.random() - 0.5) * 4, 0, -6, 0, 0.5, 0xa8c8ff, { alpha: 0.6, priority: 0.4 });
      if (z.type === 'blizzard' && Math.random() < dt * 40) pt.spawn(z.x + (Math.random() - 0.5) * z.radius * 2, 3.5, z.z + (Math.random() - 0.5) * z.radius * 2, 0.5, -3, 0.5, 1, 0xd0f0ff, { alpha: 0.8, priority: 0.4 });
    }
  }

  render(): void {
    const ctx = this.ctx;
    const cam = this.view;
    const W = this.frame.width;
    const H = this.frame.height;
    const w = this.world;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssOf(this.pal.background);
    ctx.fillRect(0, 0, W, H);
    this.items.length = 0;
    this.lights.length = 0;
    this.bars.length = 0;
    let drawn = 0;

    // Visible tiles: the world box that covers the four corners of the frame
    const c = { x: 0, z: 0 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H + TILE_H * 3], [W, H + TILE_H * 3]] as const) {
      cam.unproject(cam.offsetX + sx * cam.scale, cam.offsetY + sy * cam.scale, c);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
    }
    const map = w.map;
    const c0 = Math.max(0, Math.floor(minX) - 1);
    const c1 = Math.min(map.cols - 1, Math.ceil(maxX) + 1);
    const r0 = Math.max(0, Math.floor(minZ) - 1);
    const r1 = Math.min(map.rows - 1, Math.ceil(maxZ) + 1);
    const tiles = this.tiles;
    const heroDepth = cam.depth(w.px, w.pz);
    const heroFx = Math.round(cam.frameX(w.px, w.pz));
    const heroFy = Math.round(cam.frameY(w.px, 0.6, w.pz));
    for (let r = r0; r <= r1; r++) {
      for (let q = c0; q <= c1; q++) {
        const px = Math.round(cam.frameX(q + 0.5, r + 0.5)) - TILE_W / 2;
        const py = Math.round(cam.frameY(q + 0.5, 0, r + 0.5)) - TILE_H / 2;
        if (px + TILE_W < 0 || px > W || py + TILE_H < 0 || py - tiles.wallH > H) continue;
        const t = map.get(q, r);
        if (t === Tile.Wall) {
          // Fully enclosed walls are never seen
          if (map.get(q + 1, r) === Tile.Wall && map.get(q - 1, r) === Tile.Wall && map.get(q, r + 1) === Tile.Wall && map.get(q, r - 1) === Tile.Wall && map.get(q + 1, r + 1) === Tile.Wall) continue;
          const depth = cam.depth(q + 0.5, r + 0.5);
          // Walls that would hide the hero turn see-through
          const hides = depth > heroDepth && heroFx >= px - 4 && heroFx <= px + TILE_W + 4 && heroFy >= py - tiles.wallH && heroFy <= py + TILE_H;
          this.items.push({
            depth,
            draw: () => {
              if (hides) ctx.globalAlpha = 0.45;
              ctx.drawImage(tiles.wall, px, py - tiles.wallH);
              if (hides) ctx.globalAlpha = 1;
            },
          });
        } else {
          ctx.drawImage(tiles.floor[(q * 7 + r * 13 + (q ^ r)) % tiles.floor.length]!, px, py);
          drawn++;
        }
      }
    }

    this.drawDecals(ctx);

    // Props and stations
    for (const p of this.placed) {
      const fx = Math.round(cam.frameX(p.x, p.z));
      const fy = Math.round(cam.frameY(p.x, 0, p.z));
      if (fx < -40 || fx > W + 40 || fy < -10 || fy > H + 60) continue;
      const frames = p.prop.frames;
      const frame = frames[Math.floor(this.time / p.prop.frameTime + p.x * 3) % frames.length]!;
      const hover = p.interactId >= 0 && p.interactId === this.hoverInteractable;
      this.items.push({
        depth: cam.depth(p.x, p.z),
        draw: () => {
          if (hover) this.drawTinted(frame, fx - p.prop.originX, fy - p.prop.originY, false, '#ffffff', 0.3);
          else ctx.drawImage(frame, fx - p.prop.originX, fy - p.prop.originY);
        },
      });
    }

    // The merchant
    if (w.area === 'town') {
      const t = w.town;
      const anim = this.vendor.front.idle;
      const frame = anim.frames[Math.floor(this.time / anim.frameTime) % anim.frames.length]!;
      const fx = Math.round(cam.frameX(t.vendor.x, t.vendor.z + 0.9));
      const fy = Math.round(cam.frameY(t.vendor.x, 0, t.vendor.z + 0.9));
      const hover = this.hoverInteractable >= 0 && w.interactables.find((i) => i.id === this.hoverInteractable)?.kind === 'vendor';
      this.items.push({
        depth: cam.depth(t.vendor.x, t.vendor.z + 0.9),
        draw: () => {
          if (hover) this.drawTinted(frame, fx - anim.originX, fy - anim.originY, false, '#ffffff', 0.3);
          else ctx.drawImage(frame, fx - anim.originX, fy - anim.originY);
        },
      });
    }

    // Hero
    const heroY = this.heroHeight();
    const rite = w.buffs.some((b) => b.id === 'rite_of_blood');
    this.pushPuppet(this.hero, w.px, heroY, w.pz, w.invisible ? 0.45 : 1, rite ? '#7a0a2a' : null, rite ? '#ff2040' : null);
    if (rite && !w.playerDead) this.drawRite();
    if (w.pet.active && this.pet) this.pushPuppet(this.pet, w.pet.x, 0, w.pet.z, 1, null);
    drawn++;

    // Enemies
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const p = this.puppets.get(e.id);
      if (!p) continue;
      const fx = cam.frameX(e.x, e.z);
      if (fx < -40 || fx > W + 40) continue;
      const fy = cam.frameY(e.x, 0, e.z);
      if (fy < -10 || fy > H + 50) continue;
      let tint: string | null = null;
      if (e.status.freeze > 0) tint = '#9fe0ff';
      else if (e.status.curse) tint = '#c080ff';
      else if (e.status.poison) tint = '#66e070';
      const targeted = e.id === w.targetId && !e.dead;
      // Flying things bob above the ground
      const hover = e.def?.hover && !e.dead ? (e.def.hover + Math.sin(this.time * 4 + e.id) * 2) / 12 : 0;
      this.pushPuppet(p, e.x, hover, e.z, 1, tint, targeted ? TARGET_COLOR : null);
      if (e.def?.glow && !e.dead) {
        const [gr, gg, gb] = rgb(e.def.glow);
        this.lights.push({ x: Math.round(fx), y: Math.round(fy) - p.sheet.height * 0.5, radius: 46, intensity: 0.8, r: gr, g: gg, b: gb });
      }
      if (!e.dead) this.bars.push(Math.round(fx), Math.round(fy) - p.sheet.height - 5, e.hp / e.maxHp, targeted ? 1 : 0);
      drawn++;
    }

    // Projectiles
    for (const pr of w.projectiles) {
      if (!pr.alive) continue;
      const holy = pr.shape === 'hammer' || pr.shape === 'star';
      const color = pr.owner === 'enemy' ? 0xff4a3a : pr.shape === 'star' ? 0xffe070 : pr.shape === 'hammer' ? 0xffd860 : pr.shape === 'arrow' || pr.shape === 'dagger' ? 0xe8e0d0 : ELEMENT_COLORS[pr.element];
      const prop = this.projectileProp(pr.shape, color);
      const fx = Math.round(cam.frameX(pr.x, pr.z));
      const fy = Math.round(cam.frameY(pr.x, pr.y, pr.z));
      const sdx = pr.vx - pr.vz;
      const sdy = (pr.vx + pr.vz) / 2;
      const angle = pr.shape === 'boulder' ? this.time * 6 : holy ? 0 : Math.atan2(sdy, sdx);
      const frame = prop.frames[Math.floor(this.time / prop.frameTime + pr.id) % prop.frames.length]!;
      this.items.push({
        depth: cam.depth(pr.x, pr.z) + 0.01,
        draw: () => {
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(angle);
          ctx.drawImage(frame, -prop.originX, -prop.originY);
          ctx.restore();
        },
      });
      if (pr.shape === 'bolt' || pr.shape === 'ball' || pr.shape === 'enemy_bolt') {
        const [lr, lg, lb] = rgb(color);
        this.lights.push({ x: fx, y: fy, radius: pr.shape === 'ball' ? 50 : 30, intensity: 1, r: lr, g: lg, b: lb });
      } else if (holy) {
        // The holy star throws a warm, pulsing light as it spins
        const [lr, lg, lb] = rgb(color);
        this.lights.push({ x: fx, y: fy, radius: 50, intensity: 0.85 + Math.sin(this.time * 12) * 0.15, r: lr, g: lg, b: lb });
      }
    }

    // Orbiting daggers and the spinning hammer: drawn from the buff's angle, one sprite per orbiter
    for (const b of w.buffs) {
      const od = b.mods.orbitDaggers;
      if (!od) continue;
      const shape: ProjectileShape = od.shape ?? 'dagger';
      const color = shape === 'hammer' ? 0xffd860 : shape === 'star' ? 0xffe070 : 0xe8e0d0;
      const prop = this.projectileProp(shape, color);
      const rings = od.stacks ? b.data.rings ?? 1 : 1;
      for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < od.count; i++) {
        // Drawn exactly where the simulation's hit box is
        const place = orbiterPlace(od, b.data.angle ?? 0, ring, i);
        const a = place.angle;
        const ox = w.px + Math.sin(a) * place.radius * PX;
        const oz = w.pz + Math.cos(a) * place.radius * PX;
        const fx = Math.round(cam.frameX(ox, oz));
        const fy = Math.round(cam.frameY(ox, 0.9, oz));
        // Daggers point along their path; the hammer's own frames spin it
        const tx = Math.cos(a);
        const tz = -Math.sin(a);
        const angle = shape === 'hammer' || shape === 'star' ? 0 : Math.atan2((tx + tz) / 2, tx - tz);
        const frame = prop.frames[Math.floor(this.time / prop.frameTime + i) % prop.frames.length]!;
        this.items.push({
          depth: cam.depth(ox, oz) + 0.01,
          draw: () => {
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(angle);
            ctx.drawImage(frame, -prop.originX, -prop.originY);
            ctx.restore();
          },
        });
        if (shape === 'hammer' || shape === 'star') {
          const [lr, lg, lb] = rgb(color);
          this.lights.push({ x: fx, y: fy, radius: 50, intensity: 0.85 + Math.sin(this.time * 12) * 0.15, r: lr, g: lg, b: lb });
        }
      }
      }
    }

    // Prayer: little crosses of light climbing all over the hero, and a green glow
    if (w.buffs.some((b) => b.id === 'prayer')) this.drawPrayer();
    this.drawRockSolid();

    // Boulder Toss: the rock on its way down, from high above to the marked ground
    for (const z of w.zones) {
      if (z.type !== 'boulder') continue;
      // Out of sight for the first third, then a true fall: speeding up all the way down
      const k = Math.max(0, 1 - z.remaining / z.duration - 0.35) / 0.65;
      const h = 9 * (1 - k * k);
      if (h > 8.5) continue;
      const rock = this.fx.boulder;
      const fx = Math.round(cam.frameX(z.x, z.z));
      const fy = Math.round(cam.frameY(z.x, h, z.z));
      this.items.push({ depth: cam.depth(z.x, z.z) + 0.02, draw: () => ctx.drawImage(rock, fx - (rock.width >> 1), fy - rock.height + 6) });
    }

    // Drops
    for (const d of w.drops) {
      if (!d.alive || !w.dropVisible(d)) continue;
      const prop = this.dropProp(d.item ? RARITIES[d.item.rarity].color : null);
      const fx = Math.round(cam.frameX(d.x, d.z));
      const fy = Math.round(cam.frameY(d.x, 0, d.z));
      if (fx < -20 || fx > W + 20 || fy < -20 || fy > H + 20) continue;
      const frame = prop.frames[Math.floor(this.time / prop.frameTime + d.id) % prop.frames.length]!;
      this.items.push({ depth: cam.depth(d.x, d.z) - 0.2, draw: () => ctx.drawImage(frame, fx - prop.originX, fy - prop.originY) });
      if (d.item && d.item.rarity !== 'common') {
        const color = RARITIES[d.item.rarity].color;
        const [lr, lg, lb] = rgb(color);
        this.lights.push({ x: fx, y: fy - 6, radius: 22, intensity: 0.6 + Math.sin(this.time * 4 + d.id) * 0.15, r: lr, g: lg, b: lb });
        if (Math.random() < 0.08) this.particles.spawn(d.x, 0.2, d.z, 0, 0.8, 0, 0.9, color, { priority: 0.3 });
      }
    }

    this.items.sort((a, b) => a.depth - b.depth);
    for (const it of this.items) it.draw();
    drawn += this.items.length;
    this.drawBars(ctx);

    this.effects.draw(ctx, cam, 'air');
    this.particles.draw(ctx, cam);
    this.stats.drawn = drawn;

    // Lights: fixed ones in view, the hero's own and every effect
    for (const l of this.staticLights) {
      const x = cam.frameX(l.x, l.z);
      const y = cam.frameY(l.x, l.y, l.z);
      if (x < -l.radius * TILE_W || x > W + l.radius * TILE_W || y < -l.radius * TILE_H || y > H + l.radius * TILE_H) continue;
      const flicker = l.flicker ? 0.92 + 0.08 * Math.sin(this.time * 13 + l.x * 3 + l.z) : 1;
      const [lr, lg, lb] = rgb(l.color);
      this.lights.push({ x, y, radius: l.radius * TILE_W * flicker, intensity: l.intensity, r: lr, g: lg, b: lb });
    }
    const heroLightColor = w.player.pledgeId ? PLEDGES[w.player.pledgeId]!.color : 0xffd0a0;
    const [hr, hg, hb] = rgb(heroLightColor);
    this.lights.push({ x: cam.frameX(w.px, w.pz), y: cam.frameY(w.px, 0.8, w.pz), radius: (w.area === 'arena' ? 5.2 : 4.4) * TILE_W, intensity: 1.1, r: hr * 0.4 + 0.6, g: hg * 0.4 + 0.55, b: hb * 0.4 + 0.45 });
    this.effects.collectLights(cam, this.lights);
    // Keep the brightest, nearest lights when there are too many
    if (this.lights.length > 48) {
      const cx = W / 2;
      const cy = H / 2;
      this.lights.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) / a.intensity - Math.hypot(b.x - cx, b.y - cy) / b.intensity);
      this.lights.length = 48;
    }
    this.compositor.dim += (this.dim - this.compositor.dim) * 0.25;
    if (Math.abs(this.compositor.dim - this.dim) < 0.01) this.compositor.dim = this.dim;
    this.compositor.lights.length = 0;
    for (const l of this.lights) this.compositor.lights.push(l);
    this.compositor.present(this.frame, cam.scale, cam.offsetX, cam.offsetY);
  }

  /** Small life bars above every monster; the target's is wider with a gold rim. */
  private drawBars(ctx: CanvasRenderingContext2D): void {
    const b = this.bars;
    for (let i = 0; i < b.length; i += 4) {
      const x = b[i]!;
      const y = b[i + 1]!;
      const frac = Math.max(0, Math.min(1, b[i + 2]!));
      const targeted = b[i + 3] === 1;
      const w = targeted ? 18 : 12;
      const h = targeted ? 4 : 3;
      const left = x - (w >> 1);
      ctx.fillStyle = targeted ? TARGET_COLOR : '#0a0a12';
      ctx.fillRect(left - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#2a1014';
      ctx.fillRect(left, y, w, h);
      const fill = Math.round(w * frac);
      if (fill > 0) {
        ctx.fillStyle = frac > 0.5 ? '#c82828' : frac > 0.25 ? '#d06020' : '#e0a020';
        ctx.fillRect(left, y, fill, h);
        ctx.fillStyle = '#ff6a5a';
        ctx.fillRect(left, y, fill, 1);
      }
    }
  }

  /** Things painted on the floor before anything stands on it: zones, rings, shadows, the buff aura. */
  private drawDecals(ctx: CanvasRenderingContext2D): void {
    const cam = this.view;
    const w = this.world;
    const ellipse = (x: number, z: number, r: number, style: string, fill: boolean, alpha: number, width = 1) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(Math.round(cam.frameX(x, z)), Math.round(cam.frameY(x, 0, z)), Math.max(1, r * RING_RX), Math.max(1, r * RING_RY), 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = style;
        ctx.fill();
      } else {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    // Zones
    for (const z of w.zones) {
      const pulse = 0.9 + Math.sin(this.time * 5 + z.id) * 0.1;
      switch (z.type) {
        case 'fire_prison':
          ellipse(z.x, z.z, z.radius * pulse, '#ff7a2a', false, 0.9, 2);
          ellipse(z.x, z.z, z.radius, '#ff5a1a', true, 0.12);
          break;
        case 'poison':
          ellipse(z.x, z.z, z.radius, '#3a9a40', true, 0.35);
          break;
        case 'smoke':
          ellipse(z.x, z.z, z.radius, '#8a8a9a', true, 0.3);
          break;
        case 'trap':
          ellipse(z.x, z.z, z.radius, '#a0a0b0', true, 0.25);
          ctx.fillStyle = '#c8c8d0';
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const sx = Math.round(cam.frameX(z.x + Math.cos(a) * z.radius * 0.8, z.z + Math.sin(a) * z.radius * 0.8));
            const sy = Math.round(cam.frameY(z.x + Math.cos(a) * z.radius * 0.8, 0, z.z + Math.sin(a) * z.radius * 0.8));
            ctx.fillRect(sx, sy - 3, 1, 3);
          }
          break;
        case 'spear_wall': {
          ctx.fillStyle = '#d8d0c0';
          const px = -z.dz;
          const pz = z.dx;
          for (let k = 0; k < z.count; k++) {
            const t = z.count > 1 ? k / (z.count - 1) - 0.5 : 0;
            const x = z.x + px * z.length * t;
            const zz = z.z + pz * z.length * t;
            ctx.fillRect(Math.round(cam.frameX(x, zz)), Math.round(cam.frameY(x, 0, zz)) - 14, 2, 14);
          }
          break;
        }
        case 'void_trail': {
          ctx.strokeStyle = '#9a40ff';
          ctx.lineWidth = 6;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.moveTo(Math.round(cam.frameX(z.x, z.z)), Math.round(cam.frameY(z.x, 0, z.z)));
          ctx.lineTo(Math.round(cam.frameX(z.x + z.dx * z.length, z.z + z.dz * z.length)), Math.round(cam.frameY(z.x + z.dx * z.length, 0, z.z + z.dz * z.length)));
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'sanctuary':
          this.drawSanctuary(ctx, z, ellipse);
          break;
        case 'wind':
          ellipse(z.x, z.z, z.radius * pulse, '#8fd0ff', false, 0.4);
          break;
        case 'boulder': {
          // The target ring, and the rock's shadow growing as it comes down
          const k = Math.max(0, 1 - z.remaining / z.duration - 0.35) / 0.65;
          ellipse(z.x, z.z, z.radius, '#ff9a40', false, 0.7);
          ellipse(z.x, z.z, 0.3 + 0.55 * k * k, '#000000', true, 0.15 + 0.35 * k);
          break;
        }
        default:
          break;
      }
      this.zoneLight(z);
    }
    // Buff aura under the hero
    const buff = w.buffs.find((b) => b.id !== 'incense');
    if (buff) ellipse(w.px, w.pz, 0.9, cssOf(buff.color), true, 0.18 + Math.sin(this.time * 6) * 0.06);
    // Rings under the interactable in reach and the one under the mouse
    const near = w.nearestInteractable();
    for (const it of w.interactables) {
      if (!it.active) continue;
      const isNear = near?.id === it.id;
      const isHover = it.id === this.hoverInteractable;
      if (!isNear && !isHover) continue;
      const info = INTERACT_INFO[it.kind];
      ellipse(it.x, it.z, Math.max(0.9, it.radius) * (isNear ? 1 + Math.sin(this.time * 5) * 0.06 : 1), cssOf(info.color), false, isNear ? 0.9 : 0.5, 1);
    }
    // Shadows
    const sh = this.fx.shadow;
    const put = (x: number, z: number) => ctx.drawImage(sh, Math.round(cam.frameX(x, z)) - (sh.width >> 1), Math.round(cam.frameY(x, 0, z)) - (sh.height >> 1));
    if (!w.playerDead) put(w.px, w.pz);
    for (const e of w.enemies) if (e.alive && !e.dead) put(e.x, e.z);
    this.effects.draw(ctx, cam, 'floor');
  }

  /**
   * Consecrated ground: a still double rim of gold and white, a warm glowing
   * floor that breathes slowly, a cross of light through the middle and eight
   * candles standing round the edge with flickering flames.
   */
  private drawSanctuary(ctx: CanvasRenderingContext2D, z: Zone, ellipse: (x: number, z: number, r: number, style: string, fill: boolean, alpha: number, width?: number) => void): void {
    const cam = this.view;
    const breathe = 0.16 + Math.sin(this.time * 1.5 + z.id) * 0.04;
    ellipse(z.x, z.z, z.radius, '#ffe87a', true, breathe);
    ellipse(z.x, z.z, z.radius * 0.55, '#fff4c0', true, breathe * 0.6);
    // Gold glitter scattered over the whole floor, each grain blinking in its own time
    for (let i = 0; i < 48; i++) {
      const h1 = Math.sin(i * 12.9898 + z.id * 78.233) * 43758.5453;
      const h2 = Math.sin(i * 39.3467 + z.id * 11.135) * 24634.6345;
      const a = (h1 - Math.floor(h1)) * Math.PI * 2;
      const r = Math.sqrt(h2 - Math.floor(h2)) * z.radius * 0.97;
      const wx = z.x + Math.cos(a) * r;
      const wz = z.z + Math.sin(a) * r;
      const blink = Math.sin(this.time * 5 + i * 1.7);
      if (blink < -0.2) continue;
      ctx.fillStyle = blink > 0.75 ? '#ffffff' : blink > 0.3 ? '#fff4c0' : '#e0b840';
      const sx = Math.round(cam.frameX(wx, wz));
      const sy = Math.round(cam.frameY(wx, 0, wz));
      ctx.fillRect(sx, sy, 1, 1);
      if (blink > 0.75) {
        ctx.fillRect(sx - 1, sy, 1, 1);
        ctx.fillRect(sx + 1, sy, 1, 1);
        ctx.fillRect(sx, sy - 1, 1, 1);
        ctx.fillRect(sx, sy + 1, 1, 1);
      }
    }
    // The rim: does not move
    ellipse(z.x, z.z, z.radius, '#ffe87a', false, 0.9, 2);
    ellipse(z.x, z.z, z.radius * 0.93, '#fff8e0', false, 0.6, 1);
    // Candles at the rim, flames flickering
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const wx = z.x + Math.cos(a) * z.radius;
      const wz = z.z + Math.sin(a) * z.radius;
      const sx = Math.round(cam.frameX(wx, wz));
      const sy = Math.round(cam.frameY(wx, 0, wz));
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(sx - 2, sy - 9, 5, 10);
      ctx.fillStyle = '#f4ecd0';
      ctx.fillRect(sx - 1, sy - 8, 3, 8);
      const flick = Math.sin(this.time * 17 + i * 2.1) > 0.2 ? 1 : 0;
      ctx.fillStyle = '#ffb040';
      ctx.fillRect(sx - 1, sy - 11 - flick, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy - 10 - flick, 1, 1);
    }
  }

  private zoneLight(z: Zone): void {
    const cam = this.view;
    const colors: Partial<Record<Zone['type'], number>> = { fire_prison: 0xff7a2a, sanctuary: 0xffe87a, void_trail: 0x9a40ff, boulder: 0xff9a40, poison: 0x66e070, wind: 0x8fd0ff };
    const color = colors[z.type];
    if (color === undefined) return;
    const [r, g, b] = rgb(color);
    const glow = z.type === 'sanctuary' ? 1.6 + Math.sin(this.time * 1.5 + z.id) * 0.25 : 0.8;
    this.lights.push({ x: cam.frameX(z.x, z.z), y: cam.frameY(z.x, 0.3, z.z), radius: (z.radius + 1) * TILE_W, intensity: glow, r, g, b });
  }

  private pushPuppet(p: Puppet, x: number, y: number, z: number, alpha: number, tint: string | null, outline: string | null = null): void {
    const cam = this.view;
    const ctx = this.ctx;
    const set = p.sheet[p.facing];
    const anim: SpriteAnim = p.dying >= 0 ? set.idle : set[p.anim];
    const frame = anim.frames[Math.floor(p.animT / anim.frameTime) % anim.frames.length]!;
    const fx = Math.round(cam.frameX(x, z));
    const fy = Math.round(cam.frameY(x, y, z));
    const flip = p.facing === 'side' && p.faceLeft;
    const flash = p.flash > 0;
    const dying = p.dying;
    this.items.push({
      depth: cam.depth(x, z),
      draw: () => {
        if (dying >= 0) {
          // Fall over, lie a moment, then sink away
          const k = Math.min(1, dying / DEATH_FALL);
          ctx.save();
          ctx.translate(fx, fy);
          ctx.globalAlpha = Math.max(0, 1 - Math.max(0, dying - 1.0) / 0.6);
          ctx.rotate((flip ? 1 : -1) * k * Math.PI * 0.5);
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(frame, -anim.originX, -anim.originY);
          ctx.restore();
          return;
        }
        if (alpha < 1) ctx.globalAlpha = alpha;
        if (outline) this.drawOutline(frame, fx - anim.originX, fy - anim.originY, flip, outline, anim.originX);
        if (flash) this.drawTinted(frame, fx - anim.originX, fy - anim.originY, flip, '#ffffff', 0.9, anim.originX);
        else if (tint) this.drawTinted(frame, fx - anim.originX, fy - anim.originY, flip, tint, 0.5, anim.originX);
        else if (flip) {
          ctx.save();
          ctx.translate(fx, fy);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, -anim.originX, -anim.originY);
          ctx.restore();
        } else ctx.drawImage(frame, fx - anim.originX, fy - anim.originY);
        if (alpha < 1) ctx.globalAlpha = 1;
      },
    });
  }

  /** Draws a sprite with a flat colour blended over its opaque pixels. */
  private drawTinted(frame: HTMLCanvasElement, x: number, y: number, flip: boolean, color: string, amount: number, originX = 0): void {
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
    const ctx = this.ctx;
    if (flip) {
      ctx.save();
      ctx.translate(x + originX, y);
      ctx.scale(-1, 1);
      ctx.drawImage(s, -originX, 0);
      ctx.restore();
    } else ctx.drawImage(s, x, y);
  }

  /** A one-pixel coloured rim around a sprite: its silhouette stamped in four directions under it. */
  private drawOutline(frame: HTMLCanvasElement, x: number, y: number, flip: boolean, color: string, originX: number): void {
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
    c.globalCompositeOperation = 'source-in';
    c.globalAlpha = 1;
    c.fillStyle = color;
    c.fillRect(0, 0, s.width, s.height);
    const ctx = this.ctx;
    ctx.save();
    if (flip) {
      ctx.translate(x + originX, y);
      ctx.scale(-1, 1);
      x = -originX;
      y = 0;
    }
    ctx.drawImage(s, x - 1, y);
    ctx.drawImage(s, x + 1, y);
    ctx.drawImage(s, x, y - 1);
    ctx.drawImage(s, x, y + 1);
    ctx.restore();
  }

  // ---------------------------------------------------------------- picking

  /** Nearest enemy to a window point, within `px` pixels. */
  pickEnemy(sx: number, sy: number, px = 40): Enemy | null {
    let best: Enemy | null = null;
    let bestD = px * px;
    const out = { x: 0, y: 0 };
    for (const e of this.world.enemies) {
      if (!e.alive || e.dead) continue;
      this.view.project(e.x, 0.8, e.z, out);
      const d = (out.x - sx) ** 2 + (out.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Nearest interactable to a window point. */
  pickInteractable(sx: number, sy: number, px = 48): number {
    let best = -1;
    let bestD = px * px;
    const out = { x: 0, y: 0 };
    for (const it of this.world.interactables) {
      if (!it.active) continue;
      this.view.project(it.x, 1.0, it.z, out);
      const d = (out.x - sx) ** 2 + (out.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = it.id;
      }
    }
    return best;
  }

  /** Keyboard and joystick directions are given on the screen; the world is turned 45 degrees from it. */
  screenDirToWorld(dx: number, dy: number, out: { x: number; z: number }): void {
    this.view.screenDirToWorld(dx, dy, out);
  }
}
