import { dummyArt, heroArt, heroArtSheet, npcArt, propAnim, propArt, shrunk, stillSheet } from '../art/images';
import { DUMMIES } from '../data/dummies';
import { RARITIES } from '../data/items';
import { PX } from '../data/units';
import { PLEDGES } from '../data/pledges';
import { SKILLS, orbiterPlace } from '../data/skills';
import { ELEMENT_COLORS, type Element } from '../data/stats';
import { crabSheet, dummySheet, heroLookKey, heroSheet, monsterSheet, vendorSheet, type AnimSet, type CharacterSheet, type Facing, type HeroLook, type MonsterKind, type OffhandLook } from '../gen/pixel/characters';
import { PALETTES, type Palette } from '../gen/pixel/palettes';
import { arcanaProp, bloodFountainProp, decorProp, dropProp, forgeProp, portalProp, projectileProp, rubbleProp, waypointProp, type Prop } from '../gen/pixel/props';
import { zoneById } from '../data/zones';
import { effectSprites, isoTiles, propSprites, type EffectSprites, type PropSprites, type SpriteAnim, type TileSet } from '../gen/pixel/sprites';
import { Tile } from '../sim/map/tilemap';
import type { Drop, Enemy, Minion, ProjectileShape, SimEvent, Zone } from '../sim/types';

/** Which shield drawing each shield base gets on the hero. */
const SHIELD_LOOKS: Record<string, OffhandLook> = { wooden_shield: 'wooden', wooden_shield_base: 'wooden', iron_shield: 'iron', tower_shield: 'tower', energy_shield: 'energy' };
import type { World } from '../sim/world';
import { IsoCamera, RING_RX, RING_RY, TILE_H, TILE_W, Y_PX } from './camera';
import { Compositor, type Light } from './compositor';
import { DamageNumbers } from './damageNumbers';
import { DropLabels } from './dropLabels';
import { Effects2D } from './effects2d';
import { INTERACT_INFO, InteractLabels } from './interactLabels';
import { Minimap } from './minimap';
import { Particles2D } from './particles2d';

type AnimName = 'idle' | 'walk' | 'attack' | 'cast';

/** The animation a puppet's state plays: a cast falls back to the attack where none is drawn. */
function animOf(set: AnimSet, anim: AnimName): SpriteAnim {
  return anim === 'cast' ? (set.cast ?? set.attack) : set[anim];
}

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
  /** Lit smoothly like the characters, without the floor's dither. */
  smooth: boolean;
  /** The town piece it is (`stash`, `braziers.3`), for creator mode; empty for anything else. */
  piece: string;
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
/** The lighting's ambient colour, and the colder one while the hero sneaks. */
const BASE_AMBIENT: [number, number, number] = [0.85, 0.88, 1.0];
const SNEAK_AMBIENT: [number, number, number] = [0.5, 0.58, 0.95];
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
const alphaCache = new WeakMap<HTMLCanvasElement, Uint8Array>();
let alphaScratch: CanvasRenderingContext2D | null = null;

/**
 * A sprite's alpha channel, read once through a scratch canvas so the sprite
 * itself is never read back (that would slow the browser's drawing of it).
 * Only creator mode's picking uses it.
 */
function alphaOf(frame: HTMLCanvasElement): Uint8Array {
  let a = alphaCache.get(frame);
  if (a) return a;
  if (!alphaScratch) alphaScratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const c = alphaScratch.canvas;
  if (c.width < frame.width) c.width = frame.width;
  if (c.height < frame.height) c.height = frame.height;
  alphaScratch.clearRect(0, 0, c.width, c.height);
  alphaScratch.drawImage(frame, 0, 0);
  const data = alphaScratch.getImageData(0, 0, frame.width, frame.height).data;
  a = new Uint8Array(frame.width * frame.height);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]!;
  alphaCache.set(frame, a);
  return a;
}

export class PixelView {
  readonly view = new IsoCamera();
  readonly numbers: DamageNumbers;
  readonly labels: DropLabels;
  readonly minimap: Minimap;
  readonly interactLabels: InteractLabels;
  readonly particles = new Particles2D(3000);
  readonly effects = new Effects2D();
  /** Interactable under the mouse, set by the game each frame. */
  hoverInteractable = -1;
  /** Creator mode's camera spot, or null to follow the hero. */
  creator: { x: number; z: number } | null = null;
  /** 1 while a menu covers the game: the frame darkens in dithered bands behind it. */
  dim = 0;
  readonly stats = { drawn: 0 };

  private readonly frame: HTMLCanvasElement;
  /** Silhouettes of the characters lit without the floor's dither (the hero, the merchant, the dummies), for the compositor's mask. */
  private readonly maskFrame: HTMLCanvasElement;
  private readonly mctx: CanvasRenderingContext2D;
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
  /** One puppet per skeleton archer slot, made when first needed. */
  private readonly minionPuppets: Puppet[] = [];
  private heroKey = '';
  private areaKey = '';
  private readonly placed: Placed[] = [];
  private readonly staticLights: StaticLight[] = [];
  private readonly lights: Light[] = [];
  private readonly items: Item[] = [];
  /** Monsters thrown into the air by Seismic Slam: id to the time they left the ground. */
  private readonly launches = new Map<number, number>();
  /** Where the Shade Army's shadows stand, trailing the hero. */
  private readonly shadePos: { x: number; z: number }[] = [];
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
    this.maskFrame = document.createElement('canvas');
    this.mctx = this.maskFrame.getContext('2d')!;
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d')!;
    this.compositor = new Compositor(canvas);
    this.compositor.background = rgb(pal.background);

