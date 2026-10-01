import { SKILLS, SKILL_RULES, type SkillDef, type SkillEffect } from '../../data/skills';
import { ELEMENT_COLORS } from '../../data/stats';
import { MS, PX } from '../../data/units';
import { PLEDGES } from '../../data/pledges';
import { hitEnemy, skillDamage } from '../combat';
import type { DamagePacket, Enemy } from '../types';
import type { World } from '../world';

export interface Aim {
  x: number;
  z: number;
}

export type CastResult = { ok: true } | { ok: false; reason: string; approach?: boolean };

/** Cooldown for a skill at the player's rank, after cooldown reduction. Seconds. */
export function skillCooldown(w: World, def: SkillDef): number {
  const rank = w.skillRank(def.id);
  const base = rank >= SKILL_RULES.maxRank && def.rank5Cooldown ? def.rank5Cooldown : def.cooldown;
  return base * MS * (1 - w.derived.cdr / 100);
}

export function skillColor(def: SkillDef): number {
  if (def.pledgeId) return PLEDGES[def.pledgeId]?.color ?? ELEMENT_COLORS[def.element];
  return ELEMENT_COLORS[def.element];
}

function requirementOk(w: World, def: SkillDef): string | null {
  if (!def.requires) return null;
  const d = w.derived;
  if (def.requires === 'dagger' && d.weaponType !== 'dagger') return 'Needs a dagger';
  if (def.requires === 'bow' && d.weaponType !== 'bow' && d.weaponType !== 'crossbow') return 'Needs a bow';
  if (def.requires === 'shield' && !d.hasShield) return 'Needs a shield';
  return null;
}

/** Can the skill be cast right now, ignoring targeting? */
export function castReady(w: World, id: string): CastResult {
  const def = SKILLS[id];
  if (!def) return { ok: false, reason: 'Unknown skill' };
  if (w.playerDead) return { ok: false, reason: 'Dead' };
  if (w.skillRank(id) <= 0) return { ok: false, reason: 'Not learned' };
  const req = requirementOk(w, def);
  if (req) return { ok: false, reason: req };
  if (w.pStatus.stun > 0 || w.pStatus.freeze > 0) return { ok: false, reason: 'Stunned' };
  if (w.leap || w.charge) return { ok: false, reason: 'Busy' };
  if ((w.cooldowns[id] ?? 0) > 0) return { ok: false, reason: 'Cooling down' };
  const eff = def.effect;
  if (eff.kind === 'projectile' && eff.rateLimited === 'cast' && w.castTimer > 0) return { ok: false, reason: 'Casting' };
  if (eff.kind === 'projectile' && eff.rateLimited === 'attack' && w.attackTimer > 0) return { ok: false, reason: 'Attacking' };
  if (w.player.mana < def.manaCost) return { ok: false, reason: 'Not enough mana' };
  return { ok: true };
}

function facing(w: World, aim: Aim | null, target: Enemy | null): { x: number; z: number } {
  let dx = Math.sin(w.pyaw);
  let dz = Math.cos(w.pyaw);
  const to = target ? { x: target.x, z: target.z } : aim;
  if (to) {
    dx = to.x - w.px;
    dz = to.z - w.pz;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
    } else {
      dx = Math.sin(w.pyaw);
      dz = Math.cos(w.pyaw);
    }
  }
  return { x: dx, z: dz };
}

/** A point to aim at: explicit aim, current target, nearest enemy in range, else straight ahead. */
function aimPoint(w: World, aim: Aim | null, rangePx: number, fallbackFraction = 0.6): { x: number; z: number; enemy: Enemy | null } {
  const range = rangePx * PX;
  if (aim) return { x: aim.x, z: aim.z, enemy: null };
  const t = w.targetEnemy();
  if (t && w.dist(t.x, t.z) <= range) return { x: t.x, z: t.z, enemy: t };
  const near = w.nearestEnemy(w.px, w.pz, range);
  if (near) return { x: near.x, z: near.z, enemy: near };
  return { x: w.px + Math.sin(w.pyaw) * range * fallbackFraction, z: w.pz + Math.cos(w.pyaw) * range * fallbackFraction, enemy: null };
}

