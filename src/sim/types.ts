import type { DummyDef } from '../data/dummies';
import type { EnemyDef } from '../data/monsters';
import type { BuffMods } from '../data/skills';
import type { Element } from '../data/stats';
import type { Item } from './items/item';

/** A skeleton archer raised by Summon Skeleton Army. Runtime only, never saved. */
export interface Minion {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  /** Seconds since its last shot. */
  timer: number;
  /** Seconds left of the loosing pose, for the renderer. */
  shoot: number;
}

export interface DotState {
  ticks: number;
  timer: number;
  interval: number;
  damage: number;
}

export interface EnemyStatus {
  stun: number;
  freeze: number;
  slow: number;
  shock: number;
  burn: DotState | null;
  poison: DotState | null;
  bleed: DotState | null;
  curse: { remaining: number; pctPerSec: number; executeBelow: number } | null;
  /** Zone id holding this enemy in place (Fire Prison ultimate). */
  heldBy: number;
}

export interface Enemy {
  id: number;
  alive: boolean;
  /** Monster definition, or null for a training dummy. */
  def: EnemyDef | null;
  dummy: DummyDef | null;
  name: string;
  recipeId: string;
  x: number;
  z: number;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  damage: number;
  /** Units per second. */
  speed: number;
  xp: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  thinkTimer: number;
  moving: boolean;
  dead: boolean;
  deadTimer: number;
  status: EnemyStatus;
  /** Seconds since last damage, for dummies that reset. */
  sinceHit: number;
  scale: number;
  /** Damage multiplier from Electrocute is instant, so nothing stored. */
  moveX: number;
  moveZ: number;
  /** Has noticed the hero: idle until the hero comes within MONSTER_RULES.aggroRange or hits it. */
  aggro: boolean;
}

export type ProjectileShape = 'bolt' | 'ball' | 'dagger' | 'arrow' | 'greatarrow' | 'hammer' | 'star' | 'boulder' | 'enemy_bolt';

export interface DamagePacket {
  amount: number;
  element: Element;
  canCrit: boolean;
  skillId: string | null;
  stun?: number;
  slow?: number;
  freeze?: number;
  bleed?: { ticks: number; interval: number; damage: number };
  poison?: { ticks: number; interval: number; damage: number };
  /** Multiplier against stunned or frozen targets. */
  bonusVsDisabled?: number;
  /** Life healed on kill, percent of max life. */
  healOnKillPct?: number;
  /** Counts as a weapon hit for life steal, mana on hit and Rite of Blood. */
  weaponHit: boolean;
  /** Dealt by an item proc: never fires procs itself. */
  fromProc?: boolean;
  /** Shot by a summoned skeleton, so it never changes what the hero is counted as attacking. */
  fromMinion?: boolean;
}

export interface Projectile {
  id: number;
  alive: boolean;
  owner: 'player' | 'enemy';
  shape: ProjectileShape;
  element: Element;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  speed: number;
  radius: number;
  traveled: number;
  maxRange: number;
  packet: DamagePacket;
  pierce: number;
  hit: number[];
  homing: boolean;
  homingTarget: number;
  ricochets: number;
  returns: boolean;
  returning: boolean;
  throughWalls: boolean;
  splashRadius: number;
  onHitZone: { radius: number; duration: number; damage: number; tickInterval: number } | null;
  burstOnHit: { count: number; damage: number; projSpeed: number; maxRange: number } | null;
  skillId: string | null;
}

export type ZoneType = 'trap' | 'fire_prison' | 'spear_wall' | 'blizzard' | 'sanctuary' | 'wind' | 'storm' | 'arrow_storm' | 'poison' | 'void_trail' | 'smoke' | 'boulder' | 'prison_hold' | 'summon';

export interface Zone {
  id: number;
  type: ZoneType;
  x: number;
  z: number;
  /** Direction for line zones (spear wall, void trail). */
  dx: number;
  dz: number;
  length: number;
  radius: number;
  remaining: number;
  duration: number;
  tickTimer: number;
  tickInterval: number;
  damage: number;
  element: Element;
  slow: number;
  slowPct: number;
  holds: boolean;
  aoeRadius: number;
  targets: number;
  perWave: number;
  triggered: boolean;
  followsPlayer: boolean;
  skillId: string | null;
  /** Enemies already hit by a one-shot zone. */
  hit: number[];
  count: number;
  mods: BuffMods | null;
  onEnd: (() => void) | null;
  /** A summon's one action, run once when `tickInterval` has passed (the daemon looses its arrow). */
  onFire: (() => void) | null;
}

export interface Drop {
  id: number;
  alive: boolean;
  x: number;
  z: number;
  item: Item | null;
  gold: number;
  age: number;
}

export type InteractableKind = 'vendor' | 'stash' | 'forge' | 'bloodfountain' | 'arcana' | 'waypoint' | 'town_portal' | 'return_portal';

export interface Interactable {
  id: number;
  kind: InteractableKind;
  x: number;
  z: number;
  radius: number;
  active: boolean;
}

export type SimEvent =
  | { type: 'damage'; x: number; z: number; y: number; amount: number; crit: boolean; element: Element; target: 'enemy' | 'player'; kind?: 'dodge' | 'block' | 'absorb' }
  | { type: 'heal'; amount: number }
  | { type: 'enemy_hit'; id: number }
  | { type: 'enemy_died'; id: number; x: number; z: number }
  | { type: 'enemy_attack'; id: number }
  | { type: 'enemy_spawn'; id: number }
  | { type: 'player_hit' }
  | { type: 'player_attack'; melee: boolean }
  | { type: 'player_died' }
  | { type: 'player_respawn' }
  | { type: 'cast'; skillId: string; x: number; z: number; dirX: number; dirZ: number; tx: number; tz: number; element: Element }
  | { type: 'melee_swing'; x: number; z: number; dirX: number; dirZ: number; range: number; arc: number; element: Element; visual?: 'cleave' | 'void' }
  /** A single-target hit drawn on the target standing at x, z: a big weapon from above, or a holy shield raised over it. */
  | { type: 'melee_impact'; visual: 'overhead' | 'holy_shield' | 'bloody'; x: number; z: number; element: Element }
  | { type: 'aoe'; visual: string; x: number; z: number; radius: number; element: Element }
  | { type: 'projectile_hit'; x: number; z: number; element: Element; shape: ProjectileShape; splash: number }
  | { type: 'zone_start'; zone: Zone }
  | { type: 'zone_tick'; id: number; x: number; z: number }
  | { type: 'zone_end'; id: number }
  | { type: 'buff_start'; id: string; color: number }
  | { type: 'buff_end'; id: string }
  | { type: 'leap'; fromX: number; fromZ: number; toX: number; toZ: number; duration: number }
  | { type: 'teleport'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'beam'; on: boolean; targetId: number }
  | { type: 'message'; text: string; color?: number }
  | { type: 'level_up'; level: number }
  | { type: 'pledge_choice' }
  | { type: 'pickup'; item: Item | null; gold: number; /** Set when the pet fetched it, with where it stood. */ by?: 'pet'; x?: number; z?: number }
  | { type: 'drop_spawn'; id: number }
  | { type: 'sound'; id: string }
  | { type: 'open'; panel: InteractableKind }
  | { type: 'area'; area: 'town' | 'arena'; zone?: string; /** A picked monster level past the zone's own. */ level?: number }
  | { type: 'kick'; k: number }
  | { type: 'status'; id: number; status: 'frozen' | 'burning' | 'poisoned' | 'stunned' | 'cursed' | 'bleeding' };
