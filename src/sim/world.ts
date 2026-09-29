import { CONSUMABLES, CONSUMABLE_RULES, type ConsumableId } from '../data/consumables';
import { DUMMIES, DUMMY_RULES } from '../data/dummies';
import { MONSTERS, MONSTER_RULES, monsterScale, type EnemyDef } from '../data/monsters';
import { ZONES, zoneById, type ZoneDef } from '../data/zones';
import { SKILLS, orbiterPlace, type BuffMods, type SkillDef } from '../data/skills';
import { STATUS_RULES } from '../data/status';
import { LEVELING } from '../data/classes';
import { PLEDGES } from '../data/pledges';
import { ELEMENT_COLORS, type Element, type StatMap } from '../data/stats';
import { MS, PX } from '../data/units';
import { Rng } from '../gen/rng';
import { damagePlayer, hitEnemy, tickStatuses } from './combat';
import type { EquipKey } from './items/equipment';
import type { Inventory } from './items/inventory';
import { generateItem, type Item } from './items/item';
import { buyPrice, generateStock, sellPrice } from './items/vendor';
import { FlowField, findPath } from './map/pathing';
import { buildTown, buildZone, type ArenaLayout, type TownLayout } from './map/tilemap';
import type { Rarity } from '../data/items';
import { setsForZone } from '../data/sets';
import { ATTACK_SLOT, addXp, canEquipItem, deriveStats, rechargePotions, resolveSlotSkill, type Buff, type DerivedStats, type PlayerState } from './player';
import { castSkill, type Aim } from './skills/cast';
import { SpatialHash } from './spatialHash';
import type { DamagePacket, Drop, Enemy, Interactable, Projectile, ProjectileShape, SimEvent, Zone, ZoneType } from './types';

export const SIM_DT = 1 / 60;
const ENEMY_POOL = 256;
const PROJ_POOL = 256;
const PLAYER_RADIUS = 0.38;
const PICKUP_RADIUS = 0.9;
/** The dev-menu pet fetches loot this far from the hero, in tiles (300 px). */
const PET_REACH = 300 * PX;
const PET_SPEED = 5.5;

export type Area = 'town' | 'arena';

export interface ProjectileSpec {
  owner: 'player' | 'enemy';
  shape: ProjectileShape;
  element: Element;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  radius: number;
  maxRange: number;
  packet: DamagePacket;
  pierce?: number;
  homing?: boolean;
  ricochets?: number;
  returns?: boolean;
  throughWalls?: boolean;
  splashRadius?: number;
  onHitZone?: Projectile['onHitZone'];
  burstOnHit?: Projectile['burstOnHit'];
  skillId?: string | null;
}

export interface Leap {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  duration: number;
  arc: boolean;
  onLand: (() => void) | null;
}

export interface Charge {
  dirX: number;
  dirZ: number;
  remaining: number;
  speed: number;
  radius: number;
  damage: number;
  def: SkillDef;
  hit: number[];
}

export interface Beam {
  targetId: number;
  remaining: number;
  tickTimer: number;
  interval: number;
  drain: number;
  maxRange: number;
  extendedRange: number;
  farEffectiveness: number;
}

function emptyStatus(): Enemy['status'] {
  return { stun: 0, freeze: 0, slow: 0, shock: 0, burn: null, poison: null, bleed: null, curse: null, heldBy: -1 };
}

/**
 * The whole game simulation. Pure data plus a fixed-step `step()`. Rendering, UI and
 * audio read state and drain `events`; they never write here except through commands.
 */
export class World {
  readonly rng: Rng;
  readonly events: SimEvent[] = [];
  derived: DerivedStats;
  buffs: Buff[] = [];
  zoneMods: BuffMods = {};
  area: Area = 'town';
  readonly town: TownLayout = buildTown();
  arena: ArenaLayout | null = null;
  /** The zone the hero is in, or was last in. */
  zoneId: string = ZONES[0]!.id;
  arenaVisited = false;
  map = this.town.map;
  flow: FlowField;
  hash: SpatialHash;
  readonly interactables: Interactable[] = [];
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly drops: Drop[] = [];
  vendorStock: Item[] = [];
  time = 0;
  private nextZoneId = 1;
  private nextDropId = 1;
  private spawnTimer = 0;
  private statsDirty = true;

  // Player runtime
  px = 0;
  pz = 0;
  pyaw = 0;
  path: { x: number; z: number }[] = [];
  moveInput = { x: 0, z: 0 };
  moving = false;
  targetId = -1;
  pendingInteract: Interactable | null = null;
  pendingPickup = -1;
  pendingCast: { skillId: string; aim: Aim | null } | null = null;
  attackTimer = 0;
  castTimer = 0;
  cooldowns: Record<string, number> = {};
  pStatus = { stun: 0, freeze: 0, slow: 0 };
  invulnTimer = 0;
  playerDead = false;
  /** True from the pledge level until a pledge is sworn: the hero is rooted and cannot be hurt. */
  pledgePending = false;
  leap: Leap | null = null;
  charge: Charge | null = null;
  beam: Beam | null = null;
  bandage: { remaining: number; perSec: number } | null = null;
  potionCooldowns: Record<ConsumableId, number> = { hp_potion: 0, bandage: 0, mp_potion: 0, incense: 0 };
  private potionFraction: Record<ConsumableId, number> = { hp_potion: 0, bandage: 0, mp_potion: 0, incense: 0 };
  private repathTimer = 0;

  constructor(public readonly player: PlayerState, seed: number) {
    this.rng = new Rng(seed);
    for (let i = 0; i < ENEMY_POOL; i++) this.enemies.push(this.blankEnemy(i));
    for (let i = 0; i < PROJ_POOL; i++) this.projectiles.push(this.blankProjectile(i));
    this.flow = new FlowField(this.map);
    this.hash = new SpatialHash(this.map.cols, this.map.rows, 3, ENEMY_POOL);
    this.derived = deriveStats(player, [], {});
    this.enterTown(true);
    // A loaded hero past the pledge level without a pledge is held right away
    this.checkPledge();
  }

  // ---------------------------------------------------------------- areas

  enterTown(first = false): void {
    this.area = 'town';
    this.map = this.town.map;
    this.flow = new FlowField(this.map);
    this.hash = new SpatialHash(this.map.cols, this.map.rows, 3, ENEMY_POOL);
    this.clearArea();
    const t = this.town;
    this.px = t.spawn.x;
    this.pz = t.spawn.z;
    this.pyaw = Math.PI;
    this.interactables.length = 0;
    let id = 1;
    const add = (kind: Interactable['kind'], p: { x: number; z: number }, radius: number, active = true) => this.interactables.push({ id: id++, kind, x: p.x, z: p.z, radius, active });
    add('vendor', t.vendor, 70 * PX);
    add('stash', t.stash, 60 * PX);
    add('forge', t.forge, 68 * PX);
    add('bloodfountain', t.bloodfountain, 68 * PX);
    add('arcana', t.arcana, 68 * PX);
    add('waypoint', t.waypoint, 56 * PX);
    add('return_portal', t.returnPortal, 50 * PX, this.arenaVisited);
    DUMMIES.forEach((d, i) => {
      const e = this.allocEnemy();
      const at = t.dummies[i]!;
      Object.assign(e, {
        alive: true, def: null, dummy: d, name: d.name, recipeId: 'dummy', x: at.x, z: at.z, yaw: 0, radius: 0.45,
        hp: DUMMY_RULES.hp, maxHp: DUMMY_RULES.hp, damage: d.damage, speed: 0, xp: 0, attackRange: DUMMY_RULES.attackRange * PX,
        attackCooldown: d.cooldown * MS, attackTimer: 0, moving: false, dead: false, deadTimer: 0, status: emptyStatus(), sinceHit: 99, scale: 1,
      });
      this.emit({ type: 'enemy_spawn', id: e.id });
    });
    this.vendorStock = generateStock(this.rng, this.player.level);
    if (!first) {
      this.player.hp = this.derived.maxHp;
      this.player.mana = this.derived.maxMana;
    }
    this.emit({ type: 'area', area: 'town' });
  }

  get zone(): ZoneDef {
    return zoneById(this.zoneId);
  }

  /** A monster level chosen on the waypoint's Beyond 100 page, or 0 for the zone's own. Kept through the return portal. */
  zoneLevel = 0;

  /** The level monsters, gold and endgame drops scale to in the current zone. */
  get monsterLevel(): number {
    return this.zoneLevel || this.zone.level;
  }

  enterArena(zoneId = this.zoneId, level = this.zoneLevel): void {
    this.zoneId = zoneById(zoneId).id;
    this.zoneLevel = level;
    const z = this.zone;
    this.arena = buildZone(z.layout, z.cols, z.rows, this.rng.int(1, 1e9));
    this.arenaVisited = true;
    this.area = 'arena';
    this.map = this.arena.map;
    this.flow = new FlowField(this.map);
    this.hash = new SpatialHash(this.map.cols, this.map.rows, 3, ENEMY_POOL);
    this.clearArea();
    this.px = this.arena.spawn.x;
    this.pz = this.arena.spawn.z;
    this.pyaw = Math.PI / 2;
    this.interactables.length = 0;
    this.interactables.push({ id: 1, kind: 'town_portal', x: this.arena.spawn.x - 2, z: this.arena.spawn.z, radius: 50 * PX, active: true });
    this.spawnTimer = 0.5;
    this.emit({ type: 'area', area: 'arena', zone: this.zoneId, level: this.zoneLevel || undefined });
  }