function packet(w: World, def: SkillDef, damageMult: number, extra: Partial<DamagePacket> = {}, scalesWithInt = false): DamagePacket {
  return {
    amount: skillDamage(w, def.id, damageMult, scalesWithInt),
    element: def.element,
    canCrit: true,
    skillId: def.id,
    weaponHit: false,
    ...extra,
  };
}

function pay(w: World, def: SkillDef, dir: { x: number; z: number }, tx: number, tz: number): void {
  w.player.mana -= def.manaCost;
  const cd = skillCooldown(w, def);
  if (cd > 0) w.cooldowns[def.id] = cd;
  const eff = def.effect;
  if (eff.kind === 'projectile' && eff.rateLimited === 'cast') w.castTimer = w.derived.castInterval;
  if (eff.kind === 'projectile' && eff.rateLimited === 'attack') w.attackTimer = 1 / w.derived.atkSpd;
  w.pyaw = Math.atan2(dir.x, dir.z);
  w.breakInvisibility();
  w.emit({ type: 'cast', skillId: def.id, x: w.px, z: w.pz, dirX: dir.x, dirZ: dir.z, tx, tz, element: def.element });
  w.emit({ type: 'sound', id: def.effect.kind === 'melee' ? 'heavyStrike' : 'skillCast' });
}

/**
 * Casts a skill. Returns `approach: true` when the target is out of reach and the
 * player should walk closer first (the world queues the cast).
 */
export function castSkill(w: World, id: string, aim: Aim | null): CastResult {
  const ready = castReady(w, id);
  if (!ready.ok) return ready;
  const def = SKILLS[id]!;
  const eff = def.effect;
  switch (eff.kind) {
    case 'melee':
      return castMelee(w, def, eff, aim);
    case 'projectile':
      return castProjectile(w, def, eff, aim);
    case 'aoe':
      return castAoe(w, def, eff, aim);
    case 'buff':
      return castBuff(w, def, eff);
    case 'zone':
      return castZone(w, def, eff, aim);
    case 'mobility':
      return castMobility(w, def, eff, aim);
    case 'beam':
      return castBeam(w, def, eff);
    case 'curse':
      return castCurse(w, def, eff, aim);
    case 'mark':
      return castMark(w, def, eff, aim);
    case 'line':
      return castLine(w, def, eff, aim);
  }
}

