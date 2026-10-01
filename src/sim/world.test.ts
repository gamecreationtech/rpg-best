import { describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_RULES, monsterScale } from '../data/monsters';
import { ZONES } from '../data/zones';
import { SKILLS, SKILL_RULES, skillsFor } from '../data/skills';
import { makeItem, makeStarterItem } from './items/item';
import { baseItem } from '../data/items';
import { armorReduction, damagePlayer, hitEnemy } from './combat';
import { castSkill } from './skills/cast';
import type { DamagePacket, Enemy } from './types';
import { createPlayer } from './player';
import { SIM_DT, World } from './world';

function run(w: World, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) w.step(SIM_DT);
}

describe('world', () => {
  it('starts in town with dummies and interactables', () => {
    const w = new World(createPlayer('knight', 'paladin'), 1);
    expect(w.area).toBe('town');
    expect(w.enemies.filter((e) => e.alive && e.dummy).length).toBe(5);
    expect(w.interactables.map((i) => i.kind)).toContain('vendor');
    expect(w.vendorStock.length).toBe(18);
    run(w, 1);
    expect(w.player.hp).toBe(w.derived.maxHp);
  });

  it('walks to a tapped point', () => {
    const w = new World(createPlayer('rogue', 'impaler'), 2);
    const sx = w.px;
    w.moveTo(sx + 5, w.pz);
    run(w, 3);
    expect(Math.abs(w.px - (sx + 5))).toBeLessThan(0.3);
  });

  it('attacks a targeted enemy in the arena, gains xp and drops loot', () => {
    const w = new World(createPlayer('knight', 'titan'), 3);
    w.travel('arena');
    expect(w.area).toBe('arena');
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 3, w.pz);
    e.speed = 0;
    w.setTarget(e.id);
    run(w, 4);
    expect(w.events.some((ev) => ev.type === 'enemy_died' && ev.id === e.id)).toBe(true);
    expect(w.player.xp).toBeGreaterThan(0);
    expect(w.player.kills).toBeGreaterThanOrEqual(1);
    expect(w.drops.length + w.events.filter((ev) => ev.type === 'pickup').length).toBeGreaterThan(0);
  });

  it('steering with the keys or joystick drops the attack target', () => {
    const w = new World(createPlayer('knight', 'titan'), 3);
    w.travel('arena');
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 6, w.pz);
    e.speed = 0;
    w.setTarget(e.id);
    run(w, 0.5);
    expect(w.targetId).toBe(e.id);
    w.setMoveInput(0, -1);
    run(w, 0.5);
    expect(w.targetId).toBe(-1);
    w.setMoveInput(0, 0);
    run(w, 3);
    // Nothing brings the target back on its own
    expect(w.targetId).toBe(-1);
    expect(e.hp).toBe(e.maxHp);
  });

  it('holds the hero at level 20 until a pledge is sworn', () => {
    const w = new World(createPlayer('knight', null), 5);
    expect(w.pledgePending).toBe(false);
    for (let i = 0; i < 19; i++) w.devLevelUp();
    expect(w.player.level).toBe(20);
    expect(w.pledgePending).toBe(true);
    expect(w.events.some((ev) => ev.type === 'pledge_choice')).toBe(true);
    // Cannot move, cannot be hurt
    const x = w.px;
    w.setMoveInput(1, 0);
    run(w, 1);
    expect(w.px).toBe(x);
    const hp = w.player.hp;
    damagePlayer(w, 50, 'physical', null, true);
    expect(w.player.hp).toBe(hp);
    // A pledge of another class is refused; the right one releases the hold
    expect(w.choosePledge('necromancer')).toBe(false);
    expect(w.choosePledge('titan')).toBe(true);
    expect(w.player.pledgeId).toBe('titan');
    expect(w.pledgePending).toBe(false);
    w.setMoveInput(1, 0);
    run(w, 1);
    expect(w.px).toBeGreaterThan(x);
  });

  it('every zone builds, spawns its own roster and scales monsters by its level', () => {
    for (const zone of ZONES) {
      const w = new World(createPlayer('rogue', null), 9);
      w.travel('arena', zone.id);
      expect(w.zoneId).toBe(zone.id);
      expect(w.map.cols).toBe(zone.cols);
      expect(w.map.circleBlocked(w.px, w.pz, 0.4)).toBe(false);
      run(w, 12);
      const spawned = w.enemies.filter((e) => e.alive && e.def);
      expect(spawned.length).toBeGreaterThan(0);
      for (const e of spawned) {
        expect(zone.spawns[e.def!.id]).toBeGreaterThan(0);
        expect(e.maxHp).toBe(Math.round(e.def!.hp * (1 + MONSTER_RULES.hpPerLevel * (zone.level - 1))));
      }
    }
  });

  it('dummies reset after a few seconds and never die', () => {
    const w = new World(createPlayer('sorcerer', 'wintercaller'), 4);
    const dummy = w.enemies.find((e) => e.alive && e.dummy)!;
    w.player.skillRanks.fire_bolt = 5;
    w.px = dummy.x - 3;
    w.pz = dummy.z;
    for (let i = 0; i < 30; i++) {
      w.castSkillId('fire_bolt', { x: dummy.x, z: dummy.z });
      run(w, 0.4);
    }
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
    expect(dummy.alive).toBe(true);
    run(w, 8); // burn ticks keep it "recently hit" for three seconds
    expect(dummy.hp).toBe(dummy.maxHp);
  });

  it('every skill of every class can be cast without throwing', () => {
    const classes = [['knight', 'paladin'], ['knight', 'titan'], ['knight', 'nightlord'], ['sorcerer', 'necromancer'], ['sorcerer', 'stormsinger'], ['sorcerer', 'wintercaller'], ['rogue', 'quiverbound'], ['rogue', 'impaler'], ['rogue', 'silverblade']] as const;
    for (const [cls, pledge] of classes) {
      const p = createPlayer(cls, pledge);
      p.level = 30;
      for (const s of skillsFor(cls, pledge)) p.skillRanks[s.id] = 5;
      const w = new World(p, 7);
      w.travel('arena');
      const home = { x: w.px, z: w.pz };
      const spawn = () => {
        for (const e of w.enemies) e.alive = false;
        w.playerDead = false;
        // Back to the spawn: a teleport earlier in the list must not leave the next cast's monsters inside a wall
        w.teleportTo(home.x, home.z);
        p.hp = w.derived.maxHp;
        for (let i = 0; i < 6; i++) {
          const e = w.spawnEnemy((i % 2 ? MONSTERS.skeleton! : MONSTERS.ghoul!), w.px + 2 + i * 0.8, w.pz + (i % 2 ? 0.7 : -0.7));
          e.speed = 0;
        }
      };
      for (const s of skillsFor(cls, pledge)) {
        // Give the right weapon for skills that need one
        if (s.requires === 'dagger') p.equipment.equip(makeStarterItem('starter_dagger'), 30);
        if (s.requires === 'bow') p.equipment.equip(makeStarterItem('wooden_bow'), 30);
        w.markDirty();
        w.recomputeStats();
        p.mana = 10000;
        w.cooldowns = {};
        w.leap = null;
        w.charge = null;
        w.beam = null;
        spawn();
        const before = w.events.length;
        w.castSkillId(s.id, { x: w.px + 3, z: w.pz });
        run(w, 2.5);
        const cast = w.events.slice(before).some((ev) => ev.type === 'cast' && ev.skillId === s.id);
        expect(cast, `${s.id} did not cast`).toBe(true);
      }
    }
    expect(Object.keys(SKILLS).length).toBe(83);
  });

  it('dies and respawns in town at full life', () => {
    const w = new World(createPlayer('rogue', 'silverblade'), 9);
    w.travel('arena');
    w.player.hp = 1;
    const e = w.spawnEnemy(MONSTERS.brute!, w.px + 0.8, w.pz);
    e.attackTimer = 0;
    run(w, 3);
    expect(w.playerDead).toBe(true);
    w.respawn();
    expect(w.area).toBe('town');
    expect(w.player.hp).toBe(w.derived.maxHp);
  });
});

