import type { DummyDef } from '../data/dummies';
import type { EnemyDef } from '../data/monsters';
import type { BuffMods } from '../data/skills';
import type { Element } from '../data/stats';
import type { Item } from './items/item';

/** A skeleton archer raised by Summon Skeleton Army. Runtime only, never saved. */
export interface Minion {
  active: boolean;
  /** A skeleton archer, the titan of Meat Shield, the rogue's eagle or the paladin's fallen angel. */
  kind: 'archer' | 'titan' | 'eagle' | 'angel';
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  /** Seconds since its last shot or blow. */
  timer: number;
  /** Seconds left of the loosing or smashing pose, for the renderer. */
  shoot: number;
  /** Life, for the titan; archers take no damage. */
  hp: number;
  maxHp: number;
  radius: number;
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
  /** Seconds of cold soaked up in a Frostbite patch; past the patch's threshold it freezes. */
  chill: number;
  /** Share of max life lost when the current freeze ends (Winter's Heart). */
  thaw: number;
  /** Zone id holding this enemy in place (Fire Prison ultimate). */
  heldBy: number;
  /** Seconds left swinging and shooting wide (Blind). */
  blind: number;
  /** Judgement's mark: every hit lands for `dmgTakenPct` percent more while it lasts. */
  mark: { remaining: number; dmgTakenPct: number } | null;
  /** How deep in quicksand, in seconds of sinking; it climbs out at the same pace. */
  sink: number;
  /** Seconds left fighting for the hero (Blood Puppet); it dies when they run out. */
  puppet: number;
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
  /** Seconds left fighting the titan instead of the hero. */
  taunt: number;
}

export type ProjectileShape = 'bolt' | 'ball' | 'dagger' | 'arrow' | 'greatarrow' | 'lance' | 'spark' | 'orb' | 'hammer' | 'star' | 'boulder' | 'enemy_bolt';

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
  /** Shove the target this many world units away from the hero. */
  knockback?: number;
  /** Jumped from another hit by Overload, so it never arcs again. */
  fromArc?: boolean;
  /** Multiplier against the undead (Blind). */
  vsUndead?: number;
  /** Seconds of blindness dealt (Blind). */
  blind?: number;
  /** Struck by one of the hero's shades: never mirrored again. */
  fromShade?: boolean;
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
  /** Damage kept per ricochet hop. */
  ricochetDecay: number;
  /** Every hop returns to the enemy struck just before, so the shot shuttles between two. */
  ricochetBack: boolean;
  /** The monster that loosed an enemy shot, -1 for none. */
  sourceId: number;
  /** Seconds between repeat hits on the same enemy, 0 for once only; `rehitTimer` counts up to it. */
  rehit: number;
  rehitTimer: number;
  returns: boolean;
  returning: boolean;
  throughWalls: boolean;
  splashRadius: number;
  onHitZone: { radius: number; duration: number; damage: number; tickInterval: number } | null;
  burstOnHit: { count: number; damage: number; projSpeed: number; maxRange: number } | null;
  skillId: string | null;
}

export type ZoneType = 'trap' | 'fire_prison' | 'spear_wall' | 'blizzard' | 'sanctuary' | 'wind' | 'storm' | 'arrow_storm' | 'poison' | 'void_trail' | 'smoke' | 'boulder' | 'prison_hold' | 'summon' | 'frostbite' | 'frost_patch' | 'winter' | 'line_wave' | 'quicksand' | 'rockfall' | 'earthquake' | 'void_rift';

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
  /** Arrow Storm: percent of each volley aimed straight at an enemy in reach. */
  aimedPct: number;
  triggered: boolean;
  followsPlayer: boolean;
  skillId: string | null;
  /** Enemies already hit by a one-shot zone. */
  hit: number[];
  count: number;
  mods: BuffMods | null;
  onEnd: (() => void) | null;
  /** Frostbite: life lost per second inside as a share of max, and seconds of cold before the freeze; frost patch: seconds frozen on stepping in. */
  pctPerSec: number;
  freezeAfter: number;
  freeze: number;
  /** A summon's one action, run once when `tickInterval` has passed (the daemon looses its arrow). */
  onFire: (() => void) | null;
  /** Line wave: ms of stun and world units of shove dealt to each monster the front reaches. Earthquake: multiplier against a wall. */
  stun: number;
  knockback: number;
  wallMult: number;
  /** Void Rift, Quicksand's ultimate: tiles per second everything inside is dragged toward the centre. */
  pull: number;
  /** Earthquake's ultimate: every monster on the map, walls or not. */
  wholeMap: boolean;
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
  | { type: 'damage'; x: number; z: number; y: number; amount: number; crit: boolean; element: Element; target: 'enemy' | 'player'; kind?: 'dodge' | 'block' | 'absorb' | 'miss' | 'immune' }
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
  | { type: 'melee_swing'; x: number; z: number; dirX: number; dirZ: number; range: number; arc: number; element: Element; visual?: 'cleave' | 'void' | 'avalanche' | 'blind' }
  /** Lightning jumping from one point to another: a chain hop or an Overload arc. */
  | { type: 'arc'; x0: number; z0: number; x1: number; z1: number }
  /** A companion's blow: the eagle's talons or the angel's sword, from x, z toward dirX, dirZ. */
  | { type: 'minion_strike'; kind: 'eagle' | 'angel'; x: number; z: number; dirX: number; dirZ: number }
  /** A single-target hit drawn on the target standing at x, z: a big weapon from above, or a holy shield raised over it. */
  | { type: 'melee_impact'; visual: 'overhead' | 'holy_shield' | 'bloody' | 'holy' | 'shade'; x: number; z: number; element: Element }
  /** Retribution's answer: a bolt of light out of the sky onto whatever struck the hero. */
  | { type: 'holy_bolt'; x: number; z: number }
  /** Exsanguinate: blood torn out of a monster at (x, z) and drawn to the hero. */
  | { type: 'blood_drain'; x: number; z: number }
  | { type: 'aoe'; visual: string; x: number; z: number; radius: number; element: Element }
  | { type: 'projectile_hit'; x: number; z: number; element: Element; shape: ProjectileShape; splash: number }
  | { type: 'zone_start'; zone: Zone }
  | { type: 'zone_tick'; id: number; x: number; z: number; /** The monster hit, when the tick is a blow on one. */ enemyId?: number }
  | { type: 'zone_end'; id: number }
  | { type: 'buff_start'; id: string; color: number }
  | { type: 'buff_end'; id: string }
  | { type: 'leap'; fromX: number; fromZ: number; toX: number; toZ: number; duration: number }
  /** Impale's landing: spikes burst up across the area the hero came down on. */
  | { type: 'impale'; x: number; z: number; radius: number }
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
  | { type: 'status'; id: number; status: 'frozen' | 'burning' | 'poisoned' | 'stunned' | 'cursed' | 'bleeding' | 'shattered' | 'blinded' | 'judged' | 'puppeted' };