function castMelee(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'melee' }>, aim: Aim | null): CastResult {
  const range = eff.maxRange * PX + w.derived.range * PX;
  let target = w.targetEnemy();
  if (!target || w.dist(target.x, target.z) > range + target.radius) target = w.nearestEnemy(w.px, w.pz, range + 0.6);
  if (!eff.arc && !target) {
    const far = w.nearestEnemy(w.px, w.pz, 14);
    if (far) return { ok: false, reason: 'Out of range', approach: true };
    return { ok: false, reason: 'No target' };
  }
  const dir = facing(w, aim, target);
  const tx = target?.x ?? w.px + dir.x * range;
  const tz = target?.z ?? w.pz + dir.z * range;
  pay(w, def, dir, tx, tz);
  if (eff.healOnCastPct) w.healPlayer(Math.round((w.derived.maxHp * eff.healOnCastPct) / 100), false);
  const mult = 1 + w.skillRank(def.id) * (def.rankBonus ?? 0.2);

  const strike = () => {
    if (eff.arc) {
      w.emit({ type: 'melee_swing', x: w.px, z: w.pz, dirX: dir.x, dirZ: dir.z, range, arc: eff.arc, element: def.element, visual: eff.visual === 'cleave' || eff.visual === 'void' || eff.visual === 'avalanche' || eff.visual === 'blind' ? eff.visual : undefined });
      const hits = w.enemiesInArc(w.px, w.pz, dir.x, dir.z, range, eff.arc);
      for (const e of hits) hitEnemy(w, e, packet(w, def, eff.damageMult, { stun: eff.stun, slow: eff.slow, healOnKillPct: eff.healOnKillPct, knockback: eff.knockback ? eff.knockback * PX : undefined, blind: eff.blind, vsUndead: eff.vsUndeadMult }, eff.scalesWithInt));
    } else if (target && target.alive && !target.dead) {
      if (eff.visual === 'overhead' || eff.visual === 'holy_shield' || eff.visual === 'bloody') w.emit({ type: 'melee_impact', visual: eff.visual, x: target.x, z: target.z, element: def.element });
      else w.emit({ type: 'melee_swing', x: w.px, z: w.pz, dirX: dir.x, dirZ: dir.z, range, arc: 60, element: def.element });
      if (eff.noInitialDamage && eff.bleed) {
        const total = (target.maxHp * eff.bleed.pctOfMaxHp * mult) / 100;
        const ticks = Math.round(eff.bleed.duration / eff.bleed.interval);
        target.status.bleed = { ticks, timer: 0, interval: eff.bleed.interval * MS, damage: Math.max(1, Math.round(total / ticks)) };
        w.emit({ type: 'status', id: target.id, status: 'bleeding' });
        w.emit({ type: 'enemy_hit', id: target.id });
      } else {
        hitEnemy(w, target, packet(w, def, eff.damageMult, { stun: eff.stun, slow: eff.slow, healOnKillPct: eff.healOnKillPct }, eff.scalesWithInt));
      }
      if (eff.leap) {
        for (const e of w.enemiesWithin(w.px, w.pz, eff.leap.landingRadius * PX)) {
          if (e !== target) hitEnemy(w, e, packet(w, def, eff.damageMult, {}, eff.scalesWithInt));
        }
      }
    }
    if (eff.trail) {
      const dmg = skillDamage(w, def.id, eff.damageMult, eff.scalesWithInt);
      w.addZone({ type: 'void_trail', x: w.px, z: w.pz, dx: dir.x, dz: dir.z, length: eff.trail.length * PX, radius: 2.1, duration: eff.trail.duration * MS, tickInterval: 0.5, damage: Math.max(1, Math.round((dmg * eff.trail.tickPct) / 100 / 2)), element: def.element, skillId: def.id });
    }
    if (eff.moveBonus) w.addBuff(def.id + '_haste', def.name, eff.moveBonus.duration * MS, { moveSpdPct: eff.moveBonus.pct }, skillColor(def));
  };

  if (target && eff.teleportBehind) {
    const bx = target.x + dir.x * (target.radius + 0.6);
    const bz = target.z + dir.z * (target.radius + 0.6);
    w.teleportTo(bx, bz);
    w.pyaw = Math.atan2(-dir.x, -dir.z);
    strike();
  } else if (target && (eff.charge || eff.leap)) {
    const stopAt = target.radius + 0.5;
    const dist = w.dist(target.x, target.z);
    const k = Math.max(0, dist - stopAt) / Math.max(dist, 0.001);
    const lx = w.px + (target.x - w.px) * k;
    const lz = w.pz + (target.z - w.pz) * k;
    w.startLeap(lx, lz, (eff.leap ? eff.leap.duration : 250) * MS, !!eff.leap, strike);
  } else {
    strike();
  }
  return { ok: true };
}