describe('leveling pace', () => {
  it('a fresh knight reaches level 2 in the Proving Grounds within five minutes of fighting', () => {
    const w = new World(createPlayer('knight', null), 41);
    w.travel('arena', 'proving_grounds');
    let t = 0;
    for (; t < 300 && w.player.level < 2 && !w.playerDead; t += 0.5) {
      const alive = w.enemies.filter((e) => e.alive && !e.dead && e.def);
      alive.sort((a, b) => Math.hypot(a.x - w.px, a.z - w.pz) - Math.hypot(b.x - w.px, b.z - w.pz));
      const near = alive[0];
      if (near && (w.targetId < 0 || w.enemies[w.targetId]!.dead)) {
        if (w.dist(near.x, near.z) < 12) w.setTarget(near.id);
        else w.moveTo(near.x, near.z);
      }
      if (w.player.hp < w.derived.maxHp * 0.4) w.useConsumable('hp_potion');
      run(w, 0.5);
    }
    expect(w.playerDead).toBe(false);
    expect(w.player.level).toBe(2);
    expect(t).toBeLessThan(300);
  });
});

describe('monster collision', () => {
  it('a monster squeezed between the hero and a wall is never pushed into the wall', () => {
    const w = new World(createPlayer('knight', 'titan'), 24);
    w.travel('arena');
    const hc = Math.floor(w.px);
    const hr = Math.floor(w.pz);
    w.px = hc + 0.6;
    w.pz = hr + 0.5;
    w.map.set(hc + 1, hr, 0);
    w.map.set(hc + 1, hr - 1, 0);
    w.map.set(hc + 1, hr + 1, 0);
    const bat = w.spawnEnemy(MONSTERS.crypt_bat!, hc + 0.7, hr + 0.5);
    bat.speed = 0;
    run(w, 1);
    expect(w.map.circleBlocked(bat.x, bat.z, bat.radius)).toBe(false);
    expect(w.map.lineBlocked(w.px, w.pz, bat.x, bat.z)).toBe(false);
  });
});

describe('class weapons', () => {
  it('a knight only equips swords, maces and bardiches', () => {
    const w = new World(createPlayer('knight', 'titan'), 71);
    const bow = makeItem(baseItem('bow'), 'common', 1, null);
    const mace = makeItem(baseItem('mace'), 'common', 1, null);
    w.player.inventory.add(bow);
    w.player.inventory.add(mace);
    const r = w.equipItem(bow);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Knights only use');
    expect(w.player.inventory.has(bow)).toBe(true);
    expect(w.equipItem(mace).ok).toBe(true);
    // Other classes are not restricted
    const s = new World(createPlayer('sorcerer', null), 72);
    const sword = makeItem(baseItem('sword'), 'common', 1, null);
    s.player.inventory.add(sword);
    expect(s.equipItem(sword).ok).toBe(true);
  });
});

describe('bulk selling', () => {
  it('sells every item of one rarity and pays 40% of their value', () => {
    const w = new World(createPlayer('knight', 'titan'), 81);
    const a = makeItem(baseItem('ring'), 'common', 1, null);
    const b = makeItem(baseItem('belt'), 'common', 1, null);
    const c = makeItem(baseItem('amulet'), 'magic', 1, null);
    for (const it of [a, b, c]) w.player.inventory.add(it);
    const gold = w.player.gold;
    const r = w.sellAll('common');
    expect(r.count).toBe(2);
    expect(w.player.gold).toBe(gold + Math.floor(a.value * 0.4) + Math.floor(b.value * 0.4));
    expect(w.player.inventory.items).toEqual([c]);
    expect(w.sellAll('common').count).toBe(0);
  });
});

describe('town', () => {
  it('keeps life and mana full while the hero is in town', () => {
    const w = new World(createPlayer('sorcerer', null), 161);
    w.travel('arena');
    w.player.hp = 5;
    w.player.mana = 3;
    w.travel('town');
    run(w, 0.1);
    expect(w.player.hp).toBe(w.derived.maxHp);
    expect(w.player.mana).toBe(w.derived.maxMana);
    w.player.mana -= 40; // a cast in town
    run(w, 0.1);
    expect(w.player.mana).toBe(w.derived.maxMana);
  });
});

describe('ranged monsters stay answerable', () => {
  it('a sorcerer holding the attack button can shoot back at an archer that has settled to shoot', () => {
    const w = new World(createPlayer('sorcerer', null), 151);
    w.travel('arena');
    const archer = w.spawnEnemy(MONSTERS.bone_archer!, w.px + 9, w.pz); // 288 px out, it walks in to its preferred range
    archer.aggro = true;
    w.attackHeld = true;
    run(w, 6);
    expect(w.events.some((ev) => ev.type === 'player_attack')).toBe(true);
    expect(archer.hp).toBeLessThan(archer.maxHp);
  });

  it('every ranged monster prefers to stand inside a 200 px weapon\'s reach', () => {
    for (const m of Object.values(MONSTERS)) {
      if (m.ai !== 'ranged') continue;
      expect(m.preferredRange ?? 195, m.name).toBeLessThanOrEqual(180);
    }
  });
});

describe('hidden skills', () => {
  it('Holy Smite stays off the list until the dev toggle shows it', () => {
    const ids = () => skillsFor('knight', 'paladin').map((s) => s.id);
    expect(ids()).not.toContain('holy_smite');
    SKILL_RULES.showHidden = true;
    expect(ids()).toContain('holy_smite');
    SKILL_RULES.showHidden = false;
  });

  it('Holy Smite circles the hero for three seconds and strikes what it passes', () => {
    const w = new World(createPlayer('knight', 'paladin'), 141);
    w.travel('arena');
    w.player.level = 10;
    w.player.skillPoints = 5;
    w.player.skillRanks.holy_smite = 1;
    w.player.slots[1] = 'holy_smite';
    const near = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 1.9, w.pz); // on the 60 px ring
    const far = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 6, w.pz);
    const inside = w.spawnEnemy(MONSTERS.blood_bat!, w.px - 0.3, w.pz); // a bat hugging the hero, well inside the ring
    inside.speed = 0;
    inside.maxHp = inside.hp = 100000;
    const insideHp = inside.hp;
    near.speed = 0;
    far.speed = 0;
    near.maxHp = near.hp = 100000;
    const farHp = far.hp;
    w.castSlot(1);
    expect(w.buffs.some((b) => b.id === 'holy_smite')).toBe(true);
    run(w, 1);
    const afterOne = near.hp;
    expect(afterOne).toBeLessThan(100000);
    run(w, 2.5);
    expect(near.hp).toBeLessThan(afterOne);
    expect(far.hp).toBe(farHp);
    // The star is a hit box on its path, not a field: a monster inside the ring is never touched
    expect(inside.hp).toBe(insideHp);
    expect(w.buffs.some((b) => b.id === 'holy_smite')).toBe(false);
  });

  it('recasting adds up to three rings, and the outermost goes when the oldest timer ends', () => {
    const w = new World(createPlayer('knight', 'paladin'), 142);
    w.travel('arena');
    w.player.level = 10;
    w.player.skillRanks.holy_smite = 1;
    w.player.slots[1] = 'holy_smite';
    w.devStats.cdr = 90;
    w.recomputeStats();
    expect(w.derived.cdr).toBe(90);
    const rings = () => w.buffs.find((b) => b.id === 'holy_smite')?.data.rings ?? 0;
    w.castSlot(1);
    run(w, 1);
    w.cooldowns = {};
    w.castSlot(1);
    run(w, 1);
    w.cooldowns = {};
    w.castSlot(1);
    expect(rings()).toBe(3);
    w.cooldowns = {};
    expect(castSkill(w, 'holy_smite', null).ok).toBe(false); // three is the limit
    run(w, 1.05); // the first ring's three seconds are up
    expect(rings()).toBe(2);
    run(w, 1);
    expect(rings()).toBe(1);
    run(w, 1.1);
    expect(rings()).toBe(0);
  });
});

describe('armour', () => {
  it('80% reduction takes 100 armor at level 1 and 5000 at level 100', () => {
    expect(armorReduction(100, 1)).toBeCloseTo(80, 5);
    expect(armorReduction(5000, 100)).toBeCloseTo(80, 5);
    expect(armorReduction(100, 100)).toBeLessThan(10);
    expect(armorReduction(1e9, 50)).toBe(90);
  });
});

