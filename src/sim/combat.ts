import { COMBAT_RULES, PROC_CHANCE, STATUS_RULES } from '../data/status';
import { LEVELING } from '../data/classes';
import { PROCS } from '../data/procs';
import { isUndead } from '../data/monsters';
import { PX } from '../data/units';
import type { Element } from '../data/stats';
import { MS } from '../data/units';
import type { DamagePacket, Enemy } from './types';
import type { World } from './world';

/** Weapon roll plus the stat that scales it. `magic` uses INT and spell damage. */
export function baseDamage(w: World, magic: boolean): number {
  const d = w.derived;
  const roll = d.dmgMin + w.rng.next() * (d.dmgMax - d.dmgMin);
  const statBonus = magic ? d.int * 0.5 + d.spellDmg : d.str * 0.5 + d.bonusDamage;
  return Math.max(1, roll + statBonus);
}

/** Damage a skill deals before crits: base * damageMult * rankMult * buff multiplier. */
export function skillDamage(w: World, skillId: string, damageMult: number, scalesWithInt = false): number {
  const def = w.skillDef(skillId);
  const rank = w.skillRank(skillId);
  const rankMult = 1 + rank * (def.rankBonus ?? 0.2);
  let base = baseDamage(w, w.derived.isMagicWeapon);
  if (scalesWithInt && !w.derived.isMagicWeapon) base += w.derived.int * 0.5 + w.derived.spellDmg;
  return Math.max(1, Math.round(base * damageMult * rankMult * w.derived.dmgMult));
}

/** Percent of a hit that armour removes for a hero of this level. */
export function armorReduction(armor: number, level: number): number {
  const r = COMBAT_RULES;
  const t = (Math.min(Math.max(1, level), LEVELING.maxLevel) - 1) / (LEVELING.maxLevel - 1);
  const k = r.armorConstantAtOne + (r.armorConstantAtCap - r.armorConstantAtOne) * t;
  return Math.min(r.maxArmorReductionPct, (armor / (armor + k)) * 100);
}

