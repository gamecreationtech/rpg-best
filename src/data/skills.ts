import type { ClassId } from './classes';
import type { Element } from './stats';

export type SkillTier = 'base' | 'ultimate' | 'pledge';
export type WeaponReq = 'dagger' | 'bow' | 'shield';

/** Stat changes a buff applies while active. Percent values are bonuses (100 = +100%). */
export interface BuffMods {
  armor?: number;
  allResists?: number;
  atkSpdPct?: number;
  dmgPct?: number;
  moveSpdPct?: number;
  /** Life regenerated per second as a percentage of max life. */
  regenPct?: number;
  /** Damage shield as a percentage of max life. */
  shieldPct?: number;
  shieldPhysicalOnly?: boolean;
  /** An aoe skill dropped on the hero the moment the shield breaks (Rock Solid's boulder). */
  onShieldBreak?: string;
  /** Attackers take this multiple of their damage back as fire. */
  retaliationMult?: number;
  freezeAttackersMs?: number;
  /** Life lost per hit landed, as a percentage of max life. */
  selfCostPct?: number;
  invisible?: boolean;
  attackKeepsInvisible?: boolean;
  homingArrows?: boolean;
  /** Melee reach in px while active. */
  meleeRange?: number;
  /** Things circling the hero that cut what they pass: daggers by default, or one spinning hammer. `spin` is radians per second. */
  orbitDaggers?: { count: number; radius: number; damageMult: number; hitCooldown: number; shape?: 'dagger' | 'hammer' | 'star'; spin?: number; /** Hit box of each orbiter in px; it only strikes what it actually touches. */ hitRadius?: number; /** Recasting while active adds another ring, `ringGap` px further out, up to `stacks`; each ring keeps its own timer and the outermost goes when the oldest runs out. */ stacks?: number; ringGap?: number };
  /** Smoke bomb dropped when the buff ends. */
  endSmoke?: { radius: number; slowDuration: number };
  /** Skeleton archers raised for the buff's duration: they follow the hero and shoot whatever the hero last hit. `interval` ms between shots, `range` px. */
  skeletons?: { count: number; damageMult: number; interval: number; range: number };
  /** A colossal titan raised for the buff's duration: `hpMult` times the hero's life, taunts monsters within `tauntRadius` px of the hero, smashes everything within `reach` px every `interval` ms. */
  titan?: { hpMult: number; damageMult: number; interval: number; reach: number; tauntRadius: number };
  /** Overload: every lightning hit has `chance` percent to arc to the nearest other enemy within `range` px for `mult` of the hit. */
  overload?: { chance: number; mult: number; range: number };
  /** Wind Barrier: enemy bolts and arrows that come near the hero are blown apart. */
  deflect?: boolean;
  /** A single companion at the hero's side for the buff's duration: an eagle that dives on what the hero attacks, or a fallen angel that fights whatever is near. Strikes within `reach` px every `interval` ms. */
  companion?: { kind: 'eagle' | 'angel'; damageMult: number; interval: number; reach: number; /** Eagles only: how many fly (the ultimate's three). */ count?: number };
  /** Consecrated Blade: every hit the hero lands deals `pct` percent more, and `vsUndead` times that bonus against the undead. */
  holyBlade?: { pct: number; vsUndead: number };
  /** Divine Shield: nothing hurts the hero while it lasts... */
  invulnerable?: boolean;
  /** ...and when it ends, a `Weakened` buff with `dmgTakenPct` for `duration` ms follows. */
  afterWeakness?: { dmgTakenPct: number; duration: number };
  /** Damage taken is raised by this percent (the weakness after Divine Shield). */
  dmgTakenPct?: number;
  /** Retribution: a bolt of light strikes whatever hits the hero for `mult` times the damage it dealt. */
  retribution?: { mult: number };
  /** Shade Army: `count` shadows of the hero that each strike whatever the hero hits for `mult` of the blow. */
  shades?: { count: number; mult: number };
}

