import { EQUIP_SLOTS, type EquipSlot } from '../../data/items';
import { isTwoHanded, type Item } from './item';

export type EquipKey = 'weapon' | 'shield' | 'helmet' | 'chest' | 'gloves' | 'boots' | 'belt' | 'amulet' | 'ring1' | 'ring2' | 'totem' | 'relic' | 'charm';

export const EQUIP_KEYS: EquipKey[] = ['weapon', 'shield', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'totem', 'relic', 'charm'];

export function keyLabel(key: EquipKey): string {
  if (key === 'ring1') return 'Ring 1';
  if (key === 'ring2') return 'Ring 2';
  return EQUIP_SLOTS.find((s) => s.id === key)?.label ?? key;
}

export function keysForSlot(slot: EquipSlot): EquipKey[] {
  return slot === 'ring' ? ['ring1', 'ring2'] : [slot];
}

/** Worn items by slot key. */
export class Equipment {
  readonly slots: Record<EquipKey, Item | null> = {
    weapon: null, shield: null, helmet: null, chest: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null, totem: null, relic: null, charm: null,
  };

  get(key: EquipKey): Item | null {
    return this.slots[key];
  }

  all(): Item[] {
    return EQUIP_KEYS.map((k) => this.slots[k]).filter((i): i is Item => !!i);
  }

  /** Which slot an item would go into: the first empty matching one, else the first. */
  targetKey(item: Item, preferred?: EquipKey): EquipKey {
    const keys = keysForSlot(item.slot);
    if (preferred && keys.includes(preferred)) return preferred;
    return keys.find((k) => !this.slots[k]) ?? keys[0]!;
  }

  /**
   * Equips an item and returns everything that came off (the replaced item, and the
   * shield if a two-handed weapon was equipped). The caller puts those back in the bag.
   */
  equip(item: Item, level: number, preferred?: EquipKey): { ok: boolean; removed: Item[]; reason?: string } {
    if (item.reqLevel > level) return { ok: false, removed: [], reason: `Requires level ${item.reqLevel}` };
    const key = this.targetKey(item, preferred);
    const removed: Item[] = [];
    const prev = this.slots[key];
    if (prev) removed.push(prev);
    if (key === 'weapon' && isTwoHanded(item) && this.slots.shield) {
      removed.push(this.slots.shield);
      this.slots.shield = null;
    }
    if (key === 'shield' && isTwoHanded(this.slots.weapon)) {
      return { ok: false, removed: [], reason: 'Cannot use a shield with a two-handed weapon' };
    }
    this.slots[key] = item;
    return { ok: true, removed };
  }

  unequip(key: EquipKey): Item | null {
    const item = this.slots[key];
    this.slots[key] = null;
    return item;
  }
}
