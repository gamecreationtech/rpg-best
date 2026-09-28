import { describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_RULES } from '../data/monsters';
import { ZONES } from '../data/zones';
import { SKILLS, skillsFor } from '../data/skills';
import { makeItem, makeStarterItem } from './items/item';
import { baseItem } from '../data/items';
import { damagePlayer, hitEnemy } from './combat';
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
      const spawn = () => {
        for (const e of w.enemies) e.alive = false;
        w.playerDead = false;
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
    expect(Object.keys(SKILLS).length).toBe(53);
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
