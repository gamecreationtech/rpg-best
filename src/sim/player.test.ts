import { describe, expect, it } from 'vitest';
import { addXp, canUnlockUltimate, createPlayer, deriveStats, learnPassive, learnSkill, resolveSlotSkill, unlockUltimate, unlockedSlots } from './player';

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

  it('levels with the 1.45 curve and grants points', () => {
    const p = createPlayer('sorcerer', 'wintercaller');
    expect(p.xpToNext).toBe(60);
    const r = addXp(p, 60);
    expect(r.levels).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xpToNext).toBe(87);
    expect(p.statPoints).toBe(5);
    expect(p.skillPoints).toBe(1);
    expect(p.passivePoints).toBe(1);
    const d = deriveStats(p, [], {});
    // +4 INT per level: 14 INT -> 240 mana, wooden staff int 0
    expect(d.maxMana).toBe(100 + 14 * 10);
  });

  it('unlocks slots and ultimates at the right levels', () => {
    const p = createPlayer('rogue', 'quiverbound');
    expect(unlockedSlots(1)).toBe(2);
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

  it('passives respect prerequisites', () => {
    const p = createPlayer('knight', 'titan');
    p.passivePoints = 3;
    expect(learnPassive(p, 'thick_skin')).toBe(false);
    expect(learnPassive(p, 'iron_constitution')).toBe(true);
    expect(learnPassive(p, 'thick_skin')).toBe(true);
    const d = deriveStats(p, [], {});
    expect(d.maxHp).toBe(200 + 50);
    expect(d.armor).toBe(10 + 5 + 12); // vit + shield + thick skin
  });
});
