import { EQUIP_SLOTS, type EquipSlot, type OffhandKind } from '../../data/items';
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

/**
 * Whether the item in the shield slot cannot be held alongside this weapon.
 * Two-handed weapons leave no hand free for a shield, lantern or skull. A bow
 * (one-handed) takes a quiver and nothing else; a quiver needs a bow.
 */
export function offhandConflict(off: Item, weapon: Item | null | undefined): boolean {
  if (off.offhand === 'quiver') return weapon?.weapon?.type !== 'bow';
  if (weapon?.weapon?.type === 'bow') return true;
  return isTwoHanded(weapon);
}

/** Why an offhand cannot go on with this weapon, for the refusal message and the item card. */
export function offhandReason(off: { offhand?: OffhandKind }, weapon: Item | null | undefined): string {
  if (off.offhand === 'quiver') return 'A quiver needs a bow';
  if (weapon?.weapon?.type === 'bow') return 'A bow only takes a quiver';
  return `Cannot use ${off.offhand ? 'an offhand' : 'a shield'} with a two-handed weapon`;
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
   * Equips an item and returns everything that came off (the replaced item, the
   * shield, lantern or skull if a two-handed weapon was equipped, the quiver if
   * the bow was swapped for anything else). The caller puts those back in the bag.
   */
  equip(item: Item, level: number, preferred?: EquipKey): { ok: boolean; removed: Item[]; reason?: string } {
    if (item.reqLevel > level) return { ok: false, removed: [], reason: `Requires level ${item.reqLevel}` };
    const key = this.targetKey(item, preferred);
    const removed: Item[] = [];
    const prev = this.slots[key];
    if (prev) removed.push(prev);
    const off = this.slots.shield;
    if (key === 'weapon' && off && offhandConflict(off, item)) {
      removed.push(off);
      this.slots.shield = null;
    }
    if (key === 'shield' && offhandConflict(item, this.slots.weapon)) {
      return { ok: false, removed: [], reason: offhandReason(item, this.slots.weapon) };
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