    this.townTiles = isoTiles(pal, SIZE, 11);
    this.tiles = this.townTiles;
    this.props = propSprites(pal, SIZE, OUTLINE);
    this.fx = effectSprites(pal, SIZE);
    for (const look of ['ghoul', 'skeleton', 'brute', 'wraith'] as MonsterKind[]) this.monsterSheet(look);
    // A hand-made dummy sprite on disk stands in for the code-drawn one
    for (const d of DUMMIES) {
      const art = dummyArt(d.id);
      this.dummies.set(d.id, art ? stillSheet(art) : dummySheet(d.color, pal, SIZE, OUTLINE));
    }
    const merchant = npcArt('merchant');
    this.vendor = merchant ? stillSheet(merchant) : vendorSheet(pal, SIZE, OUTLINE);
    this.stations = {
      forge: forgeProp(pal, SIZE, OUTLINE),
      bloodfountain: propArt('bloodfountain') ? propAnim(propArt('bloodfountain')!) : bloodFountainProp(pal, SIZE, OUTLINE),
      arcana: arcanaProp(pal, SIZE, OUTLINE),
      waypoint: propArt('waypoint') ? propAnim(propArt('waypoint')!) : waypointProp(0xffd060, pal, SIZE, OUTLINE),
      // The producer's animated portal serves both the town portal and the return portal
      return_portal: propArt('portal') ? propAnim(propArt('portal')!) : portalProp(0x6fa8ff, pal, SIZE, OUTLINE),
      town_portal: propArt('portal') ? propAnim(propArt('portal')!) : portalProp(0xb070ff, pal, SIZE, OUTLINE),
      stash: propArt('stash') ? propAnim(propArt('stash')!) : { frames: [this.props.chest], originX: this.props.chest.width >> 1, originY: this.props.chest.height - 1, frameTime: 1 },
      // The merchant's two chests are their own piece: the code-drawn chest until their own drawing arrives
      merchant_chest: propArt('merchant_chest') ? propAnim(propArt('merchant_chest')!) : { frames: [this.props.chest], originX: this.props.chest.width >> 1, originY: this.props.chest.height - 1, frameTime: 1 },
      // The merchant's caravan on his left; the chest stands until it is drawn
      caravan: propArt('caravan') ? propAnim(propArt('caravan')!) : { frames: [this.props.chest], originX: this.props.chest.width >> 1, originY: this.props.chest.height - 1, frameTime: 1 },
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
    this.maskFrame.width = this.view.width;
    this.maskFrame.height = this.view.height;
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
      // A class with hand-made sprites on disk is drawn from them, whatever it wears
      const art = heroArt(look.classId);
      sheet = art ? heroArtSheet(art) : heroSheet(look, this.pal, SIZE, OUTLINE);
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
    const key = w.area + ':' + zone.id + ':' + w.map.cols + ':' + (w.arenaVisited || this.creator ? 1 : 0) + ':' + w.townVersion;
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
    const place = (prop: Prop, x: number, z: number, interactId = -1, smooth = false, piece = '') => this.placed.push({ prop, x, z, interactId, smooth, piece });
    const light = (x: number, z: number, color: number, intensity: number, radius: number, flicker = false, y = 1.2) => this.staticLights.push({ x, z, y, color, intensity, radius, flicker });
    const idOf = (kind: string) => w.interactables.find((i) => i.kind === kind)?.id ?? -1;
    if (w.area === 'town') {
      const t = w.town;
      place(this.stations.stash!, t.stash.x, t.stash.z, idOf('stash'), false, 'stash');
      place(this.stations.forge!, t.forge.x, t.forge.z, idOf('forge'), false, 'forge');
      place(this.stations.bloodfountain!, t.bloodfountain.x, t.bloodfountain.z, idOf('bloodfountain'), false, 'bloodfountain');
      place(this.stations.arcana!, t.arcana.x, t.arcana.z, idOf('arcana'), false, 'arcana');
      place(this.stations.waypoint!, t.waypoint.x, t.waypoint.z, idOf('waypoint'), true, 'waypoint');
      // Creator mode shows the return portal even before it opens, so it can be moved
      if (w.arenaVisited || this.creator) place(this.stations.return_portal!, t.returnPortal.x, t.returnPortal.z, idOf('return_portal'), false, 'returnPortal');
      light(t.forge.x, t.forge.z, 0xff8a30, 1.3, 3.2, true);
      light(t.bloodfountain.x, t.bloodfountain.z, 0xff3a3a, 1.0, 2.6);
      light(t.arcana.x, t.arcana.z, 0xb066ff, 1.1, 3);
      light(t.waypoint.x, t.waypoint.z, 0xffd060, 1.1, 3);
      if (w.arenaVisited) light(t.returnPortal.x, t.returnPortal.z, 0x6fa8ff, 1.1, 3);
      t.braziers.forEach((b, i) => {
        place(this.stations.brazier!, b.x, b.z, -1, false, `braziers.${i}`);
        light(b.x, b.z, 0xff8a3a, 1.2, 4.2, true, 1.0);
      });
      t.pillars.forEach((p, i) => place(this.stations.pillar!, p.x, p.z, -1, false, `pillars.${i}`));
      t.rubble.forEach((r, i) => place(this.rubble[i % this.rubble.length]!, r.x, r.z, -1, false, `rubble.${i}`));
      // The merchant's stall: his caravan and a chest beside him
      place(this.stations.caravan!, t.caravan.x, t.caravan.z, -1, false, 'caravan');
      place(this.stations.merchant_chest!, t.merchantChest.x, t.merchantChest.z, -1, false, 'merchantChest');
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
    if (p.anim === 'attack' || p.anim === 'cast') {
      const a = animOf(p.facing === 'side' && p.faceLeft && p.sheet.left ? p.sheet.left : p.sheet[p.facing], p.anim);
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

  /**
   * A hand-made attack is paced to the time between attacks, so every frame
   * of the swing shows before the next one starts and the hero does not snap
   * back to standing between fast attacks: each frame gets 60 to 200 ms. A
   * cast is quicker (producer's call, 2026-10-04): it fills under half the
   * time between spells, 40 to 100 ms a frame, so a base one-second cast
   * plays its nine frames in about 0.45 s.
   */
  private paceAttack(interval: number, anim: 'attack' | 'cast' = 'attack'): void {
    const sheet = this.hero.sheet;
    if (!sheet.handMade) return;
    const [share, min, max] = anim === 'cast' ? [0.45, 0.04, 0.1] : [0.9, 0.06, 0.2];
    for (const set of [sheet.front, sheet.back, sheet.side, sheet.left]) {
      if (!set) continue;
      const a = animOf(set, anim);
      a.frameTime = Math.max(min, Math.min(max, (interval * share) / a.frames.length));
    }
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
        this.paceAttack(1 / w.derived.atkSpd);
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
        this.paceAttack(w.derived.castInterval, 'cast');
        this.play(this.hero, 'cast');
        const color = def && def.pledgeId ? PLEDGES[def.pledgeId]!.color : ELEMENT_COLORS[ev.element];
        this.effects.flash(ev.x + ev.dirX * 0.5, 1.2, ev.z + ev.dirZ * 0.5, color, 1.2, 40, 0.2);
        pt.burst(ev.x + ev.dirX * 0.5, 1.2, ev.z + ev.dirZ * 0.5, 6, 1.5, color, 0.35, { priority: 0.5 });
        break;
      }
      case 'arc':
        // Lightning jumps: a jagged line between the two, sparks at the far end
        this.effects.link(ev.x0, 1, ev.z0, ev.x1, 1, ev.z1, 0xa8c8ff, 0.18);
        pt.burst(ev.x1, 1, ev.z1, 6, 1.5, 0xd8e8ff, 0.25, { priority: 0.5 });
        break;
      case 'minion_strike':
        if (ev.kind === 'eagle') {
          // Talons: a quick white rake and a few feathers knocked loose
          this.effects.slash(ev.x + ev.dirX * 0.3, ev.z + ev.dirZ * 0.3, ev.dirX, ev.dirZ, 0.8, 50, 0xf0ece0);
          pt.burst(ev.x + ev.dirX * 0.6, 1.0, ev.z + ev.dirZ * 0.6, 6, 1.2, 0xe8e0d0, 0.5, { gravity: 3, drag: 1.5, priority: 0.5 });
        } else {
          // The sword: a golden sweep and a flash of holy light
          this.effects.sweep(ev.x, ev.z, ev.dirX, ev.dirZ, 1.3, 100, 0xffd860, 0.22);
          this.effects.flash(ev.x + ev.dirX * 0.6, 1.0, ev.z + ev.dirZ * 0.6, 0xffe8a0, 1.6, 40, 0.2);
          pt.burst(ev.x + ev.dirX * 0.8, 0.9, ev.z + ev.dirZ * 0.8, 8, 1.6, 0xfff0b0, 0.4, { drag: 2, up: 1, priority: 0.6 });
        }
        break;
      case 'melee_swing':
        if (ev.visual === 'cleave') this.cleave(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc);
        else if (ev.visual === 'void') this.voidSlash(ev.x, ev.z, ev.range);
        else if (ev.visual === 'avalanche') this.avalanche(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc);
        else if (ev.visual === 'blind') this.blindFlash(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc);
        else this.effects.slash(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc, ELEMENT_COLORS[ev.element]);
        break;
      case 'melee_impact':
        if (ev.visual === 'overhead') this.smash(ev.x, ev.z, ELEMENT_COLORS[ev.element]);
        else if (ev.visual === 'bloody') this.bloodyHit(ev.x, ev.z);
        else if (ev.visual === 'holy') this.holyHit(ev.x, ev.z);
        else if (ev.visual === 'shade') {
          // A shade's blow: a dark flicker and black wisps off the target
          pt.burst(ev.x, 1.0, ev.z, 5, 1.4, 0x100818, 0.3, { up: 1, drag: 2, priority: 0.3, alpha: 0.9 });
          this.effects.flash(ev.x, 1, ev.z, 0x8a4ab0, 0.7, 26, 0.1);
        } else this.holyShield(ev.x, ev.z);
        break;
      case 'blood_drain': {
        // Blood torn out and pulled to the hero
        this.effects.link(ev.x, 0.9, ev.z, w.px, 1.0, w.pz, 0xc01828, 0.3);
        this.effects.flash(ev.x, 0.9, ev.z, 0xff2040, 1.4, 36, 0.25);
        const dx = w.px - ev.x;
        const dz = w.pz - ev.z;
        for (let i = 0; i < 14; i++) {
          const t = 0.3 + Math.random() * 0.25;
          pt.spawn(ev.x + (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.8, ev.z + (Math.random() - 0.5) * 0.4, dx / t, (1.1 - 0.6) / t, dz / t, t, Math.random() < 0.5 ? 0xc01828 : 0xff4a58, { priority: 0.7, size: Math.random() < 0.4 ? 2 : 1, delay: Math.random() * 0.1 });
        }
        break;
      }
      case 'holy_bolt':
        this.holyBolt(ev.x, ev.z);
        break;
      case 'aoe':
        this.aoeVisual(ev.visual, ev.x, ev.z, ev.radius, ev.element);
        break;
      case 'projectile_hit': {
        const color = ELEMENT_COLORS[ev.element];
        if (ev.splash > 0 && ev.element === 'fire') this.fireWave(ev.x, ev.z, ev.splash);
        else if (ev.splash > 0) this.explode(ev.x, ev.z, Math.max(0.5, ev.splash / 2.5), ev.element);
        else if (ev.shape === 'arrow' && ev.element === 'poison') this.poisonSplat(ev.x, ev.z);
        else {
          pt.burst(ev.x, 0.8, ev.z, ev.shape === 'boulder' ? 16 : 8, 2, color, 0.35, { priority: 0.5 });
          this.effects.flash(ev.x, 0.8, ev.z, color, 0.9, 30, 0.15);
        }
        break;
      }
      case 'zone_start': {
        const z = ev.zone;
        if (z.type === 'line_wave') {
          if (z.skillId === 'earthen_spikes') this.spikesRise(z);
          else this.slamWave(z);
        }
        if (z.type === 'quicksand') {
          // The ground gives: a ring of dust and sand sliding inward
          this.effects.ring(z.x, z.z, z.radius * 0.5, z.radius, 0xc8a870, 0.5, 2);
          pt.burst(z.x, 0.1, z.z, 30, 3 * z.radius, 0xc8a870, 0.8, { up: 0.8, gravity: 3, priority: 0.6, size: 2 });
          this.view.kick(0.1);
        }
        if (z.type === 'rockfall') this.effects.ring(z.x, z.z, 0.3, z.radius, 0x9a8a70, 0.6, 1);
        if (z.type === 'void_rift') {
          // The world tears: a purple ring snapping out, darkness pouring in
          this.effects.ring(z.x, z.z, 0.1, z.radius, 0xaa66cc, 0.4, 2, 1.5);
          this.effects.flash(z.x, 0.5, z.z, 0xaa66cc, 2, 90, 0.3);
          pt.burst(z.x, 0.3, z.z, 30, 3, 0x100818, 0.7, { drag: 1, priority: 0.7, size: 2, alpha: 0.9 });
          this.view.kick(0.15);
        }
        if (z.type === 'earthquake') {
          // The first heave: the ground splits under the hero and the screen jolts, harder when the whole map goes
          this.effects.cracks(z.x, z.z, z.wholeMap ? 60 : 40, 0x9a8a70, 1.4, z.wholeMap ? 14 : 10);
          pt.burst(z.x, 0.1, z.z, 30, 3, 0x8a7a68, 0.8, { up: 2.5, gravity: 6, priority: 0.7, size: 2 });
          this.view.kick(z.wholeMap ? 0.6 : 0.4);
        }
        if (z.type === 'fire_prison') this.effects.ring(z.x, z.z, 0.3, z.radius, 0xff7a2a, 0.4, 2, 1.5);
        if (z.type === 'sanctuary') this.effects.ring(z.x, z.z, 0.3, z.radius, 0xffe87a, 0.6, 2, 1.2);
        if (z.type === 'wind') {
          this.effects.ring(z.x, z.z, 0.3, z.radius, 0x8fd0ff, 0.5, 1);
          pt.burst(w.px, 0.3, w.pz, 30, 4, 0xd8ecff, 0.6, { up: 2, drag: 1, priority: 0.7 });
        }
        if (z.type === 'storm') this.effects.flash(z.x, 3, z.z, 0xd8e8ff, 3, 200, 0.2);
        if (z.type === 'blizzard') this.effects.ring(z.x, z.z, 0.3, 6, 0xd8f4ff, 0.6, 1, 1);
        if (z.type === 'frostbite') {
          this.effects.ring(z.x, z.z, 0.3, z.radius, 0x9fe0ff, 0.5, 2, 1.2);
          pt.burst(z.x, 0.2, z.z, 24, 2.5, 0xd8f4ff, 0.7, { up: 1, drag: 1.5, priority: 0.6 });
        }
        if (z.type === 'frost_patch') {
          // The ground the hero left freezes over with a crack
          this.effects.ring(z.x, z.z, 0.1, z.radius, 0xffffff, 0.3, 1, 1);
          pt.burst(z.x, 0.2, z.z, 14, 1.6, 0xd8f4ff, 0.5, { up: 1.5, priority: 0.6 });
        }
        if (z.type === 'summon') {
          // The ground breaks open where the daemon comes up; a lesser daemon (radius under one) breaks less of it
          const big = z.radius >= 1;
          this.effects.cracks(z.x, z.z, big ? 30 : 16, 0x55cc33, 1.2, big ? 8 : 5);
          this.effects.ring(z.x, z.z, 0.2, big ? 1.4 : 0.8, 0x55cc33, 0.5, 2, 1.2);
          pt.burst(z.x, 0.1, z.z, big ? 24 : 12, 2.2, 0x8a7a68, 0.6, { up: 2.5, gravity: 6, priority: 0.7, size: 2 });
          this.view.kick(big ? 0.12 : 0.05);
        }
        if (z.type === 'smoke') {
          // The bomb pops: a flash, a fast ring, and a thick puff of smoke thrown out to the edge
          this.effects.flash(z.x, 0.6, z.z, 0xd0d0e0, 1.6, 60, 0.15);
          this.effects.ring(z.x, z.z, 0.2, z.radius, 0xb0b0c0, 0.3, 2);
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 5;
            pt.spawn(z.x, 0.3 + Math.random() * 0.6, z.z, Math.cos(a) * spd, 0.6 + Math.random() * 1.2, Math.sin(a) * spd, 1.4 + Math.random() * 1.2, [0x5a5a68, 0x7a7a88, 0x9a9aa8, 0xb4b4c0][i % 4]!, { drag: 2.2, priority: 0.7, size: 3 + (i % 2), alpha: 0.85 });
          }
          this.view.kick(0.06);
        }
        if (z.type === 'poison') this.effects.ring(z.x, z.z, 0.3, z.radius, 0x66e070, 0.5, 1);
        break;
      }
      case 'zone_tick': {
        const zone = w.zones.find((z) => z.id === ev.id);
        if (zone?.type === 'arrow_storm') this.arrowFall(ev.x, ev.z);
        else if (zone?.type === 'line_wave') {
          // The front reaches a monster: thrown up by the slam, or a spray of dust and stone off the spikes
          if (zone.skillId === 'seismic_slam' && ev.enemyId !== undefined) this.launches.set(ev.enemyId, this.time);
          pt.burst(ev.x, 0.3, ev.z, 10, 1.6, 0x8a7a68, 0.5, { up: 2.5, gravity: 6, priority: 0.6, size: 2 });
        } else if (zone?.type === 'earthquake') {
          if (ev.enemyId !== undefined) {
            // Crushed against the wall: stone bursts off it
            this.effects.cracks(ev.x, ev.z, 16, 0x9a8a70, 0.6, 5);
            pt.burst(ev.x, 0.8, ev.z, 14, 2, 0x8a7a68, 0.6, { up: 2, gravity: 7, priority: 0.7, size: 2 });
          } else {
            // The heave: a hard jolt and a wave of dust rolling out from the hero
            this.view.kick(0.35);
            this.effects.ring(ev.x, ev.z, 0.3, 8, 0xc8b8a0, 0.7, 2);
            this.effects.ring(ev.x, ev.z, 0.3, 8, 0x9a8a70, 0.8, 1, 0, 0.1);
          }
        } else this.snowflakeHit(ev.x, ev.z);
        break;
      }
      case 'buff_start': {
        if (ev.id === 'summon_eagle' || ev.id === 'summon_eagle_ult' || ev.id === 'summon_angel') {
          const kind = ev.id === 'summon_angel' ? 'angel' : 'eagle';
          for (const m of w.minions) {
            if (!m.active || m.kind !== kind) continue;
            if (kind === 'eagle') pt.burst(m.x, 1.8, m.z, 12, 1.5, 0xe8e0d0, 0.6, { drag: 1.5, priority: 0.6 });
            else {
              // The angel comes down in a column of light
              this.effects.ring(m.x, m.z, 0.2, 1.4, 0xffe8a0, 0.5, 2, 1.5);
              pt.burst(m.x, 0.5, m.z, 30, 1.2, 0xfff0b0, 0.9, { up: 2.5, drag: 1, priority: 0.8 });
              this.effects.flash(m.x, 1.5, m.z, 0xffe8a0, 3, 90, 0.5);
              for (let i = 0; i < 10; i++) pt.spawn(m.x + (Math.random() - 0.5) * 0.6, 3 + Math.random(), m.z + (Math.random() - 0.5) * 0.6, 0, -3, 0, 0.6, 0xffffff, { priority: 0.7, size: 2, delay: i * 0.03 });
            }
          }
          break;
        }
        if (ev.id === 'meat_shield' && w.titan) {
          // The titan heaves itself out of the earth: the ground splits, dirt flies, the screen shakes
          const t = w.titan;
          this.effects.cracks(t.x, t.z, 40, 0x9a8a70, 1.2, 10);
          this.effects.ring(t.x, t.z, 0.3, 2.4, 0xc8b8a0, 0.5, 3, 1);
          pt.burst(t.x, 0.1, t.z, 40, 3, 0x6a5a48, 0.8, { up: 3, gravity: 6, priority: 0.8, size: 2 });
          pt.burst(t.x, 0.2, t.z, 16, 2, 0x9a8a70, 0.9, { up: 3.5, gravity: 6, priority: 0.7, size: 3 });
          this.effects.flash(t.x, 1.5, t.z, 0xff4030, 1.6, 60, 0.4);
          this.view.kick(0.3);
          break;
        }
        if (ev.id === 'skeleton_army') {
          // The dead claw their way up: cracks and a spray of grave dirt under each one, a sickly green flash
          for (const m of w.minions) {
            if (!m.active) continue;
            this.effects.cracks(m.x, m.z, 14, 0x66e070, 0.8, 6);
            pt.burst(m.x, 0.1, m.z, 14, 1.6, 0x6a5a48, 0.6, { up: 2.5, gravity: 6, priority: 0.7, size: 2 });
            pt.burst(m.x, 0.3, m.z, 8, 1, 0x9aff9a, 0.7, { up: 1.5, drag: 1, priority: 0.6 });
            this.effects.flash(m.x, 0.8, m.z, 0x66e070, 1.2, 36, 0.35);
          }
          this.view.kick(0.06);
          break;
        }
        if (ev.id === 'sneak' || ev.id === 'sneak_ult') {
          // Slipping into shadow: a puff of darkness and a ring that closes in on the hero
          pt.burst(w.px, 0.6, w.pz, 26, 1.4, 0x080810, 0.9, { drag: 1.5, up: 0.8, priority: 0.8, size: 2, alpha: 0.85 });
          this.effects.ring(w.px, w.pz, 1.6, 0.2, 0x3a4a80, 0.45, 2);
          break;
        }
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
        if (ev.id === 'divine_shield') {
          // The light closes over the hero: a white flash, a ring snapping out and sparks thrown up
          this.effects.flash(w.px, 1, w.pz, 0xfff6d0, 3.5, 100, 0.4);
          this.effects.ring(w.px, w.pz, 0.2, 1.8, 0xffffff, 0.35, 2, 1.5);
          pt.burst(w.px, 0.3, w.pz, 30, 1.4, 0xfff0b0, 0.8, { up: 3, drag: 1, priority: 0.8, size: 2 });
          this.view.kick(0.06);
          break;
        }
        if (ev.id === 'retribution') {
          // The halo lights: a pillar on the hero and a gold ring
          this.effects.pillar(w.px, w.pz, 0xffd860, 0.4, 7);
          this.effects.ring(w.px, w.pz, 0.2, 1.4, 0xffd860, 0.4, 2, 1);
          pt.burst(w.px, 2.2, w.pz, 12, 1, 0xffe8a0, 0.6, { gravity: 2, priority: 0.7 });
          break;
        }
        if (ev.id === 'shade_army') {
          // The shades step out of the hero's shadow
          this.shadePos.length = 0;
          this.effects.disc(w.px, w.pz, 1.6, 0x0a0414, 0.8, 0.7);
          pt.burst(w.px, 0.2, w.pz, 30, 1.6, 0x100818, 0.9, { up: 1.5, drag: 1, priority: 0.8, size: 2, alpha: 0.9 });
          this.effects.ring(w.px, w.pz, 0.2, 1.6, 0xaa66cc, 0.45, 2, 0.8);
          break;
        }
        if (ev.id === 'consecrated_blade') {
          // Holy fire runs down the blade
          const dx = Math.sin(w.pyaw);
          const dz = Math.cos(w.pyaw);
          for (let i = 0; i < 8; i++) pt.spawn(w.px + dx * (0.3 + i * 0.1), 0.9 + i * 0.12, w.pz + dz * (0.3 + i * 0.1), 0, 1.2, 0, 0.5, i % 2 ? 0xffffff : 0xffd860, { priority: 0.7, delay: i * 0.03 });
          this.effects.flash(w.px + dx * 0.5, 1.2, w.pz + dz * 0.5, 0xffd860, 2, 60, 0.3);
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
      case 'impale':
        this.impaleLanding(ev.x, ev.z, ev.radius);
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
        if (ev.status === 'blinded') {
          // Dazzled: a hard white flash at the eyes and stars reeling round the head
          this.effects.flash(e.x, 1.6 * e.scale, e.z, 0xffffff, 1.6, 30, 0.2);
          pt.burst(e.x, 1.9 * e.scale, e.z, 8, 0.9, 0xffffff, 0.6, { drag: 2, priority: 0.6 });
        }
        if (ev.status === 'puppeted') {
          // The blood seized: a red burst, a ring, and the strings drop from above
          pt.burst(e.x, 1.0 * e.scale, e.z, 20, 1.8, 0xc01828, 0.6, { up: 1.5, gravity: 3, priority: 0.7, size: 2 });
          this.effects.ring(e.x, e.z, 0.2, 1.0, 0xff2040, 0.4, 2, 1);
          this.effects.flash(e.x, 1, e.z, 0xff2040, 1.8, 50, 0.3);
        }
        if (ev.status === 'judged') {
          // The light finds it: a flash from above, a ring on the ground and motes rising in the beam
          this.effects.pillar(e.x, e.z, 0xffe8a0, 0.5, 8);
          this.effects.ring(e.x, e.z, 0.2, 1.2, 0xffe8a0, 0.45, 2, 1.2);
          pt.burst(e.x, 0.3, e.z, 16, 1.2, 0xfff0b0, 0.8, { up: 2.5, drag: 1, priority: 0.7 });
        }
        if (ev.status === 'shattered') {
          // The ice breaks off the monster in shards
          pt.burst(e.x, 0.9, e.z, 22, 2.4, 0xd8f4ff, 0.6, { gravity: 7, up: 2, priority: 0.7, size: 2 });
          pt.burst(e.x, 0.9, e.z, 10, 1.6, 0xffffff, 0.5, { gravity: 7, up: 2.5, priority: 0.7 });
          this.effects.flash(e.x, 0.9, e.z, 0xd8f4ff, 1.6, 40, 0.25);
          this.effects.ring(e.x, e.z, 0.1, 0.9, 0xffffff, 0.25, 1);
        }
        break;
      }
      case 'buff_end':
        if (ev.id === 'summon_eagle' || ev.id === 'summon_eagle_ult' || ev.id === 'summon_angel') {
          const kind = ev.id === 'summon_angel' ? 'angel' : 'eagle';
          for (const m of w.minions) if (m.active && m.kind === kind) pt.burst(m.x, kind === 'eagle' ? 1.8 : 1, m.z, 16, 1.2, kind === 'eagle' ? 0xe8e0d0 : 0xfff0b0, 0.8, { drag: 1, up: 0.5, priority: 0.6 });
        }
        if (ev.id === 'meat_shield') {
          // It comes apart: a heap of flesh and bone dust where it stood
          const t = w.minions.find((q) => q.kind === 'titan')!;
          pt.burst(t.x, 1.2, t.z, 40, 2, 0x82705e, 1.0, { gravity: 6, drag: 1, priority: 0.7, size: 3 });
          pt.burst(t.x, 1.5, t.z, 20, 1.5, 0xd6ceb6, 1.0, { gravity: 5, drag: 1, priority: 0.6, size: 2 });
          this.effects.disc(t.x, t.z, 1.2, 0x3a2a30, 2.5, 0.5);
          this.view.kick(0.15);
        }
        if (ev.id === 'skeleton_army') {
          // They crumble to bone dust where they stand
          for (const m of w.minions) {
            pt.burst(m.x, 0.6, m.z, 16, 1.2, 0xe8e0c8, 0.8, { gravity: 5, drag: 1, priority: 0.6, size: 2 });
            pt.burst(m.x, 0.4, m.z, 8, 0.8, 0x9aff9a, 0.6, { up: 1, priority: 0.5 });
          }
        }
        break;
      case 'zone_end':
      default:
        break;
    }
  }

  /** Fire Ball's landing: a wave of fire racing out to the splash radius with flames licking up along it. No explosion. */
  private fireWave(x: number, z: number, radius: number): void {
    this.effects.flash(x, 0.6, z, 0xff7a2a, 2.4, 50, 0.25);
    this.effects.wave(x, z, 0.2, radius, 0xff6a1a, 0.45, 2);
    this.effects.disc(x, z, radius, 0x5a1a08, 0.7, 0.35);
    this.effects.ring(x, z, 0.2, radius * 1.05, 0xffb040, 0.5, 1, 0, 0.1);
    // Flames rising off the wave as it passes, further out later
    const n = 28;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = i * 2.399 + x;
      const r = radius * (0.25 + 0.75 * (1 - (1 - t) * (1 - t)));
      this.particles.spawn(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, Math.cos(a) * 0.6, 1.6 + (i % 3) * 0.4, Math.sin(a) * 0.6, 0.4, i % 3 === 0 ? 0xffe070 : 0xff7a2a, { drag: 2, priority: 0.7, size: 2, delay: t * 0.3 });
    }
    this.view.kick(0.12);
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

  /** Poison Shot landing: venom splashes off the arrow, a green stain spreads on the floor and bubbles rise from it. */
  private poisonSplat(x: number, z: number): void {
    this.particles.burst(x, 0.8, z, 16, 2.2, 0x66e070, 0.5, { gravity: 6, up: 1, priority: 0.6, size: 2 });
    this.particles.burst(x, 0.8, z, 8, 1.4, 0xc0ffc0, 0.4, { gravity: 6, up: 1.5, priority: 0.6 });
    this.effects.disc(x, z, 0.55, 0x2a7a30, 1.2, 0.5);
    this.effects.ring(x, z, 0.1, 0.6, 0x66e070, 0.3, 1, 1.2);
    for (let i = 0; i < 6; i++) this.particles.spawn(x + (Math.random() - 0.5) * 0.6, 0.1, z + (Math.random() - 0.5) * 0.6, 0, 0.6, 0, 0.9, 0x9aff9a, { priority: 0.4, size: 2, alpha: 0.8, delay: 0.1 + i * 0.12 });
    this.effects.flash(x, 0.6, z, 0x66e070, 1.4, 40, 0.3);
  }

  /** Arrow Storm's volley on one enemy: three big arrows plunge from the sky round it, and stick quivering in the ground a moment. */
  private arrowFall(x: number, z: number): void {
    const arrow = this.fx.bigArrow;
    // Each arrow of the volley lands on its own spot a little apart in time, falling from four tiles up over a fifth of a second, then standing in the ground while it fades
    const delay = Math.random() * 0.12;
    this.effects.sprite(arrow, x, 4, z, arrow.width >> 1, arrow.height, 0.22 + delay, 'air', -4 * Y_PX, undefined, true);
    this.effects.sprite(arrow, x, 0.15, z, arrow.width >> 1, arrow.height, 0.9, 'air', 0, undefined, false, 0.22 + delay);
    this.particles.burst(x, 0.1, z, 5, 1.2, 0xc8b8a0, 0.35, { gravity: 6, up: 1.5, priority: 0.4, delay: 0.2 + delay });
    this.effects.ring(x, z, 0.1, 0.6, 0xe8e0d0, 0.25, 1, 0.6, 0.2 + delay);
  }

  /** Blizzard's hit: a big snowflake drops from above and bursts into ice where it lands. */
  private snowflakeHit(x: number, z: number): void {
    const flake = this.fx.snowflakes[(Math.random() * this.fx.snowflakes.length) | 0]!;
    this.effects.sprite(flake, x, 2.4, z, flake.width >> 1, flake.height >> 1, 0.34, 'air', -2.4 * Y_PX, undefined, true);
    this.effects.ring(x, z, 0.1, 1.2, 0xd8f4ff, 0.3, 1, 1, 0.17);
    this.particles.burst(x, 0.2, z, 10, 1.8, 0x9fe0ff, 0.45, { drag: 2, up: 1.5, priority: 0.4, delay: 0.17 });
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

  /**
   * Fire Armor and Frozen Armor: a bubble round the hero. Fire: a licking,
   * flickering rim with embers rising off it and a warm light. Ice: a slow,
   * glassy rim with frost crystals, snow drifting down off it and a cold light.
   */
  private drawArmorBubble(heroY: number, kind: 'fire' | 'ice' | 'holy'): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, heroY + 0.75, w.pz));
    const rx = 15;
    const ry = 20;
    const fire = kind === 'fire';
    const holy = kind === 'holy';
    const fill = fire ? '#ff7a2a' : holy ? '#ffe8a0' : '#9fe0ff';
    const rim = fire ? '#ff7a2a' : holy ? '#ffd860' : '#9fe0ff';
    const bright = fire ? '#ffe070' : '#ffffff';
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        ctx.globalAlpha = (fire ? 0.14 : holy ? 0.2 : 0.16) + Math.sin(this.time * (fire ? 9 : 3)) * 0.03;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (!fire) {
          // A glassy sheen: a thin pale outline and a highlight on the upper left
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = holy ? '#fff4d0' : '#d8f4ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.ellipse(fx, fy, rx - 3, ry - 3, 0, Math.PI * 1.1, Math.PI * 1.45);
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // The rim: tongues of flame wobbling in and out, or frost crystals slowly drifting round
        const n = 22;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.time * (fire ? 0.6 : -0.25);
          const wob = 1 + Math.sin(this.time * (fire ? 11 : 2.5) + i * 2.3) * (fire ? 0.12 : 0.04);
          const x = fx + Math.round(Math.cos(a) * rx * wob);
          const y = fy + Math.round(Math.sin(a) * ry * wob);
          const hot = Math.sin(this.time * (fire ? 13 : 4) + i * 1.1) > 0.3;
          ctx.fillStyle = hot ? bright : rim;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          if (hot) {
            ctx.fillStyle = rim;
            if (fire) ctx.fillRect(x - 1, y - 3, 2, 2);
            else if (holy) {
              // A four-pointed star of light
              ctx.fillRect(x - 3, y, 2, 1);
              ctx.fillRect(x + 2, y, 2, 1);
              ctx.fillRect(x, y - 3, 1, 2);
              ctx.fillRect(x, y + 2, 1, 2);
            } else {
              // A little six-pointed crystal
              ctx.fillRect(x - 2, y, 1, 1);
              ctx.fillRect(x + 1, y, 1, 1);
              ctx.fillRect(x, y - 2, 1, 1);
              ctx.fillRect(x, y + 1, 1, 1);
            }
          }
        }
      },
    });
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      if (fire) this.particles.spawn(w.px + Math.cos(a) * 0.45, heroY + 0.3 + Math.random() * 1.2, w.pz + Math.sin(a) * 0.45, 0, 1.2, 0, 0.5, Math.random() < 0.5 ? 0xffb040 : 0xff7a2a, { priority: 0.4, size: 1, alpha: 0.9 });
      else if (holy) this.particles.spawn(w.px + Math.cos(a) * 0.5, heroY + 0.2 + Math.random() * 1.2, w.pz + Math.sin(a) * 0.5, 0, 0.8, 0, 0.7, Math.random() < 0.5 ? 0xffffff : 0xffd860, { priority: 0.4, size: 1, alpha: 0.9 });
      else this.particles.spawn(w.px + Math.cos(a) * 0.5, heroY + 1.2 + Math.random() * 0.8, w.pz + Math.sin(a) * 0.5, 0, -0.5, 0, 1.0, Math.random() < 0.5 ? 0xffffff : 0xd0f0ff, { priority: 0.4, size: 1, alpha: 0.9 });
    }
    if (fire) this.lights.push({ x: fx, y: fy, radius: 40, intensity: 1 + Math.sin(this.time * 9) * 0.15, r: 1, g: 0.5, b: 0.2 });
    else if (holy) this.lights.push({ x: fx, y: fy, radius: 48, intensity: 1.3 + Math.sin(this.time * 4) * 0.15, r: 1, g: 0.9, b: 0.6 });
    else this.lights.push({ x: fx, y: fy, radius: 40, intensity: 0.9 + Math.sin(this.time * 3) * 0.1, r: 0.6, g: 0.85, b: 1 });
  }

  /** Prayer's healing: twelve small crosses rising round the hero in turn, brightest halfway up, plus a soft green light. */
  private drawPrayer(): void {
    this.drawHealMotes('#8aff8a', 12, 0.55, 0.9, [0.55, 1, 0.55]);
  }

  /** Small crosses of light climbing round the hero, in a colour: Prayer's green, the bandage's cloth white. */
  private drawHealMotes(color: string, count: number, speed: number, glow: number, rgbLight: [number, number, number]): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, 0.7, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.02,
      draw: () => {
        for (let i = 0; i < count; i++) {
          const phase = (this.time * speed + i * 0.29) % 1;
          const a = i * 2.4 + Math.floor(this.time * speed + i * 0.29) * 1.7;
          const r = 9 + (i % 3) * 3;
          const x = fx + Math.round(Math.cos(a) * r);
          const y = fy + 14 - Math.round(phase * 30);
          const bright = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
          ctx.globalAlpha = 0.35 + bright * 0.65;
          ctx.fillStyle = bright > 0.7 ? '#ffffff' : color;
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        }
        ctx.globalAlpha = 1;
      },
    });
    this.lights.push({ x: fx, y: fy, radius: 44, intensity: glow + Math.sin(this.time * 4) * 0.2, r: rgbLight[0], g: rgbLight[1], b: rgbLight[2] });
  }

  /** Incense burning: a thread of smoke rising off the hero and blue motes of mana drifting in, under a soft violet light. */
  private drawIncense(): void {
    const w = this.world;
    const cam = this.view;
    const heroY = this.heroHeight();
    if (Math.random() < 0.9) this.particles.spawn(w.px + (Math.random() - 0.5) * 0.3, heroY + 1.4 + Math.random() * 0.3, w.pz + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.7, (Math.random() - 0.5) * 0.3, 1.6, Math.random() < 0.5 ? 0x9a9ab0 : 0xc4c4d8, { priority: 0.4, size: 2, alpha: 0.7, drag: 0.5 });
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.8) continue;
      const a = Math.random() * Math.PI * 2;
      const r = 0.9 + Math.random() * 0.5;
      this.particles.spawn(w.px + Math.cos(a) * r, heroY + Math.random() * 1.2, w.pz + Math.sin(a) * r, -Math.cos(a) * 1.4, 0.2, -Math.sin(a) * 1.4, 0.7, Math.random() < 0.4 ? 0xffffff : 0x6a8aff, { priority: 0.4, size: 1, alpha: 0.9, drag: 0.8 });
    }
    this.lights.push({ x: Math.round(cam.frameX(w.px, w.pz)), y: Math.round(cam.frameY(w.px, heroY + 0.7, w.pz)), radius: 40, intensity: 0.7 + Math.sin(this.time * 3) * 0.1, r: 0.6, g: 0.55, b: 1 });
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

  /** Void Slash: a splash of void bursting out all round the hero from where the cut began; the trail itself is the zone. */
  private voidSlash(x: number, z: number, range: number): void {
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

  /** Rite of Blood: the hero as a daemon. Burning eyes, a dark red skin and outline, black smoke and a red light. */
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

  /** Avalanche: a wall of snow rolling out through the cone, a second wave behind it, snow and fog thrown ahead, and a cold flash. */
  private avalanche(x: number, z: number, dirX: number, dirZ: number, range: number, arc: number): void {
    this.effects.sweep(x, z, dirX, dirZ, range, arc, 0xd8f4ff, 0.45);
    this.effects.sweep(x, z, dirX, dirZ, range * 0.8, arc, 0x9fe0ff, 0.5, 0.1);
    const a0 = Math.atan2(dirZ, dirX) - (arc * Math.PI) / 360;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = a0 + ((arc * Math.PI) / 180) * Math.random();
      const r = range * (0.2 + 0.8 * t);
      const snow = Math.random() < 0.6;
      this.particles.spawn(x + Math.cos(a) * r * 0.5, 0.2 + Math.random() * 0.8, z + Math.sin(a) * r * 0.5, Math.cos(a) * 5, 1 + Math.random(), Math.sin(a) * 5, 0.5 + Math.random() * 0.3, snow ? 0xffffff : 0xb8d8f0, { drag: 2.5, gravity: 2, priority: 0.6, size: snow ? 2 : 4, alpha: snow ? 0.95 : 0.55, delay: t * 0.3 });
    }
    this.effects.flash(x + dirX * range * 0.5, 0.8, z + dirZ * range * 0.5, 0xd8f4ff, 1.8, 90, 0.4);
    this.view.kick(0.12);
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
      case 'thunderclap': {
        // A crack of thunder: a blinding white ring snapping outward, a hard flash, sparks everywhere and a jolt
        this.effects.ring(x, z, 0.2, radius, 0xffffff, 0.18, 3, 2.5);
        this.effects.ring(x, z, 0.2, radius * 1.1, 0xa8c8ff, 0.35, 2, 0, 0.05);
        this.effects.wave(x, z, 0.2, radius, 0xa8c8ff, 0.3, 1.5);
        this.effects.flash(x, 1, z, 0xffffff, 3, 120, 0.2);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + z;
          this.effects.link(x, 1, z, x + Math.cos(a) * radius, 0.2, z + Math.sin(a) * radius, 0xa8c8ff, 0.12);
        }
        this.particles.burst(x, 0.8, z, 30, 4, 0xd8e8ff, 0.4, { drag: 2, priority: 0.7 });
        this.view.kick(0.3);
        break;
      }
      case 'winter': {
        // Winter's Heart: the cold takes the whole field at once. A hard white flash, a wave of frost racing to the
        // edge of sight, frost thrown up everywhere, and the screen shakes
        this.effects.flash(x, 1, z, 0xffffff, 4, 300, 0.35);
        this.effects.wave(x, z, 0.3, radius, 0xd8f4ff, 0.7, 2.5);
        this.effects.wave(x, z, 0.3, radius * 0.9, 0x9fe0ff, 0.8, 0, 0.12);
        this.effects.disc(x, z, radius, 0xa8d8f0, 3.4, 0.22);
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * Math.min(radius, 11);
          this.particles.spawn(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, 0, 1.5 + Math.random(), 0, 0.8, i % 3 ? 0xd8f4ff : 0xffffff, { gravity: 3, priority: 0.6, size: 2, delay: (r / 11) * 0.6 });
        }
        this.view.kick(0.25);
        break;
      }
      case 'nova_cold': {
        // A shockwave of ice from the hero: a hard white-blue wave out to the radius, a frosted floor left behind,
        // shards thrown up along the wave and a cold flash
        this.effects.wave(x, z, 0.2, radius, 0x9fe0ff, 0.4, 2.2);
        this.effects.wave(x, z, 0.2, radius * 0.85, 0xd8f4ff, 0.5, 0, 0.08);
        this.effects.disc(x, z, radius, 0xa8d8f0, 1.6, 0.3);
        this.effects.ring(x, z, 0.2, radius * 1.05, 0xffffff, 0.45, 1, 0, 0.1);
        this.effects.flash(x, 0.8, z, 0xd8f4ff, 2.5, 90, 0.25);
        const n = 32;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const a = i * 2.399 + x;
          const r = radius * (0.2 + 0.8 * (1 - (1 - t) * (1 - t)));
          this.particles.spawn(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, Math.cos(a) * 1.2, 2.2 + (i % 3) * 0.5, Math.sin(a) * 1.2, 0.5, i % 3 === 0 ? 0xffffff : 0x9fe0ff, { gravity: 7, priority: 0.7, size: i % 2 ? 2 : 1, delay: t * 0.28 });
        }
        this.particles.burst(x, 0.5, z, 16, 2, 0xffffff, 0.4, { drag: 2, up: 1.5, priority: 0.7 });
        this.view.kick(0.1);
        break;
      }
      case 'nova_poison': {
        // A plague wave rolling out, a second one behind it, a cloud left hanging and spores drifting up along the way
        this.effects.wave(x, z, 0.2, radius, 0x3aa040, 0.6, 1.6);
        this.effects.wave(x, z, 0.2, radius * 0.9, 0x66e070, 0.7, 0, 0.12);
        this.effects.disc(x, z, radius, 0x1a4a20, 1.4, 0.45);
        this.effects.ring(x, z, 0.2, radius, 0x9aff9a, 0.55, 1, 0, 0.15);
        const n = 40;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const a = i * 2.399 + z;
          const r = radius * (0.15 + 0.85 * (1 - (1 - t) * (1 - t)));
          this.particles.spawn(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, Math.cos(a) * 0.4, 0.7 + (i % 3) * 0.3, Math.sin(a) * 0.4, 1.2, i % 4 === 0 ? 0xc0ffc0 : i % 2 ? 0x66e070 : 0x2a8a30, { drag: 1.5, priority: 0.7, size: i % 3 === 0 ? 3 : 2, alpha: 0.85, delay: t * 0.4 });
        }
        this.particles.burst(x, 0.6, z, 14, 1.2, 0x9aff9a, 0.7, { up: 1.5, drag: 1, priority: 0.6, size: 2 });
        this.view.kick(0.06);
        break;
      }
      case 'rock':
        this.rockLand(x, z, radius);
        break;
      case 'shadow_burst':
        // Out of the shadow swinging: a black disc, a purple ring and a sweep of darkness all round
        this.effects.disc(x, z, radius, 0x0a0414, 0.5, 0.7);
        this.effects.ring(x, z, 0.1, radius, 0xaa66cc, 0.3, 2, 1.2);
        this.effects.ring(x, z, 0.1, radius * 0.6, 0xffffff, 0.15, 1);
        this.particles.burst(x, 0.5, z, 24, radius * 2.2, 0x100818, 0.5, { drag: 2, priority: 0.7, size: 2, alpha: 0.9 });
        this.particles.burst(x, 0.8, z, 10, 1.5, 0xc080ff, 0.4, { up: 1.5, drag: 2, priority: 0.6 });
        this.view.kick(0.08);
        break;
      case 'exsanguinate':
        // The pull: a dark red disc and two rings closing on the hero
        this.effects.disc(x, z, radius, 0x2a0410, 0.6, 0.5);
        this.effects.ring(x, z, radius, 0.3, 0xc01828, 0.45, 2, 1.2);
        this.effects.ring(x, z, radius * 0.7, 0.2, 0xff4a58, 0.35, 1, 0, 0.1);
        this.effects.flash(x, 1, z, 0xff2040, 2.5, 90, 0.4);
        this.view.kick(0.1);
        break;
      case 'boulder':
        this.boulderLand(x, z, radius);
        break;
      case 'lightning':
        this.effects.strike(x, z, 0xa8c8ff);
        this.particles.burst(x, 0.2, z, 10, 2, 0xd8e8ff, 0.3, { priority: 0.6 });
        break;
      case 'trap':
        // The jaws snap: a white flash ring, sparks off the iron and shards flung outward
        this.effects.ring(x, z, 0.1, radius, 0xffffff, 0.2, 2, 1.5);
        this.effects.ring(x, z, 0.2, radius * 1.2, 0xb0b0c0, 0.4, 1);
        this.particles.burst(x, 0.3, z, 18, 2.5, 0xd8d0c0, 0.45, { gravity: 6, up: 2.5, priority: 0.6 });
        this.particles.burst(x, 0.2, z, 10, 1.5, 0xffe070, 0.3, { gravity: 5, up: 2, priority: 0.6 });
        this.view.kick(0.1);
        break;
      case 'curse': {
        // Death: a dark stain, a ring drawing in, and a great skull rising out of the ground and fading into the air
        const skull = this.fx.skull;
        this.effects.disc(x, z, radius * 1.1, 0x1a0630, 1.6, 0.6);
        this.effects.ring(x, z, radius * 1.4, 0.2, 0xb060ff, 0.5, 2, 1.5);
        this.effects.sprite(skull, x, 0.2, z, skull.width >> 1, skull.height, 1.5, 'air', 26, { color: 0xb060ff, intensity: 2, radius: 70 });
        this.particles.burst(x, 0.2, z, 30, 1.2, 0xb060ff, 1.3, { up: 1.8, drag: 1, priority: 0.7, size: 2 });
        this.particles.burst(x, 0.1, z, 16, 1.8, 0x2a0a40, 1.0, { up: 1, drag: 1, priority: 0.6, size: 3, alpha: 0.7 });
        this.view.kick(0.08);
        break;
      }
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
    // Creator mode looks wherever the producer drags the view
    if (this.creator) this.view.snapTo(this.creator.x, this.creator.z);
    else this.view.lookAt(w.px + Math.sin(w.pyaw) * lead, w.pz + Math.cos(w.pyaw) * lead);
    this.view.update(dt);
    this.syncHero(dt);
    if (w.pet.active) {
      if (!this.pet) this.pet = { sheet: crabSheet(this.pal, 1, OUTLINE), anim: 'idle', animT: 0, facing: 'side', faceLeft: false, flash: 0, dying: -1 };
      const c = this.pet;
      this.face(c, Math.sin(w.pet.yaw), Math.cos(w.pet.yaw));
      c.facing = 'side';
      this.advance(c, dt, w.pet.moving);
    }
    for (let i = 0; i < w.minions.length; i++) {
      const m = w.minions[i]!;
      if (!m.active || m.kind !== 'archer') continue;
      let p = this.minionPuppets[i];
      if (!p) {
        p = { sheet: this.monsterSheet('bone_archer'), anim: 'idle', animT: Math.random(), facing: 'front', faceLeft: false, flash: 0, dying: -1 };
        this.minionPuppets[i] = p;
      }
      this.face(p, Math.sin(m.yaw), Math.cos(m.yaw));
      if (m.shoot > 0.28 && p.anim !== 'attack') this.play(p, 'attack');
      this.advance(p, dt, m.moving);
    }
    this.syncEnemies(dt);
    this.syncZoneParticles(dt);
    this.effects.update(dt);
    this.particles.update(dt);
    if (this.beamTarget >= 0) {
      const t = w.enemies[this.beamTarget];
      if (t && t.alive && !t.dead) {
        this.effects.beamSet(w.px, 1.2, w.pz, t.x, 0.8, t.z, 0xd01a30);
        // Blood pulled along the beam from the enemy into the hero
        const dx = w.px - t.x;
        const dz = w.pz - t.z;
        const dist = Math.max(0.1, Math.hypot(dx, dz));
        const speed = 7;
        for (let i = 0; i < 2; i++) {
          if (Math.random() > dt * 60) continue;
          const j = (Math.random() - 0.5) * 0.3;
          this.particles.spawn(t.x - dz / dist * j, 0.8 + Math.random() * 0.4, t.z + dx / dist * j, (dx / dist) * speed, 0.2, (dz / dist) * speed, dist / speed, Math.random() < 0.3 ? 0xff5060 : 0x9a1020, { priority: 0.6, size: Math.random() < 0.4 ? 3 : 2 });
        }
      }
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
      if (z.type === 'poison' && Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * z.radius;
        pt.spawn(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, 0, 0.5, 0, 1.2, 0x66e070, { alpha: 0.6, priority: 0.4, size: 2 });
      }
      if (z.type === 'smoke') {
        // Smoke billowing: fat grey puffs rolling up and drifting across the whole cloud, thickest near the middle
        for (let k = 0; k < 7; k++) {
          if (Math.random() >= dt * 40) continue;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.radius * 0.95;
          const drift = 0.3;
          pt.spawn(z.x + Math.cos(a) * r, 0.05 + Math.random() * 0.4, z.z + Math.sin(a) * r, Math.cos(a + 1.2) * drift, 0.25 + Math.random() * 0.3, Math.sin(a + 1.2) * drift, 2 + Math.random() * 1.5, [0x5a5a68, 0x7a7a88, 0x9a9aa8, 0xb4b4c0][(Math.random() * 4) | 0]!, { alpha: 0.8, priority: 0.45, size: Math.random() < 0.5 ? 4 : 5, drag: 0.6 });
        }
      }
      if (z.type === 'wind' && Math.random() < dt * 90) {
        // Debris caught in the funnel: whipping round the hero, climbing as it goes, the rest streaking round the gale's edge
        const a = Math.random() * Math.PI * 2;
        const inFunnel = Math.random() < 0.7;
        const r = inFunnel ? 0.5 + Math.random() * 1.8 : z.radius * (0.5 + Math.random() * 0.5);
        const h = inFunnel ? Math.random() * 3.5 : 0.2 + Math.random() * 0.8;
        const spd = inFunnel ? 6 : 4;
        pt.spawn(z.x + Math.cos(a) * r, h, z.z + Math.sin(a) * r, -Math.sin(a) * spd, inFunnel ? 1.5 : 0, Math.cos(a) * spd, inFunnel ? 0.35 : 0.5, Math.random() < 0.3 ? 0xd8ecff : Math.random() < 0.5 ? 0x9fd8ff : 0x8a8a90, { alpha: 0.7, priority: 0.4, size: Math.random() < 0.3 ? 2 : 1 });
      }
      if (z.type === 'sanctuary' && Math.random() < dt * 30) {
        // Motes drifting up everywhere inside, and sparks off the candles at the rim
        const a = Math.random() * Math.PI * 2;
        const rim = Math.random() < 0.35;
        const r = rim ? z.radius : Math.sqrt(Math.random()) * z.radius * 0.9;
        pt.spawn(z.x + Math.cos(a) * r, rim ? 0.5 : 0.1, z.z + Math.sin(a) * r, 0, rim ? 1.6 : 0.8, 0, rim ? 0.5 : 1.6, Math.random() < 0.5 ? 0xfff4c0 : 0xffe87a, { priority: 0.4, alpha: 0.9 });
      }
      if (z.type === 'frostbite' && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * z.radius;
        pt.spawn(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, 0, 0.5, 0, 1.2, Math.random() < 0.5 ? 0xffffff : 0x9fe0ff, { priority: 0.4, alpha: 0.8 });
      }
      if (z.type === 'winter' && Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * Math.min(z.radius, 11);
        pt.spawn(z.x + Math.cos(a) * r, 3.5 + Math.random(), z.z + Math.sin(a) * r, 0.3, -2.5, 0.3, 1.2, 0xffffff, { priority: 0.35, alpha: 0.8 });
      }
      if (z.type === 'arrow_storm' && Math.random() < dt * 3) {
        // Stray arrows dropping across the field between volleys
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * Math.min(z.radius, 9);
        const arrow = this.fx.bigArrow;
        this.effects.sprite(arrow, z.x + Math.cos(a) * r, 4, z.z + Math.sin(a) * r, arrow.width >> 1, arrow.height, 0.22, 'air', -4 * Y_PX, undefined, true);
        this.effects.sprite(arrow, z.x + Math.cos(a) * r, 0.15, z.z + Math.sin(a) * r, arrow.width >> 1, arrow.height, 0.7, 'air', 0, undefined, false, 0.22);
      }
      if (z.type === 'storm') {
        // Rain driving down over the whole dark patch, and low cloud drifting above it
        if (Math.random() < dt * 90) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.radius;
          pt.spawn(z.x + Math.cos(a) * r, 4.5, z.z + Math.sin(a) * r, 0.3, -9, 0.3, 0.5, 0x8aa8c8, { alpha: 0.55, priority: 0.35 });
        }
        if (Math.random() < dt * 6) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.radius * 0.9;
          pt.spawn(z.x + Math.cos(a) * r, 4.6 + Math.random() * 0.6, z.z + Math.sin(a) * r, 0.5, 0, 0.3, 2.5, Math.random() < 0.5 ? 0x2a3040 : 0x3a4458, { alpha: 0.75, priority: 0.35, size: 3 });
        }
      }
      if (z.type === 'blizzard') {
        // A true winter storm: snow sheeting across on the wind, thick and fast, some flakes big and slow
        const wx = Math.cos(z.id * 1.3) * 3;
        const wz = Math.sin(z.id * 1.3) * 3;
        // The storm covers the whole field, so the snow is spawned only as far as the frame can see
        const spread = Math.min(z.radius, 11);
        for (let k = 0; k < 20; k++) {
          if (Math.random() >= dt * 60) continue;
          const big = Math.random() < 0.2;
          pt.spawn(z.x + (Math.random() - 0.5) * spread * 2, 3.5 + Math.random() * 1.5, z.z + (Math.random() - 0.5) * spread * 2, wx * (big ? 0.6 : 1) + Math.random(), big ? -2 : -4.5, wz * (big ? 0.6 : 1) + Math.random(), big ? 1.4 : 1, big ? 0xffffff : Math.random() < 0.5 ? 0xd0f0ff : 0xa8d8f0, { alpha: big ? 0.95 : 0.7, priority: 0.35, size: big ? 2 : 1 });
        }
      }
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
    this.mctx.clearRect(0, 0, W, H);
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
          if (p.smooth) this.maskDraw(frame, fx - p.prop.originX, fy - p.prop.originY, false);
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
          this.maskDraw(frame, fx - anim.originX, fy - anim.originY, false);
        },
      });
    }

    // Hero
    const heroY = this.heroHeight();
    const rite = w.buffs.some((b) => b.id === 'rite_of_blood');
    const sneaking = w.invisible && !w.playerDead;
    this.pushPuppet(this.hero, w.px, heroY, w.pz, sneaking ? 0.5 : 1, rite ? '#7a0a2a' : sneaking ? '#101828' : null, rite ? '#ff2040' : null, true);
    const shades = w.buffs.find((b) => b.mods.shades)?.mods.shades;
    if (shades && !w.playerDead) this.drawShades(heroY, shades.count);
    if (sneaking && Math.random() < 0.5) {
      // Shadow clinging to the hero: dark wisps drifting up off the body
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(w.px + Math.cos(a) * 0.35, heroY + 0.1 + Math.random() * 1.2, w.pz + Math.sin(a) * 0.35, 0, 0.5, 0, 0.8, Math.random() < 0.5 ? 0x080810 : 0x182038, { priority: 0.4, size: 2, alpha: 0.75 });
    }
    if (rite && !w.playerDead) this.drawRite();
    if (w.pet.active && this.pet) this.pushPuppet(this.pet, w.pet.x, 0, w.pet.z, 1, null);
    if (w.titan) this.drawTitan(w.titan);
    for (const m of w.minions) if (m.active && (m.kind === 'eagle' || m.kind === 'angel')) this.drawCompanion(m);
    for (let i = 0; i < w.minions.length; i++) {
      const m = w.minions[i]!;
      const p = this.minionPuppets[i];
      if (!m.active || !p || m.kind !== 'archer') continue;
      this.pushPuppet(p, m.x, 0, m.z, 1, null);
      if (m.shoot > 0.25) this.lights.push({ x: Math.round(cam.frameX(m.x, m.z)), y: Math.round(cam.frameY(m.x, 1, m.z)), radius: 24, intensity: 0.8, r: 1, g: 0.3, b: 0.3 });
    }
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
      else if (e.status.blind > 0) tint = '#ffffff';
      else if (e.status.puppet > 0) tint = '#c01828';
      else if (e.status.curse) tint = '#c080ff';
      else if (e.status.poison) tint = '#66e070';
      const targeted = e.id === w.targetId && !e.dead;
      // Flying things bob above the ground
      let hover = e.def?.hover && !e.dead ? (e.def.hover + Math.sin(this.time * 4 + e.id) * 2) / 12 : 0;
      const launch = this.launches.get(e.id);
      if (launch !== undefined) {
        // Thrown up by Seismic Slam: a short arc into the air and back down
        const k = (this.time - launch) / 0.55;
        if (k >= 1 || e.dead) this.launches.delete(e.id);
        else hover += 1.8 * Math.sin(k * Math.PI);
      }
      if (e.status.sink > 0 && !e.dead) {
        // Sunk in quicksand: lower in the ground, with the sand closing over its feet
        hover -= Math.min(0.5, e.status.sink * 0.17);
        const sx = Math.round(fx);
        const sy = Math.round(fy);
        this.items.push({
          depth: cam.depth(e.x, e.z) + 0.001,
          draw: () => {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#a08858';
            ctx.beginPath();
            ctx.ellipse(sx, sy, 12 + e.radius * 6, 6 + e.radius * 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#7a6440';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
          },
        });
      }
      if (e.status.mark && !e.dead) this.drawJudgement(e, Math.round(fx), Math.round(fy), p.sheet.height);
      if (e.status.puppet > 0 && !e.dead) this.drawStrings(e, Math.round(fx), Math.round(cam.frameY(e.x, hover, e.z)), p.sheet.height);
      this.pushPuppet(p, e.x, hover, e.z, 1, tint, targeted ? TARGET_COLOR : null, !!e.dummy);
      if (e.status.blind > 0 && !e.dead && Math.random() < 0.5) {
        // Stars reeling round the head
        const a = this.time * 7 + e.id;
        this.particles.spawn(e.x + Math.cos(a) * 0.35, 1.95 * e.scale + hover, e.z + Math.sin(a) * 0.35, 0, 0.3, 0, 0.2, 0xffffff, { priority: 0.3 });
      }
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
      const venom = pr.shape === 'arrow' && pr.element === 'poison' && pr.owner !== 'enemy';
      const great = pr.shape === 'greatarrow';
      const lance = pr.shape === 'lance';
      const orb = pr.shape === 'orb';
      const color = pr.owner === 'enemy' ? 0xff4a3a : pr.shape === 'star' ? 0xffe070 : pr.shape === 'hammer' ? 0xffd860 : venom ? 0x66e070 : great ? 0x55cc33 : lance ? 0x9fe0ff : orb || pr.shape === 'spark' ? 0xa8c8ff : pr.shape === 'arrow' || pr.shape === 'dagger' ? 0xe8e0d0 : ELEMENT_COLORS[pr.element];
      if (orb) {
        // Ball lightning crackles: a hard flickering light and sparks jumping off it to the ground
        this.lights.push({ x: Math.round(cam.frameX(pr.x, pr.z)), y: Math.round(cam.frameY(pr.x, pr.y, pr.z)), radius: 70, intensity: 1.6 + Math.sin(this.time * 40) * 0.5, r: 0.65, g: 0.8, b: 1 });
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          this.particles.spawn(pr.x + Math.cos(a) * 0.6, pr.y + (Math.random() - 0.5) * 0.6, pr.z + Math.sin(a) * 0.6, Math.cos(a) * 3, -2, Math.sin(a) * 3, 0.25, Math.random() < 0.5 ? 0xffffff : 0xa8c8ff, { priority: 0.5, drag: 3 });
        }
        if (Math.random() < 0.15) this.effects.link(pr.x, pr.y, pr.z, pr.x + (Math.random() - 0.5) * 2.5, 0, pr.z + (Math.random() - 0.5) * 2.5, 0xa8c8ff, 0.1);
      } else if (pr.shape === 'spark') {
        this.lights.push({ x: Math.round(cam.frameX(pr.x, pr.z)), y: Math.round(cam.frameY(pr.x, pr.y, pr.z)), radius: 30, intensity: 1.2, r: 0.65, g: 0.8, b: 1 });
      }
      if (lance) {
        // Frost crystals shed behind the lance, and a cold light on it
        if (Math.random() < 0.8) this.particles.spawn(pr.x, pr.y + (Math.random() - 0.5) * 0.3, pr.z, (Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5, 0.45, Math.random() < 0.4 ? 0xffffff : 0x9fe0ff, { priority: 0.5, alpha: 0.9, drag: 2 });
        this.lights.push({ x: Math.round(cam.frameX(pr.x, pr.z)), y: Math.round(cam.frameY(pr.x, pr.y, pr.z)), radius: 34, intensity: 1, r: 0.6, g: 0.85, b: 1 });
      }
      if (great) {
        // The daemon's arrow tears the air: a green wake behind it and a hard green light
        for (let i = 0; i < 2; i++) this.particles.spawn(pr.x - (pr.vx / Math.max(1, Math.hypot(pr.vx, pr.vz))) * i * 0.4, pr.y + (Math.random() - 0.5) * 0.3, pr.z - (pr.vz / Math.max(1, Math.hypot(pr.vx, pr.vz))) * i * 0.4, (Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6, 0.35, i === 0 ? 0xc0ffa0 : 0x55cc33, { priority: 0.6, size: 2, alpha: 0.9, drag: 3 });
        this.lights.push({ x: Math.round(cam.frameX(pr.x, pr.z)), y: Math.round(cam.frameY(pr.x, pr.y, pr.z)), radius: 44, intensity: 1.4, r: 0.4, g: 1, b: 0.3 });
      }
      if (venom) {
        // Venom dripping off the arrowhead as it flies, and a sickly glow round it
        if (Math.random() < 0.7) this.particles.spawn(pr.x, pr.y - 0.05, pr.z, (Math.random() - 0.5) * 0.3, -0.8, (Math.random() - 0.5) * 0.3, 0.4, Math.random() < 0.3 ? 0xc0ffc0 : 0x66e070, { priority: 0.5, alpha: 0.9, gravity: 2 });
        this.lights.push({ x: Math.round(cam.frameX(pr.x, pr.z)), y: Math.round(cam.frameY(pr.x, pr.y, pr.z)), radius: 26, intensity: 0.8, r: 0.4, g: 1, b: 0.45 });
      }
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
      const rings = od.stacks ? b.data.rings ?? 1 : od.rings ?? 1;
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
    if (w.bandage && !w.playerDead) this.drawHealMotes('#f4ecd8', 8, 0.45, 0.6, [1, 0.95, 0.85]);
    if (w.incense && !w.playerDead) this.drawIncense();
    this.drawRockSolid();

    // Fire Prison: bars of flame standing round the ring, each flickering on its own
    for (const z of w.zones) {
      if (z.type !== 'fire_prison') continue;
      const bars = Math.max(10, Math.round(z.radius * 6.5));
      const flame = this.fx.flame;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const bx = z.x + Math.cos(a) * z.radius;
        const bz = z.z + Math.sin(a) * z.radius;
        const fx = Math.round(cam.frameX(bx, bz));
        const fy = Math.round(cam.frameY(bx, 0, bz));
        const f = flame[(Math.floor(this.time * 14 + i * 1.7) % flame.length + flame.length) % flame.length]!;
        this.items.push({ depth: cam.depth(bx, bz), draw: () => ctx.drawImage(f, fx - (f.width >> 1), fy - f.height + 2) });
      }
    }
    // The Titan's ground: a quake shakes the frame and splits the floor, sand slides into quicksand, grit falls under a rockfall
    for (const z of w.zones) {
      if (z.type === 'earthquake') {
        this.view.kick(0.05);
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 6;
          this.effects.cracks(w.px + Math.cos(a) * r, w.pz + Math.sin(a) * r, 14, 0x9a8a70, 1.0, 5);
        }
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 7;
          this.particles.spawn(w.px + Math.cos(a) * r, 4 + Math.random() * 2, w.pz + Math.sin(a) * r, 0, -4, 0, 0.8, 0x8a7a68, { gravity: 6, priority: 0.3, size: Math.random() < 0.3 ? 2 : 1 });
        }
      } else if (z.type === 'quicksand') {
        // Sand sliding in from the rim; the ultimate's pull sends it racing to the heart
        if (Math.random() < (z.pull > 0 ? 1 : 0.7)) {
          const a = Math.random() * Math.PI * 2;
          const r = z.radius * (0.7 + Math.random() * 0.3);
          const v = 0.9 + z.pull;
          this.particles.spawn(z.x + Math.cos(a) * r, 0.05, z.z + Math.sin(a) * r, -Math.cos(a) * v, 0, -Math.sin(a) * v, 1.2, 0xc8a870, { drag: 0.3, priority: 0.3 });
        }
      } else if (z.type === 'void_rift') {
        // Darkness at the heart of it, a purple rim, and wisps pulled in from all round
        const cx = cam.frameX(z.x, z.z);
        const cy = cam.frameY(z.x, 0.3, z.z);
        this.lights.push({ x: cx, y: cy, radius: z.radius * TILE_W * 1.1, intensity: -0.55, r: 0, g: 0, b: 0 });
        this.lights.push({ x: cx, y: cy, radius: z.radius * TILE_W * 0.5, intensity: 0.7 + Math.sin(this.time * 9) * 0.15, r: 0.6, g: 0.3, b: 0.9 });
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = z.radius * (0.8 + Math.random() * 0.4);
          const t = 0.35 + Math.random() * 0.2;
          this.particles.spawn(z.x + Math.cos(a) * r, 0.1 + Math.random() * 1.2, z.z + Math.sin(a) * r, (-Math.cos(a) * r) / t, 0, (-Math.sin(a) * r) / t, t, Math.random() < 0.5 ? 0x100818 : 0xaa66cc, { priority: 0.4, size: Math.random() < 0.3 ? 2 : 1, alpha: 0.9 });
        }
      } else if (z.type === 'rockfall') {
        if (Math.random() < 0.5) this.particles.spawn(z.x + (Math.random() - 0.5) * 2 * z.radius, 5 + Math.random() * 2, z.z + (Math.random() - 0.5) * 2 * z.radius, 0, -3, 0, 1.0, 0x8a7a68, { gravity: 5, priority: 0.3 });
      }
    }
    if (!w.playerDead) {
      if (w.buffs.some((b) => b.id === 'fire_armor')) this.drawArmorBubble(heroY, 'fire');
      if (w.buffs.some((b) => b.id === 'frozen_armor')) this.drawArmorBubble(heroY, 'ice');
      if (w.zones.some((z) => z.type === 'wind' && z.followsPlayer)) this.drawTornado(heroY);
      if (w.buffs.some((b) => b.id === 'quickshot' || b.id === 'quickshot_ult')) this.drawQuickWind(heroY);
      if (w.buffs.some((b) => b.mods.deflect)) this.drawWindBarrier(heroY);
      if (w.buffs.some((b) => b.mods.overload)) this.drawOverload(heroY);
      if (w.buffs.some((b) => b.mods.holyBlade)) this.drawHolyBlade(heroY);
      if (w.charge) this.drawChargeJavelins(heroY);
      if (w.buffs.some((b) => b.mods.invulnerable)) this.drawArmorBubble(heroY, 'holy');
      if (w.buffs.some((b) => b.mods.retribution)) this.drawRetribution(heroY);
    }

    // Arrow of Beyond: the daemon, rising out of the ground, drawing, loosing, and sinking back
    for (const z of w.zones) {
      if (z.type !== 'summon') continue;
      this.drawDaemon(z);
    }

    // Boulder Toss: the rock on its way down, from high above to the marked ground
    for (const z of w.zones) {
      if (z.type !== 'boulder') continue;
      // Out of sight for the first third, then a true fall: speeding up all the way down
      const k = Math.max(0, 1 - z.remaining / z.duration - 0.35) / 0.65;
      const h = 9 * (1 - k * k);
      if (h > 8.5) continue;
      const small = z.radius < 2;
      const rock = small ? this.fx.stones[z.id % 2]! : this.fx.boulder;
      const fx = Math.round(cam.frameX(z.x, z.z));
      const fy = Math.round(cam.frameY(z.x, h, z.z));
      this.items.push({ depth: cam.depth(z.x, z.z) + 0.02, draw: () => ctx.drawImage(rock, fx - (rock.width >> 1), fy - rock.height + (small ? 3 : 6)) });
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
    // A sneaking hero is in the dark: the whole world dims a little and goes cold blue until it ends
    const sneak = w.invisible && !w.playerDead ? 0.4 : 0;
    const dim = Math.max(this.dim, sneak);
    this.compositor.dim += (dim - this.compositor.dim) * 0.25;
    if (Math.abs(this.compositor.dim - dim) < 0.01) this.compositor.dim = dim;
    const amb = sneak > 0 ? SNEAK_AMBIENT : BASE_AMBIENT;
    const ca = this.compositor.ambient;
    ca[0] += (amb[0] - ca[0]) * 0.15;
    ca[1] += (amb[1] - ca[1]) * 0.15;
    ca[2] += (amb[2] - ca[2]) * 0.15;
    this.compositor.lights.length = 0;
    for (const l of this.lights) this.compositor.lights.push(l);
    this.compositor.mask = this.maskFrame;
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
      switch (z.type) {
        case 'fire_prison':
          ellipse(z.x, z.z, z.radius, '#ff5a1a', true, 0.16 + Math.sin(this.time * 7 + z.id) * 0.04);
          ellipse(z.x, z.z, z.radius, '#ff7a2a', false, 0.9, 2);
          ellipse(z.x, z.z, z.radius * 0.94, '#ffd060', false, 0.5, 1);
          break;
        case 'poison':
          ellipse(z.x, z.z, z.radius, '#3a9a40', true, 0.35);
          break;
        case 'smoke': {
          // The cloud's body on the floor: a soft grey mass, denser in the middle, fading as the smoke thins out
          const life = Math.min(1, z.remaining / 0.8);
          ellipse(z.x, z.z, z.radius, '#7a7a8a', true, 0.28 * life);
          ellipse(z.x, z.z, z.radius * 0.7, '#9a9aa8', true, 0.28 * life);
          ellipse(z.x, z.z, z.radius * 0.4, '#b4b4c0', true, 0.25 * life);
          break;
        }
        case 'trap':
          this.drawTrap(ctx, z, ellipse);
          break;
        case 'quicksand':
          this.drawQuicksand(ctx, z, ellipse);
          break;
        case 'rockfall':
          ellipse(z.x, z.z, z.radius, '#9a8a70', false, 0.3 + Math.sin(this.time * 3) * 0.1, 1);
          break;
        case 'void_rift':
          this.drawVoidRift(ctx, z, ellipse);
          break;
        case 'spear_wall': {
          // A row of real spears, leaf-bladed and barbed in turn, driven up out of the ground as the wall is planted and sinking back at the end.
          // Each is a depth-sorted sprite, so monsters pass in front of and behind it
          const age = z.duration - z.remaining;
          let rise = Math.min(1, age / 0.18);
          if (z.remaining < 0.3) rise = Math.max(0, z.remaining / 0.3);
          const px = -z.dz;
          const pz = z.dx;
          for (let k = 0; k < z.count; k++) {
            const t = z.count > 1 ? k / (z.count - 1) - 0.5 : 0;
            const x = z.x + px * z.length * t;
            const zz = z.z + pz * z.length * t;
            const frame = this.fx.spears[k % 2]!;
            const shown = Math.max(1, Math.round(frame.height * rise));
            const fx = Math.round(cam.frameX(x, zz));
            const fy = Math.round(cam.frameY(x, 0, zz));
            this.items.push({ depth: cam.depth(x, zz), draw: () => ctx.drawImage(frame, 0, 0, frame.width, shown, fx - (frame.width >> 1), fy + 1 - shown, frame.width, shown) });
            // Earth thrown up while it rises
            if (rise < 1 && age < 0.3 && Math.random() < 0.5) this.particles.spawn(x + (Math.random() - 0.5) * 0.3, 0.1, zz + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.5, 2 + Math.random(), (Math.random() - 0.5) * 1.5, 0.4, 0x8a7a68, { gravity: 7, priority: 0.4, size: 2 });
          }
          // The seam of broken ground the spears stand in
          ctx.strokeStyle = '#2a2420';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.6 * Math.min(1, rise + 0.3);
          ctx.beginPath();
          ctx.moveTo(Math.round(cam.frameX(z.x - px * z.length * 0.5, z.z - pz * z.length * 0.5)), Math.round(cam.frameY(z.x - px * z.length * 0.5, 0, z.z - pz * z.length * 0.5)) + 1);
          ctx.lineTo(Math.round(cam.frameX(z.x + px * z.length * 0.5, z.z + pz * z.length * 0.5)), Math.round(cam.frameY(z.x + px * z.length * 0.5, 0, z.z + pz * z.length * 0.5)) + 1);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'void_trail': {
          // A band on the floor exactly as wide as the trail's hit area, rounded at both ends
          const ex = z.x + z.dx * z.length;
          const ez = z.z + z.dz * z.length;
          const nx = -z.dz * z.radius;
          const nz = z.dx * z.radius;
          const fade = Math.min(1, z.remaining / 0.6);
          ctx.fillStyle = '#5a20a0';
          ctx.globalAlpha = 0.4 * fade;
          ellipse(z.x, z.z, z.radius, '#5a20a0', true, 0.4 * fade);
          ellipse(ex, ez, z.radius, '#5a20a0', true, 0.4 * fade);
          ctx.globalAlpha = 0.4 * fade;
          ctx.beginPath();
          ctx.moveTo(Math.round(cam.frameX(z.x + nx, z.z + nz)), Math.round(cam.frameY(z.x + nx, 0, z.z + nz)));
          ctx.lineTo(Math.round(cam.frameX(ex + nx, ez + nz)), Math.round(cam.frameY(ex + nx, 0, ez + nz)));
          ctx.lineTo(Math.round(cam.frameX(ex - nx, ez - nz)), Math.round(cam.frameY(ex - nx, 0, ez - nz)));
          ctx.lineTo(Math.round(cam.frameX(z.x - nx, z.z - nz)), Math.round(cam.frameY(z.x - nx, 0, z.z - nz)));
          ctx.closePath();
          ctx.fill();
          // A brighter seam down the middle
          ctx.strokeStyle = '#b070ff';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 * fade;
          ctx.beginPath();
          ctx.moveTo(Math.round(cam.frameX(z.x, z.z)), Math.round(cam.frameY(z.x, 0, z.z)));
          ctx.lineTo(Math.round(cam.frameX(ex, ez)), Math.round(cam.frameY(ex, 0, ez)));
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'sanctuary':
          this.drawSanctuary(ctx, z, ellipse);
          break;
        case 'wind':
          this.drawGale(ctx, z);
          break;
        case 'frostbite': {
          // Ground going white with hoarfrost, sparkling, under a faint rim
          ellipse(z.x, z.z, z.radius, '#a8d8f0', true, 0.22);
          ellipse(z.x, z.z, z.radius, '#d8f4ff', false, 0.5, 1);
          this.glitter(ctx, z, 30, ['#ffffff', '#d8f4ff', '#9fe0ff']);
          break;
        }
        case 'frost_patch': {
          // A sheet of ice: pale, glassy, cracked, with a slipping highlight
          const life = Math.min(1, z.remaining / 0.5);
          ellipse(z.x, z.z, z.radius, '#c8ecff', true, 0.55 * life);
          ellipse(z.x, z.z, z.radius, '#ffffff', false, 0.8 * life, 1);
          const cx = Math.round(cam.frameX(z.x, z.z));
          const cy = Math.round(cam.frameY(z.x, 0, z.z));
          ctx.globalAlpha = 0.7 * life;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const a = z.id * 1.3 + i * 1.7;
            const r = z.radius * RING_RX * 0.8;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.round(Math.cos(a) * r * 0.5), cy + Math.round(Math.sin(a) * r * 0.25));
            ctx.lineTo(cx + Math.round(Math.cos(a + 0.4) * r), cy + Math.round(Math.sin(a + 0.4) * r * 0.5));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'storm':
          // The dark patch under the storm cloud; the lighting pass darkens it further (see zoneLight)
          ellipse(z.x, z.z, z.radius, '#101828', true, 0.35);
          ellipse(z.x, z.z, z.radius, '#5a6a90', false, 0.3, 1);
          break;
        case 'boulder': {
          // The target ring, and the rock's shadow growing as it comes down
          const k = Math.max(0, 1 - z.remaining / z.duration - 0.35) / 0.65;
          ellipse(z.x, z.z, z.radius, z.radius < 2 ? '#c8b8a0' : '#ff9a40', false, z.radius < 2 ? 0.4 : 0.7);
          ellipse(z.x, z.z, (z.radius < 2 ? 0.15 : 0.3) + 0.55 * k * k * (z.radius < 2 ? 0.6 : 1), '#000000', true, 0.15 + 0.35 * k);
          break;
        }
        default:
          break;
      }
      this.zoneLight(z);
      this.skyLight(z);
    }
    // Buff aura under the hero: Autoaim draws a target reticle instead of the plain glow
    if (w.buffs.some((b) => b.id === 'autoaim' || b.id === 'autoaim_ult')) this.drawReticle(ctx);
    else {
      const buff = w.buffs[0];
      if (buff) ellipse(w.px, w.pz, 0.9, cssOf(buff.color), true, 0.18 + Math.sin(this.time * 6) * 0.06);
    }
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
    for (const m of w.minions) if (m.active && m.kind !== 'titan') put(m.x, m.z);
    if (w.titan) {
      // A big body throws a big shadow
      const t = w.titan;
      put(t.x - 0.3, t.z);
      put(t.x + 0.3, t.z);
      put(t.x, t.z - 0.3);
      put(t.x, t.z + 0.3);
    }
    this.effects.draw(ctx, cam, 'floor');
  }

  /** Grains of light scattered over a zone's floor, each blinking in its own time, in the given colours (brightest first). */
  private glitter(ctx: CanvasRenderingContext2D, z: Zone, count: number, colors: [string, string, string]): void {
    const cam = this.view;
    for (let i = 0; i < count; i++) {
      const h1 = Math.sin(i * 12.9898 + z.id * 78.233) * 43758.5453;
      const h2 = Math.sin(i * 39.3467 + z.id * 11.135) * 24634.6345;
      const a = (h1 - Math.floor(h1)) * Math.PI * 2;
      const r = Math.sqrt(h2 - Math.floor(h2)) * z.radius * 0.97;
      const blink = Math.sin(this.time * 5 + i * 1.7);
      if (blink < -0.2) continue;
      ctx.fillStyle = blink > 0.75 ? colors[0] : blink > 0.3 ? colors[1] : colors[2];
      const wx = z.x + Math.cos(a) * r;
      const wz = z.z + Math.sin(a) * r;
      ctx.fillRect(Math.round(cam.frameX(wx, wz)), Math.round(cam.frameY(wx, 0, wz)), 1, 1);
    }
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

  /**
   * A spiked trap: an iron plate with a rim and a ring of spikes that punch
   * up and sink back without pause, each a little out of step with its
   * neighbour, plus one big spike in the middle.
   */
  private drawTrap(ctx: CanvasRenderingContext2D, z: Zone, ellipse: (x: number, z: number, r: number, style: string, fill: boolean, alpha: number, width?: number) => void): void {
    const cam = this.view;
    ellipse(z.x, z.z, z.radius, '#2a2a34', true, 0.85);
    ellipse(z.x, z.z, z.radius, '#8a8a98', false, 0.9, 1);
    ellipse(z.x, z.z, z.radius * 0.8, '#4a4a58', false, 0.7, 1);
    const spikes = Math.max(8, Math.round(z.radius * 9));
    const spike = (wx: number, wz: number, h: number, wide: boolean): void => {
      const sx = Math.round(cam.frameX(wx, wz));
      const sy = Math.round(cam.frameY(wx, 0, wz));
      if (h < 1) {
        // Sunk: just the slot it lives in
        ctx.fillStyle = '#101018';
        ctx.fillRect(sx - 1, sy, 3, 1);
        return;
      }
      const w = wide ? 3 : 1;
      ctx.fillStyle = '#101018';
      ctx.fillRect(sx - (w >> 1) - 1, sy - h, w + 2, h + 1);
      ctx.fillStyle = '#b0b0c0';
      ctx.fillRect(sx - (w >> 1), sy - h + 1, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy - h, 1, 1);
    };
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const h = Math.round(1 + 4 * (0.5 + 0.5 * Math.sin(this.time * 7 + i * 1.9 + z.id)));
      spike(z.x + Math.cos(a) * z.radius * 0.72, z.z + Math.sin(a) * z.radius * 0.72, h, false);
    }
    spike(z.x, z.z, Math.round(2 + 6 * (0.5 + 0.5 * Math.sin(this.time * 5 + z.id))), true);
  }

  /** Autoaim: a target under the hero. Two rings, a crosshair and four ticks that turn slowly, in the hunter's green. */
  private drawReticle(ctx: CanvasRenderingContext2D): void {
    const w = this.world;
    const cam = this.view;
    const cx = Math.round(cam.frameX(w.px, w.pz));
    const cy = Math.round(cam.frameY(w.px, 0, w.pz));
    const rx = 1.15 * RING_RX;
    const ry = 1.15 * RING_RY;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#55cc33';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8fe08f';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.45, ry * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Crosshair through the rings, and four ticks on the outer ring that creep round
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - rx - 3, cy);
    ctx.lineTo(cx - rx * 0.25, cy);
    ctx.moveTo(cx + rx * 0.25, cy);
    ctx.lineTo(cx + rx + 3, cy);
    ctx.moveTo(cx, cy - ry - 3);
    ctx.lineTo(cx, cy - ry * 0.25);
    ctx.moveTo(cx, cy + ry * 0.25);
    ctx.lineTo(cx, cy + ry + 3);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const a = this.time * 1.2 + (i * Math.PI) / 2;
      ctx.fillRect(cx + Math.round(Math.cos(a) * rx) - 1, cy + Math.round(Math.sin(a) * ry) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Quickshot: a small wind whipping round the hero at waist height, three streaks chasing each other with specks flung off them. */
  private drawQuickWind(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, heroY + 0.55, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const a0 = this.time * 9 + (i * Math.PI * 2) / 3;
          const front = Math.sin(a0 + 0.5) > 0;
          ctx.globalAlpha = front ? 0.85 : 0.35;
          ctx.strokeStyle = i === 0 ? '#ffffff' : '#d8ecff';
          ctx.beginPath();
          ctx.ellipse(fx, fy, 13, 6, 0, a0, a0 + 1.0);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    });
    if (Math.random() < 0.5) {
      const a = this.time * 9;
      this.particles.spawn(w.px + Math.cos(a) * 0.55, heroY + 0.5 + (Math.random() - 0.5) * 0.3, w.pz + Math.sin(a) * 0.55, -Math.sin(a) * 3, 0.2, Math.cos(a) * 3, 0.25, 0xd8ecff, { drag: 4, priority: 0.4, alpha: 0.8 });
    }
  }

  /**
   * The daemon of the beyond. It comes up out of the ground over the first
   * half second, clipped at the floor so only what has risen shows, stands
   * with the bow drawn until it fires, holds the loosed pose a moment and
   * sinks back down at the end. Faces the target; dirt boils at its feet
   * while it moves and its eyes throw a green light.
   */
  private drawDaemon(z: Zone): void {
    const cam = this.view;
    const ctx = this.ctx;
    // The ultimate's lesser daemons are half the size: the same frames shrunk by a whole factor once and cached
    const lesser = z.radius < 1;
    const frames = lesser ? this.fx.daemon.map((f) => shrunk(f, 2)) : this.fx.daemon;
    const age = z.duration - z.remaining;
    const riseTime = 0.5;
    const sinkTime = 0.35;
    let rise = Math.min(1, age / riseTime);
    if (z.remaining < sinkTime) rise = Math.max(0, z.remaining / sinkTime);
    const loosed = z.triggered;
    const frame = frames[loosed ? 1 : 0]!;
    const flip = z.dx - z.dz < 0;
    const fx = Math.round(cam.frameX(z.x, z.z));
    const fy = Math.round(cam.frameY(z.x, 0, z.z));
    const shown = Math.max(1, Math.round(frame.height * rise));
    const moving = rise < 1;
    this.items.push({
      depth: cam.depth(z.x, z.z),
      draw: () => {
        ctx.save();
        ctx.translate(fx, fy + 2);
        if (flip) ctx.scale(-1, 1);
        // Only the risen part, drawn from the floor up
        ctx.drawImage(frame, 0, 0, frame.width, shown, -(frame.width >> 1), -shown, frame.width, shown);
        ctx.restore();
      },
    });
    if (moving && Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(z.x + Math.cos(a) * 0.5, 0.05, z.z + Math.sin(a) * 0.5, Math.cos(a) * 1.2, 1.5 + Math.random(), Math.sin(a) * 1.2, 0.5, Math.random() < 0.5 ? 0x6a5a48 : 0x9a8a70, { gravity: 6, priority: 0.5, size: 2 });
    }
    if (rise > 0.6) this.lights.push({ x: fx + (flip ? -2 : 2), y: fy - Math.round((lesser ? 23 : 46) * rise), radius: lesser ? 32 : 50, intensity: (lesser ? 0.8 : 1.2) + (loosed ? 0.6 : 0), r: 0.5, g: 1, b: 0.35 });
  }

  /**
   * Meat Shield's titan: standing, or winding up and bringing its fists down
   * when it strikes, with a slow heavy bob as it walks. Faces the way it
   * moves or fights, with its life bar over its head and a dim red eye light.
   */
  private drawTitan(t: Minion): void {
    const cam = this.view;
    const ctx = this.ctx;
    const frames = this.fx.titan;
    const frame = frames[t.shoot > 0.4 ? 1 : t.shoot > 0 ? 2 : 0]!;
    const flip = Math.sin(t.yaw) - Math.cos(t.yaw) < 0;
    const bob = t.moving ? Math.round(Math.abs(Math.sin(this.time * 5)) * 2) : 0;
    const fx = Math.round(cam.frameX(t.x, t.z));
    const fy = Math.round(cam.frameY(t.x, 0, t.z)) + 2 - bob;
    this.items.push({
      depth: cam.depth(t.x, t.z),
      draw: () => {
        ctx.save();
        ctx.translate(fx, fy);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(frame, -(frame.width >> 1), -frame.height);
        ctx.restore();
      },
    });
    this.bars.push(fx, fy - frame.height - 6, t.hp / t.maxHp, 0);
    this.lights.push({ x: fx + (flip ? -5 : 5), y: fy - frame.height + 14, radius: 30, intensity: 0.5, r: 1, g: 0.3, b: 0.25 });
    if (t.moving && Math.random() < 0.4) this.particles.spawn(t.x + (Math.random() - 0.5) * 1.2, 0.05, t.z + (Math.random() - 0.5) * 1.2, 0, 0.8, 0, 0.5, 0x8a7a68, { priority: 0.4, size: 2, alpha: 0.7 });
  }

  /**
   * The eagle wheels a hero's height above the ground beating its wings, and
   * folds them for the dive when it strikes. The Angel Knight hovers a little
   * off the floor with a slow rise and fall, sword upright until it cuts.
   */
  private drawCompanion(m: Minion): void {
    const cam = this.view;
    const ctx = this.ctx;
    const eagle = m.kind === 'eagle';
    const frames = eagle ? this.fx.eagle : this.fx.angel;
    let frame: HTMLCanvasElement;
    let y: number;
    if (eagle) {
      frame = m.shoot > 0 ? frames[3]! : frames[Math.floor(this.time * 9) % 3]!;
      y = m.shoot > 0 ? 0.9 : 1.9 + Math.sin(this.time * 2.5) * 0.15;
    } else {
      frame = m.shoot > 0.15 ? frames[1]! : frames[0]!;
      y = 0.3 + Math.sin(this.time * 1.8) * 0.12;
    }
    const flip = Math.sin(m.yaw) - Math.cos(m.yaw) < 0;
    const fx = Math.round(cam.frameX(m.x, m.z));
    const fy = Math.round(cam.frameY(m.x, y, m.z));
    this.items.push({
      depth: cam.depth(m.x, m.z) + 0.005,
      draw: () => {
        ctx.save();
        ctx.translate(fx, fy);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(frame, -(frame.width >> 1), -frame.height + (eagle ? 4 : 0));
        ctx.restore();
      },
    });
    if (!eagle) {
      // Holy light off the halo and the plate, and golden motes drifting up round it
      this.lights.push({ x: fx, y: fy - 30, radius: 52, intensity: 1.1 + Math.sin(this.time * 3) * 0.1, r: 1, g: 0.85, b: 0.5 });
      if (Math.random() < 0.35) this.particles.spawn(m.x + (Math.random() - 0.5) * 1.4, y + Math.random() * 1.8, m.z + (Math.random() - 0.5) * 1.4, 0, 0.5, 0, 1.2, Math.random() < 0.4 ? 0xffffff : 0xffe070, { priority: 0.3, size: 1, alpha: 0.9 });
    }
  }

  /** Wind Barrier: a wide sphere of wind round the hero, three streaks racing round at chest height and two more leaning the other way above and below, with dust whipped round the edge. */
  private drawWindBarrier(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, heroY + 0.7, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        ctx.lineWidth = 1;
        const bands: [number, number, number][] = [[0, 30, 12], [-14, 24, 9], [14, 24, 9]];
        for (const [dy, rx, ry] of bands) {
          for (let i = 0; i < 3; i++) {
            const a0 = this.time * (6 + Math.abs(dy) * 0.1) * (dy < 0 ? -1 : 1) + (i * Math.PI * 2) / 3;
            const front = Math.sin(a0 + 0.6) > 0;
            ctx.globalAlpha = front ? 0.8 : 0.3;
            ctx.strokeStyle = i === 0 ? '#ffffff' : '#c8e0ff';
            ctx.beginPath();
            ctx.ellipse(fx, fy + dy, rx, ry, 0, a0, a0 + 1.2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    });
    if (Math.random() < 0.8) {
      const a = this.time * 6 + Math.random() * 0.5;
      this.particles.spawn(w.px + Math.cos(a) * 1.3, heroY + Math.random() * 1.6, w.pz + Math.sin(a) * 1.3, -Math.sin(a) * 4, 0, Math.cos(a) * 4, 0.3, 0xc8e0ff, { drag: 4, priority: 0.4, alpha: 0.7 });
    }
    this.lights.push({ x: fx, y: fy, radius: 44, intensity: 0.6, r: 0.7, g: 0.85, b: 1 });
  }

  /** Blind: a flash of holy light fanning out before the hero: a white-gold wedge, a hard flash and sparks thrown across the cone. */
  private blindFlash(x: number, z: number, dirX: number, dirZ: number, range: number, arc: number): void {
    // No swing: a blinding burst of light. A hard white flash at the hero's hand, the whole cone lit for a blink,
    // rays fanning out across it, and motes of light thrown to its edge
    const half = (arc * Math.PI) / 360;
    const base = Math.atan2(dirX, dirZ);
    this.effects.flash(x + dirX * 0.6, 1.2, z + dirZ * 0.6, 0xffffff, 6, 190, 0.2);
    this.effects.flash(x + dirX * range * 0.5, 0.8, z + dirZ * range * 0.5, 0xfff0b0, 3, 150, 0.4);
    for (let i = 0; i <= 10; i++) {
      const a = base - half + (2 * half * i) / 10;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const len = range * (0.8 + Math.random() * 0.3);
      this.effects.link(x + sx * 0.4, 1.2, z + sz * 0.4, x + sx * len, 1.0 + Math.random() * 0.8, z + sz * len, i % 2 ? 0xffffff : 0xfff0b0, 0.2 + Math.random() * 0.1);
    }
    for (let t = 0.3; t <= 1.0; t += 0.175) {
      this.effects.disc(x + dirX * range * t, z + dirZ * range * t, range * t * Math.tan(half) * 0.9, 0xfff0b0, 0.28, 0.3);
    }
    for (let i = 0; i < 30; i++) {
      const a = base + (Math.random() - 0.5) * 2 * half;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      this.particles.spawn(x + sx * 0.5, 0.6 + Math.random() * 1.2, z + sz * 0.5, sx * (6 + Math.random() * 4), 0.5, sz * (6 + Math.random() * 4), 0.3, Math.random() < 0.6 ? 0xffffff : 0xffe8a0, { drag: 4, priority: 0.7, size: Math.random() < 0.4 ? 2 : 1 });
    }
    this.view.kick(0.05);
  }

  /** Impale's landing: the hero comes down and stone spikes burst up across the whole landing circle, with the ground cracking and dust thrown out. */
  private impaleLanding(x: number, z: number, radius: number): void {
    const frames = this.fx.spikes;
    const cycle = [frames[0]!, frames[1]!, frames[2]!, frames[2]!, frames[2]!, frames[1]!, frames[0]!];
    this.effects.cracks(x, z, 26, 0x9a8a70, 0.9, 9);
    this.effects.ring(x, z, 0.2, radius, 0xc8b8a0, 0.35, 2);
    this.particles.burst(x, 0.1, z, 18, 2.5 * radius, 0x8a7a68, 0.6, { up: 2, gravity: 6, priority: 0.7, size: 2 });
    const rings: [number, number][] = [[radius * 0.4, 5], [radius * 0.85, 10]];
    for (const [r, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (r < radius * 0.5 ? 0.3 : 0);
        const sx = x + Math.sin(a) * r;
        const sz = z + Math.cos(a) * r;
        const delay = (r / radius) * 0.08 + Math.random() * 0.04;
        this.effects.anim(cycle, sx, 0, sz, 5, 17, 0.7, 'air', undefined, delay);
        this.particles.burst(sx, 0.1, sz, 4, 1.2, 0x8a7a68, 0.4, { up: 2.5, gravity: 7, priority: 0.5, size: 2, delay });
      }
    }
    this.view.kick(0.22);
  }

  /** Reckless Charge: a flight of javelins racing along with the hero, strung out behind and to either side, with the air streaking past. */
  private drawChargeJavelins(heroY: number): void {
    const w = this.world;
    const c = w.charge!;
    const cam = this.view;
    const ctx = this.ctx;
    const frame = this.fx.javelin;
    // Screen angle of the charge, as the orbiting daggers find theirs
    const angle = Math.atan2((c.dirX + c.dirZ) / 2, c.dirX - c.dirZ);
    const sideX = -c.dirZ;
    const sideZ = c.dirX;
    for (let i = 0; i < 5; i++) {
      const lag = 0.5 + i * 0.35;
      const side = (i % 2 ? 1 : -1) * (0.4 + i * 0.1);
      const jx = w.px - c.dirX * lag + sideX * side;
      const jz = w.pz - c.dirZ * lag + sideZ * side;
      const y = heroY + 1.0 + Math.sin(this.time * 18 + i * 1.3) * 0.2;
      const fx = Math.round(cam.frameX(jx, jz));
      const fy = Math.round(cam.frameY(jx, y, jz));
      this.items.push({
        depth: cam.depth(jx, jz) + 0.002,
        draw: () => {
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(angle);
          ctx.drawImage(frame, -(frame.width >> 1), -(frame.height >> 1));
          ctx.restore();
        },
      });
    }
    // Air streaking past, and dust kicked up behind
    for (let i = 0; i < 3; i++) {
      const side = (Math.random() - 0.5) * 2;
      this.particles.spawn(w.px + c.dirX * 0.8 + sideX * side, heroY + 0.4 + Math.random() * 1.4, w.pz + c.dirZ * 0.8 + sideZ * side, -c.dirX * 7, 0, -c.dirZ * 7, 0.25, 0xd8d0c0, { drag: 1, priority: 0.4, alpha: 0.6 });
    }
    if (Math.random() < 0.8) this.particles.spawn(w.px - c.dirX * 0.4, 0.1, w.pz - c.dirZ * 0.4, -c.dirX * 1.5 + (Math.random() - 0.5), 1.5, -c.dirZ * 1.5 + (Math.random() - 0.5), 0.5, 0x8a7a68, { gravity: 5, priority: 0.4, size: 2 });
  }

  /** Consecrated Blade landing: a holy sword taller than the hero drops out of the sky onto the target, stands a moment in a blaze of light, and fades. */
  private holyHit(x: number, z: number): void {
    const sword = this.fx.holySword;
    const ox = sword.width >> 1;
    const oy = sword.height;
    this.effects.sprite(sword, x, 3.0, z, ox, oy, 0.14, 'air', -2.8 * Y_PX, { color: 0xffe8a0, intensity: 1.2, radius: 44 }, true);
    this.effects.sprite(sword, x, 0.2, z, ox, oy, 0.45, 'air', 0, { color: 0xffe8a0, intensity: 1.0, radius: 48 }, false, 0.14);
    this.effects.ring(x, z, 0.1, 0.9, 0xffe8a0, 0.3, 2, 1, 0.14);
    this.effects.flash(x, 1.2, z, 0xffffff, 1.6, 40, 0.15);
    this.particles.burst(x, 0.3, z, 12, 1.6, 0xfff0b0, 0.45, { up: 2.5, gravity: 4, priority: 0.6, size: 2, delay: 0.14 });
    this.particles.burst(x, 1.0, z, 6, 1.4, 0xffe8a0, 0.3, { up: 1, drag: 2, priority: 0.3, delay: 0.14 });
    this.view.kick(0.06);
  }

  /** Retribution's answer: a pillar of light out of the sky onto the attacker, a ring on the ground and sparks thrown up. */
  private holyBolt(x: number, z: number): void {
    this.effects.pillar(x, z, 0xffe8a0, 0.35, 5);
    this.effects.ring(x, z, 0.1, 0.9, 0xffe8a0, 0.3, 2, 1);
    this.particles.burst(x, 0.3, z, 14, 1.6, 0xfff0b0, 0.5, { up: 3, gravity: 4, priority: 0.7, size: 2 });
    this.view.kick(0.05);
  }

  /** Judgement: a beam of light out of the sky resting on the marked monster, a pool of light under it and motes climbing in the beam. */
  private drawJudgement(e: Enemy, fx: number, fy: number, height: number): void {
    const ctx = this.ctx;
    const cam = this.view;
    const k = Math.min(1, e.status.mark!.remaining / 0.3);
    const pulse = 0.85 + Math.sin(this.time * 6) * 0.15;
    this.items.push({
      depth: cam.depth(e.x, e.z) - 0.001,
      draw: () => {
        ctx.fillStyle = '#ffe8a0';
        ctx.globalAlpha = 0.3 * k;
        ctx.beginPath();
        ctx.ellipse(fx, fy, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        const layers: [number, number, string][] = [[10, 0.16, '#ffe8a0'], [6, 0.3, '#fff4d0'], [2, 0.8, '#ffffff']];
        for (const [hw, a, c] of layers) {
          ctx.globalAlpha = a * k * pulse;
          ctx.fillStyle = c;
          ctx.fillRect(fx - hw, 0, hw * 2, fy);
        }
        ctx.globalAlpha = 1;
      },
    });
    if (Math.random() < 0.5) this.particles.spawn(e.x + (Math.random() - 0.5) * 0.5, Math.random() * 2, e.z + (Math.random() - 0.5) * 0.5, 0, 1.2, 0, 0.6, 0xfff0b0, { priority: 0.3 });
    this.lights.push({ x: fx, y: fy - (height >> 1), radius: 52, intensity: 1.0 * k * pulse, r: 1, g: 0.9, b: 0.6 });
  }

  /** Consecrated Blade: a streak of gold light along the blade, sparks drifting up off it and a warm glow on the weapon hand. */
  private drawHolyBlade(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const dx = Math.sin(w.pyaw);
    const dz = Math.cos(w.pyaw);
    const hx = w.px + dx * 0.35;
    const hz = w.pz + dz * 0.35;
    const y = heroY + 0.8;
    const x0 = Math.round(cam.frameX(hx, hz));
    const y0 = Math.round(cam.frameY(hx, y, hz));
    const x1 = Math.round(cam.frameX(hx + dx * 0.7, hz + dz * 0.7));
    const y1 = Math.round(cam.frameY(hx + dx * 0.7, y + 1.0, hz + dz * 0.7));
    const flicker = 0.7 + Math.sin(this.time * 14) * 0.2;
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd860';
        ctx.globalAlpha = 0.45 * flicker;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = flicker;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      },
    });
    if (Math.random() < 0.7) {
      const t = Math.random();
      this.particles.spawn(hx + dx * 0.7 * t, y + t, hz + dz * 0.7 * t, (Math.random() - 0.5) * 0.6, 1.0, (Math.random() - 0.5) * 0.6, 0.45, Math.random() < 0.5 ? 0xffffff : 0xffd860, { priority: 0.4, drag: 1.5, alpha: 0.9 });
    }
    this.lights.push({ x: x0, y: y0 - 6, radius: 34, intensity: 0.9 + Math.sin(this.time * 7) * 0.15, r: 1, g: 0.85, b: 0.45 });
  }

  /** Retribution: a halo of gold turning over the hero's head with a gleam running round it, and motes falling off it. */
  private drawRetribution(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const fy = Math.round(cam.frameY(w.px, heroY + 2.3, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.001,
      draw: () => {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffd860';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(fx, fy, 7, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 5) * 0.2;
        ctx.beginPath();
        ctx.ellipse(fx, fy - 1, 7, 3, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        const a = this.time * 4;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fx + Math.round(Math.cos(a) * 7) - 1, fy + Math.round(Math.sin(a) * 3) - 1, 2, 2);
      },
    });
    if (Math.random() < 0.3) this.particles.spawn(w.px + (Math.random() - 0.5) * 0.5, heroY + 2.2, w.pz + (Math.random() - 0.5) * 0.5, 0, -0.6, 0, 0.6, 0xffe8a0, { priority: 0.3, gravity: 1, alpha: 0.9 });
    this.lights.push({ x: fx, y: fy, radius: 36, intensity: 0.8 + Math.sin(this.time * 5) * 0.1, r: 1, g: 0.88, b: 0.5 });
  }

  /** Earthen Spikes: two staggered rows of stone spikes bursting up along the line in turn, each with a spray of dirt, then sinking back. */
  private spikesRise(z: Zone): void {
    const frames = this.fx.spikes;
    const cycle = [frames[0]!, frames[1]!, frames[2]!, frames[2]!, frames[2]!, frames[2]!, frames[1]!, frames[0]!];
    const speed = z.length / z.duration;
    const px = -z.dz;
    const pz = z.dx;
    let side = 1;
    for (let t = 0.2; t <= z.length; t += 0.32) {
      const off = side * z.radius * 0.45;
      side = -side;
      const x = z.x + z.dx * t + px * off;
      const zz = z.z + z.dz * t + pz * off;
      const delay = t / speed;
      this.effects.anim(cycle, x, 0, zz, 5, 17, 0.9, 'air', undefined, delay);
      this.particles.burst(x, 0.1, zz, 5, 1.2, 0x8a7a68, 0.45, { up: 2.5, gravity: 7, priority: 0.5, size: 2, delay });
    }
    this.effects.cracks(z.x, z.z, 18, 0x9a8a70, 0.8, 6);
    this.view.kick(0.1);
  }

  /** Seismic Slam: the fists land, then a heave of earth rolls out along the line: cracks, dust and a bump of ground at every step. */
  private slamWave(z: Zone): void {
    const dust = 0xc8b8a0;
    this.effects.cracks(z.x, z.z, 36, 0x9a8a70, 1.0, 10);
    this.effects.ring(z.x, z.z, 0.1, 1.2, 0xfff0d0, 0.15, 3, 1);
    this.particles.burst(z.x, 0.1, z.z, 24, 2.5, 0x6a5a48, 0.7, { up: 3, gravity: 7, priority: 0.7, size: 2 });
    this.view.kick(0.3);
    const speed = z.length / z.duration;
    for (let t = 0.5; t <= z.length; t += 0.45) {
      const x = z.x + z.dx * t;
      const zz = z.z + z.dz * t;
      const delay = t / speed;
      this.effects.ring(x, zz, 0.1, z.radius * 1.1, dust, 0.35, 2, 0, delay);
      this.effects.cracks(x, zz, 12, 0x9a8a70, 0.9, 4, delay);
      this.particles.burst(x, 0.1, zz, 10, 2, 0x8a7a68, 0.5, { up: 2.5, gravity: 7, priority: 0.6, size: 2, delay });
      this.particles.burst(x, 0.1, zz, 6, z.radius * 2, dust, 0.6, { up: 1, gravity: 4, priority: 0.5, delay });
    }
  }

  /** Rockfall: one stone lands. It lies there a moment in a small crater with dust thrown up. */
  private rockLand(x: number, z: number, radius: number): void {
    const rock = this.fx.stones[Math.floor(Math.random() * this.fx.stones.length)]!;
    this.effects.sprite(rock, x, 0, z, rock.width >> 1, rock.height - 3, 0.9, 'air');
    this.effects.cracks(x, z, 16, 0x9a8a70, 0.7, 6);
    this.effects.ring(x, z, 0.1, radius, 0xc8b8a0, 0.35, 2);
    this.particles.burst(x, 0.2, z, 12, 2.5, 0x6a6058, 0.6, { up: 2.5, gravity: 8, priority: 0.6, size: 2 });
    this.particles.burst(x, 0.1, z, 10, 2 * radius, 0xc8b8a0, 0.5, { up: 1, gravity: 5, priority: 0.5 });
    this.view.kick(0.08);
  }

  /** Quicksand on the floor: a sandy pit, darker toward the middle, with three arcs of sand turning slowly inward. */
  private drawQuicksand(ctx: CanvasRenderingContext2D, z: Zone, ellipse: (x: number, z: number, r: number, style: string, fill: boolean, alpha: number, width?: number) => void): void {
    const cam = this.view;
    const life = Math.min(1, z.remaining / 0.6);
    ellipse(z.x, z.z, z.radius, '#a08858', true, 0.6 * life);
    ellipse(z.x, z.z, z.radius * 0.62, '#7a6440', true, 0.5 * life);
    ellipse(z.x, z.z, z.radius * 0.28, '#4a3a28', true, 0.6 * life);
    ellipse(z.x, z.z, z.radius, '#6a5438', false, 0.8 * life, 1);
    const cx = Math.round(cam.frameX(z.x, z.z));
    const cy = Math.round(cam.frameY(z.x, 0, z.z));
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d8c090';
    for (let i = 0; i < 3; i++) {
      const f = 0.86 - i * 0.24;
      const a0 = -this.time * (0.7 + i * 0.3) + i * 2.1;
      ctx.globalAlpha = 0.4 * life;
      ctx.beginPath();
      ctx.ellipse(cx, cy, z.radius * RING_RX * f, z.radius * RING_RY * f, 0, a0, a0 + 1.8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Shade Army: three black copies of the hero trailing behind in a wedge, easing after every move, with dark wisps drifting off them. */
  private drawShades(heroY: number, count: number): void {
    const w = this.world;
    const dx = Math.sin(w.pyaw);
    const dz = Math.cos(w.pyaw);
    const px = -dz;
    const pz = dx;
    const slots: [number, number][] = [[-0.9, -0.8], [0.9, -0.8], [0, -1.5]];
    for (let i = 0; i < count; i++) {
      const [side, back] = slots[i % slots.length]!;
      const tx = w.px + px * side + dx * back;
      const tz = w.pz + pz * side + dz * back;
      let s = this.shadePos[i];
      if (!s) {
        s = { x: tx, z: tz };
        this.shadePos[i] = s;
      }
      s.x += (tx - s.x) * 0.12;
      s.z += (tz - s.z) * 0.12;
      this.pushPuppet(this.hero, s.x, heroY, s.z, 0.6, '#100818');
      if (Math.random() < 0.25) this.particles.spawn(s.x + (Math.random() - 0.5) * 0.5, heroY + Math.random() * 1.6, s.z + (Math.random() - 0.5) * 0.5, 0, 0.6, 0, 0.5, 0x100818, { priority: 0.3, alpha: 0.8 });
    }
  }

  /** Blood Puppet: red strings dropping from above onto the monster's head and hands, swaying as it moves. */
  private drawStrings(e: Enemy, fx: number, fy: number, height: number): void {
    const ctx = this.ctx;
    const cam = this.view;
    const sway = Math.sin(this.time * 5 + e.id) * 2;
    const top = fy - height - 22;
    const ends: [number, number][] = [[0, fy - height + 1], [-5, fy - (height >> 1)], [5, fy - (height >> 1)]];
    this.items.push({
      depth: cam.depth(e.x, e.z) + 0.001,
      draw: () => {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ff2040';
        ctx.globalAlpha = 0.85;
        for (const [ox, ey] of ends) {
          ctx.beginPath();
          ctx.moveTo(fx + Math.round(ox * 0.6) + sway, top);
          ctx.lineTo(fx + ox, ey);
          ctx.stroke();
        }
        ctx.fillStyle = '#ff2040';
        ctx.fillRect(fx - 4 + sway, top - 1, 9, 2);
        ctx.globalAlpha = 1;
      },
    });
    this.lights.push({ x: fx, y: fy - (height >> 1), radius: 30, intensity: 0.6, r: 1, g: 0.15, b: 0.25 });
  }

  /** Void Rift on the floor: a black hole with a purple rim, three arcs of violet spiralling inward, all of it fading as it closes. */
  private drawVoidRift(ctx: CanvasRenderingContext2D, z: Zone, ellipse: (x: number, z: number, r: number, style: string, fill: boolean, alpha: number, width?: number) => void): void {
    const cam = this.view;
    const life = Math.min(1, z.remaining / 0.5);
    ellipse(z.x, z.z, z.radius, '#1a0a2a', true, 0.5 * life);
    ellipse(z.x, z.z, z.radius * 0.55, '#0a0414', true, 0.8 * life);
    ellipse(z.x, z.z, z.radius * 0.25, '#000000', true, 1 * life);
    ellipse(z.x, z.z, z.radius, '#aa66cc', false, 0.7 * life, 1);
    const cx = Math.round(cam.frameX(z.x, z.z));
    const cy = Math.round(cam.frameY(z.x, 0, z.z));
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const f = 0.9 - i * 0.25;
      const a0 = -this.time * (2.2 + i * 0.6) + i * 2.1;
      ctx.strokeStyle = i === 1 ? '#e0a0ff' : '#aa66cc';
      ctx.globalAlpha = 0.6 * life;
      ctx.beginPath();
      ctx.ellipse(cx, cy, z.radius * RING_RX * f, z.radius * RING_RY * f, 0, a0, a0 + 2.0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Overload: the hero crackles. Short arcs leap off the body at random and a blue-white light pulses. */
  private drawOverload(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    if (Math.random() < 0.25) {
      const a = Math.random() * Math.PI * 2;
      this.effects.link(w.px, heroY + 0.4 + Math.random() * 0.8, w.pz, w.px + Math.cos(a) * 0.9, heroY + Math.random() * 1.4, w.pz + Math.sin(a) * 0.9, 0xa8c8ff, 0.08);
    }
    if (Math.random() < 0.4) this.particles.spawn(w.px + (Math.random() - 0.5) * 0.7, heroY + Math.random() * 1.5, w.pz + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.25, 0xffffff, { priority: 0.4, drag: 3 });
    this.lights.push({ x: Math.round(cam.frameX(w.px, w.pz)), y: Math.round(cam.frameY(w.px, heroY + 0.8, w.pz)), radius: 40, intensity: 0.9 + Math.sin(this.time * 30) * 0.3, r: 0.65, g: 0.8, b: 1 });
  }

  /** Storm and Blizzard change the sky: a shadow over the storm's whole patch (flickering when a bolt lands), a cold white cast over a blizzard. */
  private skyLight(z: Zone): void {
    const cam = this.view;
    if (z.type === 'storm') {
      const flicker = Math.sin(this.time * 37) > 0.94 ? 0.3 : 0;
      this.lights.push({ x: cam.frameX(z.x, z.z), y: cam.frameY(z.x, 0, z.z), radius: (z.radius + 2) * TILE_W * 1.4, intensity: -0.6 + flicker, r: 0, g: 0, b: 0 });
    } else if (z.type === 'blizzard') {
      this.lights.push({ x: cam.frameX(z.x, z.z), y: cam.frameY(z.x, 0, z.z), radius: (z.radius + 2) * TILE_W * 1.4, intensity: 0.35, r: 0.75, g: 0.88, b: 1 });
    } else if (z.type === 'winter') {
      // Everything in sight goes white and cold until the ice breaks
      const k = Math.min(1, z.remaining / 0.4);
      this.lights.push({ x: cam.frameX(z.x, z.z), y: cam.frameY(z.x, 0, z.z), radius: (z.radius + 4) * TILE_W * 1.4, intensity: 0.9 * k, r: 0.8, g: 0.92, b: 1 });
    } else if (z.type === 'smoke') {
      // Murk: the smoke swallows the light inside it
      this.lights.push({ x: cam.frameX(z.x, z.z), y: cam.frameY(z.x, 0.3, z.z), radius: (z.radius + 1) * TILE_W * 1.3, intensity: -0.35 * Math.min(1, z.remaining / 0.8), r: 0, g: 0, b: 0 });
    }
  }

  /** Call of the Wind on the floor: three spiral arms of wind streaks turning round the hero out to the gale's edge. */
  private drawGale(ctx: CanvasRenderingContext2D, z: Zone): void {
    const cam = this.view;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 1;
    for (let arm = 0; arm < 3; arm++) {
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      const steps = 26;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r = z.radius * (0.15 + 0.85 * t);
        const a = (arm / 3) * Math.PI * 2 - this.time * 2.2 + t * 3.4;
        const wx = z.x + Math.cos(a) * r;
        const wz = z.z + Math.sin(a) * r;
        const sx = Math.round(cam.frameX(wx, wz));
        const sy = Math.round(cam.frameY(wx, 0, wz));
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(Math.round(cam.frameX(z.x, z.z)), Math.round(cam.frameY(z.x, 0, z.z)), z.radius * RING_RX, z.radius * RING_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * The tornado round a hero calling the wind: nine dashed rings stacked from the
   * feet to well over head height, each wider than the last and turning faster
   * than the one below, the whole funnel leaning and swaying.
   */
  private drawTornado(heroY: number): void {
    const w = this.world;
    const cam = this.view;
    const ctx = this.ctx;
    const fx = Math.round(cam.frameX(w.px, w.pz));
    const baseY = Math.round(cam.frameY(w.px, heroY, w.pz));
    this.items.push({
      depth: cam.depth(w.px, w.pz) + 0.002,
      draw: () => {
        const levels = 9;
        for (let i = 0; i < levels; i++) {
          const t = i / (levels - 1);
          const rx = 7 + t * t * 30;
          const ry = rx * 0.45;
          const lean = Math.sin(this.time * 1.7 + t * 2.5) * 6 * t;
          const cy = baseY - 2 - Math.round(t * 62);
          const cx = fx + Math.round(lean);
          const spin = this.time * (5 + t * 4) + i * 0.9;
          const dashes = 6 + i;
          ctx.lineWidth = i < 3 ? 1 : 2;
          for (let d = 0; d < dashes; d++) {
            const a0 = spin + (d / dashes) * Math.PI * 2;
            const a1 = a0 + (Math.PI * 2 / dashes) * 0.55;
            // The front of each ring is brighter than the back so the funnel reads as round
            const front = Math.sin((a0 + a1) / 2) > 0;
            ctx.globalAlpha = (front ? 0.75 : 0.35) * (0.5 + 0.5 * t);
            ctx.strokeStyle = front && (d + i) % 3 === 0 ? '#e8f4ff' : '#9fd8ff';
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    });
    this.lights.push({ x: fx, y: baseY - 30, radius: 60, intensity: 0.6, r: 0.6, g: 0.85, b: 1 });
  }

  /** Adds a sprite's silhouette to the mask layer, at the spot it is drawn in the frame. */
  private maskDraw(frame: HTMLCanvasElement, x: number, y: number, flip: boolean): void {
    const m = this.mctx;
    if (!flip) {
      m.drawImage(frame, x, y);
      return;
    }
    m.save();
    m.translate(x + frame.width, y);
    m.scale(-1, 1);
    m.drawImage(frame, 0, 0);
    m.restore();
  }

  private pushPuppet(p: Puppet, x: number, y: number, z: number, alpha: number, tint: string | null, outline: string | null = null, smooth = false): void {
    const cam = this.view;
    const ctx = this.ctx;
    // Facing left: the sheet's own left-facing drawing when it has one, else the side mirrored
    const ownLeft = p.facing === 'side' && p.faceLeft && !!p.sheet.left;
    const set = ownLeft ? p.sheet.left! : p.sheet[p.facing];
    const anim: SpriteAnim = p.dying >= 0 ? set.idle : animOf(set, p.anim);
    const frame = anim.frames[Math.floor(p.animT / anim.frameTime) % anim.frames.length]!;
    const fx = Math.round(cam.frameX(x, z));
    const fy = Math.round(cam.frameY(x, y, z));
    const flip = p.facing === 'side' && p.faceLeft && !ownLeft;
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
        // Characters in the mask layer are lit smoothly by the compositor, without the floor's dither
        if (smooth) this.maskDraw(frame, fx - anim.originX, fy - anim.originY, flip);
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

  /**
   * Creator mode: the town piece drawn under a window point, front-most first,
   * found from the sprite's box; the hero's start, which has no sprite, within
   * 24 pixels of its spot.
   */
  townPieceAt(sx: number, sy: number): string | null {
    const w = this.world;
    if (w.area !== 'town') return null;
    const cam = this.view;
    const out = { x: 0, y: 0 };
    let best: string | null = null;
    let bestDepth = -Infinity;
    const test = (piece: string, x: number, z: number, frame: HTMLCanvasElement, ox: number, oy: number, drawZ = z) => {
      cam.project(x, 0, drawZ, out);
      const px = Math.floor((sx - out.x) / cam.scale + ox);
      const py = Math.floor((sy - out.y) / cam.scale + oy);
      if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return;
      // Only a drawn pixel counts, so a tap through an empty corner reaches what is behind
      if (alphaOf(frame)[py * frame.width + px]! < 40) return;
      const depth = cam.depth(x, drawZ);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = piece;
      }
    };
    for (const p of this.placed) {
      if (!p.piece) continue;
      const f = p.prop.frames[0]!;
      test(p.piece, p.x, p.z, f, p.prop.originX, p.prop.originY);
    }
    const t = w.town;
    const vendor = this.vendor.front.idle;
    test('vendor', t.vendor.x, t.vendor.z, vendor.frames[0]!, vendor.originX, vendor.originY, t.vendor.z + 0.9);
    DUMMIES.forEach((d, i) => {
      const sheet = this.dummies.get(d.id);
      const at = t.dummies[i];
      if (!sheet || !at) return;
      const a = sheet.front.idle;
      test(`dummies.${i}`, at.x, at.z, a.frames[0]!, a.originX, a.originY);
    });
    if (best) return best;
    cam.project(t.spawn.x, 0, t.spawn.z, out);
    return Math.hypot(out.x - sx, out.y - sy) < 24 ? 'spawn' : null;
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
