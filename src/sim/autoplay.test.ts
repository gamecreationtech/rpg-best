import { describe, expect, it } from 'vitest';
import { MONSTERS, MONSTER_RULES } from '../data/monsters';
import { Autoplay } from './autoplay';
import { createPlayer } from './player';
import { SIM_DT, World } from './world';

describe('autoplay', () => {
  it('a level 10 knight left to itself in the Proving Grounds hunts, casts and wins', () => {
    MONSTER_RULES.firstWave = 1;
    try {
      const w = new World(createPlayer('knight', null), 3);
      for (let i = 1; i < 10; i++) w.devLevelUp();
      w.player.skillRanks.heavy_strike = 3;
      w.player.slots[1] = 'heavy_strike';
      w.recomputeStats();
      w.player.hp = w.derived.maxHp;
      w.travel('arena', 'proving_grounds');
      const bot = new Autoplay();
      for (let t = 0; t < 120 && !w.playerDead; t += SIM_DT) {
        bot.step(w, SIM_DT);
        w.step(SIM_DT);
      }
      expect(w.playerDead).toBe(false);
      expect(w.player.kills).toBeGreaterThanOrEqual(10);
      expect(w.events.some((ev) => ev.type === 'cast' && ev.skillId === 'heavy_strike')).toBe(true);
      // It walked: not still standing where it arrived
      expect(Math.hypot(w.px - w.arena!.spawn.x, w.pz - w.arena!.spawn.z)).toBeGreaterThan(3);
    } finally {
      MONSTER_RULES.firstWave = 0;
    }
  });

  it('a surrounded archer keeps shooting instead of shuffling about', () => {
    const w = new World(createPlayer('rogue', null), 3);
    for (let i = 1; i < 10; i++) w.devLevelUp();
    w.recomputeStats();
    w.player.hp = w.derived.maxHp;
    w.travel('arena', 'proving_grounds');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const e = w.spawnEnemy(MONSTERS.ghoul!, w.px + dx!, w.pz + dz!);
      e.speed = 0;
      e.hp = e.maxHp = 100000;
      e.damage = 1;
    }
    const bot = new Autoplay();
    for (let t = 0; t < 10; t += SIM_DT) {
      bot.step(w, SIM_DT);
      w.step(SIM_DT);
    }
    const shots = w.events.filter((ev) => ev.type === 'player_attack').length;
    expect(shots).toBeGreaterThanOrEqual(8);
    expect(w.playerDead).toBe(false);
  });
});