/** Player hits an enemy. Handles crits, procs, statuses, on-hit healing and death. */
export function hitEnemy(w: World, e: Enemy, p: DamagePacket): number {
  if (!e.alive || e.dead) return 0;
  const d = w.derived;
  let amount = p.amount;
  let crit = false;
  if (p.canCrit && w.rng.next() * 100 < d.critChance) {
    crit = true;
    amount = Math.round(amount * (d.critDamage / 100));
  }
  const disabled = e.status.stun > 0 || e.status.freeze > 0;
  if (p.bonusVsDisabled && disabled) amount = Math.round(amount * p.bonusVsDisabled);
  const undead = isUndead(e.def);
  if (p.vsUndead && undead) amount = Math.round(amount * p.vsUndead);
  // Consecrated Blade: the hero's own hits burn with holy fire, hotter still against the undead
  if ((p.weaponHit || p.skillId) && !p.fromProc && !p.fromMinion) {
    const hb = w.buffs.find((b) => b.mods.holyBlade)?.mods.holyBlade;
    if (hb) {
      amount = Math.round(amount * (1 + (hb.pct / 100) * (undead ? hb.vsUndead : 1)));
      w.emit({ type: 'melee_impact', visual: 'holy', x: e.x, z: e.z, element: 'physical' });
    }
  }
  // Judgement: a marked enemy takes more from everything
  if (e.status.mark) amount = Math.round(amount * (1 + e.status.mark.dmgTakenPct / 100));
  // Element procs
  const proc = PROC_CHANCE[p.element];
  const roll = () => w.rng.next() * 100;
  if (p.element === 'lightning' && proc.electrocute && roll() < proc.electrocute) amount = Math.round(amount * (1 + STATUS_RULES.electrocuteBonusPct / 100));
  amount = Math.max(0, Math.round(amount));
  if (e.dummy) {
    e.hp = Math.max(0, e.hp - amount);
    e.sinceHit = 0;
  } else {
    e.hp -= amount;
    e.aggro = true;
    w.alertNear(e);
  }
  // What the hero is attacking, for the skeletons to follow; their own arrows and procs do not count
  if (!p.fromMinion && !p.fromProc) w.lastHitId = e.id;
  w.emit({ type: 'damage', x: e.x, z: e.z, y: 1.6 * e.scale, amount, crit, element: p.element, target: 'enemy' });
  w.emit({ type: 'enemy_hit', id: e.id });
  if (crit) w.emit({ type: 'sound', id: 'crit' });
  else w.emit({ type: 'sound', id: 'hit' });

  // Statuses
  if (p.stun) applyStun(w, e, p.stun * MS);
  if (p.freeze) applyFreeze(w, e, p.freeze * MS);
  if (p.slow) e.status.slow = Math.max(e.status.slow, p.slow * MS);
  if (p.knockback && !e.dummy) w.shove(e, p.knockback);
  if (p.blind && e.status.blind < p.blind * MS) {
    e.status.blind = p.blind * MS;
    w.emit({ type: 'status', id: e.id, status: 'blinded' });
  }
  const burnChance = (proc.burn ?? 0) + (p.element === 'fire' ? d.burnChance : 0);
  if (burnChance > 0 && roll() < burnChance) {
    e.status.burn = { ticks: STATUS_RULES.burnTicks, timer: 0, interval: STATUS_RULES.burnInterval * MS, damage: Math.max(1, Math.round((p.amount * STATUS_RULES.burnTickPct) / 100)) };
    w.emit({ type: 'status', id: e.id, status: 'burning' });
  }
  const poisonChance = (proc.poison ?? 0) + (p.element === 'poison' ? d.poisonChance : 0) + (p.weaponHit ? d.poisonChance : 0);
  if (p.poison) {
    e.status.poison = { ticks: p.poison.ticks, timer: 0, interval: p.poison.interval * MS, damage: p.poison.damage };
    w.emit({ type: 'status', id: e.id, status: 'poisoned' });
  } else if (poisonChance > 0 && roll() < poisonChance) {
    e.status.poison = { ticks: STATUS_RULES.poisonTicks, timer: 0, interval: STATUS_RULES.poisonInterval * MS, damage: Math.max(1, Math.round((p.amount * STATUS_RULES.poisonTickPct) / 100)) };
    w.emit({ type: 'status', id: e.id, status: 'poisoned' });
  }
  if (proc.slow && roll() < proc.slow) e.status.slow = Math.max(e.status.slow, STATUS_RULES.slowDuration * MS);
  if (proc.freeze && roll() < proc.freeze) applyFreeze(w, e, STATUS_RULES.freezeDuration * MS);
  if (proc.shock && roll() < proc.shock) e.status.shock = Math.max(e.status.shock, STATUS_RULES.shockDuration * MS);
  if (p.bleed) {
    e.status.bleed = { ticks: p.bleed.ticks, timer: 0, interval: p.bleed.interval * MS, damage: p.bleed.damage };
    w.emit({ type: 'status', id: e.id, status: 'bleeding' });
  }

  // On-hit returns
  if (p.weaponHit || p.skillId) {
    if (d.lifeSteal > 0) w.healPlayer(Math.round((amount * d.lifeSteal) / 100), true);
    if (d.lifeOnHit > 0) w.healPlayer(d.lifeOnHit, true);
    if (d.manaOnHit > 0) w.player.mana = Math.min(d.maxMana, w.player.mana + d.manaOnHit);
    const rite = w.buffs.find((b) => b.mods.selfCostPct);
    if (rite) w.player.hp = Math.max(1, w.player.hp - Math.round((d.maxHp * rite.mods.selfCostPct!) / 100));
  }
  if (e.hp <= 0 && !e.dummy) {
    w.killEnemy(e, p.healOnKillPct ?? 0);
  }
  // Item procs fire off weapon hits, never off their own damage
  if (p.weaponHit && !p.fromProc && amount > 0) fireProcs(w, e, amount, p.element);
  // Shade Army: the hero's shadows land the same blow after the hero
  if ((p.weaponHit || p.skillId) && !p.fromProc && !p.fromMinion && !p.fromShade && amount > 0 && !e.dead) {
    const sh = w.buffs.find((b) => b.mods.shades)?.mods.shades;
    if (sh) {
      for (let i = 0; i < sh.count && !e.dead; i++) {
        w.emit({ type: 'melee_impact', visual: 'shade', x: e.x, z: e.z, element: 'physical' });
        hitEnemy(w, e, { amount: Math.max(1, Math.round(amount * sh.mult)), element: p.element, canCrit: false, skillId: p.skillId, weaponHit: false, fromMinion: true, fromShade: true });
      }
    }
  }
  // Overload: a lightning hit may jump once to the nearest other enemy
  if (p.element === 'lightning' && !p.fromArc && !p.fromProc && amount > 0) {
    const ov = w.buffs.find((b) => b.mods.overload)?.mods.overload;
    if (ov && roll() < ov.chance) {
      const other = w.nearestEnemy(e.x, e.z, ov.range * PX, [e.id]);
      if (other) {
        w.emit({ type: 'arc', x0: e.x, z0: e.z, x1: other.x, z1: other.z });
        hitEnemy(w, other, { amount: Math.max(1, Math.round(amount * ov.mult)), element: 'lightning', canCrit: false, skillId: p.skillId, weaponHit: false, fromArc: true });
      }
    }
  }
  return amount;
}