describe('beyond 100', () => {
  it('replays a zone at a picked monster level, drops follow it, and the hero stays at the cap', () => {
    const w = new World(createPlayer('knight', 'titan'), 131);
    w.player.level = 100;
    w.player.xpToNext = 999999;
    w.travel('arena', 'the_abyss', 300);
    expect(w.monsterLevel).toBe(300);
    expect(w.events.some((ev) => ev.type === 'area' && ev.level === 300)).toBe(true);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 12, w.pz);
    // Past the cap life compounds toward 26,000x at level 1000; damage adds +10% of the base a level (Nightmare is 300)
    const rate = Math.pow(MONSTER_RULES.lifeAtInferno / (1 + MONSTER_RULES.hpPerLevel * 99), 1 / 900);
    expect(e.maxHp).toBe(Math.round(17 * (1 + MONSTER_RULES.hpPerLevel * 99) * Math.pow(rate, 200)));
    expect(e.damage).toBe(Math.round(3 * (1 + MONSTER_RULES.dmgPerLevel * 99 + 0.1 * 200)));
    expect(monsterScale(1000).hp).toBeCloseTo(26000, 0);
    let drop = null;
    for (let i = 0; i < 60 && !drop; i++) {
      const g = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 12, w.pz);
      w.killEnemy(g, 0);
      drop = w.drops.find((d) => d.alive && d.item)?.item ?? null;
    }
    expect(drop).toBeTruthy();
    expect(drop!.ilvl).toBe(300);
    expect(drop!.reqLevel).toBe(100);
    expect(w.player.level).toBe(100);
    // The return portal brings the hero back at the same level
    w.enterTown();
    w.enterArena();
    expect(w.monsterLevel).toBe(300);
    // Travelling normally clears it
    w.travel('arena', 'cursed_hollow');
    expect(w.monsterLevel).toBe(6);
  });
});

describe('heavy strike', () => {
  it('lands from above on the target instead of drawing a swing arc', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 1, w.pz);
    e.speed = 0;
    const hp = e.hp;
    w.events.length = 0;
    expect(castSkill(w, 'heavy_strike', null).ok).toBe(true);
    const smash = w.events.find((ev) => ev.type === 'melee_impact');
    expect(smash && smash.type === 'melee_impact' ? [smash.visual, smash.x, smash.z] : null).toEqual(['overhead', e.x, e.z]);
    expect(w.events.some((ev) => ev.type === 'melee_swing')).toBe(false);
    expect(e.hp).toBeLessThan(hp);
  });
});

describe('ground stomp', () => {
  it('jumps in place and lands the blow on touchdown', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 2, w.pz);
    e.speed = 0;
    const hp = e.hp;
    const [px, pz] = [w.px, w.pz];
    w.player.skillRanks.ground_stomp = 1;
    expect(castSkill(w, 'ground_stomp', null).ok).toBe(true);
    expect(w.leap).not.toBeNull();
    expect(e.hp).toBe(hp);
    run(w, 0.2);
    expect(e.hp).toBe(hp);
    run(w, 0.3);
    expect(w.leap).toBeNull();
    expect(e.hp).toBeLessThan(hp);
    expect(e.status.slow).toBeGreaterThan(0);
    expect(w.px).toBeCloseTo(px, 3);
    expect(w.pz).toBeCloseTo(pz, 3);
  });
});

describe('skeleton army', () => {
  it('raises five archers that heel behind the hero and shoot what the hero hit', () => {
    const w = new World(createPlayer('sorcerer', 'necromancer'), 7);
    w.travel('arena');
    w.player.level = 20;
    w.player.mana = 500;
    w.player.skillRanks.skeleton_army = 1;
    expect(castSkill(w, 'skeleton_army', null).ok).toBe(true);
    expect(w.minions.filter((m) => m.active).length).toBe(5);
    for (const m of w.minions) if (m.active) expect(w.dist(m.x, m.z)).toBeLessThan(3);
    // Nothing hit yet: no arrows
    run(w, 1.5);
    expect(w.projectiles.some((p) => p.alive)).toBe(false);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 5, w.pz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    hitEnemy(w, e, { amount: 1, element: 'physical', canCrit: false, skillId: null, weaponHit: false });
    expect(w.lastHitId).toBe(e.id);
    run(w, 2.5);
    expect(e.hp).toBeLessThan(100000 - 1);
    // The buff ends and the bones fall
    const b = w.buffs.find((b) => b.id === 'skeleton_army')!;
    b.remaining = 0.01;
    run(w, 0.1);
    expect(w.minions.some((m) => m.active)).toBe(false);
  });
});

