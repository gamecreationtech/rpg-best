import type { ClassId } from '../data/classes';
import { ITEM_RULES } from '../data/items';
import { EQUIP_KEYS, Equipment, type EquipKey } from './items/equipment';
import { Inventory } from './items/inventory';
import { resetItemUids, type Item } from './items/item';
import type { PlayerState } from './player';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  player: Omit<PlayerState, 'inventory' | 'equipment' | 'stash'> & {
    inventory: Item[];
    equipment: Partial<Record<EquipKey, Item | null>>;
    stash: Item[][];
  };
}

export function serialize(p: PlayerState, seed: number): SaveData {
  const { inventory, equipment, stash, ...rest } = p;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed,
    player: {
      ...structuredClone(rest),
      inventory: structuredClone(inventory.items),
      equipment: structuredClone(equipment.slots),
      stash: stash.map((s) => structuredClone(s.items)),
    },
  };
}

function restoreInventory(items: Item[]): Inventory {
  const inv = new Inventory(ITEM_RULES.inventoryCols, ITEM_RULES.inventoryRows);
  for (const item of items) {
    if (!inv.place(item, item.col, item.row)) inv.add(item);
  }
  return inv;
}

export function deserialize(data: SaveData): PlayerState {
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);
  const src = data.player;
  const equipment = new Equipment();
  let maxUid = 0;
  const seen = (i: Item | null | undefined) => {
    if (i) maxUid = Math.max(maxUid, i.uid);
  };
  for (const k of EQUIP_KEYS) {
    const it = src.equipment[k] ?? null;
    equipment.slots[k] = it;
    seen(it);
  }
  src.inventory.forEach(seen);
  src.stash.forEach((page) => page.forEach(seen));
  resetItemUids(maxUid + 1);
  const p: PlayerState = {
    ...src,
    classId: src.classId as ClassId,
    inventory: restoreInventory(src.inventory),
    equipment,
    stash: src.stash.map(restoreInventory),
  };
  while (p.stash.length < ITEM_RULES.stashPages) p.stash.push(new Inventory(ITEM_RULES.inventoryCols, ITEM_RULES.inventoryRows));
  return p;
}

/** A shareable text code: version tag, checksum, then base64 JSON. */
export function encodeSave(data: SaveData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `FS1-${checksum(b64)}-${b64}`;
}

export function decodeSave(code: string): SaveData {
  const trimmed = code.trim();
  const m = /^FS1-([0-9a-f]{8})-([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (!m) throw new Error('That does not look like a Falling Sky save code');
  const [, sum, b64] = m;
  if (checksum(b64!) !== sum) throw new Error('The save code is damaged');
  const bin = atob(b64!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as SaveData;
}

function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