export type SkillEffect =
  | {
      kind: 'melee';
      damageMult: number;
      maxRange: number;
      /** Degrees of arc hit around the facing direction. Omit for a single target. */
      arc?: number;
      /**
       * How the hit is drawn. Single target: `overhead` drops a big weapon onto
       * the target from above, `holy_shield` raises a holy shield over it,
       * `bloody` tears a gash across it with blood flying. Arc: `cleave` is a
       * wide red sweep instead of the thin swing line, `void` a purple one
       * with a splash of void all round the hero.
       */
      visual?: 'overhead' | 'holy_shield' | 'bloody' | 'cleave' | 'void' | 'avalanche' | 'blind';
      /** Arc only: everything hit is shoved this many px away from the hero (Avalanche). */
      knockback?: number;
      /** Ms during which everything hit swings and shoots wide (Blind). */
      blind?: number;
      /** Multiplier against the undead (Blind). */
      vsUndeadMult?: number;
      radius?: number;
      stun?: number;
      slow?: number;
      healOnCastPct?: number;
      healOnKillPct?: number;
      /** Dash to the target before striking (Shield Bash Ult). */
      charge?: boolean;
      /** Blink behind the target before striking (Cutthroat). */
      teleportBehind?: boolean;
      /** Jump onto the target and hit everything in `landingRadius` (Impale). */
      leap?: { duration: number; landingRadius: number };
      moveBonus?: { pct: number; duration: number };
      bleed?: { pctOfMaxHp: number; duration: number; interval: number };
      noInitialDamage?: boolean;
      trail?: { length: number; duration: number; tickPct: number };
      scalesWithInt?: boolean;
    }
  | {
      kind: 'projectile';
      damageMult: number;
      projSpeed: number;
      projRadius?: number;
      maxRange: number;
      count?: number;
      spreadAngle?: number;
      homing?: boolean;
      splashRadius?: number;
      /** Number of enemies passed through. Infinity for all. */
      pierce?: number;
      ricochets?: number;
      returns?: boolean;
      throughWalls?: boolean;
      onHitZone?: { radius: number; duration: number; tickMult: number; tickInterval: number };
      burstOnHit?: { count: number; damageMult: number; projSpeed: number; maxRange: number };
      bleed?: { ticks: number; interval: number; tickMult: number };
      stun?: number;
      /** No cooldown; limited by cast rate or attack speed instead. */
      rateLimited?: 'cast' | 'attack';
      /** Multiplier against stunned or frozen targets (Ice Lance). */
      bonusVsDisabled?: number;
      /** Damage kept on each ricochet hop (Chain Lightning loses some every jump). */
      ricochetDecay?: number;
      /** Ms between hits on the same enemy while the projectile stays on it (Ball Lightning). */
      rehit?: number;
      /** The shot is loosed by something summoned behind the hero: it rises for `delay` ms, `behind` px back along the line of fire, then fires from there (Arrow of Beyond's daemon). */
      summon?: { delay: number; behind: number };
      /** Which projectile visual to use. */
      shape: 'bolt' | 'ball' | 'dagger' | 'arrow' | 'greatarrow' | 'lance' | 'spark' | 'orb' | 'hammer' | 'star' | 'boulder';
    }
  | {
      kind: 'aoe';
      damageMult: number;
      radius: number;
      at: 'self' | 'target';
      maxRange?: number;
      delay?: number;
      /** Self-centred only: jump in place for this many ms and land the blow on touchdown (Ground Stomp). */
      jump?: number;
      stun?: number;
      slow?: number;
      freeze?: number;
      poison?: { ticks: number; tickMult: number; interval: number };
      /** Multiplier if the target is stunned or frozen (Lightning Strike). */
      bonusVsDisabled?: number;
      /** Hits every enemy on screen regardless of radius (Arrow Storm). */
      hitsAllVisible?: boolean;
      /** Everything frozen by this takes this share of its max life when it thaws (Winter's Heart). */
      thawPct?: number;
      /** Everything hit is shoved this many px away from the centre (Thunderclap). */
      knockback?: number;
      /** Exsanguinate: every bleeding monster in reach takes the rest of its bleed at once, and the hero heals `healPct` of the total. */
      burstBleed?: { healPct: number };
      visual: 'stomp' | 'nova_cold' | 'nova_poison' | 'boulder' | 'lightning' | 'winter' | 'thunderclap' | 'exsanguinate';
    }
  | { kind: 'buff'; duration: number; mods: BuffMods }
  | {
      kind: 'zone';
      zone: 'trap' | 'fire_prison' | 'spear_wall' | 'blizzard' | 'sanctuary' | 'wind' | 'storm' | 'arrow_storm' | 'frostbite' | 'quicksand' | 'rockfall' | 'earthquake' | 'void_rift';
      duration: number;
      radius: number;
      damageMult?: number;
      maxRange?: number;
      tickInterval?: number;
      slow?: number;
      slowPct?: number;
      /** Trap: area damaged when triggered. Rockfall: the crater of each rock. */
      aoeRadius?: number;
      /** Earthquake: damage multiplier for monsters standing against a wall. */
      wallMult?: number;
      /** Void Rift: tiles per second everything in the zone is dragged toward its centre; the damage lands within `aoeRadius` of it. */
      pull?: number;
      /** Frostbite: life lost per second inside, percent of max, and ms of cold before the freeze. */
      pctPerSec?: number;
      freezeAfter?: number;
      holds?: boolean;
      /** Spear wall. */
      count?: number;
      spacing?: number;
      /** Blizzard flakes per wave. */
      perWave?: number;
      /** Storm targets per tick. */
      targets?: number;
      mods?: BuffMods;
      playerMoveSpdPct?: number;
    }
  | {
      kind: 'mobility';
      mode: 'leap' | 'teleport' | 'charge';
      maxRange: number;
      /** Teleport: a patch of ice left where the hero stood that freezes what steps on it (Frost Step). */
      leaveFrost?: { radius: number; duration: number; freeze: number };
      /** Teleport: everything within this many px of where the hero lands is struck for `damageMult` (Shadow Step). */
      arrivalRadius?: number;
      duration?: number;
      invulnerable?: boolean;
      throughWalls?: boolean;
      damageMult?: number;
      chargeRadius?: number;
      chargeSpeed?: number;
    }
  | { kind: 'beam'; drainMult: number; interval: number; duration: number; maxRange: number; extendedRange: number; farEffectiveness: number }
  | { kind: 'curse'; maxRange: number; radius: number; duration: number; pctPerSec: number; executeBelowPct: number }
  /** Judgement: one enemy takes `dmgTakenPct` percent more from every hit for `duration` ms. */
  | { kind: 'mark'; maxRange: number; duration: number; dmgTakenPct: number }
  /** Blood Puppet: one enemy turns on its own kind for `duration` ms, then dies. */
  | { kind: 'puppet'; maxRange: number; duration: number }
  /**
   * A wave along the ground from the hero's feet: `length` px long, `width` px
   * wide, its front travelling at `speed` px per second, hitting each monster
   * as it reaches it. Stops at walls. `spikes` is a row of stone spikes
   * (Earthen Spikes), `slam` a heave of earth that throws monsters up (Seismic Slam).
   */
  | { kind: 'line'; damageMult: number; length: number; width: number; speed: number; stun?: number; knockback?: number; visual: 'spikes' | 'slam' };

export interface SkillDef {
  id: string;
  name: string;
  classId: ClassId;
  tier: SkillTier;
  pledgeId?: string;
  /** Not offered on the Skills tab unless the dev menu shows special skills. */
  hidden?: boolean;
  description: string;
  manaCost: number;
  /** Milliseconds. 0 means rate-limited by cast rate or attack speed. */
  cooldown: number;
  rank5Cooldown?: number;
  /** Damage bonus per rank. Defaults to 0.2. */
  rankBonus?: number;
  reqLevel?: number;
  upgradesTo?: string;
  requires?: WeaponReq;
  element: Element;
  effect: SkillEffect;
}

const K = 'knight';
const S = 'sorcerer';
const R = 'rogue';