describe('stormsinger', () => {
  const setup = (): World => {
    const w = new World(createPlayer('sorcerer', 'stormsinger'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 1000;
    for (const id of ['chain_lightning', 'thunderclap', 'wind_barrier', 'overload', 'ball_lightning']) w.player.skillRanks[id] = 1;
    return w;
  };
  const ghoul = (w: World, dx: number, dz: number): Enemy => {
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + dx, w.pz + dz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    return e;
  };

  it('chain lightning jumps from the first enemy to the next, losing a little each hop', () => {
    const w = setup();
    const a = ghoul(w, 0, 3);
    const b = ghoul(w, 1.5, 4.5);
    const c = ghoul(w, -1.5, 6);
    expect(castSkill(w, 'chain_lightning', { x: a.x, z: a.z }).ok).toBe(true);
    run(w, 1);
    const hits = [a, b, c].map((e) => 100000 - e.hp);
    expect(hits.every((h) => h > 0)).toBe(true);
    expect(hits[1]!).toBeLessThan(hits[0]!);
    expect(w.events.filter((ev) => ev.type === 'arc').length).toBeGreaterThanOrEqual(2);
  });

  it('thunderclap stuns and shoves everything close', () => {
    const w = setup();
    const e = ghoul(w, 0, 2);
    const before = e.z;
    expect(castSkill(w, 'thunderclap', null).ok).toBe(true);
    expect(e.status.stun).toBeGreaterThan(0);
    expect(e.z).toBeGreaterThan(before + 1);
    expect(e.hp).toBeLessThan(100000);
  });

  it('overload arcs lightning hits to a neighbour', () => {
    const w = setup();
    const a = ghoul(w, 0, 3);
    const b = ghoul(w, 1.2, 3);
    expect(castSkill(w, 'overload', null).ok).toBe(true);
    // Twenty lightning hits on one: at 40% the other must catch at least one arc
    for (let i = 0; i < 20; i++) hitEnemy(w, a, { amount: 10, element: 'lightning', canCrit: false, skillId: null, weaponHit: false });
    expect(b.hp).toBeLessThan(100000);
    expect(w.events.some((ev) => ev.type === 'arc')).toBe(true);
  });

  it('wind barrier tears enemy bolts apart before they land', () => {
    const w = setup();
    w.derived.dodge = 0;
    expect(castSkill(w, 'wind_barrier', null).ok).toBe(true);
    const hp = w.player.hp;
    w.spawnProjectile({ owner: 'enemy', shape: 'enemy_bolt', element: 'fire', x: w.px + 5, z: w.pz, dirX: -1, dirZ: 0, speed: 9, radius: 0.25, maxRange: 10, packet: { amount: 50, element: 'fire', canCrit: false, skillId: null, weaponHit: false } });
    run(w, 1.5);
    expect(w.player.hp).toBe(hp);
    expect(w.projectiles.some((p) => p.alive)).toBe(false);
  });

  it('ball lightning drifts slowly and shocks the same enemy again and again', () => {
    const w = setup();
    const e = ghoul(w, 0, 2.5);
    expect(castSkill(w, 'ball_lightning', { x: w.px, z: w.pz + 6 }).ok).toBe(true);
    run(w, 2.5);
    const hits = w.events.filter((ev) => ev.type === 'enemy_hit' && ev.id === e.id).length;
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(w.projectiles.some((p) => p.alive && p.shape === 'orb')).toBe(true);
  });
});

describe('wintercaller', () => {
  const setup = (): World => {
    const w = new World(createPlayer('sorcerer', 'wintercaller'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 1000;
    for (const id of ['ice_lance', 'frostbite', 'frost_step', 'avalanche', 'winters_heart']) w.player.skillRanks[id] = 1;
    return w;
  };
  const ghoul = (w: World, dx: number, dz: number): Enemy => {
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + dx, w.pz + dz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    return e;
  };

  it('ice lance passes through a line of enemies and hits frozen ones twice as hard', () => {
    const w = setup();
    // Straight down the arena's open lane
    const near = ghoul(w, 0, 3);
    const far = ghoul(w, 0, 6);
    far.status.freeze = 5;
    expect(castSkill(w, 'ice_lance', { x: w.px, z: w.pz + 8 }).ok).toBe(true);
    run(w, 1);
    const nearHit = 100000 - near.hp;
    const farHit = 100000 - far.hp;
    expect(nearHit).toBeGreaterThan(0);
    expect(farHit).toBeGreaterThanOrEqual(nearHit * 1.9);
  });

  it('frostbite drains, slows and freezes what stays in the cold', () => {
    const w = setup();
    const e = ghoul(w, 3, 0);
    expect(castSkill(w, 'frostbite', { x: e.x, z: e.z }).ok).toBe(true);
    run(w, 1);
    expect(e.hp).toBeLessThan(100000);
    expect(e.status.slow).toBeGreaterThan(0);
    expect(e.status.freeze).toBe(0);
    run(w, 3);
    expect(w.events.some((ev) => ev.type === 'status' && ev.status === 'frozen' && ev.id === e.id) || e.status.freeze > 0).toBe(true);
  });

  it('avalanche throws enemies back and slows them', () => {
    const w = setup();
    const e = ghoul(w, 0, 3);
    const before = e.z;
    expect(castSkill(w, 'avalanche', { x: w.px, z: w.pz + 5 }).ok).toBe(true);
    expect(e.z).toBeGreaterThan(before + 2);
    expect(e.status.slow).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(100000);
  });

  it('frost step blinks and leaves ice that freezes the first step onto it', () => {
    const w = setup();
    const [px, pz] = [w.px, w.pz];
    expect(castSkill(w, 'frost_step', { x: w.px + 5, z: w.pz }).ok).toBe(true);
    expect(w.dist(px, pz)).toBeGreaterThan(3);
    const patch = w.zones.find((z) => z.type === 'frost_patch')!;
    expect([patch.x, patch.z]).toEqual([px, pz]);
    const e = ghoul(w, px - w.px, pz - w.pz);
    run(w, 0.1);
    expect(e.status.freeze).toBeGreaterThan(0);
  });

  it("winter's heart freezes everything in sight and takes a fifth of its life when it thaws", () => {
    const w = setup();
    const a = ghoul(w, 4, 0);
    const b = ghoul(w, -3, 5);
    expect(castSkill(w, 'winters_heart', null).ok).toBe(true);
    expect(a.status.freeze).toBeGreaterThan(2.5);
    expect(b.status.freeze).toBeGreaterThan(2.5);
    const afterHit = a.hp;
    run(w, 3.2);
    expect(a.status.freeze).toBe(0);
    expect(afterHit - a.hp).toBeGreaterThanOrEqual(100000 * 0.2 - 1);
    expect(w.events.some((ev) => ev.type === 'status' && ev.status === 'shattered')).toBe(true);
  });
});

describe('companions', () => {
  it('the eagle flies at the rogue\'s side and dives on what the rogue hits', () => {
    const w = new World(createPlayer('rogue', null), 7);
    w.travel('arena');
    w.player.level = 20;
    w.player.mana = 500;
    w.player.skillRanks.summon_eagle = 1;
    expect(castSkill(w, 'summon_eagle', null).ok).toBe(true);
    const eagle = w.minions.find((m) => m.kind === 'eagle')!;
    expect(eagle.active).toBe(true);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 4, w.pz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    run(w, 1.5);
    expect(e.hp).toBe(100000); // nothing hit yet
    hitEnemy(w, e, { amount: 1, element: 'physical', canCrit: false, skillId: null, weaponHit: false });
    run(w, 2.5);
    expect(e.hp).toBeLessThan(100000 - 1);
    expect(w.events.some((ev) => ev.type === 'minion_strike' && ev.kind === 'eagle')).toBe(true);
  });

  it('the angel fights whatever has noticed the paladin', () => {
    const w = new World(createPlayer('knight', 'paladin'), 7);
    w.travel('arena');
    w.player.level = 20;
    w.player.mana = 500;
    w.player.skillRanks.summon_angel = 1;
    expect(castSkill(w, 'summon_angel', null).ok).toBe(true);
    expect(w.minions.find((m) => m.kind === 'angel')!.active).toBe(true);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 3, w.pz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    e.aggro = true;
    run(w, 3);
    expect(e.hp).toBeLessThan(100000);
    const b = w.buffs.find((b) => b.id === 'summon_angel')!;
    b.remaining = 0.01;
    run(w, 0.1);
    expect(w.minions.find((m) => m.kind === 'angel')!.active).toBe(false);
  });
});

describe('meat shield', () => {
  it('raises a titan that draws monsters near the hero onto itself and smashes them', () => {
    const w = new World(createPlayer('sorcerer', 'necromancer'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 500;
    w.player.skillRanks.meat_shield = 1;
    expect(castSkill(w, 'meat_shield', null).ok).toBe(true);
    const t = w.titan!;
    expect(t).not.toBeNull();
    expect(t.maxHp).toBe(w.derived.maxHp * 3);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 1.2, w.pz);
    e.hp = 100000;
    e.maxHp = 100000;
    const heroHp = w.player.hp;
    run(w, 4);
    expect(e.taunt).toBeGreaterThan(0);
    // The ghoul hits the titan, not the hero
    expect(w.player.hp).toBe(heroHp);
    expect(t.hp).toBeLessThan(t.maxHp);
    // The titan's blow has landed at least once in four seconds
    expect(e.hp).toBeLessThan(100000);
    // Beaten down, it falls and the buff ends
    w.damageTitan(t.hp + 10, 'physical');
    expect(w.titan).toBeNull();
    expect(w.buffs.some((b) => b.id === 'meat_shield')).toBe(false);
  });
});

describe('arrow of beyond', () => {
  it('raises a daemon behind the hero that looses a great arrow after its delay', () => {
    const w = new World(createPlayer('rogue', 'quiverbound'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.skillRanks.arrow_of_beyond = 1;
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 4, w.pz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    expect(castSkill(w, 'arrow_of_beyond', { x: e.x, z: e.z }).ok).toBe(true);
    const summon = w.zones.find((z) => z.type === 'summon')!;
    expect(summon).toBeDefined();
    expect(summon.x).toBeLessThan(w.px); // behind the hero, away from the target
    expect(w.projectiles.some((p) => p.alive)).toBe(false);
    run(w, 0.75);
    const arrow = w.projectiles.find((p) => p.alive);
    expect(arrow?.shape).toBe('greatarrow');
    run(w, 1.5);
    expect(e.hp).toBeLessThan(100000);
    expect(e.status.bleed).not.toBeNull();
  });
});

describe('arrow storm', () => {
  it('rains a volley on every enemy in sight every half second for ten seconds', () => {
    const w = new World(createPlayer('rogue', 'quiverbound'), 7);
    w.travel('arena');
    w.player.level = 20;
    w.player.skillRanks.arrow_storm = 1;
    const a = w.spawnEnemy(MONSTERS.ghoul!, w.px + 3, w.pz);
    const b = w.spawnEnemy(MONSTERS.ghoul!, w.px - 2, w.pz + 4);
    for (const e of [a, b]) {
      e.speed = 0;
      e.hp = 100000;
      e.maxHp = 100000;
    }
    expect(castSkill(w, 'arrow_storm', null).ok).toBe(true);
    const zone = w.zones.find((z) => z.type === 'arrow_storm')!;
    expect(zone.remaining).toBeCloseTo(10, 1);
    run(w, 1.05);
    const hits = w.events.filter((ev) => ev.type === 'zone_tick' && ev.id === zone.id).length;
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(a.hp).toBeLessThan(100000);
    expect(b.hp).toBeLessThan(100000);
  });
});

describe('trap', () => {
  it('is always set at the hero\'s feet, whatever is aimed at', () => {
    const w = new World(createPlayer('rogue', null), 7);
    w.travel('arena');
    w.player.level = 10;
    w.player.skillRanks.trap = 1;
    expect(castSkill(w, 'trap', { x: w.px + 8, z: w.pz + 3 }).ok).toBe(true);
    const z = w.zones.find((z) => z.type === 'trap')!;
    expect([z.x, z.z]).toEqual([w.px, w.pz]);
  });

  it('the ultimate is thrown where the hero aims', () => {
    const w = new World(createPlayer('rogue', null), 7);
    w.travel('arena');
    w.player.level = 15;
    w.player.skillRanks.trap_ult = 1;
    expect(castSkill(w, 'trap_ult', { x: w.px + 5, z: w.pz + 2 }).ok).toBe(true);
    const z = w.zones.find((z) => z.type === 'trap')!;
    expect(Math.hypot(z.x - (w.px + 5), z.z - (w.pz + 2))).toBeLessThan(0.6);
  });
});

describe('consumables', () => {
  it('holds one dose that refills with time and, for potions, with kills', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    w.player.hp = 1;
    expect(w.useConsumable('hp_potion')).toBe(true);
    expect(w.player.potions.hp_potion).toBe(0);
    expect(w.player.hp).toBeGreaterThan(1);
    expect(w.useConsumable('hp_potion')).toBe(false);
    run(w, 10);
    expect(w.player.potions.hp_potion).toBeCloseTo(0.1, 1);
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 6, w.pz);
    w.killEnemy(e, 0);
    expect(w.player.potions.hp_potion).toBeCloseTo(0.2, 1);
    // The bandage refills twice as fast and takes nothing from kills
    expect(w.useConsumable('bandage')).toBe(true);
    run(w, 10);
    expect(w.player.potions.bandage).toBeCloseTo(0.2, 1);
    const e2 = w.spawnEnemy(MONSTERS.ghoul!, w.px + 6, w.pz);
    w.killEnemy(e2, 0);
    expect(w.player.potions.bandage).toBeCloseTo(0.2, 1);
  });

  it('bandage heals over time and stops bleeding and burning', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    w.player.hp = 10;
    w.pStatus.bleed = { ticks: 10, timer: 0, interval: 0.5, damage: 1 };
    w.pStatus.burn = { ticks: 10, timer: 0, interval: 0.5, damage: 1 };
    expect(w.useConsumable('bandage')).toBe(true);
    expect(w.pStatus.bleed).toBeNull();
    expect(w.pStatus.burn).toBeNull();
    run(w, 4);
    expect(w.player.hp).toBeGreaterThan(10 + w.derived.maxHp * 0.25);
    expect(w.player.hp).toBeLessThan(10 + w.derived.maxHp * 0.6);
  });

  it('incense restores mana over time and clears slow, freeze and poison', () => {
    const w = new World(createPlayer('sorcerer', null), 7);
    w.travel('arena');
    w.player.mana = 0;
    w.pStatus.slow = 3;
    w.pStatus.poison = { ticks: 10, timer: 0, interval: 0.5, damage: 1 };
    expect(w.useConsumable('incense')).toBe(true);
    expect(w.pStatus.slow).toBe(0);
    expect(w.pStatus.poison).toBeNull();
    expect(w.buffs.some((b) => b.id === 'incense')).toBe(false);
    run(w, 4);
    expect(w.player.mana).toBeGreaterThan(w.derived.maxMana * 0.25);
    expect(w.player.mana).toBeLessThan(w.derived.maxMana * 0.6);
  });

  it('poison on the hero ticks into life', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    const hp = w.player.hp;
    w.pStatus.poison = { ticks: 4, timer: 0, interval: 0.5, damage: 2 };
    run(w, 2.5);
    expect(w.player.hp).toBeLessThanOrEqual(hp - 8 + 1);
    expect(w.pStatus.poison).toBeNull();
  });
});

describe('rock solid', () => {
  it('soaks up damage of any element before life is touched', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    w.player.skillRanks.rock_solid = 1;
    expect(castSkill(w, 'rock_solid', null).ok).toBe(true);
    const buff = w.buffs.find((b) => b.id === 'rock_solid')!;
    expect(buff.shield).toBe(w.derived.maxHp);
    const hp = w.player.hp;
    damagePlayer(w, 30, 'poison', null, false);
    damagePlayer(w, 30, 'physical', null, false);
    expect(w.player.hp).toBe(hp);
    expect(buff.shield).toBeLessThan(w.derived.maxHp);
  });

  it('drops a boulder on the hero when the shield breaks', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    w.player.skillRanks.rock_solid = 1;
    w.derived.dodge = 0;
    expect(castSkill(w, 'rock_solid', null).ok).toBe(true);
    const buff = w.buffs.find((b) => b.id === 'rock_solid')!;
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 2, w.pz);
    e.speed = 0;
    e.hp = 5000;
    e.maxHp = 5000;
    expect(w.zones.some((z) => z.type === 'boulder')).toBe(false);
    damagePlayer(w, buff.shield * 50, 'physical', null, false);
    expect(buff.shield).toBe(0);
    const boulder = w.zones.find((z) => z.type === 'boulder');
    expect(boulder && [boulder.x, boulder.z]).toEqual([w.px, w.pz]);
    expect(w.events.some((ev) => ev.type === 'message' && ev.text.includes('shatters'))).toBe(true);
    run(w, 1.2);
    expect(e.hp).toBeLessThan(5000);
  });
});