function castProjectile(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'projectile' }>, aim: Aim | null): CastResult {
  const range = eff.maxRange + w.derived.range;
  const at = aimPoint(w, aim, range, 1);
  const dir = facing(w, at, null);
  pay(w, def, dir, at.x, at.z);
  const count = eff.count ?? 1;
  const spread = ((eff.spreadAngle ?? 0) * Math.PI) / 180;
  const homing = !!eff.homing || (eff.shape === 'arrow' && w.buffs.some((b) => b.mods.homingArrows));
  const baseAngle = Math.atan2(dir.x, dir.z);
  const loose = (fromX: number, fromZ: number, y?: number): void => {
    for (let i = 0; i < count; i++) {
      const a = count > 1 ? baseAngle - spread / 2 + (spread * i) / (count - 1) : baseAngle;
      const p = packet(w, def, eff.damageMult, { stun: eff.stun, bonusVsDisabled: eff.bonusVsDisabled });
      if (eff.bleed) p.bleed = { ticks: eff.bleed.ticks, interval: eff.bleed.interval, damage: Math.max(1, Math.round(p.amount * eff.bleed.tickMult)) };
      w.spawnProjectile({
        owner: 'player',
        shape: eff.shape,
        element: def.element,
        y,
        x: fromX + Math.sin(a) * 0.5,
        z: fromZ + Math.cos(a) * 0.5,
        dirX: Math.sin(a),
        dirZ: Math.cos(a),
        speed: eff.projSpeed * PX * (1 + w.derived.projSpeedPct / 100),
        radius: (eff.projRadius ?? 8) * PX,
        maxRange: range * PX,
        packet: p,
        pierce: eff.pierce ?? (eff.shape === 'arrow' ? w.derived.pierce : 0),
        homing,
        ricochets: eff.ricochets ?? 0,
      ricochetDecay: eff.ricochetDecay,
      rehit: eff.rehit ? eff.rehit * MS : 0,
        returns: !!eff.returns,
        throughWalls: !!eff.throughWalls,
        splashRadius: (eff.splashRadius ?? 0) * PX,
        onHitZone: eff.onHitZone ? { radius: eff.onHitZone.radius * PX, duration: eff.onHitZone.duration * MS, damage: Math.max(1, Math.round(p.amount * eff.onHitZone.tickMult)), tickInterval: eff.onHitZone.tickInterval * MS } : null,
        burstOnHit: eff.burstOnHit ? { count: eff.burstOnHit.count, damage: Math.max(1, Math.round(p.amount * eff.burstOnHit.damageMult)), projSpeed: eff.burstOnHit.projSpeed * PX, maxRange: eff.burstOnHit.maxRange * PX } : null,
        skillId: def.id,
      });
    }
  };
  if (eff.summon) {
    // Something rises behind the hero and looses the shot from there once it stands
    const sx = w.px - dir.x * eff.summon.behind * PX;
    const sz = w.pz - dir.z * eff.summon.behind * PX;
    const delay = eff.summon.delay * MS;
    w.addZone({
      type: 'summon', x: sx, z: sz, dx: dir.x, dz: dir.z, radius: 1, duration: delay + 0.9, tickInterval: delay, damage: 0, element: def.element, skillId: def.id,
      onFire: () => {
        loose(sx, sz, 2.4);
        w.emit({ type: 'kick', k: 0.18 });
      },
    });
  } else {
    loose(w.px, w.pz);
  }
  return { ok: true };
}

function castAoe(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'aoe' }>, aim: Aim | null): CastResult {
  let cx = w.px;
  let cz = w.pz;
  let target: Enemy | null = null;
  if (eff.at === 'target') {
    const at = aimPoint(w, aim, eff.maxRange ?? 300, 0.5);
    cx = at.x;
    cz = at.z;
    target = at.enemy;
    if (!aim && !target && eff.visual === 'lightning') {
      const far = w.nearestEnemy(w.px, w.pz, 16);
      if (far) return { ok: false, reason: 'Out of range', approach: true };
      return { ok: false, reason: 'No target' };
    }
  }
  const dir = facing(w, { x: cx, z: cz }, null);
  pay(w, def, eff.at === 'self' ? { x: Math.sin(w.pyaw), z: Math.cos(w.pyaw) } : dir, cx, cz);
  landAoe(w, def, eff, cx, cz);
  return { ok: true };
}

