import { describe, expect, it } from 'vitest';
import { Rng } from '../../gen/rng';
import { ARCANA_OPS, FORGE_OPS, applyArcana, applyForge } from './crafting';
import { Equipment } from './equipment';
import { Inventory } from './inventory';
import { baseItem } from '../../data/items';
import { generateItem, makeItem, makeStarterItem, rollRarity } from './item';
import { generateStock, sellPrice } from './vendor';

describe('item generation', () => {
  it('scales stats with rarity and level', () => {
    const rng = new Rng(1);
    const common = generateItem(rng, { ilvl: 1, rarity: 'common', slot: 'helmet' });
    const rare = generateItem(rng, { ilvl: 10, rarity: 'rare', slot: 'helmet' });
    expect(rare.stats.armor!).toBeGreaterThan(common.stats.armor!);
    expect(rare.affixes.length).toBe(2);
    expect(rare.value).toBeGreaterThan(common.value);
    expect(rare.reqLevel).toBe(8);
  });

  it('keeps attribute bonuses small on low-level items and lets them grow', () => {
    const attrs = ['str', 'dex', 'int', 'vit'] as const;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed);
      const low = generateItem(rng, { ilvl: 2, rarity: 'magic' });
      for (const k of attrs) expect(low.stats[k] ?? 0, `${low.name} ${k}`).toBeLessThanOrEqual(4);
      const rare = generateItem(rng, { ilvl: 2, rarity: 'rare' });
      for (const k of attrs) expect(rare.stats[k] ?? 0, `${rare.name} ${k}`).toBeLessThanOrEqual(6);
    }
    const rng = new Rng(5);
    const high = makeItem(baseItem('axe'), 'mythic', 100, null);
    expect(high.stats.str!).toBeGreaterThanOrEqual(10);
    expect(high.stats.str!).toBeLessThanOrEqual(40);
    // Weapon damage still climbs steeply with rarity and level
    const low = makeItem(baseItem('axe'), 'magic', 2, rng);
    expect(high.weapon!.dmgMax).toBeGreaterThan(low.weapon!.dmgMax * 10);
    // Divine specials carry their numbers as written
    const charm = makeItem(baseItem('vital_charm'), 'divine', 60, rng);
    expect(charm.stats.life).toBe(500);
  });

  it('rarity weights roughly match the design', () => {
    const rng = new Rng(9);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const r = rollRarity(rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.common! / 20000).toBeCloseTo(0.55, 1);
    expect(counts.set ?? 0).toBe(0);
    expect(counts.divine!).toBeGreaterThan(100);
  });

  it('vendor stock never exceeds magic', () => {
    const stock = generateStock(new Rng(3), 5);
    expect(stock.length).toBe(18);
    for (const it of stock) expect(['common', 'magic']).toContain(it.rarity);
    expect(sellPrice(stock[0]!)).toBe(Math.floor(stock[0]!.value * 0.4));
  });
});

describe('inventory sort', () => {
  it('packs items from the top left, biggest first', () => {
    const inv = new Inventory(18, 14);
    const ring = makeItem(baseItem('ring'), 'common', 1, null);
    const chest = makeItem(baseItem('chest_armor'), 'rare', 5, null);
    const sword = makeItem(baseItem('sword'), 'magic', 3, null);
    inv.place(ring, 10, 10);
    inv.place(sword, 3, 7);
    inv.place(chest, 15, 2);
    inv.sort();
    expect([chest.col, chest.row]).toEqual([0, 0]);
    expect(sword.row).toBe(0);
    expect(sword.col).toBe(2);
    expect(ring.row).toBe(0);
    expect(inv.items.length).toBe(3);
  });
});

describe('inventory grid', () => {
  it('places, rejects overlaps and removes', () => {
    const inv = new Inventory(12, 12);
    const sword = makeStarterItem('wooden_sword');
    const shield = makeStarterItem('wooden_shield');
    expect(inv.add(sword)).toBe(true);
    expect(sword.col).toBe(0);
    expect(inv.place(shield, 0, 0)).toBe(false);
    expect(inv.add(shield)).toBe(true);
    expect(shield.col).toBe(1);
    expect(inv.itemAt(0, 2)).toBe(sword);
    expect(inv.remove(sword)).toBe(true);
    expect(inv.itemAt(0, 2)).toBeNull();
    expect(inv.place(shield, 0, 0)).toBe(true);
  });
});

describe('equipment', () => {
  it('drops the shield when a two-handed weapon goes on', () => {
    const eq = new Equipment();
    const shield = makeStarterItem('wooden_shield');
    const staff = makeStarterItem('wooden_staff');
    expect(eq.equip(shield, 1).ok).toBe(true);
    const res = eq.equip(staff, 1);
    expect(res.ok).toBe(true);
    expect(res.removed).toContain(shield);
    expect(eq.get('shield')).toBeNull();
    expect(eq.equip(shield, 1).ok).toBe(false);
  });

  it('boots always carry movement speed, 5% at level 1 and more as they scale', () => {
    const base = baseItem('boots');
    expect(makeItem(base, 'common', 1, null).stats.moveSpeed).toBe(5);
    expect(makeItem(base, 'magic', 1, null).stats.moveSpeed).toBe(6);
    const high = makeItem(base, 'common', 50, null).stats.moveSpeed!;
    expect(high).toBeGreaterThan(15);
    expect(high).toBeLessThan(25);
  });

  it('enforces level requirements', () => {
    const eq = new Equipment();
    const item = generateItem(new Rng(2), { ilvl: 20, rarity: 'magic', slot: 'boots' });
    expect(eq.equip(item, 3).ok).toBe(false);
    expect(eq.equip(item, 16).ok).toBe(true);
  });
});

describe('crafting', () => {
  it('forge caps at five uses', () => {
    const sword = makeStarterItem('wooden_sword');
    const op = FORGE_OPS[0]!;
    for (let i = 0; i < 5; i++) expect(applyForge(op, sword).ok).toBe(true);
    expect(applyForge(op, sword).ok).toBe(false);
    expect(sword.weapon!.dmgMax).toBeGreaterThanOrEqual(3);
  });

  it('transmute climbs the rarity ladder and stops at divine', () => {
    const item = generateItem(new Rng(4), { ilvl: 5, rarity: 'common', slot: 'helmet' });
    const rng = new Rng(5);
    const op = ARCANA_OPS.find((o) => o.id === 'transmute')!;
    const seen = [item.rarity];
    while (applyArcana(op, item, rng).ok) seen.push(item.rarity);
    expect(seen).toEqual(['common', 'magic', 'rare', 'mythic', 'set', 'divine']);
  });
});