describe('shield bash', () => {
  it('raises a holy shield over the target', () => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 1, w.pz);
    e.speed = 0;
    w.events.length = 0;
    w.player.skillRanks.shield_bash = 1;
    expect(castSkill(w, 'shield_bash', null).ok).toBe(true);
    expect(w.events.some((ev) => ev.type === 'melee_impact' && ev.visual === 'holy_shield')).toBe(true);
    expect(e.status.stun).toBeGreaterThan(0);
  });
});

describe('shift-click attack in place', () => {
  it('a melee hero stands still, faces the point and hits what is in reach that way', () => {
    const w = new World(createPlayer('knight', 'titan'), 121);
    w.travel('arena');
    const near = w.spawnEnemy(MONSTERS.ghoul!, w.px + 1, w.pz);
    near.speed = 0;
    const hp = near.hp;
    const [px, pz] = [w.px, w.pz];
    expect(w.attackAt(w.px + 3, w.pz)).toBe(true);
    expect(near.hp).toBeLessThan(hp);
    expect(w.targetId).toBe(-1);
    run(w, 1);
    expect(w.px).toBeCloseTo(px, 3);
    expect(w.pz).toBeCloseTo(pz, 3);
    // Nothing that way: a swing at air, still no walking
    w.attackTimer = 0;
    w.events.length = 0;
    expect(w.attackAt(w.px, w.pz - 3)).toBe(true);
    expect(w.events.some((ev) => ev.type === 'melee_swing')).toBe(true);
    run(w, 1);
    expect(w.px).toBeCloseTo(px, 3);
    expect(w.targetId).toBe(-1);
  });

  it('a ranged hero shoots along the line without moving', () => {
    const w = new World(createPlayer('rogue', 'quiverbound'), 122);
    w.travel('arena');
    const [px, pz] = [w.px, w.pz];
    expect(w.attackAt(w.px + 5, w.pz)).toBe(true);
    const shot = w.projectiles.find((p) => p.alive && p.owner === 'player');
    expect(shot).toBeTruthy();
    expect(shot!.vx).toBeGreaterThan(0);
    expect(Math.abs(shot!.vz)).toBeLessThan(1e-6);
    run(w, 1);
    expect(w.px).toBeCloseTo(px, 3);
    expect(w.pz).toBeCloseTo(pz, 3);
  });
});