/** Rolls every worn proc against this hit; a proc that fires strikes everything around its centre (the hero or the enemy hit). */
function fireProcs(w: World, e: Enemy, amount: number, element: Element): void {
  for (const proc of w.derived.procs) {
    if (w.rng.next() * 100 >= proc.chance) continue;
    const def = PROCS[proc.id];
    if (!def) continue;
    const radius = def.radius * PX;
    const cx = def.at === 'target' ? e.x : w.px;
    const cz = def.at === 'target' ? e.z : w.pz;
    w.emit({ type: 'aoe', visual: def.visual, x: cx, z: cz, radius, element });
    w.emit({ type: 'sound', id: 'hit' });
    const dmg = Math.max(1, Math.round(amount * def.damageMult));
    for (const other of w.enemiesWithin(cx, cz, radius)) {
      hitEnemy(w, other, { amount: dmg, element, canCrit: false, skillId: null, weaponHit: false, fromProc: true });
    }
  }
}

export function applyStun(w: World, e: Enemy, seconds: number): void {
  if (e.status.stun < seconds) {
    e.status.stun = seconds;
    w.emit({ type: 'status', id: e.id, status: 'stunned' });
  }
}

export function applyFreeze(w: World, e: Enemy, seconds: number): void {
  if (e.status.freeze < seconds) {
    e.status.freeze = seconds;
    w.emit({ type: 'status', id: e.id, status: 'frozen' });
  }
}

/** Damage over time ticks. Returns true if the enemy died. */
export function tickStatuses(w: World, e: Enemy, dt: number): void {
  const s = e.status;
  s.stun = Math.max(0, s.stun - dt);
  // Winter's Heart: the ice breaks and takes a share of the life with it
  if (s.freeze > 0 && s.freeze - dt <= 0 && s.thaw > 0) {
    const amount = Math.max(1, Math.round((e.maxHp * s.thaw) / 100));
    s.thaw = 0;
    w.emit({ type: 'status', id: e.id, status: 'shattered' });
    dotDamage(w, e, amount, 'cold');
    if (e.dead) return;
  }
  s.freeze = Math.max(0, s.freeze - dt);
  s.chill = Math.max(0, s.chill - dt * 0.35);
  s.slow = Math.max(0, s.slow - dt);
  s.shock = Math.max(0, s.shock - dt);
  s.blind = Math.max(0, s.blind - dt);
  s.sink = Math.max(0, s.sink - dt);
  if (s.puppet > 0) {
    // Blood Puppet: when the time runs out the heart gives out
    s.puppet -= dt;
    if (s.puppet <= 0) {
      s.puppet = 0;
      if (!e.dummy) {
        w.emit({ type: 'damage', x: e.x, z: e.z, y: 1.8, amount: Math.round(e.hp), crit: true, element: 'physical', target: 'enemy' });
        w.killEnemy(e, 0);
        return;
      }
    }
  }
  if (s.mark) {
    s.mark.remaining -= dt;
    if (s.mark.remaining <= 0) s.mark = null;
  }
  const dots: [keyof Pick<EnemyStatusDots, 'burn' | 'poison' | 'bleed'>, Element][] = [['burn', 'fire'], ['poison', 'poison'], ['bleed', 'physical']];
  for (const [key, element] of dots) {
    const dot = s[key];
    if (!dot) continue;
    dot.timer += dt;
    while (dot.timer >= dot.interval && dot.ticks > 0) {
      dot.timer -= dot.interval;
      dot.ticks--;
      dotDamage(w, e, dot.damage, element);
      if (e.dead) return;
    }
    if (dot.ticks <= 0) s[key] = null;
  }
  if (s.curse) {
    s.curse.remaining -= dt;
    const perSec = Math.max(1, Math.round((e.maxHp * s.curse.pctPerSec) / 100));
    dotDamage(w, e, perSec * dt, 'poison', true);
    if (!e.dead && e.hp <= (e.maxHp * s.curse.executeBelow) / 100 && !e.dummy) {
      w.emit({ type: 'damage', x: e.x, z: e.z, y: 1.8, amount: Math.round(e.hp), crit: true, element: 'poison', target: 'enemy' });
      w.killEnemy(e, 0);
      return;
    }
    if (s.curse.remaining <= 0) s.curse = null;
  }
}

type EnemyStatusDots = Enemy['status'];