/** An aoe skill's blow at a point, paid for or not: at once, after its delay, or when the hero's jump lands. */
function landAoe(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'aoe' }>, cx: number, cz: number): void {
  const radius = eff.radius * PX;
  const apply = () => {
    w.emit({ type: 'aoe', visual: eff.visual, x: cx, z: cz, radius, element: def.element });
    const list = eff.hitsAllVisible ? w.enemiesWithin(cx, cz, 22) : w.enemiesWithin(cx, cz, radius);
    if (eff.visual === 'winter') w.addZone({ type: 'winter', x: cx, z: cz, radius, duration: (eff.freeze ?? 3000) * MS, damage: 0, element: def.element, skillId: def.id });
    for (const e of list) {
      const p = packet(w, def, eff.damageMult, { stun: eff.stun, slow: eff.slow, freeze: eff.freeze, bonusVsDisabled: eff.bonusVsDisabled, knockback: eff.knockback ? eff.knockback * PX : undefined });
      if (eff.poison) p.poison = { ticks: eff.poison.ticks, interval: eff.poison.interval, damage: Math.max(1, Math.round(p.amount * eff.poison.tickMult)) };
      if (eff.thawPct && !e.dummy) e.status.thaw = Math.max(e.status.thaw, eff.thawPct);
      hitEnemy(w, e, p);
    }
    if (eff.visual === 'stomp' || eff.visual === 'boulder') w.emit({ type: 'kick', k: 0.35 });
  };
  if (eff.delay) {
    w.addZone({ type: 'boulder', x: cx, z: cz, radius, duration: eff.delay * MS, damage: 0, element: def.element, skillId: def.id, onEnd: apply });
  } else if (eff.jump && eff.at === 'self') {
    // Up, then the blow lands with the hero
    w.startLeap(w.px, w.pz, eff.jump * MS, true, apply);
  } else {
    apply();
  }
}

/** Drops an aoe skill on a point for free, outside any cast: no mana, cooldown or rank check (Rock Solid's boulder). */
export function dropSkillAt(w: World, id: string, x: number, z: number): boolean {
  const def = SKILLS[id];
  if (!def || def.effect.kind !== 'aoe') return false;
  landAoe(w, def, def.effect, x, z);
  return true;
}

function castBuff(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'buff' }>): CastResult {
  const dir = { x: Math.sin(w.pyaw), z: Math.cos(w.pyaw) };
  const od = eff.mods.orbitDaggers;
  if (od?.stacks) {
    // Stacking rings: a recast while it spins adds a ring with its own timer instead of refreshing
    const existing = w.buffs.find((b) => b.id === def.id);
    if (existing) {
      const rings = existing.data.rings ?? 1;
      if (rings >= od.stacks) return { ok: false, reason: `Already ${od.stacks} hammers` };
      pay(w, def, dir, w.px, w.pz);
      existing.data[`exp${rings}`] = w.time + eff.duration * MS;
      existing.data.rings = rings + 1;
      w.emit({ type: 'buff_start', id: def.id, color: skillColor(def) });
      return { ok: true };
    }
    pay(w, def, dir, w.px, w.pz);
    const b = w.addBuff(def.id, def.name, eff.duration * MS, eff.mods, skillColor(def));
    b.data.rings = 1;
    b.data.exp0 = w.time + eff.duration * MS;
    return { ok: true };
  }
  pay(w, def, dir, w.px, w.pz);
  w.addBuff(def.id, def.name, eff.duration * MS, eff.mods, skillColor(def));
  return { ok: true };
}

