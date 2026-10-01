import { describe, expect, it } from 'vitest';
import { powerCurve } from '../../data/classes';
import { Rng } from '../../gen/rng';
import { ARCANA_OPS, FORGE_OPS, applyArcana, applyForge } from './crafting';
import { Equipment } from './equipment';
import { Inventory } from './inventory';
import { SPECIAL_BASES, baseItem } from '../../data/items';
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
    expect(rare.reqLevel).toBe(10);
  });

  it('keeps attribute bonuses small on low-level items and lets them grow', () => {
    const attrs = ['str', 'dex', 'int', 'vit'] as const;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed);
      const low = generateItem(rng, { ilvl: 2, rarity: 'magic' });
      for (const k of attrs) expect(low.stats[k] ?? 0, `${low.name} ${k}`).toBeLessThanOrEqual(4);
      // A rare can stack a base attribute with a matching affix (a Staff of Wisdom), so it gets a little more room
      const rare = generateItem(rng, { ilvl: 2, rarity: 'rare' });
      for (const k of attrs) expect(rare.stats[k] ?? 0, `${rare.name} ${k}`).toBeLessThanOrEqual(8);
    }
    const rng = new Rng(5);
    const high = makeItem(baseItem('axe'), 'mythic', 100, null);
    expect(high.stats.str!).toBeGreaterThanOrEqual(10);
    expect(high.stats.str!).toBeLessThanOrEqual(40);
    // Weapon damage still climbs steeply with rarity and level
    const low = makeItem(baseItem('axe'), 'magic', 2, rng);
    expect(high.weapon!.dmgMax).toBeGreaterThan(low.weapon!.dmgMax * 10);
    // Divine specials carry their numbers as written, lifted only by the power curve of their level
    const charm = makeItem(baseItem('vital_charm'), 'divine', 60, rng);
    expect(charm.stats.life).toBe(Math.round(500 * powerCurve(60)));
  });

  it('the Weak Amulet rolls its crit stats inside their ranges and carries its proc', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = makeItem(baseItem('weak_amulet'), 'divine', 100, new Rng(seed));
      expect(a.stats.critChance).toBeGreaterThanOrEqual(10);
      expect(a.stats.critChance).toBeLessThanOrEqual(20);
      expect(a.stats.critDamage).toBeGreaterThanOrEqual(30);
      expect(a.stats.critDamage).toBeLessThanOrEqual(50);
      expect(Number.isInteger(a.stats.critChance)).toBe(true);
      expect(a.reqLevel).toBe(100);
      expect(a.proc).toEqual({ id: 'cry_of_the_weak', chance: 50 });
      expect(a.affixes).toEqual([]);
    }
    const mid = makeItem(baseItem('weak_amulet'), 'divine', 100, null);
    expect(mid.stats.critChance).toBe(15);
    expect(mid.stats.critDamage).toBe(40);
  });

  it('every divine drop is one of the coded specials', () => {
    const rng = new Rng(11);
    const specials = new Set(SPECIAL_BASES.map((b) => b.id));
    for (let i = 0; i < 200; i++) {
      const item = generateItem(rng, { ilvl: 40, rarity: 'divine' });
      expect(specials.has(item.baseId), item.name).toBe(true);
      expect(item.rarity).toBe('divine');
      expect(item.affixes).toEqual([]);
    }
    // A slot with no special settles for a mythic of that slot
    const boots = generateItem(rng, { ilvl: 40, rarity: 'divine', slot: 'boots' });
    expect(boots.slot).toBe('boots');
    expect(boots.rarity).toBe('mythic');
  });

  it('rarity weights roughly match the design', () => {
    const rng = new Rng(9);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const r = rollRarity(rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.common! / 20000).toBeCloseTo(0.4, 1);
    expect(counts.magic! / 20000).toBeCloseTo(0.4, 1);
    expect(counts.rare! / 20000).toBeCloseTo(0.16, 1);
    expect(counts.set ?? 0).toBe(0);
    expect(counts.divine!).toBeGreaterThan(50);
    expect(counts.divine!).toBeLessThan(160);
  });

  it('vendor stock never exceeds magic', () => {
    const stock = generateStock(new Rng(3), 5);
    expect(stock.length).toBe(18);
    for (const it of stock) expect(['common', 'magic']).toContain(it.rarity);
    expect(sellPrice(stock[0]!)).toBe(Math.floor(stock[0]!.value * 0.4));
  });
});