export const SKILLS: Record<string, SkillDef> = {
  // ---------------- KNIGHT ----------------
  heavy_strike: { id: 'heavy_strike', name: 'Heavy Strike', classId: K, tier: 'base', description: 'A crushing blow against one enemy.', manaCost: 10, cooldown: 1500, rank5Cooldown: 1000, rankBonus: 0.3, element: 'physical', upgradesTo: 'heavy_strike_ult', effect: { kind: 'melee', damageMult: 1.5, maxRange: 80, visual: 'overhead' } },
  heavy_strike_ult: { id: 'heavy_strike_ult', name: 'Heavy Strike', classId: K, tier: 'ultimate', description: 'Devastating blow that heals 5% of your life on cast and 10% on kill.', manaCost: 25, cooldown: 8000, rank5Cooldown: 5000, rankBonus: 0.3, reqLevel: 10, element: 'physical', effect: { kind: 'melee', damageMult: 2.2, maxRange: 80, healOnCastPct: 5, healOnKillPct: 10, visual: 'overhead' } },
  cleave: { id: 'cleave', name: 'Cleave', classId: K, tier: 'base', description: 'Sweep your weapon in a half circle.', manaCost: 20, cooldown: 3500, reqLevel: 5, element: 'physical', upgradesTo: 'cleave_ult', effect: { kind: 'melee', damageMult: 1.8, maxRange: 100, arc: 180, visual: 'cleave' } },
  cleave_ult: { id: 'cleave_ult', name: 'Cleave', classId: K, tier: 'ultimate', description: 'A full spin that hits everything around you.', manaCost: 35, cooldown: 10000, rank5Cooldown: 6500, rankBonus: 0.3, reqLevel: 10, element: 'physical', effect: { kind: 'melee', damageMult: 2.0, maxRange: 120, arc: 360, visual: 'cleave' } },
  shield_bash: { id: 'shield_bash', name: 'Shield Bash', classId: K, tier: 'base', description: 'Slam an enemy with your shield, stunning it for a second.', manaCost: 15, cooldown: 5000, reqLevel: 10, element: 'physical', upgradesTo: 'shield_bash_ult', effect: { kind: 'melee', damageMult: 0.5, maxRange: 90, stun: 1000, visual: 'holy_shield' } },
  shield_bash_ult: { id: 'shield_bash_ult', name: 'Shield Bash', classId: K, tier: 'ultimate', description: 'Charge at a distant enemy and stun it for two seconds.', manaCost: 30, cooldown: 12000, rank5Cooldown: 8000, reqLevel: 15, element: 'physical', effect: { kind: 'melee', damageMult: 1.5, maxRange: 150, stun: 2000, charge: true, visual: 'holy_shield' } },
  ground_stomp: { id: 'ground_stomp', name: 'Ground Stomp', classId: K, tier: 'base', description: 'Leap and stomp the ground, damaging and slowing nearby enemies.', manaCost: 30, cooldown: 7000, reqLevel: 15, element: 'physical', upgradesTo: 'ground_stomp_ult', effect: { kind: 'aoe', damageMult: 1.5, radius: 120, at: 'self', slow: 2000, visual: 'stomp', jump: 350 } },
  ground_stomp_ult: { id: 'ground_stomp_ult', name: 'Ground Stomp', classId: K, tier: 'ultimate', description: 'A quake that stuns everything in a wide circle.', manaCost: 50, cooldown: 18000, rank5Cooldown: 12000, rankBonus: 0.35, reqLevel: 20, element: 'physical', effect: { kind: 'aoe', damageMult: 2.0, radius: 300, at: 'self', stun: 2000, visual: 'stomp', jump: 350 } },
  prayer: { id: 'prayer', name: 'Prayer', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Regenerate 5% of your life every second for ten seconds.', manaCost: 40, cooldown: 25000, rank5Cooldown: 16000, reqLevel: 10, element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { regenPct: 5 } } },
  holy_smite: { id: 'holy_smite', name: 'Holy Smite (spin)', classId: K, tier: 'pledge', pledgeId: 'paladin', hidden: true, description: 'A holy star circles you for three seconds, striking everything it passes. Cast again while it turns for a second and a third star further out.', manaCost: 35, cooldown: 12000, rank5Cooldown: 7000, rankBonus: 0.35, reqLevel: 5, element: 'physical', effect: { kind: 'buff', duration: 3000, mods: { orbitDaggers: { count: 1, radius: 60, damageMult: 2.5, hitCooldown: 500, shape: 'star', spin: 7, hitRadius: 16, stacks: 3, ringGap: 40 } } } },
  hammer_of_gods: { id: 'hammer_of_gods', name: 'Holy Smite', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Hurl a holy star that passes through everything and returns to you.', manaCost: 35, cooldown: 12000, rank5Cooldown: 7000, rankBonus: 0.35, reqLevel: 5, element: 'physical', effect: { kind: 'projectile', damageMult: 2.5, projSpeed: 840, maxRange: 350, pierce: Infinity, returns: true, throughWalls: true, shape: 'star', projRadius: 16 } },
  sanctuary: { id: 'sanctuary', name: 'Sanctuary', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Consecrate the ground: +200 armor and +50% resistances while you stand in it.', manaCost: 50, cooldown: 40000, rank5Cooldown: 28000, reqLevel: 15, element: 'physical', effect: { kind: 'zone', zone: 'sanctuary', duration: 20000, radius: 300, mods: { armor: 200, allResists: 50 } } },
  rock_solid: { id: 'rock_solid', name: 'Rock Solid', classId: K, tier: 'pledge', pledgeId: 'titan', description: '+200 armor and a shield equal to your max life for ten seconds. It soaks up any kind of damage, and when it breaks a boulder falls on you, crushing everything around.', manaCost: 55, cooldown: 35000, rank5Cooldown: 22000, reqLevel: 15, element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { armor: 200, shieldPct: 100, onShieldBreak: 'boulder_toss' } } },
  boulder_toss: { id: 'boulder_toss', name: 'Boulder Toss', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Throw a boulder that lands after a short delay and crushes a wide area.', manaCost: 45, cooldown: 14000, rank5Cooldown: 9000, rankBonus: 0.35, reqLevel: 10, element: 'physical', effect: { kind: 'aoe', damageMult: 3.5, radius: 200, at: 'target', maxRange: 320, delay: 900, visual: 'boulder' } },
  leap: { id: 'leap', name: 'Leap', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Jump over walls and enemies. Invulnerable while airborne.', manaCost: 25, cooldown: 8000, rank5Cooldown: 5000, reqLevel: 5, element: 'physical', effect: { kind: 'mobility', mode: 'leap', maxRange: 300, duration: 520, invulnerable: true, throughWalls: true } },
  earthen_spikes: { id: 'earthen_spikes', name: 'Earthen Spikes', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Stone spikes burst from the ground in a line ahead of you, impaling everything along it and holding it for a moment.', manaCost: 25, cooldown: 6000, rank5Cooldown: 4000, rankBonus: 0.25, reqLevel: 5, element: 'physical', effect: { kind: 'line', damageMult: 1.6, length: 200, width: 44, speed: 700, stun: 800, visual: 'spikes' } },
  quicksand: { id: 'quicksand', name: 'Quicksand', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Soften the ground in a wide circle for eight seconds. Everything inside slows to a crawl and sinks, taking more every moment it stays.', manaCost: 35, cooldown: 18000, rank5Cooldown: 12000, rankBonus: 0.25, reqLevel: 10, element: 'physical', effect: { kind: 'zone', zone: 'quicksand', duration: 8000, radius: 130, maxRange: 300, damageMult: 0.3, tickInterval: 500 } },
  seismic_slam: { id: 'seismic_slam', name: 'Seismic Slam', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Smash the ground with both fists. A heave of earth rolls out in a line, throwing everything in its path into the air and stunning it on landing.', manaCost: 35, cooldown: 10000, rank5Cooldown: 6500, rankBonus: 0.3, reqLevel: 15, element: 'physical', effect: { kind: 'line', damageMult: 2.2, length: 260, width: 64, speed: 600, stun: 1500, knockback: 30, visual: 'slam' } },
  rockfall: { id: 'rockfall', name: 'Rockfall', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'Stones rain down over a wide area for five seconds, each one cratering the ground where it lands.', manaCost: 45, cooldown: 20000, rank5Cooldown: 13000, rankBonus: 0.3, reqLevel: 20, element: 'physical', effect: { kind: 'zone', zone: 'rockfall', duration: 5000, radius: 150, maxRange: 320, damageMult: 1.2, tickInterval: 400, aoeRadius: 50 } },
  earthquake: { id: 'earthquake', name: 'Earthquake', classId: K, tier: 'pledge', pledgeId: 'titan', description: 'The whole ground shakes for four seconds. Every monster in sight stumbles and is hurt each second, none can swing or shoot, and anything against a wall is crushed for half again as much.', manaCost: 60, cooldown: 45000, rank5Cooldown: 30000, rankBonus: 0.3, reqLevel: 25, element: 'physical', effect: { kind: 'zone', zone: 'earthquake', duration: 4000, radius: 600, damageMult: 0.8, tickInterval: 1000, wallMult: 1.5 } },
  rite_of_blood: { id: 'rite_of_blood', name: 'Rite of Blood', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Double your damage, attack speed and movement for ten seconds. Every hit costs 2% of your life.', manaCost: 40, cooldown: 45000, rank5Cooldown: 32000, reqLevel: 15, element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { atkSpdPct: 100, dmgPct: 100, moveSpdPct: 100, selfCostPct: 2 } } },
  summon_angel: { id: 'summon_angel', name: 'Summon Angel', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Call down a fallen angel to fight at your side for thirty seconds. It cuts down whatever you attack, and anything that comes near.', manaCost: 60, cooldown: 40000, rank5Cooldown: 25000, rankBonus: 0.25, reqLevel: 20, element: 'physical', effect: { kind: 'buff', duration: 30000, mods: { companion: { kind: 'angel', damageMult: 1.6, interval: 1000, reach: 40 } } } },
  consecrated_blade: { id: 'consecrated_blade', name: 'Consecrated Blade', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Your blade burns with holy fire for ten seconds: every hit deals 30% more, and 60% more against the undead.', manaCost: 30, cooldown: 20000, rank5Cooldown: 13000, reqLevel: 5, element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { holyBlade: { pct: 30, vsUndead: 2 } } } },
  judgement: { id: 'judgement', name: 'Judgement', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Mark one enemy from afar. For six seconds a beam of light hangs over it and it takes 50% more damage from everything.', manaCost: 30, cooldown: 15000, rank5Cooldown: 10000, reqLevel: 10, element: 'physical', effect: { kind: 'mark', maxRange: 300, duration: 6000, dmgTakenPct: 50 } },
  blind: { id: 'blind', name: 'Blind', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'A flash of light in a cone before you. Everything in it is thrown back and blinded for three seconds, so its blows and shots go wide. The undead take triple damage.', manaCost: 25, cooldown: 10000, rank5Cooldown: 6500, rankBonus: 0.25, reqLevel: 15, element: 'physical', effect: { kind: 'melee', damageMult: 1.2, maxRange: 110, arc: 100, knockback: 60, blind: 3000, vsUndeadMult: 3, visual: 'blind' } },
  divine_shield: { id: 'divine_shield', name: 'Divine Shield', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'Nothing can hurt you for three seconds. When the light fades you are weakened and take 20% more damage for three seconds.', manaCost: 50, cooldown: 45000, rank5Cooldown: 30000, reqLevel: 20, element: 'physical', effect: { kind: 'buff', duration: 3000, mods: { invulnerable: true, afterWeakness: { dmgTakenPct: 20, duration: 3000 } } } },
  retribution: { id: 'retribution', name: 'Retribution', classId: K, tier: 'pledge', pledgeId: 'paladin', description: 'For eight seconds, whatever strikes you is struck back by a bolt of light for three times the damage it dealt.', manaCost: 40, cooldown: 30000, rank5Cooldown: 20000, reqLevel: 25, element: 'physical', effect: { kind: 'buff', duration: 8000, mods: { retribution: { mult: 3 } } } },
  hemorrhage: { id: 'hemorrhage', name: 'Hemorrhage', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Open a wound that bleeds away a quarter of the target\'s life over twenty seconds.', manaCost: 25, cooldown: 18000, rank5Cooldown: 12000, rankBonus: 0.2, reqLevel: 10, element: 'physical', effect: { kind: 'melee', damageMult: 0, maxRange: 80, noInitialDamage: true, bleed: { pctOfMaxHp: 25, duration: 20000, interval: 500 }, visual: 'bloody' } },
  shadow_step: { id: 'shadow_step', name: 'Shadow Step', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Vanish into shadow and step out again where you aim, tearing into everything around you as you arrive.', manaCost: 25, cooldown: 8000, rank5Cooldown: 5000, rankBonus: 0.25, reqLevel: 5, element: 'physical', effect: { kind: 'mobility', mode: 'teleport', maxRange: 260, damageMult: 1.5, arrivalRadius: 80 } },
  shade_army: { id: 'shade_army', name: 'Shade Army', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Three shades step out of your shadow for fifteen seconds. They mirror every blow you land, each striking the same monster for 35% of it.', manaCost: 40, cooldown: 30000, rank5Cooldown: 20000, rankBonus: 0.25, reqLevel: 10, element: 'physical', effect: { kind: 'buff', duration: 15000, mods: { shades: { count: 3, mult: 0.35 } } } },
  exsanguinate: { id: 'exsanguinate', name: 'Exsanguinate', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Tear the blood out of every bleeding monster near you. Each takes the rest of its bleed at once, and a quarter of it flows back into you.', manaCost: 30, cooldown: 14000, rank5Cooldown: 9000, reqLevel: 15, element: 'physical', effect: { kind: 'aoe', damageMult: 0, radius: 220, at: 'self', burstBleed: { healPct: 25 }, visual: 'exsanguinate' } },
  blood_puppet: { id: 'blood_puppet', name: 'Blood Puppet', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Seize a monster\'s blood. For six seconds it fights at your side against its own kind, then its heart gives out.', manaCost: 45, cooldown: 35000, rank5Cooldown: 24000, reqLevel: 20, element: 'physical', effect: { kind: 'puppet', maxRange: 300, duration: 6000 } },
  void_rift: { id: 'void_rift', name: 'Void Rift', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'Tear open the world where you aim. For five seconds every monster near the rift is dragged into it, and whatever it holds is torn apart.', manaCost: 50, cooldown: 25000, rank5Cooldown: 16000, rankBonus: 0.3, reqLevel: 25, element: 'physical', effect: { kind: 'zone', zone: 'void_rift', duration: 5000, radius: 150, maxRange: 300, damageMult: 0.7, tickInterval: 500, aoeRadius: 60, pull: 2.6 } },
  void_slash: { id: 'void_slash', name: 'Void Slash', classId: K, tier: 'pledge', pledgeId: 'nightlord', description: 'A slash that leaves a burning void trail. Scales with strength and intelligence.', manaCost: 30, cooldown: 10000, rank5Cooldown: 6500, rankBonus: 0.25, reqLevel: 5, element: 'physical', effect: { kind: 'melee', damageMult: 1.8, maxRange: 80, arc: 120, scalesWithInt: true, trail: { length: 300, duration: 5000, tickPct: 10 }, visual: 'void' } },

  // ---------------- SORCERER ----------------
  fire_bolt: { id: 'fire_bolt', name: 'Fire Bolt', classId: S, tier: 'base', description: 'A quick bolt of flame. Limited only by your cast rate.', manaCost: 8, cooldown: 0, element: 'fire', upgradesTo: 'fire_bolt_ult', effect: { kind: 'projectile', damageMult: 1.2, projSpeed: 420, projRadius: 7, maxRange: 380, rateLimited: 'cast', shape: 'bolt' } },
  fire_bolt_ult: { id: 'fire_bolt_ult', name: 'Fire Bolt', classId: S, tier: 'ultimate', description: 'Five bolts in a fan.', manaCost: 8, cooldown: 0, rankBonus: 0.2, element: 'fire', effect: { kind: 'projectile', damageMult: 1.2, projSpeed: 560, projRadius: 7, maxRange: 380, count: 5, spreadAngle: 30, rateLimited: 'cast', shape: 'bolt' } },
  fire_ball: { id: 'fire_ball', name: 'Fire Ball', classId: S, tier: 'base', description: 'A slow ball of fire that explodes on impact.', manaCost: 22, cooldown: 2500, reqLevel: 5, element: 'fire', upgradesTo: 'fire_ball_ult', effect: { kind: 'projectile', damageMult: 1.8, projSpeed: 300, projRadius: 14, maxRange: 400, splashRadius: 80, shape: 'ball' } },
  fire_ball_ult: { id: 'fire_ball_ult', name: 'Fire Ball', classId: S, tier: 'ultimate', description: 'A homing fireball with a bigger blast.', manaCost: 22, cooldown: 2500, rankBonus: 0.2, element: 'fire', effect: { kind: 'projectile', damageMult: 2.16, projSpeed: 600, projRadius: 14, maxRange: 480, splashRadius: 96, homing: true, shape: 'ball' } },
  fire_prison: { id: 'fire_prison', name: 'Fire Prison', classId: S, tier: 'base', description: 'A ring of fire that burns anything inside for three seconds.', manaCost: 35, cooldown: 8000, reqLevel: 10, element: 'fire', upgradesTo: 'fire_prison_ult', effect: { kind: 'zone', zone: 'fire_prison', duration: 3000, radius: 60, maxRange: 220, damageMult: 0.8, tickInterval: 500 } },
  fire_prison_ult: { id: 'fire_prison_ult', name: 'Fire Prison', classId: S, tier: 'ultimate', description: 'A larger, longer prison. Enemies cannot escape.', manaCost: 50, cooldown: 14000, rankBonus: 0.2, element: 'fire', effect: { kind: 'zone', zone: 'fire_prison', duration: 6000, radius: 100, maxRange: 220, damageMult: 0.8, tickInterval: 500, holds: true } },
  fire_armor: { id: 'fire_armor', name: 'Fire Armor', classId: S, tier: 'base', description: 'Wreathe yourself in flame for two minutes. Attackers take fire damage.', manaCost: 40, cooldown: 120000, reqLevel: 15, element: 'fire', effect: { kind: 'buff', duration: 120000, mods: { retaliationMult: 0.35 } } },
  teleport: { id: 'teleport', name: 'Teleport', classId: S, tier: 'base', description: 'Blink to a point, passing through walls.', manaCost: 25, cooldown: 5000, rank5Cooldown: 2500, reqLevel: 20, element: 'fire', effect: { kind: 'mobility', mode: 'teleport', maxRange: 400, throughWalls: true } },
  frost_nova: { id: 'frost_nova', name: 'Frost Nova', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'A ring of frost that freezes everything nearby.', manaCost: 30, cooldown: 10000, rank5Cooldown: 6000, rankBonus: 0.25, reqLevel: 5, element: 'cold', effect: { kind: 'aoe', damageMult: 1.0, radius: 200, at: 'self', freeze: 2000, slow: 5000, visual: 'nova_cold' } },
  frozen_armor: { id: 'frozen_armor', name: 'Frozen Armor', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'An ice shield equal to your max life. Attackers are frozen for two seconds.', manaCost: 50, cooldown: 30000, rank5Cooldown: 20000, reqLevel: 10, element: 'cold', effect: { kind: 'buff', duration: 10000, mods: { armor: 50, shieldPct: 100, freezeAttackersMs: 2000 } } },
  ice_lance: { id: 'ice_lance', name: 'Ice Lance', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'A spear of ice that passes through every enemy in a line. Frozen or stunned enemies take double damage.', manaCost: 18, cooldown: 2000, rank5Cooldown: 1200, rankBonus: 0.25, reqLevel: 5, element: 'cold', effect: { kind: 'projectile', damageMult: 1.6, projSpeed: 900, projRadius: 10, maxRange: 420, pierce: Infinity, bonusVsDisabled: 2, shape: 'lance' } },
  frostbite: { id: 'frostbite', name: 'Frostbite', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'Cold settles on the ground for eight seconds. Enemies in it lose 2% of their life a second, slow, and freeze once the cold has had three seconds to bite.', manaCost: 35, cooldown: 12000, rank5Cooldown: 8000, reqLevel: 10, element: 'cold', effect: { kind: 'zone', zone: 'frostbite', duration: 8000, radius: 100, maxRange: 300, tickInterval: 500, slow: 1000, pctPerSec: 2, freezeAfter: 3000 } },
  frost_step: { id: 'frost_step', name: 'Frost Step', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'Blink a short way. The ground you left freezes over for five seconds and freezes whatever steps on it.', manaCost: 25, cooldown: 8000, rank5Cooldown: 5000, reqLevel: 10, element: 'cold', effect: { kind: 'mobility', mode: 'teleport', maxRange: 250, leaveFrost: { radius: 60, duration: 5000, freeze: 1500 } } },
  avalanche: { id: 'avalanche', name: 'Avalanche', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'A wall of snow rolls out ahead of you, throwing enemies back and slowing them.', manaCost: 40, cooldown: 9000, rank5Cooldown: 6000, rankBonus: 0.25, reqLevel: 15, element: 'cold', effect: { kind: 'melee', damageMult: 1.5, maxRange: 250, arc: 70, slow: 3000, knockback: 120, visual: 'avalanche' } },
  winters_heart: { id: 'winters_heart', name: "Winter's Heart", classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'Everything you can see freezes solid for three seconds. When the ice breaks, each of them loses a fifth of its life.', manaCost: 100, cooldown: 60000, rank5Cooldown: 40000, rankBonus: 0.25, reqLevel: 25, element: 'cold', effect: { kind: 'aoe', damageMult: 0.5, radius: 600, at: 'self', hitsAllVisible: true, freeze: 3000, thawPct: 20, visual: 'winter' } },
  blizzard: { id: 'blizzard', name: 'Blizzard', classId: S, tier: 'pledge', pledgeId: 'wintercaller', description: 'Ten seconds of falling ice across the whole battlefield. Slows everything by half.', manaCost: 90, cooldown: 25000, rank5Cooldown: 15000, rankBonus: 0.25, reqLevel: 20, element: 'cold', effect: { kind: 'zone', zone: 'blizzard', duration: 10000, radius: 600, damageMult: 0.8, tickInterval: 500, perWave: 15, slowPct: 50 } },
  call_of_the_wind: { id: 'call_of_the_wind', name: 'Call of the Wind', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'A gale that slows enemies by half and doubles your speed for ten seconds.', manaCost: 60, cooldown: 35000, rank5Cooldown: 22000, reqLevel: 10, element: 'lightning', effect: { kind: 'zone', zone: 'wind', duration: 10000, radius: 300, slowPct: 50, playerMoveSpdPct: 100 } },
  storm: { id: 'storm', name: 'Storm', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'For ten seconds, lightning strikes the five nearest enemies every second.', manaCost: 80, cooldown: 30000, rank5Cooldown: 20000, rankBonus: 0.25, reqLevel: 15, element: 'lightning', effect: { kind: 'zone', zone: 'storm', duration: 10000, radius: 300, damageMult: 1.5, tickInterval: 1000, targets: 5 } },
  chain_lightning: { id: 'chain_lightning', name: 'Chain Lightning', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'A bolt that leaps from its first victim to the next nearest, up to five jumps, losing a little bite with each.', manaCost: 22, cooldown: 2500, rank5Cooldown: 1500, rankBonus: 0.25, reqLevel: 5, element: 'lightning', effect: { kind: 'projectile', damageMult: 1.3, projSpeed: 1400, projRadius: 8, maxRange: 300, ricochets: 5, ricochetDecay: 0.85, shape: 'spark' } },
  thunderclap: { id: 'thunderclap', name: 'Thunderclap', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'A crack of thunder around you that stuns everything close for a second and knocks it back a step.', manaCost: 30, cooldown: 7000, rank5Cooldown: 4500, rankBonus: 0.25, reqLevel: 10, element: 'lightning', effect: { kind: 'aoe', damageMult: 1.2, radius: 110, at: 'self', stun: 1000, knockback: 60, visual: 'thunderclap' } },
  wind_barrier: { id: 'wind_barrier', name: 'Wind Barrier', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'Six seconds of wind round you that tears apart any bolt or arrow before it lands.', manaCost: 25, cooldown: 15000, rank5Cooldown: 10000, reqLevel: 10, element: 'lightning', effect: { kind: 'buff', duration: 6000, mods: { deflect: true } } },
  overload: { id: 'overload', name: 'Overload', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'For eight seconds, every lightning hit you land has a 40% chance to arc to a nearby enemy for half the damage.', manaCost: 35, cooldown: 20000, rank5Cooldown: 14000, reqLevel: 15, element: 'lightning', effect: { kind: 'buff', duration: 8000, mods: { overload: { chance: 40, mult: 0.5, range: 120 } } } },
  ball_lightning: { id: 'ball_lightning', name: 'Ball Lightning', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'A slow sphere of lightning drifts the way you aim for six seconds, shocking everything it passes over again and again.', manaCost: 55, cooldown: 14000, rank5Cooldown: 9000, rankBonus: 0.25, reqLevel: 20, element: 'lightning', effect: { kind: 'projectile', damageMult: 0.6, projSpeed: 55, projRadius: 40, maxRange: 330, pierce: Infinity, rehit: 500, shape: 'orb' } },
  lightning_strike: { id: 'lightning_strike', name: 'Lightning Strike', classId: S, tier: 'pledge', pledgeId: 'stormsinger', description: 'Call a bolt down on one enemy. Half again as strong against stunned or frozen targets.', manaCost: 28, cooldown: 6000, rank5Cooldown: 3500, rankBonus: 0.3, reqLevel: 10, element: 'lightning', effect: { kind: 'aoe', damageMult: 2.2, radius: 40, at: 'target', maxRange: 300, bonusVsDisabled: 1.5, visual: 'lightning' } },
  death: { id: 'death', name: 'Death', classId: S, tier: 'pledge', pledgeId: 'necromancer', description: 'Curse enemies to lose 1% of their life per second. Below 5% they die instantly.', manaCost: 60, cooldown: 20000, rank5Cooldown: 12000, reqLevel: 15, element: 'poison', effect: { kind: 'curse', maxRange: 250, radius: 50, duration: 10000, pctPerSec: 1, executeBelowPct: 5 } },
  poison_nova: { id: 'poison_nova', name: 'Poison Nova', classId: S, tier: 'pledge', pledgeId: 'necromancer', description: 'A burst of plague that poisons everything nearby.', manaCost: 45, cooldown: 14000, rank5Cooldown: 8000, rankBonus: 0.25, reqLevel: 5, element: 'poison', effect: { kind: 'aoe', damageMult: 0.5, radius: 250, at: 'self', poison: { ticks: 15, tickMult: 0.55, interval: 1000 }, visual: 'nova_poison' } },
  skeleton_army: { id: 'skeleton_army', name: 'Summon Skeleton Army', classId: S, tier: 'pledge', pledgeId: 'necromancer', description: 'Raise five skeleton archers from the ground. For thirty seconds they follow you and shoot whatever you attack.', manaCost: 70, cooldown: 40000, rank5Cooldown: 25000, rankBonus: 0.25, reqLevel: 20, element: 'physical', effect: { kind: 'buff', duration: 30000, mods: { skeletons: { count: 5, damageMult: 0.6, interval: 1200, range: 260 } } } },
  meat_shield: { id: 'meat_shield', name: 'Meat Shield', classId: S, tier: 'pledge', pledgeId: 'necromancer', description: 'Raise a colossal titan of stitched flesh for twenty-five seconds. Monsters that come near you turn on it instead, and it crushes everything in reach with slow, terrible blows.', manaCost: 90, cooldown: 45000, rank5Cooldown: 30000, rankBonus: 0.25, reqLevel: 25, element: 'physical', effect: { kind: 'buff', duration: 25000, mods: { titan: { hpMult: 3, damageMult: 4, interval: 3000, reach: 60, tauntRadius: 200 } } } },
  life_touch: { id: 'life_touch', name: 'Life Touch', classId: S, tier: 'pledge', pledgeId: 'necromancer', description: 'A beam that drains life from an enemy into you for five seconds.', manaCost: 55, cooldown: 25000, rank5Cooldown: 15000, rankBonus: 0.2, reqLevel: 10, element: 'poison', effect: { kind: 'beam', drainMult: 1.2, interval: 500, duration: 5000, maxRange: 200, extendedRange: 350, farEffectiveness: 0.5 } },

  // ---------------- ROGUE ----------------
  dagger_throw: { id: 'dagger_throw', name: 'Dagger Throw', classId: R, tier: 'base', description: 'Throw your dagger. Requires a dagger.', manaCost: 10, cooldown: 1000, requires: 'dagger', element: 'physical', upgradesTo: 'dagger_throw_ult', effect: { kind: 'projectile', damageMult: 2.0, projSpeed: 520, maxRange: 340, shape: 'dagger' } },
  dagger_throw_ult: { id: 'dagger_throw_ult', name: 'Dagger Throw', classId: R, tier: 'ultimate', description: 'On hit, nine daggers burst outward.', manaCost: 10, cooldown: 4000, rank5Cooldown: 2000, rankBonus: 0.3, reqLevel: 10, requires: 'dagger', element: 'physical', effect: { kind: 'projectile', damageMult: 2.0, projSpeed: 1040, maxRange: 340, burstOnHit: { count: 9, damageMult: 1.0, projSpeed: 520, maxRange: 200 }, shape: 'dagger' } },
  poison_shot: { id: 'poison_shot', name: 'Poison Shot', classId: R, tier: 'base', description: 'A venomed arrow. Fires as fast as you can draw. Requires a bow.', manaCost: 12, cooldown: 0, reqLevel: 5, requires: 'bow', element: 'poison', upgradesTo: 'poison_shot_ult', effect: { kind: 'projectile', damageMult: 1.4, projSpeed: 480, maxRange: 360, rateLimited: 'attack', shape: 'arrow' } },
  poison_shot_ult: { id: 'poison_shot_ult', name: 'Poison Shot', classId: R, tier: 'ultimate', description: 'Leaves a poison cloud where it lands.', manaCost: 20, cooldown: 6000, rank5Cooldown: 3000, rankBonus: 0.3, reqLevel: 10, requires: 'bow', element: 'poison', effect: { kind: 'projectile', damageMult: 1.4, projSpeed: 480, maxRange: 360, onHitZone: { radius: 70, duration: 3000, tickMult: 0.3, tickInterval: 500 }, shape: 'arrow' } },
  trap: { id: 'trap', name: 'Trap', classId: R, tier: 'base', description: 'Set a spiked trap at your feet that snaps shut on the first enemy to step on it.', manaCost: 25, cooldown: 8000, reqLevel: 10, element: 'physical', upgradesTo: 'trap_ult', effect: { kind: 'zone', zone: 'trap', duration: 120000, radius: 26, damageMult: 2.5, slow: 5000 } },
  trap_ult: { id: 'trap_ult', name: 'Trap', classId: R, tier: 'ultimate', description: 'A bigger trap thrown where you aim that blasts everything nearby.', manaCost: 40, cooldown: 12000, rank5Cooldown: 6000, rankBonus: 0.3, reqLevel: 15, element: 'physical', effect: { kind: 'zone', zone: 'trap', duration: 120000, radius: 52, maxRange: 400, damageMult: 2.5, slow: 5000, aoeRadius: 110 } },
  sneak: { id: 'sneak', name: 'Sneak', classId: R, tier: 'base', description: 'Vanish for five seconds and move 60% faster. Attacking ends it.', manaCost: 30, cooldown: 20000, reqLevel: 15, element: 'physical', upgradesTo: 'sneak_ult', effect: { kind: 'buff', duration: 5000, mods: { invisible: true, moveSpdPct: 60 } } },
  sneak_ult: { id: 'sneak_ult', name: 'Sneak', classId: R, tier: 'ultimate', description: 'Attacking no longer breaks stealth, and it ends with a smoke bomb.', manaCost: 40, cooldown: 30000, rank5Cooldown: 20000, reqLevel: 15, element: 'physical', effect: { kind: 'buff', duration: 5000, mods: { invisible: true, moveSpdPct: 60, attackKeepsInvisible: true, endSmoke: { radius: 150, slowDuration: 3000 } } } },
  gods_hand: { id: 'gods_hand', name: "God's Hand", classId: R, tier: 'pledge', pledgeId: 'silverblade', description: 'Your dagger reaches far and strikes twice as fast for ten seconds.', manaCost: 45, cooldown: 30000, rank5Cooldown: 20000, reqLevel: 20, requires: 'dagger', element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { meleeRange: 300, atkSpdPct: 100 } } },
  cutthroat: { id: 'cutthroat', name: 'Cutthroat', classId: R, tier: 'pledge', pledgeId: 'silverblade', description: 'Blink behind an enemy and open its throat for six times damage.', manaCost: 40, cooldown: 12000, rank5Cooldown: 7000, rankBonus: 0.4, reqLevel: 5, element: 'physical', effect: { kind: 'melee', damageMult: 6.0, maxRange: 200, teleportBehind: true, stun: 1000, moveBonus: { pct: 50, duration: 2000 } } },
  daggers_protection: { id: 'daggers_protection', name: 'Daggers Protection', classId: R, tier: 'pledge', pledgeId: 'silverblade', description: 'Four daggers orbit you for ten seconds, cutting anything that comes close.', manaCost: 35, cooldown: 20000, rank5Cooldown: 14000, rankBonus: 0.2, reqLevel: 20, element: 'physical', effect: { kind: 'buff', duration: 10000, mods: { orbitDaggers: { count: 4, radius: 100, damageMult: 1.2, hitCooldown: 600, hitRadius: 10 } } } },
  summon_eagle: { id: 'summon_eagle', name: 'Summon Eagle', classId: R, tier: 'base', description: 'An eagle flies at your side for forty seconds and dives on whatever you attack.', manaCost: 40, cooldown: 30000, reqLevel: 20, upgradesTo: 'summon_eagle_ult', element: 'physical', effect: { kind: 'buff', duration: 40000, mods: { companion: { kind: 'eagle', damageMult: 1.2, interval: 1500, reach: 30 } } } },
  summon_eagle_ult: { id: 'summon_eagle_ult', name: 'Summon Eagle', classId: R, tier: 'ultimate', description: 'A flight of three eagles at your side for forty seconds, each diving on whatever you attack.', manaCost: 40, cooldown: 30000, rank5Cooldown: 20000, rankBonus: 0.25, reqLevel: 20, element: 'physical', effect: { kind: 'buff', duration: 40000, mods: { companion: { kind: 'eagle', damageMult: 1.2, interval: 1500, reach: 30, count: 3 } } } },
  arrow_of_beyond: { id: 'arrow_of_beyond', name: 'Arrow of Beyond', classId: R, tier: 'pledge', pledgeId: 'quiverbound', description: 'A huge daemon rises from the ground behind you and looses one great arrow at your target: eight times damage, and the wound keeps bleeding.', manaCost: 50, cooldown: 45000, rank5Cooldown: 28000, rankBonus: 0.5, reqLevel: 25, element: 'physical', effect: { kind: 'projectile', damageMult: 8.0, projSpeed: 900, maxRange: 500, projRadius: 14, bleed: { ticks: 10, interval: 500, tickMult: 0.2 }, stun: 1000, shape: 'greatarrow', summon: { delay: 700, behind: 64 } } },
  arrow_storm: { id: 'arrow_storm', name: 'Arrow Storm', classId: R, tier: 'pledge', pledgeId: 'quiverbound', description: 'For ten seconds, arrows fall from the sky on every enemy you can see, a volley every half second.', manaCost: 60, cooldown: 25000, rank5Cooldown: 15000, rankBonus: 0.3, reqLevel: 20, element: 'physical', effect: { kind: 'zone', zone: 'arrow_storm', duration: 10000, radius: 600, damageMult: 0.15, tickInterval: 500 } },
  ricochet: { id: 'ricochet', name: 'Ricochet', classId: R, tier: 'pledge', pledgeId: 'quiverbound', description: 'An arrow that bounces between ten enemies.', manaCost: 30, cooldown: 10000, rank5Cooldown: 6000, rankBonus: 0.25, reqLevel: 10, element: 'physical', effect: { kind: 'projectile', damageMult: 1.2, projSpeed: 480, maxRange: 3000, ricochets: 9, shape: 'arrow' } },
  autoaim: { id: 'autoaim', name: 'Autoaim', classId: R, tier: 'pledge', pledgeId: 'quiverbound', description: 'For five seconds your arrows seek the nearest enemy.', manaCost: 15, cooldown: 20000, rank5Cooldown: 14000, reqLevel: 5, element: 'physical', effect: { kind: 'buff', duration: 5000, mods: { homingArrows: true } } },
  quickshot: { id: 'quickshot', name: 'Quickshot', classId: R, tier: 'pledge', pledgeId: 'quiverbound', description: 'Triple attack speed and double movement for five seconds.', manaCost: 20, cooldown: 15000, rank5Cooldown: 10000, reqLevel: 5, element: 'physical', effect: { kind: 'buff', duration: 5000, mods: { atkSpdPct: 200, moveSpdPct: 100 } } },
  spear_wall: { id: 'spear_wall', name: 'Spear Wall', classId: R, tier: 'pledge', pledgeId: 'impaler', description: 'Plant a line of ten spears that wound and slow anything crossing it.', manaCost: 35, cooldown: 12000, rank5Cooldown: 7000, rankBonus: 0.3, reqLevel: 5, element: 'physical', effect: { kind: 'zone', zone: 'spear_wall', duration: 5000, radius: 14, damageMult: 1.8, count: 10, spacing: 22, slow: 2000 } },
  impale: { id: 'impale', name: 'Impale', classId: R, tier: 'pledge', pledgeId: 'impaler', description: 'Vault onto an enemy and skewer everything where you land.', manaCost: 30, cooldown: 14000, rank5Cooldown: 8000, rankBonus: 0.35, reqLevel: 10, element: 'physical', effect: { kind: 'melee', damageMult: 3.0, maxRange: 200, leap: { duration: 380, landingRadius: 90 } } },
  reckless_charge: { id: 'reckless_charge', name: 'Reckless Charge', classId: R, tier: 'pledge', pledgeId: 'impaler', description: 'Charge forward, hitting everything in your path. Stops at walls.', manaCost: 40, cooldown: 18000, rank5Cooldown: 10000, rankBonus: 0.3, reqLevel: 15, element: 'physical', effect: { kind: 'mobility', mode: 'charge', maxRange: 300, damageMult: 2.2, chargeRadius: 120, chargeSpeed: 700 } },
};

export const SKILL_RULES = {
  maxRank: 5,
  defaultRankBonus: 0.2,
  /** Cast interval for zero-cooldown spells: max(100, 1000 / (1 + fasterCast/100)) ms. */
  minCastInterval: 100,
  /** Dev menu: offer skills marked `hidden` on the Skills tab. */
  showHidden: false,
};

export function skillsFor(classId: ClassId, pledgeId: string | null): SkillDef[] {
  return Object.values(SKILLS).filter((s) => s.classId === classId && (s.tier !== 'pledge' || s.pledgeId === pledgeId) && (!s.hidden || SKILL_RULES.showHidden));
}

export function skill(id: string): SkillDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`Unknown skill ${id}`);
  return s;
}

/**
 * Where an orbiter sits: its ring's radius in px and its angle. Rings trail
 * each other by a third of a turn; orbiters on a ring are spread evenly. The
 * simulation hits from here and the renderer draws from here.
 */
export function orbiterPlace(od: NonNullable<BuffMods['orbitDaggers']>, angle: number, ring: number, index: number): { radius: number; angle: number } {
  return { radius: od.radius + ring * (od.ringGap ?? 0), angle: angle + (index / od.count) * Math.PI * 2 - ring * ((Math.PI * 2) / 3) };
}