describe('item procs', () => {
  it('Cry of the Weak fires on about half of weapon hits and strikes everything within 60 px of the enemy hit', () => {
    const w = new World(createPlayer('knight', 'titan'), 111);
    w.travel('arena');
    const amulet = makeItem(baseItem('weak_amulet'), 'divine', 100, null);
    expect(w.player.equipment.equip(amulet, 100).ok).toBe(true);
    w.recomputeStats();
    expect(w.derived.procs).toEqual([{ id: 'cry_of_the_weak', chance: 50 }]);
    const target = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 1, w.pz);
    const near = w.spawnEnemy(MONSTERS.ice_golem!, w.px, w.pz + 1.2); // 50 px from the target
    const far = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 4, w.pz); // 96 px from the target
    const behind = w.spawnEnemy(MONSTERS.ice_golem!, w.px - 2.5, w.pz); // 80 px from the hero, 112 from the target
    const behindHp = behind.hp;
    const nearHp = near.hp;
    const farHp = far.hp;
    let fired = 0;
    for (let i = 0; i < 400; i++) {
      target.hp = 100000;
      near.hp = nearHp;
      w.events.length = 0;
      hitEnemy(w, target, { amount: 10, element: 'physical', canCrit: false, skillId: null, weaponHit: true });
      const aoe = w.events.filter((ev) => ev.type === 'aoe');
      if (aoe.length) {
        fired++;
        expect(aoe.length).toBe(1);
        expect(near.hp).toBe(nearHp - 10);
        expect(target.hp).toBe(100000 - 20); // the target is at the centre, so it takes the blow and the cry
      } else {
        expect(near.hp).toBe(nearHp);
      }
    }
    expect(fired).toBeGreaterThan(150);
    expect(fired).toBeLessThan(250);
    expect(far.hp).toBe(farHp);
    // Centred on the enemy hit, not the hero: the one behind the hero is untouched
    expect(behind.hp).toBe(behindHp);
  });
});

describe('set drops', () => {
  it('set pieces drop only in the zones their set names', () => {
    const early = new World(createPlayer('knight', 'titan'), 101);
    early.travel('arena', 'proving_grounds');
    const late = new World(createPlayer('knight', 'titan'), 101);
    late.travel('arena', 'ember_foundry');
    const drops = (w: World) => {
      let sets = 0;
      for (let i = 0; i < 600; i++) {
        const e = w.spawnEnemy(MONSTERS.ice_golem!, w.px + 12, w.pz); // 70% drop chance
        w.killEnemy(e, 0);
        sets += w.drops.filter((d) => d.alive && d.item?.rarity === 'set').length;
        for (const d of w.drops) d.alive = false;
      }
      return sets;
    };
    const a = drops(early);
    expect(a).toBeGreaterThan(2);
    expect(a).toBeLessThan(30);
    expect(drops(late)).toBe(0);
  });
});

describe('rogue shields', () => {
  it('a rogue carries no shield until sworn an Impaler, but offhands are fine', () => {
    const w = new World(createPlayer('rogue', null), 91);
    const shield = makeItem(baseItem('iron_shield'), 'common', 1, null);
    const skull = makeItem(baseItem('skull'), 'common', 1, null);
    w.player.inventory.add(shield);
    w.player.inventory.add(skull);
    w.equipItem(w.player.inventory.items.find((i) => i.name === 'Dagger')!);
    const r = w.equipItem(shield);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('carry no shield');
    expect(w.equipItem(skull).ok).toBe(true);
    w.player.pledgeId = 'impaler';
    expect(w.equipItem(shield).ok).toBe(true);
    expect(w.player.equipment.get('shield')).toBe(shield);
    const silver = new World(createPlayer('rogue', 'silverblade'), 92);
    silver.player.inventory.add(shield);
    expect(silver.equipItem(shield).ok).toBe(false);
  });
});

describe('picking up loot', () => {
  it('gold is walked over but an item waits for the action key', () => {
    const w = new World(createPlayer('knight', 'titan'), 81);
    w.travel('arena');
    const gold = w.player.gold;
    const sword = makeItem(baseItem('sword'), 'common', 1, null);
    w.addDrop(w.px, w.pz, null, 12);
    w.addDrop(w.px, w.pz, sword, 0);
    run(w, 2);
    expect(w.player.gold).toBe(gold + 12);
    expect(w.player.inventory.has(sword)).toBe(false);
    expect(w.nextAction()).toEqual({ drop: w.drops[0] });
    expect(w.interactNearby()).toBe(true);
    expect(w.player.inventory.has(sword)).toBe(true);
    expect(w.drops.length).toBe(0);
    expect(w.interactNearby()).toBe(false);
  });

  it('a filtered rarity is invisible to the hero, the crab and the label click', () => {
    const w = new World(createPlayer('knight', 'titan'), 82);
    w.travel('arena');
    w.setLootFilter(['common']);
    const plain = makeItem(baseItem('sword'), 'common', 1, null);
    const blue = makeItem(baseItem('sword'), 'magic', 1, null);
    w.addDrop(w.px, w.pz, plain, 0);
    w.addDrop(w.px + 0.2, w.pz, blue, 0);
    const [d1, d2] = w.drops;
    expect(w.dropVisible(d1!)).toBe(false);
    expect(w.dropVisible(d2!)).toBe(true);
    w.pickup(d1!.id);
    run(w, 1);
    expect(w.player.inventory.has(plain)).toBe(false);
    expect(w.interactNearby()).toBe(true);
    expect(w.player.inventory.has(blue)).toBe(true);
    expect(w.interactNearby()).toBe(false);
    w.togglePet(true);
    run(w, 6);
    expect(w.player.inventory.has(plain)).toBe(false);
    w.setLootFilter([]);
    expect(w.interactNearby()).toBe(true);
    expect(w.player.inventory.has(plain)).toBe(true);
  });
});

describe('item find', () => {
  it('scales how often a kill drops an item, with magic find left to the rarity', () => {
    const drops = (itemFind: number, seed: number) => {
      const w = new World(createPlayer('knight', 'titan'), seed);
      w.travel('arena');
      w.devStats.itemFind = itemFind;
      w.recomputeStats();
      let items = 0;
      for (let i = 0; i < 400; i++) {
        const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + 12, w.pz); // 22% drop chance
        w.killEnemy(e, 0);
        items += w.drops.filter((d) => d.alive && d.item).length;
        for (const d of w.drops) d.alive = false;
      }
      return items;
    };
    const plain = drops(0, 71);
    const lucky = drops(200, 71);
    expect(plain).toBeGreaterThan(50);
    expect(plain).toBeLessThan(130);
    expect(lucky).toBeGreaterThan(plain * 2);
  });
});

describe('pet', () => {
  it('the dev crab fetches loot within 300 px of the hero and leaves the rest', () => {
    const w = new World(createPlayer('knight', 'titan'), 61);
    w.travel('arena');
    w.togglePet(true);
    const gold = w.player.gold;
    w.addDrop(w.px + 6, w.pz, null, 25); // 192 px away
    w.addDrop(w.px + 12, w.pz, null, 40); // 384 px away
    run(w, 6);
    expect(w.player.gold).toBe(gold + 25);
    expect(w.drops.filter((d) => d.alive).length).toBe(1);
    // It heels near the hero when there is nothing to fetch
    expect(w.dist(w.pet.x, w.pet.z)).toBeLessThan(2.5);
    w.togglePet(false);
    run(w, 1);
    expect(w.drops.filter((d) => d.alive).length).toBe(1);
  });
});

describe('messages', () => {
  it('drops a repeated line within half a second so a held button cannot flood the log', () => {
    const w = new World(createPlayer('sorcerer', null), 51);
    w.travel('arena'); // town would refill the mana at once
    w.player.mana = 0;
    const id = skillsFor(w.player.classId, null)[0]!.id;
    w.player.skillRanks[id] = 1;
    const seen: string[] = [];
    const drain = () => { for (const ev of w.events) if (ev.type === 'message') seen.push(ev.text); w.events.length = 0; };
    for (let i = 0; i < 10; i++) { w.castSkillId(id, null); run(w, 0.05); }
    drain();
    expect(seen.filter((t) => t === 'Not enough mana').length).toBeLessThanOrEqual(2);
    run(w, 0.6);
    w.castSkillId(id, null);
    drain();
    expect(seen.filter((t) => t === 'Not enough mana').length).toBeGreaterThanOrEqual(2);
  });
});

