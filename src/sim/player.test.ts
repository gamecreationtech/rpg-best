import { describe, expect, it } from 'vitest';
import { LEVELING, powerCurve, xpForLevel, xpPerMinuteAt } from '../data/classes';
import { addXp, canUnlockUltimate, createPlayer, deriveStats, learnPassive, learnSkill, resolveSlotSkill, unlearnSkill, unlockUltimate, unlockedSlots } from './player';
import { skillsFor } from '../data/skills';
import { SETS } from '../data/sets';
import { baseItem } from '../data/items';
import { makeItem } from './items/item';

describe('sets', () => {
  it("Pilgrim's Vestments grant their bonus only with all four pieces on", () => {
    const p = createPlayer('sorcerer', null);
    const before = deriveStats(p, [], {});
    const pieces = SETS.pilgrim!.pieces.map((id) => makeItem(baseItem(id), 'set', 5, null));
    for (const piece of pieces) {
      expect(piece.rarity).toBe('set');
      expect(piece.reqLevel).toBe(4);
      expect(piece.setId).toBe('pilgrim');
    }
    for (const piece of pieces.slice(0, 3)) expect(p.equipment.equip(piece, 5).ok).toBe(true);
    const three = deriveStats(p, [], {});
    expect(three.goldFind).toBe(0);
    expect(p.equipment.equip(pieces[3]!, 5).ok).toBe(true);
    const four = deriveStats(p, [], {});
    expect(four.goldFind).toBe(25);
    // +10 from the set on top of the pieces' own +3 intelligence
    expect(four.maxMana - before.maxMana).toBe(13 * 10);
    expect(four.moveSpeed).toBeGreaterThan(three.moveSpeed * 1.2);
  });
});

describe('reach and attack speed limits', () => {
  it('bare hands reach 20 px for every class', () => {
    for (const cls of ['knight', 'sorcerer', 'rogue'] as const) {
      const p = createPlayer(cls, null);
      p.equipment.unequip('weapon');
      expect(deriveStats(p, [], {}).meleeRange).toBe(20);
    }
  });

  it('gear can at most double a weapon\'s attack speed', () => {
    const p = createPlayer('knight', null);
    const sword = p.equipment.get('weapon')!;
    const lantern = makeItem(baseItem('lantern'), 'mythic', 650, null); // a huge attack speed bonus
    expect(lantern.stats.atkSpd!).toBeGreaterThan(5);
    expect(p.equipment.equip(lantern, 100).ok).toBe(true);
    expect(deriveStats(p, [], {}).atkSpd).toBeCloseTo(sword.weapon!.atkSpd * 2, 5);
  });
});

describe('defence caps', () => {
  it('block and dodge never pass 75%', () => {
    const p = createPlayer('knight', null);
    const shield = makeItem(baseItem('tower_shield'), 'mythic', 650, null); // thousands of percent block on paper
    expect(shield.stats.block!).toBeGreaterThan(1000);
    expect(p.equipment.equip(shield, 100).ok).toBe(true);
    p.allocated.dex += 100000;
    const d = deriveStats(p, [], {});
    expect(d.block).toBe(75);
    expect(d.dodge).toBe(75);
  });
});

describe('prisoner set', () => {
  it("Prisoner's Nightmare halves speed and attack rate and triples damage with both pieces", () => {
    const p = createPlayer('knight', null);
    const one = deriveStats(p, [], {});
    const [cuffs, ball] = SETS.prisoner!.pieces.map((id) => makeItem(baseItem(id), 'set', 12, null));
    expect(cuffs!.affixes).toEqual([]);
    expect(p.equipment.equip(cuffs!, 12).ok).toBe(true);
    const half = deriveStats(p, [], {});
    expect(half.dmgMult).toBe(1);
    expect(p.equipment.equip(ball!, 12).ok).toBe(true);
    const full = deriveStats(p, [], {});
    expect(full.dmgMult).toBe(3);
    expect(full.atkSpd).toBeCloseTo(half.atkSpd * 0.5, 5);
    expect(full.moveSpeed).toBeCloseTo(one.moveSpeed * 0.5, 1);
  });
});

