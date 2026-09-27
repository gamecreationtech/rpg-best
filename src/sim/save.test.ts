import { describe, expect, it } from 'vitest';
import { Rng } from '../gen/rng';
import { generateItem } from './items/item';
import { createPlayer, learnSkill } from './player';
import { decodeSave, deserialize, encodeSave, serialize } from './save';

describe('save', () => {
  it('round-trips a player through JSON and a save code', () => {
    const p = createPlayer('rogue', 'quiverbound');
    p.gold = 123;
    p.level = 4;
    p.skillPoints = 2;
    learnSkill(p, 'dagger_throw');
    const rng = new Rng(1);
    const bag = generateItem(rng, { ilvl: 3, rarity: 'rare', slot: 'helmet' });
    const stashed = generateItem(rng, { ilvl: 3, rarity: 'magic', slot: 'ring' });
    p.inventory.add(bag);
    p.stash[1]!.add(stashed);
    const code = encodeSave(serialize(p, 42));
    const back = deserialize(decodeSave(code));
    expect(back.gold).toBe(123);
    expect(back.level).toBe(4);
    expect(back.skillRanks.dagger_throw).toBe(2);
    expect(back.inventory.items.find((i) => i.uid === bag.uid)!.name).toBe(bag.name);
    expect(back.inventory.itemAt(bag.col, bag.row)!.uid).toBe(bag.uid);
    expect(back.stash[1]!.items[0]!.uid).toBe(stashed.uid);
    expect(back.equipment.get('weapon')!.baseId).toBe('wooden_bow');
  });

  it('rejects damaged codes', () => {
    const p = createPlayer('knight', 'paladin');
    const code = encodeSave(serialize(p, 1));
    expect(() => decodeSave(code.slice(0, -4) + 'AAAA')).toThrow();
    expect(() => decodeSave('hello')).toThrow();
  });
});