describe('aggro', () => {
  it('monsters ignore the hero beyond 300 px and chase once inside it', () => {
    const w = new World(createPlayer('knight', 'titan'), 31);
    w.travel('arena');
    const far = w.spawnEnemy(MONSTERS.ghoul!, w.px + 14, w.pz); // 448 px away
    const fx = far.x;
    run(w, 2);
    expect(far.x).toBeCloseTo(fx, 3);
    expect(far.aggro).toBe(false);
    const near = w.spawnEnemy(MONSTERS.ghoul!, w.px + 8, w.pz); // 256 px away
    const nx = near.x;
    run(w, 2);
    expect(near.aggro).toBe(true);
    expect(near.x).toBeLessThan(nx);
  });

  it('a hit wakes a monster wherever it stands', () => {
    const w = new World(createPlayer('knight', 'titan'), 32);
    w.travel('arena');
    const far = w.spawnEnemy(MONSTERS.ghoul!, w.px + 14, w.pz);
    hitEnemy(w, far, { amount: 1, element: 'physical', canCrit: false, skillId: null, weaponHit: false });
    expect(far.aggro).toBe(true);
  });

  it('a hit also wakes every monster within 100 px of the one hit', () => {
    const w = new World(createPlayer('knight', 'titan'), 33);
    w.travel('arena');
    const hit = w.spawnEnemy(MONSTERS.ghoul!, w.px + 14, w.pz);
    const near = w.spawnEnemy(MONSTERS.ghoul!, hit.x + 2.5, hit.z); // 80 px from the one hit
    const far = w.spawnEnemy(MONSTERS.ghoul!, hit.x + 4, hit.z); // 128 px from it
    hitEnemy(w, hit, { amount: 1, element: 'physical', canCrit: false, skillId: null, weaponHit: false });
    expect(near.aggro).toBe(true);
    expect(far.aggro).toBe(false);
  });
});

