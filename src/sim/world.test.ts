import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_ENEMIES } from '../data/placeholderEnemies';
import { SKILLS, skillsFor } from '../data/skills';
import { makeStarterItem } from './items/item';
import { damagePlayer } from './combat';
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
    const e = w.spawnEnemy(PLACEHOLDER_ENEMIES[0]!, w.px + 3, w.pz);
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
    const e = w.spawnEnemy(PLACEHOLDER_ENEMIES[0]!, w.px + 6, w.pz);
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
          const e = w.spawnEnemy(PLACEHOLDER_ENEMIES[i % 2]!, w.px + 2 + i * 0.8, w.pz + (i % 2 ? 0.7 : -0.7));
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
    const e = w.spawnEnemy(PLACEHOLDER_ENEMIES[3]!, w.px + 0.8, w.pz);
    e.attackTimer = 0;
    run(w, 3);
    expect(w.playerDead).toBe(true);
    w.respawn();
    expect(w.area).toBe('town');
    expect(w.player.hp).toBe(w.derived.maxHp);
  });
});

describe('touch attack button', () => {
  it('one tap is one swing at something in reach and never walks', () => {
    const w = new World(createPlayer('knight', 'titan'), 21);
    w.travel('arena');
    const far = w.spawnEnemy(PLACEHOLDER_ENEMIES[1]!, w.px + 6, w.pz);
    far.speed = 0;
    const startX = w.px;
    expect(w.attackOnce()).toBe(false);
    run(w, 1);
    expect(w.px).toBeCloseTo(startX, 3);
    expect(w.targetId).toBe(-1);
    const near = w.spawnEnemy(PLACEHOLDER_ENEMIES[1]!, w.px + 1.2, w.pz);
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
