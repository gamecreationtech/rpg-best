import { ITEM_RULES } from '../../data/items';
import type { Rng } from '../../gen/rng';
import { generateItem, type Item } from './item';

export function sellPrice(item: Item): number {
  return Math.floor(item.value * ITEM_RULES.sellRatio);
}

export function buyPrice(item: Item): number {
  return item.value;
}

/** Vendor stock scales with the player: mostly their level, sometimes a little above. Never above magic. */
export function generateStock(rng: Rng, playerLevel: number): Item[] {
  const stock: Item[] = [];
  const weights = ITEM_RULES.vendorLevelWeights;
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ITEM_RULES.vendorStockSize; i++) {
    let roll = rng.next() * total;
    let bump = 0;
    for (let k = 0; k < weights.length; k++) {
      roll -= weights[k]!;
      if (roll < 0) {
        bump = k;
        break;
      }
    }
    stock.push(generateItem(rng, { ilvl: Math.max(1, playerLevel + bump), maxRarity: ITEM_RULES.vendorMaxRarity }));
  }
  return stock;
}