describe('touch attack button', () => {
  it('targets the nearest enemy in sight and walks to it while the joystick is idle', () => {
    const w = new World(createPlayer('knight', 'titan'), 21);
    w.travel('arena');
    // A clear lane so the skeleton is in sight
    for (let c = Math.floor(w.px) - 1; c <= Math.floor(w.px) + 8; c++) for (let r = Math.floor(w.pz) - 1; r <= Math.floor(w.pz) + 1; r++) w.map.set(c, r, 1);
    const far = w.spawnEnemy(MONSTERS.skeleton!, w.px + 6, w.pz);
    far.speed = 0;
    const startX = w.px;
    expect(w.attackOnce()).toBe(false);
    expect(w.targetId).toBe(far.id);
    run(w, 1);
    expect(w.px).toBeGreaterThan(startX + 1); // walked toward it
    // The joystick cancels the target, so steering always wins
    w.setMoveInput(0, 1);
    expect(w.targetId).toBe(-1);
    w.setMoveInput(0, 0);
    far.alive = false;
  });

  it('cannot hit through a wall even in reach, and neither can the monster', () => {
    const w = new World(createPlayer('rogue', 'impaler'), 23);
    w.travel('arena');
    // Box the hero in so nobody can walk round: walls on every neighbouring tile
    const hc = Math.floor(w.px);
    const hr = Math.floor(w.pz);
    w.px = hc + 0.5;
    w.pz = hr + 0.5;
    for (let r = hr - 1; r <= hr + 1; r++) for (let c = hc - 1; c <= hc + 1; c++) if (c !== hc || r !== hr) w.map.set(c, r, 0);
    // A skeleton just past the east wall, well inside bow range but out of sight
    const e = w.spawnEnemy(MONSTERS.skeleton!, hc + 2.6, hr + 0.5);
    e.speed = 0;
    e.aggro = true;
    w.setTarget(e.id);
    w.attackHeld = true;
    const hp = w.player.hp;
    run(w, 3);
    expect(e.hp).toBe(e.maxHp);
    expect(w.player.hp).toBe(hp);
    expect(w.attackOnce()).toBe(false);
    // Open the wall between them and the arrows fly
    w.map.set(hc + 1, hr, 1);
    run(w, 2);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('never picks an enemy behind a wall', () => {
    const w = new World(createPlayer('knight', 'titan'), 22);
    w.travel('arena');
    const c = Math.floor(w.px) + 2;
    for (let r = Math.floor(w.pz) - 2; r <= Math.floor(w.pz) + 2; r++) w.map.set(c, r, 0);
    const hidden = w.spawnEnemy(MONSTERS.skeleton!, w.px + 3.5, w.pz);
    hidden.speed = 0;
    for (let r = Math.floor(w.pz); r <= Math.floor(w.pz) + 5; r++) w.map.set(Math.floor(w.px), r, 1);
    const seen = w.spawnEnemy(MONSTERS.skeleton!, w.px, w.pz + 4);
    seen.speed = 0;
    expect(w.nearestEnemy(w.px, w.pz, 12)?.id).toBe(seen.id);
    w.attackOnce();
    expect(w.targetId).toBe(seen.id);
  });

  it('one tap is one swing at something in reach', () => {
    const w = new World(createPlayer('knight', 'titan'), 21);
    w.travel('arena');
    const startX = w.px;
    const near = w.spawnEnemy(MONSTERS.skeleton!, w.px + 1.2, w.pz);
    near.speed = 0;
    near.maxHp = near.hp = 500; // sturdy enough to survive the swings, so the pool never recycles it mid-test
    expect(w.attackOnce()).toBe(true);
    const hp = near.hp;
    expect(hp).toBeLessThan(near.maxHp);
    run(w, 2);
    expect(near.hp).toBe(hp); // a tap does not keep attacking
    w.attackHeld = true;
    run(w, 3);
    expect(near.hp < hp || near.dead).toBe(true); // holding does
    expect(w.px).toBeCloseTo(startX, 3);
  });
});

describe('paladin', () => {
  const setup = (): World => {
    const w = new World(createPlayer('knight', 'paladin'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 1000;
    for (const id of ['consecrated_blade', 'judgement', 'blind', 'divine_shield', 'retribution']) w.player.skillRanks[id] = 1;
    return w;
  };
  const spawn = (w: World, id: string, dx: number, dz: number): Enemy => {
    const e = w.spawnEnemy(MONSTERS[id]!, w.px + dx, w.pz + dz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    return e;
  };
  const plain = (): DamagePacket => ({ amount: 100, element: 'physical', canCrit: false, skillId: 'x', weaponHit: true });

  it('consecrated blade adds holy damage to every hit, twice as much against the undead', () => {
    const w = setup();
    const ghoul = spawn(w, 'ghoul', 0, 2);
    const rat = spawn(w, 'plague_rat', 1, 2);
    expect(castSkill(w, 'consecrated_blade', null).ok).toBe(true);
    expect(hitEnemy(w, rat, plain())).toBe(130);
    expect(hitEnemy(w, ghoul, plain())).toBe(160);
  });

  it('judgement marks one enemy so it takes half again from everything', () => {
    const w = setup();
    const e = spawn(w, 'ghoul', 0, 4);
    expect(castSkill(w, 'judgement', { x: e.x, z: e.z }).ok).toBe(true);
    expect(e.status.mark).not.toBeNull();
    expect(hitEnemy(w, e, plain())).toBe(150);
    run(w, 7);
    expect(e.status.mark).toBeNull();
  });

  it('blind throws the cone back and blinded monsters swing wide', () => {
    const w = setup();
    w.derived.dodge = 0;
    const e = spawn(w, 'plague_rat', 0, 1.2);
    const before = e.z;
    expect(castSkill(w, 'blind', { x: w.px, z: w.pz + 3 }).ok).toBe(true);
    expect(e.status.blind).toBeGreaterThan(0);
    expect(e.z).toBeGreaterThan(before + 1);
    // Back in reach and swinging for two seconds: nothing lands
    e.z = w.pz + 0.9;
    const hp = w.player.hp;
    run(w, 2);
    expect(w.player.hp).toBe(hp);
    expect(w.events.some((ev) => ev.type === 'damage' && ev.kind === 'miss')).toBe(true);
  });

  it('blind hits the undead three times as hard', () => {
    const w = setup();
    const ghoul = spawn(w, 'ghoul', -0.6, 1.5);
    const rat = spawn(w, 'plague_rat', 0.6, 1.5);
    expect(castSkill(w, 'blind', { x: w.px, z: w.pz + 3 }).ok).toBe(true);
    const g = 100000 - ghoul.hp;
    const r = 100000 - rat.hp;
    expect(r).toBeGreaterThan(0);
    expect(g).toBeGreaterThanOrEqual(r * 2.9);
  });

  it('divine shield makes the hero untouchable, then weak', () => {
    const w = setup();
    w.derived.dodge = 0;
    expect(castSkill(w, 'divine_shield', null).ok).toBe(true);
    const hp = w.player.hp;
    damagePlayer(w, 500, 'fire', null, false);
    expect(w.player.hp).toBe(hp);
    expect(w.events.some((ev) => ev.type === 'damage' && ev.kind === 'immune')).toBe(true);
    run(w, 3.2);
    expect(w.buffs.some((b) => b.id === 'divine_shield')).toBe(false);
    const weak = w.buffs.find((b) => b.id === 'weakened');
    expect(weak).toBeDefined();
    damagePlayer(w, 100, 'fire', null, false);
    const res = w.derived.res.fire;
    expect(hp - w.player.hp).toBe(Math.round(Math.round(100 * (1 - res / 100)) * 1.2));
  });

  it('retribution strikes back with light at whatever hits the hero', () => {
    const w = setup();
    w.derived.dodge = 0;
    w.derived.block = 0;
    const e = spawn(w, 'plague_rat', 0, 2);
    expect(castSkill(w, 'retribution', null).ok).toBe(true);
    damagePlayer(w, 40, 'physical', e, true);
    expect(100000 - e.hp).toBe(120);
    expect(w.events.some((ev) => ev.type === 'holy_bolt')).toBe(true);
  });
});

describe('titan', () => {
  const setup = (): World => {
    const w = new World(createPlayer('knight', 'titan'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 1000;
    for (const id of ['earthen_spikes', 'quicksand', 'seismic_slam', 'rockfall', 'earthquake']) w.player.skillRanks[id] = 1;
    return w;
  };
  const ghoul = (w: World, dx: number, dz: number): Enemy => {
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + dx, w.pz + dz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    return e;
  };

  it('earthen spikes run out along a line, reaching the far monster after the near one', () => {
    const w = setup();
    const near = ghoul(w, 0, 1.5);
    const far = ghoul(w, 0, 5);
    const aside = ghoul(w, 3, 3);
    expect(castSkill(w, 'earthen_spikes', { x: w.px, z: w.pz + 6 }).ok).toBe(true);
    run(w, 0.1);
    expect(near.hp).toBeLessThan(100000);
    expect(far.hp).toBe(100000);
    expect(near.status.stun).toBeGreaterThan(0);
    run(w, 0.4);
    expect(far.hp).toBeLessThan(100000);
    expect(aside.hp).toBe(100000);
  });

  it('quicksand slows what stands in it and bites harder the longer it stays', () => {
    const w = setup();
    const e = ghoul(w, 0, 4);
    expect(castSkill(w, 'quicksand', { x: e.x, z: e.z }).ok).toBe(true);
    run(w, 0.6);
    const first = 100000 - e.hp;
    expect(first).toBeGreaterThan(0);
    expect(e.status.slow).toBeGreaterThan(0);
    expect(e.status.sink).toBeGreaterThan(0);
    const hpBefore = e.hp;
    run(w, 3);
    const lastTicks = hpBefore - e.hp;
    // Six more ticks, each heavier than the first
    expect(lastTicks).toBeGreaterThan(first * 6);
  });

  it('seismic slam throws the line back and stuns it', () => {
    const w = setup();
    const e = ghoul(w, 0, 2);
    const before = e.z;
    expect(castSkill(w, 'seismic_slam', { x: w.px, z: w.pz + 6 }).ok).toBe(true);
    run(w, 0.3);
    expect(e.hp).toBeLessThan(100000);
    expect(e.status.stun).toBeGreaterThan(1);
    expect(e.z).toBeGreaterThan(before + 0.5);
  });

  it('rockfall drops stones over the area for five seconds', () => {
    const w = setup();
    const list = [ghoul(w, 0, 4), ghoul(w, 1, 5), ghoul(w, -1, 3), ghoul(w, 0.5, 3.5)];
    expect(castSkill(w, 'rockfall', { x: w.px, z: w.pz + 4 }).ok).toBe(true);
    run(w, 1);
    expect(w.zones.some((z) => z.type === 'boulder')).toBe(true);
    run(w, 5);
    expect(list.some((e) => e.hp < 100000)).toBe(true);
    expect(w.events.filter((ev) => ev.type === 'aoe' && ev.visual === 'rock').length).toBeGreaterThanOrEqual(8);
  });

  it('earthquake hurts everything in sight each second and crushes what stands against a wall', () => {
    const w = setup();
    const open = ghoul(w, 0, 3);
    // Walk east until the wall, and stand a monster right against it
    let wx = w.px;
    while (!w.map.circleBlocked(wx + 0.5, w.pz, 0.4) && wx < w.px + 20) wx += 0.25;
    const wall = ghoul(w, wx - w.px, 0);
    expect(castSkill(w, 'earthquake', null).ok).toBe(true);
    run(w, 1.05);
    const a = 100000 - open.hp;
    const b = 100000 - wall.hp;
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(Math.round(a * 1.5));
    expect(open.status.shock).toBeGreaterThan(0);
    run(w, 3);
    expect(100000 - open.hp).toBeGreaterThanOrEqual(a * 4);
  });
});

describe('nightlord', () => {
  const setup = (): World => {
    const w = new World(createPlayer('knight', 'nightlord'), 7);
    w.travel('arena');
    w.player.level = 25;
    w.player.mana = 1000;
    for (const id of ['shadow_step', 'shade_army', 'exsanguinate', 'blood_puppet', 'void_rift']) w.player.skillRanks[id] = 1;
    return w;
  };
  const ghoul = (w: World, dx: number, dz: number): Enemy => {
    const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + dx, w.pz + dz);
    e.speed = 0;
    e.hp = 100000;
    e.maxHp = 100000;
    return e;
  };

  it('shadow step moves the hero to the spot and strikes everything there', () => {
    const w = setup();
    const e = ghoul(w, 0.8, 5);
    const far = ghoul(w, -3, 1);
    const from = w.pz;
    expect(castSkill(w, 'shadow_step', { x: w.px, z: w.pz + 5 }).ok).toBe(true);
    expect(w.pz).toBeGreaterThan(from + 4);
    expect(e.hp).toBeLessThan(100000);
    expect(far.hp).toBe(100000);
  });

  it('shade army mirrors every blow three times over', () => {
    const w = setup();
    const e = ghoul(w, 0, 2);
    expect(castSkill(w, 'shade_army', null).ok).toBe(true);
    hitEnemy(w, e, { amount: 100, element: 'physical', canCrit: false, skillId: 'x', weaponHit: true });
    expect(100000 - e.hp).toBe(205);
    expect(w.events.filter((ev) => ev.type === 'melee_impact' && ev.visual === 'shade').length).toBe(3);
  });

  it('exsanguinate empties every wound at once and feeds the hero', () => {
    const w = setup();
    const a = ghoul(w, 0, 2);
    const b = ghoul(w, 2, 2);
    const whole = ghoul(w, -2, 2);
    a.status.bleed = { ticks: 10, timer: 0, interval: 0.5, damage: 20 };
    b.status.bleed = { ticks: 4, timer: 0, interval: 0.5, damage: 50 };
    w.player.hp = 100;
    expect(castSkill(w, 'exsanguinate', null).ok).toBe(true);
    expect(100000 - a.hp).toBe(200);
    expect(100000 - b.hp).toBe(200);
    expect(whole.hp).toBe(100000);
    expect(a.status.bleed).toBeNull();
    expect(w.player.hp).toBe(200);
  });

  it('blood puppet turns a monster on its neighbours and kills it when the time is up', () => {
    const w = setup();
    const puppet = ghoul(w, 0, 3);
    puppet.speed = 60;
    const victim = ghoul(w, 1.2, 3);
    expect(castSkill(w, 'blood_puppet', { x: puppet.x, z: puppet.z }).ok).toBe(true);
    expect(puppet.status.puppet).toBeGreaterThan(0);
    const hp = w.player.hp;
    run(w, 3);
    expect(victim.hp).toBeLessThan(100000);
    expect(w.player.hp).toBe(hp);
    run(w, 3.5);
    expect(puppet.dead).toBe(true);
  });

  it('void rift drags monsters in and tears at what it holds', () => {
    const w = setup();
    const e = ghoul(w, 2.5, 4);
    expect(castSkill(w, 'void_rift', { x: w.px, z: w.pz + 4 }).ok).toBe(true);
    run(w, 1);
    expect(Math.hypot(e.x - w.px, e.z - (w.pz + 4))).toBeLessThan(1.2);
    run(w, 2);
    expect(e.hp).toBeLessThan(100000);
  });
});