function castZone(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'zone' }>, aim: Aim | null): CastResult {
  const dmg = eff.damageMult ? skillDamage(w, def.id, eff.damageMult) : 0;
  const radius = eff.radius * PX;
  let cx = w.px;
  let cz = w.pz;
  let dir = { x: Math.sin(w.pyaw), z: Math.cos(w.pyaw) };
  if (eff.maxRange) {
    const at = aimPoint(w, aim, eff.maxRange, 0.5);
    cx = at.x;
    cz = at.z;
    dir = facing(w, at, null);
  } else if (eff.zone === 'spear_wall') {
    const at = aimPoint(w, aim, 120, 1);
    dir = facing(w, at, null);
    cx = w.px + dir.x * 2.2;
    cz = w.pz + dir.z * 2.2;
  }
  pay(w, def, dir, cx, cz);
  const common = { x: cx, z: cz, dx: dir.x, dz: dir.z, duration: eff.duration * MS, damage: dmg, element: def.element, skillId: def.id, radius };
  switch (eff.zone) {
    case 'trap':
      w.addZone({ ...common, type: 'trap', slow: (eff.slow ?? 0) * MS, aoeRadius: (eff.aoeRadius ?? 0) * PX });
      break;
    case 'fire_prison':
      w.addZone({ ...common, type: 'fire_prison', tickInterval: (eff.tickInterval ?? 500) * MS, holds: !!eff.holds });
      break;
    case 'spear_wall':
      w.addZone({ ...common, type: 'spear_wall', tickInterval: 0.5, slow: (eff.slow ?? 0) * MS, count: eff.count ?? 10, length: ((eff.count ?? 10) - 1) * (eff.spacing ?? 22) * PX });
      break;
    case 'blizzard':
      w.addZone({ ...common, type: 'blizzard', tickInterval: (eff.tickInterval ?? 500) * MS, perWave: eff.perWave ?? 15, slowPct: eff.slowPct ?? 50 });
      break;
    case 'sanctuary':
      w.addZone({ ...common, type: 'sanctuary', mods: eff.mods });
      break;
    case 'wind':
      w.addZone({ ...common, type: 'wind', followsPlayer: true, slowPct: eff.slowPct ?? 50, tickInterval: 0.2 });
      if (eff.playerMoveSpdPct) w.addBuff(def.id, def.name, eff.duration * MS, { moveSpdPct: eff.playerMoveSpdPct }, skillColor(def));
      break;
    case 'storm':
      w.addZone({ ...common, type: 'storm', followsPlayer: true, tickInterval: (eff.tickInterval ?? 1000) * MS, targets: eff.targets ?? 5 });
      break;
    case 'arrow_storm':
      w.addZone({ ...common, type: 'arrow_storm', followsPlayer: true, tickInterval: (eff.tickInterval ?? 500) * MS });
      break;
    case 'frostbite':
      w.addZone({ ...common, type: 'frostbite', tickInterval: (eff.tickInterval ?? 500) * MS, slow: (eff.slow ?? 1000) * MS, pctPerSec: eff.pctPerSec ?? 2, freezeAfter: (eff.freezeAfter ?? 3000) * MS, freeze: 1.5 });
      break;
    case 'quicksand':
      w.addZone({ ...common, type: 'quicksand', tickInterval: (eff.tickInterval ?? 500) * MS });
      break;
    case 'rockfall':
      w.addZone({ ...common, type: 'rockfall', tickInterval: (eff.tickInterval ?? 400) * MS, aoeRadius: (eff.aoeRadius ?? 50) * PX });
      break;
    case 'earthquake':
      w.addZone({ ...common, type: 'earthquake', followsPlayer: true, tickInterval: (eff.tickInterval ?? 1000) * MS, wallMult: eff.wallMult ?? 1.5 });
      break;
  }
  return { ok: true };
}

function castMobility(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'mobility' }>, aim: Aim | null): CastResult {
  const range = eff.maxRange * PX;
  const at = aimPoint(w, aim, eff.maxRange, 1);
  const dir = facing(w, at, null);
  let dist = Math.min(range, w.dist(at.x, at.z));
  if (!aim && !at.enemy) dist = range;
  pay(w, def, dir, at.x, at.z);
  if (eff.mode === 'charge') {
    const dmg = skillDamage(w, def.id, eff.damageMult ?? 1);
    w.startCharge(dir.x, dir.z, range, (eff.chargeSpeed ?? 700) * PX, (eff.chargeRadius ?? 100) * PX, dmg, def);
    return { ok: true };
  }
  const dest = w.clampDestination(w.px + dir.x * dist, w.pz + dir.z * dist, !!eff.throughWalls);
  if (eff.mode === 'teleport') {
    const fromX = w.px;
    const fromZ = w.pz;
    w.teleportTo(dest.x, dest.z);
    if (eff.leaveFrost) w.addZone({ type: 'frost_patch', x: fromX, z: fromZ, radius: eff.leaveFrost.radius * PX, duration: eff.leaveFrost.duration * MS, freeze: eff.leaveFrost.freeze * MS, damage: 0, element: def.element, skillId: def.id });
  } else {
    w.startLeap(dest.x, dest.z, (eff.duration ?? 500) * MS, true, null, !!eff.invulnerable);
  }
  return { ok: true };
}