describe('player', () => {
  it('starts the rogue with a bow in hand and a dagger in the bag', () => {
    const p = createPlayer('rogue', null);
    expect(p.equipment.get('weapon')?.weapon?.type).toBe('bow');
    expect(p.inventory.items.some((i) => i.weapon?.type === 'dagger')).toBe(true);
    expect(createPlayer('knight', null).inventory.items.length).toBe(0);
  });

  it('starts with class stats, starter gear and one skill', () => {
    const p = createPlayer('knight', 'paladin');
    const d = deriveStats(p, [], {});
    expect(d.maxHp).toBe(100 + 10 * 10 + 0);
    expect(p.equipment.get('weapon')?.baseId).toBe('wooden_sword');
    expect(p.equipment.get('shield')?.baseId).toBe('wooden_shield');
    expect(p.slots[1]).toBe('heavy_strike');
    expect(p.skillRanks.heavy_strike).toBe(1);
    expect(d.block).toBe(25);
  });

  it('levels along the curve and grants points', () => {
    const p = createPlayer('sorcerer', 'wintercaller');
    expect(p.xpToNext).toBe(xpForLevel(1));
    const r = addXp(p, xpForLevel(1));
    expect(r.levels).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xpToNext).toBe(xpForLevel(2));
    expect(p.statPoints).toBe(5);
    // Two a level, shared by skills and passives
    expect(p.skillPoints).toBe(2);
    const d = deriveStats(p, [], {});
    // No automatic stat growth: 10 INT -> 200 mana lifted by the power curve of level 2; the level only grants free points
    expect(d.maxMana).toBe(Math.round((100 + 10 * 10) * powerCurve(2)));
    expect(p.statPoints).toBe(LEVELING.statPointsPerLevel);
  });

  it('has a level curve that takes minutes early and under half an hour at the cap', () => {
    let total = 0;
    let prev = 0;
    for (let level = 1; level < LEVELING.maxLevel; level++) {
      const need = xpForLevel(level);
      expect(need).toBeGreaterThan(prev);
      prev = need;
      const minutes = need / xpPerMinuteAt(level);
      expect(minutes).toBeGreaterThanOrEqual(1);
      expect(minutes).toBeLessThanOrEqual(30);
      total += minutes;
    }
    expect(total / 60).toBeLessThan(30); // hours from 1 to 100
    expect(xpForLevel(1)).toBeLessThan(300);
  });

  it('stops at the level cap', () => {
    const p = createPlayer('knight', 'paladin');
    for (let i = 0; i < 200; i++) addXp(p, xpForLevel(p.level));
    expect(p.level).toBe(LEVELING.maxLevel);
  });

  it('takes a rank back and refunds the point, and a rank-0 skill leaves the bar', () => {
    const p = createPlayer('sorcerer', null);
    const id = skillsFor('sorcerer', null)[0]!.id;
    const rank = p.skillRanks[id] ?? 0;
    if (!rank) learnSkill(p, id);
    const points = p.skillPoints;
    expect(p.slots.includes(id)).toBe(true);
    expect(unlearnSkill(p, id)).toBe(true);
    expect(p.skillPoints).toBe(points + 1);
    if (rank <= 1) {
      expect(p.skillRanks[id]).toBeUndefined();
      expect(p.slots.includes(id)).toBe(false);
      expect(unlearnSkill(p, id)).toBe(false);
    }
  });

  it('unlocks slots and ultimates at the right levels', () => {
    const p = createPlayer('rogue', 'quiverbound');
    expect(unlockedSlots(1)).toBe(6);
    expect(unlockedSlots(20)).toBe(6);
    while (p.level < 20) addXp(p, 100000);
    expect(p.level).toBeGreaterThanOrEqual(20);
    expect(p.ultimatePoints).toBe(1);
    for (let i = 0; i < 4; i++) learnSkill(p, 'dagger_throw');
    expect(canUnlockUltimate(p, 'dagger_throw').ok).toBe(true);
    expect(unlockUltimate(p, 'dagger_throw')).toBe(true);
    expect(resolveSlotSkill(p, 'dagger_throw')).toBe('dagger_throw_ult');
    expect(p.slots).toContain('dagger_throw_ult');
  });

  it('pledge passives open with the pledge and spend the same points as skills', () => {
    const p = createPlayer('sorcerer', 'wintercaller');
    p.skillPoints = 2;
    expect(learnPassive(p, 'deep_cold_w')).toBe(false);
    expect(learnPassive(p, 'frozen_heart_w')).toBe(true);
    expect(p.skillPoints).toBe(1);
    expect(learnPassive(p, 'deep_cold_w')).toBe(true);
    expect(p.skillPoints).toBe(0);
    expect(learnPassive(p, 'rime_skin_w')).toBe(false);
    const other = createPlayer('sorcerer', 'stormsinger');
    other.skillPoints = 1;
    expect(learnPassive(other, 'frozen_heart_w')).toBe(false);
  });

  it('passives respect prerequisites', () => {
    const p = createPlayer('knight', 'titan');
    p.skillPoints = 3;
    expect(learnPassive(p, 'thick_skin')).toBe(false);
    expect(learnPassive(p, 'iron_constitution')).toBe(true);
    expect(learnPassive(p, 'thick_skin')).toBe(true);
    const d = deriveStats(p, [], {});
    expect(d.maxHp).toBe(200 + 50);
    expect(d.armor).toBe(10 + 5 + 12); // vit + shield + thick skin
  });
});