describe('inventory sort', () => {
  const filled = () => {
    const inv = new Inventory(18, 14);
    const ring = makeItem(baseItem('ring'), 'common', 1, null);
    const chest = makeItem(baseItem('chest_armor'), 'rare', 5, null);
    const sword = makeItem(baseItem('sword'), 'magic', 3, null);
    const mace = makeItem(baseItem('mace'), 'common', 3, null);
    inv.place(ring, 10, 10);
    inv.place(sword, 3, 7);
    inv.place(chest, 15, 2);
    inv.place(mace, 0, 10);
    return { inv, ring, chest, sword, mace };
  };
  it('by rarity packs from the top left, common first up to divine', () => {
    const { inv, ring, chest, sword, mace } = filled();
    inv.sort('rarity');
    // Common: the mace (a weapon) before the ring; then the magic sword, then the rare chest
    expect([mace.col, mace.row]).toEqual([0, 0]);
    expect([ring.col, ring.row]).toEqual([1, 0]);
    expect([sword.col, sword.row]).toEqual([2, 0]);
    expect([chest.col, chest.row]).toEqual([3, 0]);
    expect(inv.items.length).toBe(4);
  });
  it('by type keeps each kind together, best rarity first', () => {
    const { inv, ring, chest, sword, mace } = filled();
    inv.sort('type');
    // Weapons first, each weapon type together (maces before swords); then the chest, then the ring
    expect([mace.col, mace.row]).toEqual([0, 0]);
    expect([sword.col, sword.row]).toEqual([1, 0]);
    expect([chest.col, chest.row]).toEqual([2, 0]);
    expect([ring.col, ring.row]).toEqual([4, 0]);
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

  it('a quiver needs a bow and comes off when the bow does', () => {
    const eq = new Equipment();
    const quiver = makeItem(baseItem('quiver'), 'common', 1, null);
    const bow = makeStarterItem('wooden_bow');
    const sword = makeStarterItem('wooden_sword');
    expect(eq.equip(quiver, 1).ok).toBe(false);
    expect(eq.equip(bow, 1).ok).toBe(true);
    expect(eq.equip(quiver, 1).ok).toBe(true);
    const res = eq.equip(sword, 1);
    expect(res.removed).toContain(quiver);
    expect(eq.get('shield')).toBeNull();
  });

  it('a lantern or skull needs a one-handed weapon; a bow takes only a quiver and a crossbow nothing', () => {
    const eq = new Equipment();
    const lantern = makeItem(baseItem('lantern'), 'common', 1, null);
    const skull = makeItem(baseItem('skull'), 'common', 1, null);
    const quiver = makeItem(baseItem('quiver'), 'common', 1, null);
    expect(lantern.stats.moveSpeed).toBe(5);
    expect(lantern.stats.atkSpd).toBe(0.1);
    expect(skull.stats.critChance).toBe(3);
    expect(skull.stats.critDamage).toBe(15);
    expect(eq.equip(makeStarterItem('wooden_sword'), 1).ok).toBe(true);
    expect(eq.equip(lantern, 1).ok).toBe(true);
    const swap = eq.equip(skull, 1);
    expect(swap.ok).toBe(true);
    expect(swap.removed).toContain(lantern);
    // A two-handed staff going on knocks the skull off like a shield
    expect(eq.equip(makeStarterItem('wooden_staff'), 1).removed).toContain(skull);
    expect(eq.equip(skull, 1).reason).toBe('Cannot use an offhand with a two-handed weapon');
    // A bow is one-handed but takes a quiver and nothing else, not even a shield
    const bow = makeStarterItem('wooden_bow');
    expect(bow.weapon!.twoHanded).toBe(false);
    expect(eq.equip(bow, 1).ok).toBe(true);
    expect(eq.equip(lantern, 1).reason).toBe('A bow only takes a quiver');
    expect(eq.equip(makeStarterItem('wooden_shield'), 1).reason).toBe('A bow only takes a quiver');
    expect(eq.equip(quiver, 1).ok).toBe(true);
    // One-handed javelin and warfork leave a hand free for a shield
    expect(eq.equip(makeItem(baseItem('javelin'), 'common', 1, null), 1).removed).toContain(quiver);
    expect(eq.equip(makeStarterItem('wooden_shield'), 1).ok).toBe(true);
    expect(eq.equip(makeItem(baseItem('warfork'), 'common', 1, null), 1).removed).toEqual(expect.not.arrayContaining([expect.objectContaining({ slot: 'shield' })]));
    // A crossbow is two-handed with no exception: the quiver comes off and nothing goes back on
    expect(eq.equip(bow, 1).removed).toEqual(expect.arrayContaining([expect.objectContaining({ slot: 'shield' })]));
    expect(eq.equip(quiver, 1).ok).toBe(true);
    const crossbow = makeItem(baseItem('crossbow'), 'common', 1, null);
    expect(eq.equip(crossbow, 1).removed).toContain(quiver);
    expect(eq.equip(quiver, 1).reason).toBe('A quiver needs a bow');
    expect(eq.equip(skull, 1).ok).toBe(false);
  });

  it('enforces level requirements', () => {
    const eq = new Equipment();
    const item = generateItem(new Rng(2), { ilvl: 20, rarity: 'magic', slot: 'boots' });
    expect(item.reqLevel).toBe(20);
    expect(eq.equip(item, 19).ok).toBe(false);
    expect(eq.equip(item, 20).ok).toBe(true);
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

  it('transmute climbs the rarity ladder and stops at set: divine is never made', () => {
    const item = generateItem(new Rng(4), { ilvl: 5, rarity: 'common', slot: 'helmet' });
    const rng = new Rng(5);
    const op = ARCANA_OPS.find((o) => o.id === 'transmute')!;
    const seen = [item.rarity];
    while (applyArcana(op, item, rng).ok) seen.push(item.rarity);
    expect(seen).toEqual(['common', 'magic', 'rare', 'mythic', 'set']);
    expect(applyArcana(op, item, rng).reason).toBe('Divine items are found, never made');
  });
});