function castBeam(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'beam' }>): CastResult {
  const target = w.targetEnemy() ?? w.nearestEnemy(w.px, w.pz, eff.maxRange * PX);
  if (!target || w.dist(target.x, target.z) > eff.maxRange * PX) {
    if (w.nearestEnemy(w.px, w.pz, 16)) return { ok: false, reason: 'Out of range', approach: true };
    return { ok: false, reason: 'No target' };
  }
  const dir = facing(w, null, target);
  pay(w, def, dir, target.x, target.z);
  w.beam = {
    targetId: target.id,
    remaining: eff.duration * MS,
    tickTimer: 0,
    interval: eff.interval * MS,
    drain: skillDamage(w, def.id, eff.drainMult),
    maxRange: eff.maxRange * PX,
    extendedRange: eff.extendedRange * PX,
    farEffectiveness: eff.farEffectiveness,
  };
  w.emit({ type: 'beam', on: true, targetId: target.id });
  return { ok: true };
}

function castCurse(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'curse' }>, aim: Aim | null): CastResult {
  const at = aimPoint(w, aim, eff.maxRange, 0.5);
  if (!aim && !at.enemy) {
    if (w.nearestEnemy(w.px, w.pz, 16)) return { ok: false, reason: 'Out of range', approach: true };
    return { ok: false, reason: 'No target' };
  }
  const dir = facing(w, at, null);
  pay(w, def, dir, at.x, at.z);
  w.emit({ type: 'aoe', visual: 'curse', x: at.x, z: at.z, radius: eff.radius * PX, element: def.element });
  for (const e of w.enemiesWithin(at.x, at.z, eff.radius * PX)) {
    e.status.curse = { remaining: eff.duration * MS, pctPerSec: eff.pctPerSec, executeBelow: eff.executeBelowPct };
    w.emit({ type: 'status', id: e.id, status: 'cursed' });
  }
  return { ok: true };
}

/** Judgement: the enemy nearest the aim point, within reach, is marked. */
function castMark(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'mark' }>, aim: Aim | null): CastResult {
  const at = aimPoint(w, aim, eff.maxRange, 0.5);
  const target = at.enemy ?? w.nearestEnemy(at.x, at.z, 2);
  if (!target) {
    if (w.nearestEnemy(w.px, w.pz, 16)) return { ok: false, reason: 'Out of range', approach: true };
    return { ok: false, reason: 'No target' };
  }
  const dir = facing(w, { x: target.x, z: target.z }, null);
  pay(w, def, dir, target.x, target.z);
  target.status.mark = { remaining: eff.duration * MS, dmgTakenPct: eff.dmgTakenPct };
  w.emit({ type: 'status', id: target.id, status: 'judged' });
  return { ok: true };
}

/** A wave along the ground from the hero's feet, cut short at the first wall. The zone's front does the hitting as it travels. */
function castLine(w: World, def: SkillDef, eff: Extract<SkillEffect, { kind: 'line' }>, aim: Aim | null): CastResult {
  const at = aimPoint(w, aim, eff.length, 1);
  const dir = facing(w, at, null);
  const full = eff.length * PX;
  // Walk the line until it meets a wall
  let length = full;
  for (let t = 0.5; t <= full; t += 0.5) {
    if (w.map.circleBlocked(w.px + dir.x * t, w.pz + dir.z * t, 0.2)) {
      length = Math.max(0.5, t - 0.5);
      break;
    }
  }
  pay(w, def, dir, w.px + dir.x * length, w.pz + dir.z * length);
  const sx = w.px + dir.x * 0.4;
  const sz = w.pz + dir.z * 0.4;
  w.addZone({
    type: 'line_wave', x: sx, z: sz, dx: dir.x, dz: dir.z, length, radius: (eff.width / 2) * PX, duration: length / (eff.speed * PX), damage: skillDamage(w, def.id, eff.damageMult),
    element: def.element, skillId: def.id, stun: eff.stun ?? 0, knockback: (eff.knockback ?? 0) * PX, tickInterval: 0,
  });
  return { ok: true };
}