  private clearArea(): void {
    for (const e of this.enemies) e.alive = false;
    for (const p of this.projectiles) p.alive = false;
    for (const z of this.zones) this.emit({ type: 'zone_end', id: z.id });
    this.zones.length = 0;
    this.drops.length = 0;
    this.path.length = 0;
    this.targetId = -1;
    this.pendingCast = null;
    this.pendingInteract = null;
    this.pendingPickup = -1;
    this.leap = null;
    this.charge = null;
    if (this.beam) this.emit({ type: 'beam', on: false, targetId: this.beam.targetId });
    this.beam = null;
    this.moving = false;
  }

  // ---------------------------------------------------------------- helpers

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  private lastMessage = '';
  private lastMessageAt = -1;

  /** A line for the log. The same line within half a second is dropped, so a held button cannot flood it. */
  message(text: string, color?: number): void {
    if (text === this.lastMessage && this.time - this.lastMessageAt < 0.5) return;
    this.lastMessage = text;
    this.lastMessageAt = this.time;
    this.emit({ type: 'message', text, color });
  }

  markDirty(): void {
    this.statsDirty = true;
  }

  skillDef(id: string): SkillDef {
    return SKILLS[id]!;
  }

  skillRank(id: string): number {
    return this.player.skillRanks[id] ?? 0;
  }

  dist(x: number, z: number): number {
    return Math.hypot(x - this.px, z - this.pz);
  }

  get invisible(): boolean {
    return this.buffs.some((b) => b.mods.invisible);
  }