function dotDamage(w: World, e: Enemy, amount: number, element: Element, silent = false): void {
  if (!e.alive || e.dead) return;
  e.hp -= amount;
  e.sinceHit = 0;
  if (!silent) w.emit({ type: 'damage', x: e.x, z: e.z, y: 1.4 * e.scale, amount: Math.round(amount), crit: false, element, target: 'enemy' });
  if (e.hp <= 0) {
    if (e.dummy) e.hp = 0;
    else w.killEnemy(e, 0);
  }
}

/** Something hurts the player. Dodge, block, armour or resistance, shields, then life. */
export function damagePlayer(w: World, amount: number, element: Element, source: Enemy | null, melee: boolean): void {
  if (w.playerDead || w.invulnTimer > 0) return;
  const d = w.derived;
  const at = { x: w.px, z: w.pz, y: 2.1 };
  // Divine Shield: the blow lands on the light, and Retribution still answers it
  if (w.buffs.some((b) => b.mods.invulnerable)) {
    w.emit({ type: 'damage', ...at, amount: 0, crit: false, element, target: 'player', kind: 'immune' });
    retaliate(w, amount, source);
    return;
  }
  if (w.rng.next() * 100 < d.dodge) {
    w.emit({ type: 'damage', ...at, amount: 0, crit: false, element, target: 'player', kind: 'dodge' });
    return;
  }
  if (melee && d.block > 0 && w.rng.next() * 100 < d.block) {
    w.emit({ type: 'damage', ...at, amount: 0, crit: false, element, target: 'player', kind: 'block' });
    w.emit({ type: 'sound', id: 'itemEquip' });
    return;
  }
  const inSanctuary = w.zoneMods.allResists ?? 0;
  let reduced: number;
  if (element === 'physical') {
    reduced = Math.max(1, Math.round(amount * (1 - armorReduction(d.armor, w.player.level) / 100)));
  } else {
    const res = Math.min(75, d.res[element] + inSanctuary);
    reduced = Math.max(1, Math.round(amount * (1 - res / 100)));
  }
  // Weakened after Divine Shield: everything bites harder
  for (const b of w.buffs) if (b.mods.dmgTakenPct) reduced = Math.round(reduced * (1 + b.mods.dmgTakenPct / 100));
  // Shields absorb in order: physical-only first, then general
  let remaining = reduced;
  const shields = w.buffs.filter((b) => b.shield > 0).sort((a, b) => (a.mods.shieldPhysicalOnly ? -1 : 1) - (b.mods.shieldPhysicalOnly ? -1 : 1));
  for (const b of shields) {
    if (remaining <= 0) break;
    if (b.mods.shieldPhysicalOnly && element !== 'physical') continue;
    const absorbed = Math.min(b.shield, remaining);
    b.shield -= absorbed;
    remaining -= absorbed;
    if (absorbed > 0) w.emit({ type: 'damage', ...at, amount: absorbed, crit: false, element, target: 'player', kind: 'absorb' });
    if (absorbed > 0 && b.shield <= 0 && b.mods.onShieldBreak) {
      // The shield's parting shot lands where the hero stands
      if (w.dropSkill(b.mods.onShieldBreak, w.px, w.pz)) w.emit({ type: 'message', text: `${b.name} shatters!`, color: 0xff9a40 });
    }
  }
  if (remaining > 0) {
    w.player.hp -= remaining;
    w.emit({ type: 'damage', ...at, amount: remaining, crit: false, element, target: 'player' });
    w.emit({ type: 'player_hit' });
    w.emit({ type: 'sound', id: 'playerHurt' });
  }
  retaliate(w, amount, source);
  if (w.player.hp <= 0) w.killPlayer();
}

/** What the attacker gets back: Fire Armor's flames, Frozen Armor's ice, Retribution's bolt of light. `amount` is the blow before armour. */
function retaliate(w: World, amount: number, source: Enemy | null): void {
  if (!source || !source.alive || source.dead) return;
  for (const b of w.buffs) {
    if (b.mods.retaliationMult) {
      hitEnemy(w, source, { amount: Math.max(1, Math.round(amount * b.mods.retaliationMult)), element: 'fire', canCrit: false, skillId: null, weaponHit: false });
    }
    if (b.mods.freezeAttackersMs) applyFreeze(w, source, b.mods.freezeAttackersMs * MS);
    if (b.mods.retribution) {
      w.emit({ type: 'holy_bolt', x: source.x, z: source.z });
      hitEnemy(w, source, { amount: Math.max(1, Math.round(amount * b.mods.retribution.mult)), element: 'physical', canCrit: false, skillId: null, weaponHit: false });
    }
  }
}
