/**
 * Leveling pace check: `npm run balance`.
 *
 * Runs each class through every zone at the zone's level for four minutes of
 * simulated fighting, with magic gear of that level, potions under 40% life
 * and a player-like routine (walk to the next pack, target the nearest
 * monster, ranged heroes step back from melee at their feet). Prints kills
 * and experience per minute and how long a level would take, and fails if a
 * hero dies or a level would take under a minute or over half an hour. Run
 * it after changing monsters, zones, items or the level curve.
 */
import { expect, it } from 'vitest';
import { LEVELING, xpForLevel } from '../src/data/classes';
import { ZONES } from '../src/data/zones';
import { baseItem } from '../src/data/items';
import { makeItem } from '../src/sim/items/item';
import { allocateStat, createPlayer } from '../src/sim/player';
import type { Enemy } from '../src/sim/types';
import { SIM_DT, World } from '../src/sim/world';

function run(w: World, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) w.step(SIM_DT);
}

it('every class levels at a sane pace in every zone', () => {
  const out: string[] = [];
  const problems: string[] = [];
  for (const zone of ZONES) {
    for (const cls of ['knight', 'rogue', 'sorcerer'] as const) {
      const level = Math.min(LEVELING.maxLevel, Math.max(1, zone.level));
      const pledge = level >= 20 ? (cls === 'knight' ? 'paladin' : cls === 'rogue' ? 'impaler' : 'wintercaller') : null;
      const w = new World(createPlayer(cls, pledge), 7);
      for (let i = 1; i < level; i++) w.devLevelUp();
      const main = cls === 'knight' ? 'str' : cls === 'rogue' ? 'dex' : 'int';
      let n = 0;
      while (allocateStat(w.player, n++ % 3 === 2 ? 'vit' : main)) { /* spend */ }
      const weapon = cls === 'knight' ? 'sword' : cls === 'rogue' ? 'bow' : 'staff';
      for (const id of [weapon, 'chest_armor', 'helmet', 'gauntlets', 'boots', 'belt', 'ring', 'amulet']) w.equipItem(makeItem(baseItem(id), level > 1 ? 'magic' : 'common', level, w.rng));
      if (cls === 'knight') w.equipItem(makeItem(baseItem('iron_shield'), 'magic', level, w.rng));
      w.recomputeStats();
      w.player.hp = w.derived.maxHp;
      const orig = w.gainXp.bind(w);
      let xpSum = 0;
      w.gainXp = (a: number) => { xpSum += a; orig(a); };
      w.travel('arena', zone.id);
      const secs = 240;
      let t = 0;
      let deaths = 0;
      // The map is peopled on arrival, so the nearest monster can flip between packs on either side of a wall every
      // half second; a player commits to one pack and walks to it, and gives up on one it cannot get closer to
      let chase: Enemy | null = null;
      const avoid = new Set<number>();
      let lastX = w.px;
      let lastZ = w.pz;
      let stuck = 0;
      for (; t < secs; t += 0.5) {
        const alive = w.enemies.filter((e) => e.alive && !e.dead && e.def && !avoid.has(e.id));
        alive.sort((a, b) => Math.hypot(a.x - w.px, a.z - w.pz) - Math.hypot(b.x - w.px, b.z - w.pz));
        const near = alive[0];
        // Ranged heroes step back from a melee monster at their feet, as a player would
        const threat = cls !== 'knight' ? alive.find((e) => e.def!.ai === 'melee' && w.dist(e.x, e.z) < 1.4) : undefined;
        if (threat) {
          const dx = w.px - threat.x;
          const dz = w.pz - threat.z;
          const len = Math.hypot(dx, dz) || 1;
          w.setMoveInput(dx / len, dz / len);
          run(w, 0.25);
          w.setMoveInput(0, 0);
          if (near) w.setTarget(near.id);
          run(w, 0.25);
        } else {
          if (w.targetId < 0 || w.enemies[w.targetId]!.dead) {
            if (!chase || !chase.alive || chase.dead || avoid.has(chase.id)) chase = near ?? null;
            if (chase) {
              if (w.dist(chase.x, chase.z) < 12) {
                w.setTarget(chase.id);
                chase = null;
              } else {
                w.moveTo(chase.x, chase.z); // walk toward the next pack like a player clicking the ground
                stuck = Math.hypot(w.px - lastX, w.pz - lastZ) < 0.3 ? stuck + 0.5 : 0;
                if (stuck >= 3) {
                  avoid.add(chase.id);
                  chase = null;
                  stuck = 0;
                }
              }
            }
          }
          lastX = w.px;
          lastZ = w.pz;
          run(w, 0.5);
        }
        if (w.player.hp < w.derived.maxHp * 0.4) w.useConsumable('hp_potion');
        if (w.playerDead) { deaths++; break; }
      }
      const perMin = xpSum / (t / 60);
      const minutesPerLevel = xpForLevel(level) / Math.max(1, perMin);
      problems.push(...(deaths ? [`${cls} died in ${zone.id}`] : []), ...(minutesPerLevel <= 0.5 || minutesPerLevel >= 30 ? [`${cls} in ${zone.id}: ${minutesPerLevel.toFixed(1)} min per level`] : []));
      out.push(`${zone.id.padEnd(22)} L${String(level).padEnd(3)} ${cls.padEnd(8)} kills/min ${(w.player.kills / (t / 60)).toFixed(1).padStart(5)} xp/min ${perMin.toFixed(0).padStart(6)} unit ${(perMin / (1 + 0.15 * (level - 1))).toFixed(0).padStart(4)} min/lvl ${minutesPerLevel.toFixed(1).padStart(6)} ${deaths ? 'DIED at ' + t + 's' : 'alive'} hp ${Math.round(w.player.hp)}/${w.derived.maxHp} potions ${w.player.potions.hp_potion}`);
    }
  }
  console.log(out.join('\n'));
  expect(problems, problems.join('; ')).toEqual([]);
}, 120000);