  breakInvisibility(): void {
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i]!;
      if (b.mods.invisible && !b.mods.attackKeepsInvisible) this.endBuff(i);
    }
  }

  targetEnemy(): Enemy | null {
    const e = this.enemies[this.targetId];
    return e && e.alive && !e.dead ? e : null;
  }

  /** The nearest living enemy with a clear line from (x, z); enemies behind walls are never picked. */
  nearestEnemy(x: number, z: number, maxDist: number, exclude: number[] | null = null, includeDummies = true): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist * maxDist;
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      if (!includeDummies && e.dummy) continue;
      if (exclude && exclude.includes(e.id)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d >= bestD) continue;
      if (this.map.lineBlocked(x, z, e.x, e.z)) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /** Living enemies within the radius that a wall does not shield from the centre. */
  enemiesWithin(x: number, z: number, radius: number): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      const r = radius + e.radius;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 > r * r) continue;
      if (this.map.lineBlocked(x, z, e.x, e.z)) continue;
      out.push(e);
    }
    return out;
  }

  enemiesInArc(x: number, z: number, dirX: number, dirZ: number, range: number, arcDeg: number): Enemy[] {
    const cosHalf = Math.cos((arcDeg * Math.PI) / 360);
    return this.enemiesWithin(x, z, range).filter((e) => {
      if (arcDeg >= 360) return true;
      const dx = e.x - x;
      const dz = e.z - z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) return true;
      return (dx * dirX + dz * dirZ) / len >= cosHalf;
    });
  }

  healPlayer(amount: number, silent: boolean): void {
    if (this.playerDead || amount <= 0) return;
    const before = this.player.hp;
    this.player.hp = Math.min(this.derived.maxHp, this.player.hp + amount);
    if (!silent && this.player.hp > before) this.emit({ type: 'heal', amount: Math.round(this.player.hp - before) });
  }

  /** Walkable destination for blinks and leaps. Without `throughWalls` the line stops at the first wall. */
  clampDestination(x: number, z: number, throughWalls: boolean): { x: number; z: number } {
    if (!throughWalls) {
      const dx = x - this.px;
      const dz = z - this.pz;
      const steps = Math.ceil(Math.hypot(dx, dz) * 4) || 1;
      let lx = this.px;
      let lz = this.pz;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const nx = this.px + dx * t;
        const nz = this.pz + dz * t;
        if (this.map.circleBlocked(nx, nz, PLAYER_RADIUS)) break;
        lx = nx;
        lz = nz;
      }
      return { x: lx, z: lz };
    }
    if (!this.map.circleBlocked(x, z, PLAYER_RADIUS)) return { x, z };
    // Search outward for a free spot
    for (let r = 0.5; r < 4; r += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        if (!this.map.circleBlocked(nx, nz, PLAYER_RADIUS)) return { x: nx, z: nz };
      }
    }
    return { x: this.px, z: this.pz };
  }

  teleportTo(x: number, z: number): void {
    const d = this.clampDestination(x, z, true);
    this.emit({ type: 'teleport', fromX: this.px, fromZ: this.pz, toX: d.x, toZ: d.z });
    this.px = d.x;
    this.pz = d.z;
    this.path.length = 0;
  }

  startLeap(x: number, z: number, duration: number, arc: boolean, onLand: (() => void) | null, invulnerable = false): void {
    this.leap = { fromX: this.px, fromZ: this.pz, toX: x, toZ: z, t: 0, duration, arc, onLand };
    if (invulnerable) this.invulnTimer = Math.max(this.invulnTimer, duration + 0.05);
    this.path.length = 0;
    this.emit({ type: 'leap', fromX: this.px, fromZ: this.pz, toX: x, toZ: z, duration });
  }

  startCharge(dirX: number, dirZ: number, range: number, speed: number, radius: number, damage: number, def: SkillDef): void {
    this.charge = { dirX, dirZ, remaining: range, speed, radius, damage, def, hit: [] };
    this.path.length = 0;
  }

  addBuff(id: string, name: string, duration: number, mods: BuffMods, color: number): Buff {
    const existing = this.buffs.find((b) => b.id === id);
    if (existing) {
      existing.remaining = duration;
      existing.duration = duration;
      if (mods.shieldPct) existing.shield = (this.derived.maxHp * mods.shieldPct) / 100;
      return existing;
    }
    const buff: Buff = { id, name, remaining: duration, duration, mods, color, shield: mods.shieldPct ? (this.derived.maxHp * mods.shieldPct) / 100 : 0, data: {} };
    this.buffs.push(buff);
    this.markDirty();
    this.emit({ type: 'buff_start', id, color });
    return buff;
  }

  private endBuff(index: number): void {
    const b = this.buffs[index]!;
    this.buffs.splice(index, 1);
    this.markDirty();
    this.emit({ type: 'buff_end', id: b.id });
    if (b.mods.endSmoke) {
      this.addZone({ type: 'smoke', x: this.px, z: this.pz, radius: b.mods.endSmoke.radius * PX, duration: b.mods.endSmoke.slowDuration * MS, tickInterval: 0.2, slow: 0.4, damage: 0, element: 'physical', skillId: b.id });
    }
  }

  addZone(spec: Partial<Zone> & { type: ZoneType; x: number; z: number; radius: number; duration: number; damage: number; element: Element }): Zone {
    const zone: Zone = {
      id: this.nextZoneId++,
      dx: 0, dz: 0, length: 0, remaining: spec.duration, tickTimer: 0, tickInterval: 0.5, slow: 0, slowPct: 0, holds: false, aoeRadius: 0, targets: 0, perWave: 0,
      triggered: false, followsPlayer: false, skillId: null, hit: [], count: 0, mods: null, onEnd: null,
      ...spec,
    };
    if (zone.type === 'fire_prison' && zone.holds) {
      for (const e of this.enemiesWithin(zone.x, zone.z, zone.radius)) e.status.heldBy = zone.id;
    }
    this.zones.push(zone);
    this.emit({ type: 'zone_start', zone });
    return zone;
  }

  spawnProjectile(spec: ProjectileSpec): Projectile | null {
    const p = this.projectiles.find((q) => !q.alive);
    if (!p) return null;
    p.alive = true;
    p.owner = spec.owner;
    p.shape = spec.shape;
    p.element = spec.element;
    p.x = spec.x;
    p.z = spec.z;
    p.y = 1.1;
    p.vx = spec.dirX * spec.speed;
    p.vz = spec.dirZ * spec.speed;
    p.speed = spec.speed;
    p.radius = spec.radius;
    p.traveled = 0;
    p.maxRange = spec.maxRange;
    p.packet = spec.packet;
    p.pierce = spec.pierce ?? 0;
    p.hit.length = 0;
    p.homing = !!spec.homing;
    p.homingTarget = -1;
    p.ricochets = spec.ricochets ?? 0;
    p.returns = !!spec.returns;
    p.returning = false;
    p.throughWalls = !!spec.throughWalls;
    p.splashRadius = spec.splashRadius ?? 0;
    p.onHitZone = spec.onHitZone ?? null;
    p.burstOnHit = spec.burstOnHit ?? null;
    p.skillId = spec.skillId ?? null;
    return p;
  }

  // ---------------------------------------------------------------- commands

  moveTo(x: number, z: number): void {
    if (this.playerDead || this.leap || this.charge) return;
    this.targetId = -1;
    this.pendingCast = null;
    this.pendingInteract = null;
    this.pendingPickup = -1;
    this.moveInput.x = 0;
    this.moveInput.z = 0;
    const path = findPath(this.map, this.px, this.pz, x, z);
    this.path = path ?? [];
  }

  /** Continuous input (keyboard or joystick). Steering away clears the tap destination and the attack target. */
  setMoveInput(x: number, z: number): void {
    if (x || z) {
      this.path.length = 0;
      this.pendingInteract = null;
      this.pendingPickup = -1;
      this.targetId = -1;
    }
    this.moveInput.x = x;
    this.moveInput.z = z;
  }

  /** While true the hero attacks whatever is nearest (the touch attack button). */
  attackHeld = false;
  /** Scratch result for wall sliding, reused every move to avoid allocation. */
  private readonly slid = { x: 0, z: 0 };
  /** Ground point under the mouse; the hero faces it while standing still. */
  aimPoint: { x: number; z: number } | null = null;

  get movingByInput(): boolean {
    return this.moveInput.x !== 0 || this.moveInput.z !== 0;
  }

  stop(): void {
    this.path.length = 0;
    this.targetId = -1;
    this.pendingCast = null;
    this.pendingInteract = null;
    this.pendingPickup = -1;
  }

  /** Tap on an enemy: attack it with the primary slot, walking closer if needed. */
  setTarget(id: number): void {
    const e = this.enemies[id];
    if (!e || !e.alive || e.dead) return;
    this.targetId = id;
    this.pendingInteract = null;
    this.pendingPickup = -1;
    this.path.length = 0;
    this.repathTimer = 0;
  }

  interact(id: number): void {
    const it = this.interactables.find((i) => i.id === id && i.active);
    if (!it) return;
    this.targetId = -1;
    this.pendingCast = null;
    this.pendingInteract = it;
    if (this.dist(it.x, it.z) > it.radius) this.path = findPath(this.map, this.px, this.pz, it.x, it.z) ?? [];
    else this.path.length = 0;
  }

  /** The merchant, station or portal the hero stands next to, if any. */
  nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const d = this.dist(it.x, it.z);
      if (d <= it.radius + 0.4 && d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  /** Rarities hidden by the loot filter: not drawn, not labelled, not picked up by hand or crab. */
  readonly hiddenRarities = new Set<Rarity>();

  setLootFilter(hidden: Rarity[]): void {
    this.hiddenRarities.clear();
    for (const r of hidden) this.hiddenRarities.add(r);
  }

  /** Gold always shows; an item shows unless its rarity is filtered out. */
  dropVisible(d: Drop): boolean {
    return !d.item || !this.hiddenRarities.has(d.item.rarity);
  }

  /** The visible item drop under the hero's feet, if any. Items wait there until the action key takes them. */
  nearestPickup(): Drop | null {
    let best: Drop | null = null;
    let bestD = Infinity;
    for (const d of this.drops) {
      if (!d.alive || !d.item || !this.dropVisible(d)) continue;
      const dist = this.dist(d.x, d.z);
      if (dist <= PICKUP_RADIUS + 0.4 && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /** What the action key would do right now: take the item underfoot, else use the interactable in reach. */
  nextAction(): { drop: Drop } | { use: Interactable } | null {
    const use = this.nearestInteractable();
    const drop = this.nearestPickup();
    if (drop && (!use || this.dist(drop.x, drop.z) <= PICKUP_RADIUS)) return { drop };
    if (use) return { use };
    return null;
  }

  /** Keyboard "F" or the touch action button: pick up the item underfoot, else use the nearest interactable in reach. */
  interactNearby(): boolean {
    const action = this.nextAction();
    if (!action) return false;
    if ('drop' in action) {
      this.takeDrop(action.drop, true);
      return true;
    }
    this.emit({ type: 'open', panel: action.use.kind });
    return true;
  }

  /** Puts a drop in the purse or the bag. Returns false when the bag is full and the item stays on the ground. */
  private takeDrop(d: Drop, byHand: boolean): boolean {
    if (d.gold > 0) {
      this.player.gold += d.gold;
      this.emit({ type: 'pickup', item: null, gold: d.gold });
      this.emit({ type: 'sound', id: 'coin' });
    } else if (d.item) {
      if (!this.player.inventory.add(d.item)) {
        if (byHand) this.message('Inventory is full', 0xff8080);
        return false;
      }
      this.emit({ type: 'pickup', item: d.item, gold: 0 });
      this.emit({ type: 'sound', id: 'itemPickup' });
    }
    d.alive = false;
    const i = this.drops.indexOf(d);
    if (i >= 0) this.drops.splice(i, 1);
    if (this.pendingPickup === d.id) this.pendingPickup = -1;
    return true;
  }

  pickup(dropId: number): void {
    const d = this.drops.find((q) => q.id === dropId && q.alive);
    if (!d || !this.dropVisible(d)) return;
    this.targetId = -1;
    this.pendingInteract = null;
    this.pendingPickup = dropId;
    this.path = findPath(this.map, this.px, this.pz, d.x, d.z) ?? [];
  }

  /** Slot 0 is the basic attack; slots 1-5 hold skills. */
  castSlot(slot: number, aim: Aim | null = null): void {
    const id = resolveSlotSkill(this.player, this.player.slots[slot] ?? null);
    if (!id) return;
    if (id === ATTACK_SLOT) {
      const t = aim ? this.nearestEnemy(aim.x, aim.z, 1.2) : this.targetEnemy() ?? this.nearestEnemy(this.px, this.pz, 12);
      if (t) this.setTarget(t.id);
      else if (aim) this.moveTo(aim.x, aim.z);
      return;
    }
    this.castSkillId(id, aim);
  }

  castSkillId(id: string, aim: Aim | null): void {
    const res = castSkill(this, id, aim);
    if (res.ok) {
      this.pendingCast = null;
      return;
    }
    if (res.approach) {
      const t = this.targetEnemy() ?? this.nearestEnemy(this.px, this.pz, 14);
      if (t) {
        this.pendingCast = { skillId: id, aim };
        this.targetId = t.id;
        this.repathTimer = 0;
      }
      return;
    }
    if (res.reason !== 'Cooling down' && res.reason !== 'Casting' && res.reason !== 'Attacking') this.message(res.reason, 0xff8080);
  }

  useConsumable(id: ConsumableId): boolean {
    if (this.playerDead) return false;
    const def = CONSUMABLES.find((c) => c.id === id)!;
    if (this.player.potions[id] <= 0) {
      this.message(`No ${def.name} left`, 0xff8080);
      return false;
    }
    if (this.potionCooldowns[id] > 0) return false;
    this.player.potions[id]--;
    this.potionCooldowns[id] = def.cooldown * MS;
    const d = this.derived;
    switch (id) {
      case 'hp_potion':
        this.healPlayer(Math.round((d.maxHp * CONSUMABLE_RULES.hpPotionPct) / 100), false);
        this.emit({ type: 'sound', id: 'potionHp' });
        break;
      case 'bandage':
        this.bandage = { remaining: CONSUMABLE_RULES.bandageDuration * MS, perSec: (d.maxHp * CONSUMABLE_RULES.bandagePct) / 100 / (CONSUMABLE_RULES.bandageDuration * MS) };
        this.emit({ type: 'sound', id: 'bandage' });
        break;
      case 'mp_potion':
        this.player.mana = Math.min(d.maxMana, this.player.mana + Math.round((d.maxMana * CONSUMABLE_RULES.mpPotionPct) / 100));
        this.emit({ type: 'sound', id: 'potionMp' });
        break;
      case 'incense':
        this.pStatus.slow = 0;
        this.pStatus.freeze = 0;
        this.addBuff('incense', 'Incense', CONSUMABLE_RULES.incenseDuration * MS, { dmgPct: CONSUMABLE_RULES.incenseDmgPct }, 0xc08aff);
        this.emit({ type: 'sound', id: 'incense' });
        break;
    }
    return true;
  }

  // ---------------------------------------------------------------- items

  /** Equips from the bag. Anything that comes off goes back in the bag; aborts if it cannot fit. */
  equipItem(item: Item, preferred?: EquipKey): { ok: boolean; reason?: string } {
    const inv = this.player.inventory;
    const allowed = canEquipItem(this.player, item);
    if (!allowed.ok) return { ok: false, reason: allowed.reason };
    const wasInBag = inv.has(item);
    if (wasInBag) inv.remove(item);
    const res = this.player.equipment.equip(item, this.player.level, preferred);
    if (!res.ok) {
      if (wasInBag) inv.add(item);
      return { ok: false, reason: res.reason };
    }
    for (const removed of res.removed) {
      if (!inv.add(removed)) {
        // No room: undo everything
        const key = this.player.equipment.targetKey(item, preferred);
        this.player.equipment.slots[key] = null;
        for (const r of res.removed) this.player.equipment.equip(r, this.player.level);
        if (wasInBag) inv.add(item);
        return { ok: false, reason: 'Inventory is full' };
      }
    }
    this.markDirty();
    this.recomputeStats();
    this.emit({ type: 'sound', id: 'itemEquip' });
    return { ok: true };
  }

  unequipItem(key: EquipKey): { ok: boolean; reason?: string } {
    const item = this.player.equipment.get(key);
    if (!item) return { ok: false, reason: 'Nothing there' };
    if (!this.player.inventory.add(item)) return { ok: false, reason: 'Inventory is full' };
    this.player.equipment.unequip(key);
    this.markDirty();
    this.recomputeStats();
    return { ok: true };
  }

  /** Drops an item from the bag onto the ground at the player's feet. */
  dropItem(item: Item): boolean {
    if (!this.player.inventory.remove(item)) return false;
    this.addDrop(this.px + Math.sin(this.pyaw) * 1.2, this.pz + Math.cos(this.pyaw) * 1.2, item, 0);
    return true;
  }

  sellItem(item: Item): boolean {
    if (!this.player.inventory.remove(item)) return false;
    this.player.gold += sellPrice(item);
    this.emit({ type: 'sound', id: 'coin' });
    return true;
  }

  /** Sells every bag item of the rarity. Returns how many went and the gold made. */
  sellAll(rarity: Rarity): { count: number; gold: number } {
    let count = 0;
    let gold = 0;
    for (const item of [...this.player.inventory.items]) {
      if (item.rarity !== rarity) continue;
      this.player.inventory.remove(item);
      gold += sellPrice(item);
      count++;
    }
    this.player.gold += gold;
    if (count) this.emit({ type: 'sound', id: 'coin' });
    return { count, gold };
  }

  buyItem(item: Item): { ok: boolean; reason?: string } {
    const price = buyPrice(item);
    if (this.player.gold < price) return { ok: false, reason: 'Not enough gold' };
    if (!this.player.inventory.add(item)) return { ok: false, reason: 'Inventory is full' };
    this.player.gold -= price;
    const i = this.vendorStock.indexOf(item);
    if (i >= 0) this.vendorStock.splice(i, 1);
    this.emit({ type: 'sound', id: 'coin' });
    return { ok: true };
  }

  /** Moves an item between the bag and a stash page, whichever it is not in. */
  moveBetween(item: Item, a: Inventory, b: Inventory): boolean {
    const from = a.has(item) ? a : b.has(item) ? b : null;
    if (!from) return false;
    const to = from === a ? b : a;
    from.remove(item);
    if (to.add(item)) return true;
    from.add(item);
    return false;
  }

  spendGold(amount: number): boolean {
    if (this.player.gold < amount) return false;
    this.player.gold -= amount;
    return true;
  }

  /** `level` replays a zone at a monster level of the player's choosing (the Beyond 100 page); omit it for the zone's own level. */
  travel(to: Area, zoneId?: string, level?: number): void {
    if (to === 'arena') this.enterArena(zoneId, level ?? 0);
    else this.enterTown();
  }

  respawn(): void {
    this.playerDead = false;
    this.enterTown();
    this.emit({ type: 'player_respawn' });
  }

  // ---------------------------------------------------------------- step

  step(dt: number): void {
    this.time += dt;
    if (this.statsDirty) this.recomputeStats();
    this.tickTimers(dt);
    this.tickBuffs(dt);
    this.tickZoneMods();
    this.tickRegen(dt);
    if (this.pledgePending) {
      // Held for the pledge: safe, still, and out of the fight until the choice is made
      this.invulnTimer = Math.max(this.invulnTimer, 1);
      this.moveInput.x = 0;
      this.moveInput.z = 0;
      this.path.length = 0;
      this.targetId = -1;
      this.pendingCast = null;
      this.moving = false;
    } else if (!this.playerDead) {
      this.tickMovement(dt);
      this.tickAutoAttack(dt);
      this.tickPendingCast();
      this.tickBeam(dt);
    }
    this.flow.update(this.px, this.pz);
    this.rebuildHash();
    this.tickEnemies(dt);
    this.tickProjectiles(dt);
    this.tickZones(dt);
    this.tickDrops(dt);
    this.tickPet(dt);
    this.tickSpawner(dt);
  }

  /** Stat bonuses from the development menu; never saved. */
  readonly devStats: StatMap = {};

  /** The development menu's crab: trots behind the hero and fetches loot within PET_REACH. Never saved. */
  readonly pet = { active: false, x: 0, z: 0, yaw: 0, moving: false, targetDrop: -1 };
  private readonly petIgnore = new Set<number>();

  togglePet(on?: boolean): void {
    this.pet.active = on ?? !this.pet.active;
    this.pet.x = this.px - 0.8;
    this.pet.z = this.pz + 0.4;
    this.pet.targetDrop = -1;
    this.petIgnore.clear();
  }

  private tickPet(dt: number): void {
    const pet = this.pet;
    if (!pet.active) return;
    pet.moving = false;
    // Left behind by a portal or a long walk: catch up at once
    if (this.dist(pet.x, pet.z) > 14) {
      pet.x = this.px - 0.8;
      pet.z = this.pz + 0.4;
    }
    // The nearest loot within reach of the hero that the bag can take
    let target: Drop | null = null;
    let bestD = Infinity;
    for (const d of this.drops) {
      if (!d.alive || d.age < 0.6 || this.petIgnore.has(d.id) || !this.dropVisible(d)) continue;
      if (this.dist(d.x, d.z) > PET_REACH) continue;
      const dd = (d.x - pet.x) ** 2 + (d.z - pet.z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        target = d;
      }
    }
    pet.targetDrop = target ? target.id : -1;
    let gx: number;
    let gz: number;
    let stop: number;
    if (target) {
      gx = target.x;
      gz = target.z;
      stop = 0.25;
    } else {
      // Heel: a step behind and beside the hero
      gx = this.px - Math.sin(this.pyaw) * 0.9 + 0.3;
      gz = this.pz - Math.cos(this.pyaw) * 0.9 + 0.3;
      stop = 0.5;
    }
    const dx = gx - pet.x;
    const dz = gz - pet.z;
    const dist = Math.hypot(dx, dz);
    if (dist > stop) {
      const step = Math.min(dist, PET_SPEED * dt);
      this.map.slide(pet.x, pet.z, pet.x + (dx / dist) * step, pet.z + (dz / dist) * step, 0.2, this.slid);
      pet.x = this.slid.x;
      pet.z = this.slid.z;
      pet.yaw = Math.atan2(dx, dz);
      pet.moving = true;
    } else if (target) {
      // Fetched: gold to the purse, an item to the bag if it fits
      if (target.gold > 0) {
        this.player.gold += target.gold;
        this.emit({ type: 'pickup', item: null, gold: target.gold, by: 'pet', x: pet.x, z: pet.z });
        this.emit({ type: 'sound', id: 'coin' });
      } else if (target.item) {
        if (!this.player.inventory.add(target.item)) {
          this.petIgnore.add(target.id);
          return;
        }
        this.emit({ type: 'pickup', item: target.item, gold: 0, by: 'pet', x: pet.x, z: pet.z });
        this.emit({ type: 'sound', id: 'itemPickup' });
      }
      target.alive = false;
      const i = this.drops.indexOf(target);
      if (i >= 0) this.drops.splice(i, 1);
      if (this.pendingPickup === target.id) this.pendingPickup = -1;
      this.petIgnore.clear();
    }
  }

  gainXp(amount: number): void {
    const res = addXp(this.player, amount);
    if (res.levels > 0) {
      this.markDirty();
      this.recomputeStats();
      this.player.hp = this.derived.maxHp;
      this.player.mana = this.derived.maxMana;
      this.emit({ type: 'level_up', level: this.player.level });
      this.emit({ type: 'sound', id: 'levelUp' });
      this.message(`Level ${this.player.level}!`, 0xffe066);
      this.checkPledge();
    }
  }

  /** At the pledge level a hero without a pledge is held until one is sworn. */
  checkPledge(): void {
    if (this.pledgePending || this.player.pledgeId || this.player.level < LEVELING.pledgeLevel) return;
    this.pledgePending = true;
    this.stop();
    this.emit({ type: 'pledge_choice' });
    this.message('Level 20: swear your pledge', 0xffe066);
  }

  /** Swears a pledge of the hero's class; releases the hold. */
  choosePledge(pledgeId: string): boolean {
    const def = PLEDGES[pledgeId];
    if (!def || def.classId !== this.player.classId || this.player.pledgeId) return false;
    this.player.pledgeId = pledgeId;
    this.pledgePending = false;
    this.invulnTimer = 0;
    this.markDirty();
    this.recomputeStats();
    this.emit({ type: 'sound', id: 'levelUp' });
    this.message(`You are now a ${def.name}`, def.color);
    return true;
  }

  /** Development menu: one whole level, right now. */
  devLevelUp(): void {
    this.gainXp(Math.max(1, this.player.xpToNext - this.player.xp));
  }

  recomputeStats(): void {
    const before = this.derived;
    this.derived = deriveStats(this.player, this.buffs, this.zoneMods, this.devStats);
    this.statsDirty = false;
    if (before && this.derived.maxHp !== before.maxHp) this.player.hp = Math.min(this.player.hp, this.derived.maxHp);
    if (before && this.derived.maxMana !== before.maxMana) this.player.mana = Math.min(this.player.mana, this.derived.maxMana);
  }

  private tickTimers(dt: number): void {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.castTimer = Math.max(0, this.castTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.pStatus.stun = Math.max(0, this.pStatus.stun - dt);
    this.pStatus.freeze = Math.max(0, this.pStatus.freeze - dt);
    this.pStatus.slow = Math.max(0, this.pStatus.slow - dt);
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k]! - dt);
    for (const c of CONSUMABLES) this.potionCooldowns[c.id] = Math.max(0, this.potionCooldowns[c.id] - dt);
  }

  private tickBuffs(dt: number): void {
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i]!;
      b.remaining -= dt;
      if (b.mods.regenPct) this.healPlayer((this.derived.maxHp * b.mods.regenPct * dt) / 100, true);
      if (b.mods.orbitDaggers?.stacks) this.settleRings(b);
      if (b.mods.orbitDaggers) this.tickOrbit(b, dt);
      if (b.remaining <= 0) this.endBuff(i);
    }
  }

  /**
   * Stacked rings each run their own timer, oldest first. When the oldest
   * runs out the outermost ring goes and the rest shift in; the buff lasts
   * until the newest ring's timer ends.
   */
  private settleRings(b: Buff): void {
    let rings = b.data.rings ?? 1;
    while (rings > 0 && (b.data.exp0 ?? 0) <= this.time) {
      for (let r = 0; r < rings - 1; r++) b.data[`exp${r}`] = b.data[`exp${r + 1}`]!;
      delete b.data[`exp${rings - 1}`];
      rings--;
    }
    b.data.rings = rings;
    b.remaining = rings ? b.data[`exp${rings - 1}`]! - this.time : 0;
  }

  private tickOrbit(b: Buff, dt: number): void {
    const od = b.mods.orbitDaggers!;
    b.data.angle = (b.data.angle ?? 0) + dt * (od.spin ?? 3.2);
    const rings = od.stacks ? b.data.rings ?? 1 : 1;
    // The buff carries its skill's id, so the damage is that skill's
    const def = SKILLS[b.id] ?? SKILLS.daggers_protection!;
    const dmg = Math.round(skillDamageFor(this, def.id, od.damageMult));
    // Each orbiter is a real hit box at the spot it is drawn: it strikes only what it touches
    const hitRadius = (od.hitRadius ?? 10) * PX;
    for (let r = 0; r < rings; r++) {
      for (let i = 0; i < od.count; i++) {
        const place = orbiterPlace(od, b.data.angle, r, i);
        const ox = this.px + Math.sin(place.angle) * place.radius * PX;
        const oz = this.pz + Math.cos(place.angle) * place.radius * PX;
        for (const e of this.enemiesWithin(ox, oz, hitRadius)) {
          const key = `hit_${r}_${e.id}`;
          if ((b.data[key] ?? 0) > this.time) continue;
          b.data[key] = this.time + od.hitCooldown * MS;
          hitEnemy(this, e, { amount: dmg, element: 'physical', canCrit: true, skillId: def.id, weaponHit: false });
        }
      }
    }
  }

  private tickZoneMods(): void {
    let mods: BuffMods = {};
    for (const z of this.zones) {
      if (z.type === 'sanctuary' && z.mods && this.dist(z.x, z.z) <= z.radius) mods = z.mods;
    }
    const changed = (mods.armor ?? 0) !== (this.zoneMods.armor ?? 0) || (mods.allResists ?? 0) !== (this.zoneMods.allResists ?? 0);
    if (changed) {
      this.zoneMods = mods;
      this.markDirty();
      this.recomputeStats();
    }
  }

  private tickRegen(dt: number): void {
    if (this.playerDead) return;
    const d = this.derived;
    if (d.hpRegen > 0) this.healPlayer(d.hpRegen * dt, true);
    if (d.manaRegen > 0) this.player.mana = Math.min(d.maxMana, this.player.mana + d.manaRegen * dt);
    if (this.bandage) {
      this.healPlayer(this.bandage.perSec * dt, true);
      this.bandage.remaining -= dt;
      if (this.bandage.remaining <= 0) this.bandage = null;
    }
  }

  private tickMovement(dt: number): void {
    this.moving = false;
    if (this.leap) {
      const l = this.leap;
      l.t += dt;
      const k = Math.min(1, l.t / l.duration);
      this.px = l.fromX + (l.toX - l.fromX) * k;
      this.pz = l.fromZ + (l.toZ - l.fromZ) * k;
      this.moving = true;
      if (k >= 1) {
        this.leap = null;
        const land = l.onLand;
        if (land) land();
        else this.emit({ type: 'kick', k: 0.2 });
      }
      return;
    }
    if (this.charge) {
      const c = this.charge;
      const stepLen = Math.min(c.remaining, c.speed * dt);
      const nx = this.px + c.dirX * stepLen;
      const nz = this.pz + c.dirZ * stepLen;
      if (this.map.circleBlocked(nx, nz, PLAYER_RADIUS)) {
        this.charge = null;
        this.emit({ type: 'kick', k: 0.3 });
        return;
      }
      this.px = nx;
      this.pz = nz;
      c.remaining -= stepLen;
      this.moving = true;
      for (const e of this.enemiesWithin(this.px, this.pz, c.radius)) {
        if (c.hit.includes(e.id)) continue;
        c.hit.push(e.id);
        hitEnemy(this, e, { amount: c.damage, element: c.def.element, canCrit: true, skillId: c.def.id, weaponHit: false });
      }
      if (c.remaining <= 0.001) this.charge = null;
      return;
    }
    if (this.pStatus.stun > 0 || this.pStatus.freeze > 0) return;
    if (!this.movingByInput && !this.path.length && this.aimPoint && !this.targetEnemy() && !this.beam) this.faceToward(this.aimPoint.x, this.aimPoint.z, dt);
    let speed = this.derived.moveSpeed;
    if (this.pStatus.slow > 0) speed *= STATUS_RULES.slowFactor;

    let dx = 0;
    let dz = 0;
    if (this.moveInput.x || this.moveInput.z) {
      const len = Math.hypot(this.moveInput.x, this.moveInput.z) || 1;
      dx = this.moveInput.x / len;
      dz = this.moveInput.z / len;
    } else if (this.path.length) {
      const wp = this.path[0]!;
      const tx = wp.x - this.px;
      const tz = wp.z - this.pz;
      const len = Math.hypot(tx, tz);
      if (len < Math.max(0.08, speed * dt)) {
        this.px = wp.x;
        this.pz = wp.z;
        this.path.shift();
        if (!this.path.length) this.onArrive();
        return;
      }
      dx = tx / len;
      dz = tz / len;
    } else {
      return;
    }
    this.moving = true;
    this.pyaw = Math.atan2(dx, dz);
    const nx = this.px + dx * speed * dt;
    const nz = this.pz + dz * speed * dt;
    this.map.slide(this.px, this.pz, nx, nz, PLAYER_RADIUS, this.slid);
    this.px = this.slid.x;
    this.pz = this.slid.z;
  }

  /** Turns the hero smoothly toward a point. */
  private faceToward(x: number, z: number, dt: number): void {
    const dx = x - this.px;
    const dz = z - this.pz;
    if (dx * dx + dz * dz < 0.09) return;
    const want = Math.atan2(dx, dz);
    let diff = want - this.pyaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.pyaw += diff * Math.min(1, dt * 14);
  }

  private onArrive(): void {
    if (this.pendingInteract) {
      const it = this.pendingInteract;
      this.pendingInteract = null;
      if (this.dist(it.x, it.z) <= it.radius + 0.5) this.emit({ type: 'open', panel: it.kind });
    }
  }

  /** How far the equipped weapon reaches, plus the target's body. */
  private attackReach(t: Enemy): number {
    const d = this.derived;
    return (d.isRanged ? (this.player.equipment.get('weapon')?.weapon?.range ?? 300) + d.range : d.meleeRange) * PX + t.radius;
  }

  /** In reach and in sight: nothing, melee or ranged, attacks through a wall. */
  private inReach(t: Enemy): boolean {
    if (this.dist(t.x, t.z) > this.attackReach(t)) return false;
    return !this.map.lineBlocked(this.px, this.pz, t.x, t.z);
  }

  /** Nearest enemy the hero could hit from where it stands, without moving. */
  nearestInReach(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dead) continue;
      const dd = this.dist(e.x, e.z);
      if (dd < bestD && this.inReach(e)) {
        bestD = dd;
        best = e;
      }
    }
    return best;
  }

  /**
   * One swing at whatever is already in reach. Never moves the hero. Used by the
   * touch Attack button: a tap is one attack, holding repeats it.
   */
  /**
   * The touch Attack button: swing at the nearest enemy in reach. With nothing
   * in reach it targets the nearest enemy in sight, and the hero walks to it
   * while the joystick is idle, as a skill out of range does.
   */
  attackOnce(): boolean {
    if (this.playerDead || this.leap || this.charge || this.pStatus.stun > 0 || this.pStatus.freeze > 0) return false;
    const t = this.nearestInReach();
    if (!t) {
      const far = this.nearestEnemy(this.px, this.pz, 12, null, false) ?? this.nearestEnemy(this.px, this.pz, 12);
      if (far) this.setTarget(far.id);
      return false;
    }
    if (this.attackTimer > 0) return false;
    this.performAttack(t);
    return true;
  }

  private tickAutoAttack(dt: number): void {
    if (this.attackHeld && !this.pendingCast) {
      // Held Attack: keep swinging at whatever is close, but stay put
      const near = this.nearestInReach();
      if (near && this.attackTimer <= 0) this.performAttack(near);
    }
    const t = this.targetEnemy();
    if (!t) {
      if (this.targetId >= 0) this.targetId = -1;
      return;
    }
    if (this.pendingCast) return; // handled by tickPendingCast
    if (!this.inReach(t)) {
      // With a joystick the player steers; only path when nothing else moves the hero
      if (!this.movingByInput) this.approach(t, dt);
      return;
    }
    this.path.length = 0;
    this.pyaw = Math.atan2(t.x - this.px, t.z - this.pz);
    if (this.attackTimer > 0) return;
    this.performAttack(t);
  }

  /**
   * Shift-click on desktop: attack toward a point without moving. The hero
   * stops, faces the point and swings or shoots that way. A melee swing lands
   * on the enemy in reach nearest the point (or hits air); an arrow flies
   * along the line and hits whatever it meets.
   */
  attackAt(x: number, z: number): boolean {
    if (this.playerDead || this.leap || this.charge || this.pStatus.stun > 0 || this.pStatus.freeze > 0) return false;
    this.targetId = -1;
    this.pendingCast = null;
    this.pendingInteract = null;
    this.pendingPickup = -1;
    this.path.length = 0;
    this.moveInput.x = 0;
    this.moveInput.z = 0;
    const dx = x - this.px;
    const dz = z - this.pz;
    if (dx * dx + dz * dz > 1e-6) this.pyaw = Math.atan2(dx, dz);
    if (this.attackTimer > 0) return false;
    const d = this.derived;
    const base = (d.isRanged ? (this.player.equipment.get('weapon')?.weapon?.range ?? 300) + d.range : d.meleeRange) * PX;
    let t: Enemy | null = null;
    if (!d.isRanged) {
      let best = Infinity;
      for (const e of this.enemiesInArc(this.px, this.pz, Math.sin(this.pyaw), Math.cos(this.pyaw), base, 70)) {
        const dd = (e.x - x) ** 2 + (e.z - z) ** 2;
        if (dd < best) {
          best = dd;
          t = e;
        }
      }
    }
    this.swing(base + (t?.radius ?? 0), t);
    return true;
  }

  private performAttack(t: Enemy): void {
    this.pyaw = Math.atan2(t.x - this.px, t.z - this.pz);
    this.swing(this.attackReach(t), t);
  }

  /** The basic attack itself, facing `pyaw`: an arrow or bolt along it, or a melee swing that lands on `t` when there is one. */
  private swing(reach: number, t: Enemy | null): void {
    const d = this.derived;
    this.attackTimer = 1 / d.atkSpd;
    this.breakInvisibility();
    this.emit({ type: 'player_attack', melee: !d.isRanged });
    const dirX = Math.sin(this.pyaw);
    const dirZ = Math.cos(this.pyaw);
    const amount = Math.max(1, Math.round(baseAttackDamage(this) * d.dmgMult));
    if (d.isRanged) {
      const homing = this.buffs.some((b) => b.mods.homingArrows);
      const shape: ProjectileShape = d.isMagicWeapon ? 'bolt' : 'arrow';
      this.spawnProjectile({
        owner: 'player', shape, element: 'physical', x: this.px + dirX * 0.5, z: this.pz + dirZ * 0.5, dirX, dirZ,
        speed: 480 * PX * (1 + d.projSpeedPct / 100), radius: 0.22, maxRange: reach + 1,
        packet: { amount, element: 'physical', canCrit: true, skillId: null, weaponHit: true },
        pierce: shape === 'arrow' ? d.pierce : 0, homing,
      });
    } else {
      this.emit({ type: 'melee_swing', x: this.px, z: this.pz, dirX, dirZ, range: reach, arc: 70, element: 'physical' });
      if (t) hitEnemy(this, t, { amount, element: 'physical', canCrit: true, skillId: null, weaponHit: true });
    }
  }

  private approach(t: Enemy, dt: number): void {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.path.length) {
      this.repathTimer = 0.3;
      this.path = findPath(this.map, this.px, this.pz, t.x, t.z) ?? [];
    }
  }

  private tickPendingCast(): void {
    const pc = this.pendingCast;
    if (!pc) return;
    const t = this.targetEnemy();
    if (!t) {
      this.pendingCast = null;
      return;
    }
    const res = castSkill(this, pc.skillId, pc.aim);
    if (res.ok) {
      this.pendingCast = null;
      this.path.length = 0;
    } else if (!res.approach) {
      this.pendingCast = null;
    }
  }

  private tickBeam(dt: number): void {
    const b = this.beam;
    if (!b) return;
    const t = this.enemies[b.targetId];
    b.remaining -= dt;
    const dist = t && t.alive && !t.dead ? this.dist(t.x, t.z) : Infinity;
    if (b.remaining <= 0 || dist > b.extendedRange) {
      this.emit({ type: 'beam', on: false, targetId: b.targetId });
      this.beam = null;
      return;
    }
    this.pyaw = Math.atan2(t!.x - this.px, t!.z - this.pz);
    b.tickTimer += dt;
    while (b.tickTimer >= b.interval) {
      b.tickTimer -= b.interval;
      const eff = dist > b.maxRange ? b.farEffectiveness : 1;
      const dealt = hitEnemy(this, t!, { amount: Math.round(b.drain * eff), element: 'poison', canCrit: false, skillId: 'life_touch', weaponHit: false });
      this.healPlayer(dealt, false);
      if (!t!.alive || t!.dead) {
        this.emit({ type: 'beam', on: false, targetId: b.targetId });
        this.beam = null;
        return;
      }
    }
  }

  // ---------------------------------------------------------------- enemies

  private blankEnemy(id: number): Enemy {
    return {
      id, alive: false, def: null, dummy: null, name: '', recipeId: 'ghoul', x: 0, z: 0, yaw: 0, radius: 0.4, hp: 1, maxHp: 1, damage: 0, speed: 0, xp: 0,
      attackRange: 1, attackCooldown: 1, attackTimer: 0, thinkTimer: 0, moving: false, dead: false, deadTimer: 0, status: emptyStatus(), sinceHit: 0, scale: 1, moveX: 0, moveZ: 0, aggro: false,
    };
  }

  private allocEnemy(): Enemy {
    const e = this.enemies.find((q) => !q.alive) ?? this.enemies[0]!;
    e.alive = true;
    e.dead = false;
    e.status = emptyStatus();
    return e;
  }

  spawnEnemy(def: EnemyDef, x: number, z: number): Enemy {
    const e = this.allocEnemy();
    // Monsters grow with their zone (or the level picked for it), not with the hero; steeper past the cap
    const lv = this.monsterLevel - 1;
    const scale = monsterScale(this.monsterLevel);
    Object.assign(e, {
      def, dummy: null, name: def.name, recipeId: def.look, x, z, yaw: this.rng.range(0, 6.28), radius: def.radius * PX,
      maxHp: Math.round(def.hp * scale.hp), damage: Math.round(def.damage * scale.dmg),
      speed: def.speed * PX, xp: Math.round(def.xp * (1 + MONSTER_RULES.xpPerLevel * lv)), attackRange: def.attackRange * PX,
      attackCooldown: def.attackCooldown * MS, attackTimer: this.rng.range(0.3, 1.0), thinkTimer: this.rng.range(0, 0.3), moving: false, deadTimer: 0, sinceHit: 0, aggro: false,
      scale: def.scale * this.rng.range(0.92, 1.08),
    });
    e.hp = e.maxHp;
    this.emit({ type: 'enemy_spawn', id: e.id });
    return e;
  }

  killEnemy(e: Enemy, healOnKillPct: number): void {
    if (e.dead || !e.alive) return;
    e.dead = true;
    e.deadTimer = 1.6;
    e.hp = 0;
    e.status.heldBy = -1;
    if (this.targetId === e.id) this.targetId = -1;
    this.emit({ type: 'enemy_died', id: e.id, x: e.x, z: e.z });
    this.emit({ type: 'sound', id: 'enemyDeath' });
    if (healOnKillPct) this.healPlayer(Math.round((this.derived.maxHp * healOnKillPct) / 100), false);
    this.player.kills++;
    rechargePotions(this.player, this.potionFraction);
    this.gainXp(e.xp);
    if (e.def) {
      const gold = Math.round(this.rng.int(e.def.gold[0], e.def.gold[1]) * (1 + MONSTER_RULES.goldPerLevel * (this.monsterLevel - 1)) * (1 + this.derived.goldFind / 100));
      this.addDrop(e.x + this.rng.range(-0.4, 0.4), e.z + this.rng.range(-0.4, 0.4), null, gold);
      // Item find scales the monster's own drop chance; magic find then decides the rarity
      if (this.rng.next() * 100 < e.def.dropChance * (1 + this.derived.itemFind / 100)) {
        const sets = setsForZone(this.zone.id);
        // Past the cap, drops follow the monster level instead of the hero's, so gear keeps growing to 500
        const ilvl = this.monsterLevel > LEVELING.maxLevel ? this.monsterLevel : this.player.level;
        const item = generateItem(this.rng, { ilvl, magicFind: this.derived.magicFind, sets: sets.map((s) => s.id), setWeight: Math.max(0, ...sets.map((s) => s.dropWeight)) });
        this.addDrop(e.x + this.rng.range(-0.6, 0.6), e.z + this.rng.range(-0.6, 0.6), item, 0);
      }
    }
  }

  killPlayer(): void {
    if (this.playerDead) return;
    this.playerDead = true;
    this.player.hp = 0;
    this.stop();
    this.emit({ type: 'player_died' });
    this.emit({ type: 'sound', id: 'playerHurt' });
  }

  private rebuildHash(): void {
    this.hash.clear();
    for (const e of this.enemies) if (e.alive && !e.dead) this.hash.insert(e.id, e.x, e.z);
  }

  private tickEnemies(dt: number): void {
    const hidden = this.invisible || this.playerDead;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.dead) {
        e.deadTimer -= dt;
        if (e.deadTimer <= 0) e.alive = false;
        continue;
      }
      tickStatuses(this, e, dt);
      if (e.dead) continue;
      e.attackTimer = Math.max(0, e.attackTimer - dt);
      e.moving = false;
      if (e.dummy) {
        this.tickDummy(e, dt);
        continue;
      }
      const disabled = e.status.stun > 0 || e.status.freeze > 0;
      if (disabled) continue;
      // Far enemies think less often
      const dist = this.dist(e.x, e.z);
      e.thinkTimer -= dt;
      const far = dist > 22;
      if (e.thinkTimer <= 0) {
        e.thinkTimer = far ? 0.25 : 0.05;
        this.think(e, dist, hidden);
      }
      // Held in a prison
      if (e.status.heldBy >= 0) {
        const z = this.zones.find((q) => q.id === e.status.heldBy);
        if (!z) e.status.heldBy = -1;
        else {
          const dx = e.x - z.x;
          const dz = e.z - z.z;
          const d = Math.hypot(dx, dz);
          if (d > z.radius - 0.2) {
            e.x = z.x + (dx / d) * (z.radius - 0.2);
            e.z = z.z + (dz / d) * (z.radius - 0.2);
            e.moveX = 0;
            e.moveZ = 0;
          }
        }
      }
      if (e.moveX || e.moveZ) {
        let speed = e.speed;
        if (e.status.slow > 0) speed *= STATUS_RULES.slowFactor;
        // Separation from neighbours
        let sx = 0;
        let sz = 0;
        this.hash.query(e.x, e.z, 1.2, (id) => {
          const o = this.enemies[id]!;
          if (o === e || o.dead) return;
          const dx = e.x - o.x;
          const dz = e.z - o.z;
          const d2 = dx * dx + dz * dz;
          const min = e.radius + o.radius + 0.1;
          if (d2 < min * min && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            sx += (dx / d) * (min - d);
            sz += (dz / d) * (min - d);
          }
        });
        const mx = e.moveX + sx * 2.5;
        const mz = e.moveZ + sz * 2.5;
        const len = Math.hypot(mx, mz) || 1;
        const nx = e.x + (mx / len) * speed * dt;
        const nz = e.z + (mz / len) * speed * dt;
        this.map.slide(e.x, e.z, nx, nz, e.radius, this.slid);
        e.x = this.slid.x;
        e.z = this.slid.z;
        e.moving = true;
        e.yaw = Math.atan2(mx, mz);
      }
      // Keep out of the player
      const pdx = e.x - this.px;
      const pdz = e.z - this.pz;
      const pd = Math.hypot(pdx, pdz);
      const minD = e.radius + PLAYER_RADIUS;
      if (pd < minD && pd > 0.001) {
        // Pushed out along the walls, never into one
        this.map.slide(e.x, e.z, this.px + (pdx / pd) * minD, this.pz + (pdz / pd) * minD, e.radius, this.slid);
        e.x = this.slid.x;
        e.z = this.slid.z;
      }
    }
  }

  /** A hit on one monster wakes its neighbours: every living monster within MONSTER_RULES.alertRange px of it starts chasing too. */
  alertNear(e: Enemy): void {
    const r = MONSTER_RULES.alertRange * PX;
    const r2 = r * r;
    for (const o of this.enemies) {
      if (o === e || o.aggro || !o.alive || o.dead || o.dummy) continue;
      const dx = o.x - e.x;
      const dz = o.z - e.z;
      if (dx * dx + dz * dz <= r2) o.aggro = true;
    }
  }

  private think(e: Enemy, dist: number, hidden: boolean): void {
    e.moveX = 0;
    e.moveZ = 0;
    if (hidden) return;
    // Monsters stand where they are until the hero comes close or hits them
    if (!e.aggro) {
      if (dist > MONSTER_RULES.aggroRange * PX) return;
      e.aggro = true;
    }
    const def = e.def!;
    const reach = e.attackRange + e.radius + PLAYER_RADIUS;
    if (def.ai === 'ranged') {
      const pref = (def.preferredRange ?? 195) * PX;
      const los = !this.map.lineBlocked(e.x, e.z, this.px, this.pz);
      if (dist < pref * 0.75) {
        const safe = Math.max(dist, 0.001);
        e.moveX = (e.x - this.px) / safe;
        e.moveZ = (e.z - this.pz) / safe;
      } else if (dist > pref || !los) {
        // Close in until it is truly at its preferred range: a hero with a 200 px weapon must be able to answer
        const dir = { x: 0, z: 0 };
        this.flow.direction(e.x, e.z, dir);
        e.moveX = dir.x * 0.6;
        e.moveZ = dir.z * 0.6;
      } else {
        e.yaw = Math.atan2(this.px - e.x, this.pz - e.z);
        if (e.attackTimer <= 0 && e.status.shock <= 0) {
          e.attackTimer = e.attackCooldown;
          this.emit({ type: 'enemy_attack', id: e.id });
          const safe = Math.max(dist, 0.001);
          const dx = (this.px - e.x) / safe;
          const dz = (this.pz - e.z) / safe;
          this.spawnProjectile({
            owner: 'enemy', shape: 'enemy_bolt', element: def.element, x: e.x + dx * 0.5, z: e.z + dz * 0.5, dirX: dx, dirZ: dz,
            speed: 9, radius: 0.25, maxRange: e.attackRange + 2, packet: { amount: e.damage, element: def.element, canCrit: false, skillId: null, weaponHit: false },
          });
        }
      }
      return;
    }
    // Melee needs to be in reach and in sight; through a wall it keeps walking round
    if (dist > reach || this.map.lineBlocked(e.x, e.z, this.px, this.pz)) {
      const dir = { x: 0, z: 0 };
      this.flow.direction(e.x, e.z, dir);
      if (!dir.x && !dir.z && dist < 6) {
        const safe = Math.max(dist, 0.001);
        dir.x = (this.px - e.x) / safe;
        dir.z = (this.pz - e.z) / safe;
      }
      e.moveX = dir.x;
      e.moveZ = dir.z;
    } else {
      e.yaw = Math.atan2(this.px - e.x, this.pz - e.z);
      if (e.attackTimer <= 0 && e.status.shock <= 0) {
        e.attackTimer = e.attackCooldown;
        this.emit({ type: 'enemy_attack', id: e.id });
        damagePlayer(this, e.damage, def.element, e, true);
      }
    }
  }

  private tickDummy(e: Enemy, dt: number): void {
    e.sinceHit += dt;
    if (e.hp < e.maxHp && e.sinceHit > DUMMY_RULES.resetAfter) e.hp = e.maxHp;
    const dist = this.dist(e.x, e.z);
    if (dist <= e.attackRange + e.radius + PLAYER_RADIUS && !this.playerDead && !this.invisible) {
      e.yaw = Math.atan2(this.px - e.x, this.pz - e.z);
      if (e.attackTimer <= 0 && e.status.shock <= 0 && e.status.stun <= 0 && e.status.freeze <= 0) {
        e.attackTimer = e.attackCooldown;
        this.emit({ type: 'enemy_attack', id: e.id });
        damagePlayer(this, e.damage, e.dummy!.element, e, e.dummy!.element === 'physical');
      }
    }
  }

  // ---------------------------------------------------------------- projectiles

  private blankProjectile(id: number): Projectile {
    return {
      id, alive: false, owner: 'player', shape: 'bolt', element: 'physical', x: 0, z: 0, y: 1, vx: 0, vz: 0, speed: 0, radius: 0.2, traveled: 0, maxRange: 1,
      packet: { amount: 0, element: 'physical', canCrit: false, skillId: null, weaponHit: false }, pierce: 0, hit: [], homing: false, homingTarget: -1, ricochets: 0,
      returns: false, returning: false, throughWalls: false, splashRadius: 0, onHitZone: null, burstOnHit: null, skillId: null,
    };
  }

  private tickProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (p.homing && p.owner === 'player') {
        let t = this.enemies[p.homingTarget];
        if (!t || !t.alive || t.dead) {
          t = this.nearestEnemy(p.x, p.z, 8, p.hit) ?? undefined;
          p.homingTarget = t ? t.id : -1;
        }
        if (t) {
          const dx = t.x - p.x;
          const dz = t.z - p.z;
          const len = Math.hypot(dx, dz) || 1;
          const turn = Math.min(1, dt * 6);
          p.vx += (dx / len * p.speed - p.vx) * turn;
          p.vz += (dz / len * p.speed - p.vz) * turn;
          const vl = Math.hypot(p.vx, p.vz) || 1;
          p.vx = (p.vx / vl) * p.speed;
          p.vz = (p.vz / vl) * p.speed;
        }
      }
      if (p.returning) {
        const dx = this.px - p.x;
        const dz = this.pz - p.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.6) {
          p.alive = false;
          continue;
        }
        p.vx = (dx / len) * p.speed;
        p.vz = (dz / len) * p.speed;
      }
      const step = Math.hypot(p.vx, p.vz) * dt;
      const nx = p.x + p.vx * dt;
      const nz = p.z + p.vz * dt;
      if (!p.throughWalls && this.map.blockedAt(nx, nz)) {
        this.endProjectile(p);
        continue;
      }
      p.x = nx;
      p.z = nz;
      p.traveled += step;
      if (p.owner === 'player') {
        let consumed = false;
        this.hash.query(p.x, p.z, p.radius + 0.8, (id) => {
          if (consumed) return;
          const e = this.enemies[id]!;
          if (!e.alive || e.dead || p.hit.includes(id)) return;
          const r = p.radius + e.radius;
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > r * r) return;
          p.hit.push(id);
          hitEnemy(this, e, p.packet);
          this.emit({ type: 'projectile_hit', x: p.x, z: p.z, element: p.element, shape: p.shape, splash: p.splashRadius });
          if (p.splashRadius > 0) {
            for (const o of this.enemiesWithin(p.x, p.z, p.splashRadius)) if (o !== e) hitEnemy(this, o, { ...p.packet, amount: Math.round(p.packet.amount * 0.7) });
          }
          if (p.onHitZone) this.addZone({ type: 'poison', x: p.x, z: p.z, radius: p.onHitZone.radius, duration: p.onHitZone.duration, tickInterval: p.onHitZone.tickInterval, damage: p.onHitZone.damage, element: 'poison', skillId: p.skillId });
          if (p.burstOnHit) {
            const b = p.burstOnHit;
            for (let i = 0; i < b.count; i++) {
              const a = (i / b.count) * Math.PI * 2;
              this.spawnProjectile({ owner: 'player', shape: 'dagger', element: p.element, x: p.x, z: p.z, dirX: Math.sin(a), dirZ: Math.cos(a), speed: b.projSpeed, radius: 0.2, maxRange: b.maxRange, packet: { ...p.packet, amount: b.damage }, skillId: p.skillId });
            }
          }
          if (p.ricochets > 0) {
            const next = this.nearestEnemy(p.x, p.z, 9, p.hit);
            if (next) {
              p.ricochets--;
              p.traveled = 0;
              const dx = next.x - p.x;
              const dz = next.z - p.z;
              const len = Math.hypot(dx, dz) || 1;
              p.vx = (dx / len) * p.speed;
              p.vz = (dz / len) * p.speed;
              return;
            }
          }
          if (p.pierce > 0 && p.pierce !== Infinity) {
            p.pierce--;
            return;
          }
          if (p.pierce === Infinity) return;
          consumed = true;
          p.alive = false;
        });
        if (!p.alive) continue;
      } else if (!this.playerDead) {
        const r = p.radius + PLAYER_RADIUS;
        if ((p.x - this.px) ** 2 + (p.z - this.pz) ** 2 <= r * r) {
          damagePlayer(this, p.packet.amount, p.packet.element, null, false);
          this.emit({ type: 'projectile_hit', x: p.x, z: p.z, element: p.element, shape: p.shape, splash: 0 });
          p.alive = false;
          continue;
        }
      }
      if (p.traveled >= p.maxRange) {
        if (p.returns && !p.returning) {
          p.returning = true;
          p.hit.length = 0;
          continue;
        }
        this.endProjectile(p);
      }
    }
  }

  private endProjectile(p: Projectile): void {
    if (p.owner === 'player' && p.splashRadius > 0) {
      this.emit({ type: 'projectile_hit', x: p.x, z: p.z, element: p.element, shape: p.shape, splash: p.splashRadius });
      for (const o of this.enemiesWithin(p.x, p.z, p.splashRadius)) hitEnemy(this, o, { ...p.packet, amount: Math.round(p.packet.amount * 0.7) });
    }
    p.alive = false;
  }

  // ---------------------------------------------------------------- zones

  private tickZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      z.remaining -= dt;
      if (z.followsPlayer) {
        z.x = this.px;
        z.z = this.pz;
      }
      z.tickTimer += dt;
      const packetFor = (): DamagePacket => ({ amount: z.damage, element: z.element, canCrit: false, skillId: z.skillId, weaponHit: false, slow: z.slow ? z.slow / MS : undefined });
      switch (z.type) {
        case 'trap': {
          if (!z.triggered) {
            const first = this.enemiesWithin(z.x, z.z, z.radius).find((e) => !e.dummy) ?? this.enemiesWithin(z.x, z.z, z.radius)[0];
            if (first) {
              z.triggered = true;
              z.remaining = 0;
              this.emit({ type: 'aoe', visual: 'trap', x: z.x, z: z.z, radius: z.aoeRadius || z.radius, element: z.element });
              const victims = z.aoeRadius > 0 ? this.enemiesWithin(z.x, z.z, z.aoeRadius) : [first];
              for (const e of victims) hitEnemy(this, e, packetFor());
            }
          }
          break;
        }
        case 'fire_prison':
        case 'poison':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            for (const e of this.enemiesWithin(z.x, z.z, z.radius)) hitEnemy(this, e, packetFor());
          }
          break;
        case 'spear_wall':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            const px = -z.dz;
            const pz = z.dx;
            for (let k = 0; k < z.count; k++) {
              const t = z.count > 1 ? k / (z.count - 1) - 0.5 : 0;
              const sx = z.x + px * z.length * t;
              const sz = z.z + pz * z.length * t;
              for (const e of this.enemiesWithin(sx, sz, z.radius + 0.2)) hitEnemy(this, e, packetFor());
            }
          }
          break;
        case 'void_trail':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            for (const e of this.enemies) {
              if (!e.alive || e.dead) continue;
              const t = Math.max(0, Math.min(z.length, (e.x - z.x) * z.dx + (e.z - z.z) * z.dz));
              const cx = z.x + z.dx * t;
              const cz = z.z + z.dz * t;
              if (Math.hypot(e.x - cx, e.z - cz) <= z.radius + e.radius) hitEnemy(this, e, packetFor());
            }
          }
          break;
        case 'blizzard':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            for (const e of this.enemiesWithin(z.x, z.z, z.radius)) e.status.slow = Math.max(e.status.slow, z.tickInterval + 0.1);
            for (let k = 0; k < z.perWave; k++) {
              const a = this.rng.range(0, Math.PI * 2);
              const r = Math.sqrt(this.rng.next()) * z.radius;
              const fx = z.x + Math.cos(a) * r;
              const fz = z.z + Math.sin(a) * r;
              this.emit({ type: 'zone_tick', id: z.id, x: fx, z: fz });
              for (const e of this.enemiesWithin(fx, fz, 1.2)) hitEnemy(this, e, packetFor());
            }
          }
          break;
        case 'wind':
        case 'smoke':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            for (const e of this.enemiesWithin(z.x, z.z, z.radius)) e.status.slow = Math.max(e.status.slow, z.tickInterval + 0.15);
          }
          break;
        case 'storm':
          while (z.tickTimer >= z.tickInterval) {
            z.tickTimer -= z.tickInterval;
            const list = this.enemiesWithin(z.x, z.z, z.radius).sort((a, b) => this.dist(a.x, a.z) - this.dist(b.x, b.z)).slice(0, z.targets);
            for (const e of list) {
              this.emit({ type: 'aoe', visual: 'lightning', x: e.x, z: e.z, radius: 1, element: 'lightning' });
              hitEnemy(this, e, packetFor());
            }
          }
          break;
        case 'sanctuary':
        case 'boulder':
        case 'prison_hold':
          break;
      }
      if (z.remaining <= 0) {
        this.zones.splice(i, 1);
        for (const e of this.enemies) if (e.status.heldBy === z.id) e.status.heldBy = -1;
        this.emit({ type: 'zone_end', id: z.id });
        z.onEnd?.();
      }
    }
  }

  // ---------------------------------------------------------------- drops and spawning

  /** Puts loot on the floor; public so tests and tools can. */
  addDrop(x: number, z: number, item: Item | null, gold: number): void {
    const d: Drop = { id: this.nextDropId++, alive: true, x, z, item, gold, age: 0 };
    this.drops.push(d);
    this.emit({ type: 'drop_spawn', id: d.id });
  }

  /** Gold is scooped up by walking over it. Items wait underfoot for the action key, or for a click on their label. */
  private tickDrops(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      if (this.playerDead) continue;
      const dist = this.dist(d.x, d.z);
      if (d.gold > 0) {
        if (dist <= PICKUP_RADIUS) this.takeDrop(d, false);
        continue;
      }
      if (this.pendingPickup !== d.id || dist > PICKUP_RADIUS + 0.4) continue;
      if (!this.takeDrop(d, true)) this.pendingPickup = -1;
    }
  }

  private tickSpawner(dt: number): void {
    if (this.area !== 'arena' || !this.arena || this.playerDead) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const zone = this.zone;
    this.spawnTimer = zone.spawnInterval;
    const alive = this.enemies.filter((e) => e.alive && !e.dead && e.def).length;
    if (alive >= zone.maxAlive) return;
    // Weighted pick from the zone's roster
    const ids = Object.keys(zone.spawns).filter((id) => MONSTERS[id]);
    const total = ids.reduce((a, id) => a + zone.spawns[id]!, 0);
    let roll = this.rng.next() * total;
    let def = MONSTERS[ids[0]!]!;
    for (const id of ids) {
      roll -= zone.spawns[id]!;
      if (roll < 0) {
        def = MONSTERS[id]!;
        break;
      }
    }
    // A reachable tile 12 to 26 units away
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(12, 26);
      const x = this.px + Math.cos(a) * r;
      const z = this.pz + Math.sin(a) * r;
      const c = Math.floor(x);
      const rr = Math.floor(z);
      if (c < 2 || rr < 2 || c >= this.map.cols - 2 || rr >= this.map.rows - 2) continue;
      if (!this.arena.reachable[rr * this.map.cols + c]) continue;
      if (this.map.circleBlocked(x, z, def.radius * PX)) continue;
      const pack = this.rng.int(def.pack[0], def.pack[1]);
      for (let k = 0; k < pack; k++) {
        const ox = x + this.rng.range(-0.8, 0.8);
        const oz = z + this.rng.range(-0.8, 0.8);
        if (!this.map.circleBlocked(ox, oz, def.radius * PX)) this.spawnEnemy(def, ox, oz);
      }
      return;
    }
  }
}

/** Basic attack damage: weapon roll plus the scaling stat. */
export function baseAttackDamage(w: World): number {
  const d = w.derived;
  const roll = d.dmgMin + w.rng.next() * (d.dmgMax - d.dmgMin);
  return roll + (d.isMagicWeapon ? d.int * 0.5 + d.spellDmg : d.str * 0.5 + d.bonusDamage);
}

function skillDamageFor(w: World, id: string, mult: number): number {
  const def = SKILLS[id]!;
  const rank = w.skillRank(id);
  return baseAttackDamage(w) * mult * (1 + rank * (def.rankBonus ?? 0.2)) * w.derived.dmgMult;
}

export { ELEMENT_COLORS };
