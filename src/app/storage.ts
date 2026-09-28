import { deserialize, serialize, type SaveData } from '../sim/save';
import type { PlayerState } from '../sim/player';
import type { Rarity } from '../data/items';

const DB_NAME = 'falling-sky';
const STORE = 'saves';
const KEY = 'slot1';
const SETTINGS_KEY = 'falling-sky-settings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('No IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Saves land in IndexedDB. Everything is best-effort: a failed save never breaks play. */
export async function saveGame(player: PlayerState, seed: number): Promise<boolean> {
  const data = serialize(player, seed);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    try {
      localStorage.setItem('falling-sky-save', JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
}

export async function loadGame(): Promise<{ player: PlayerState; seed: number } | null> {
  let data: SaveData | null = null;
  try {
    const db = await openDb();
    data = await new Promise<SaveData | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as SaveData) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem('falling-sky-save');
      if (raw) data = JSON.parse(raw) as SaveData;
    } catch {
      data = null;
    }
  }
  if (!data) return null;
  try {
    return { player: deserialize(data), seed: data.seed };
  } catch {
    return null;
  }
}

export async function deleteSave(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem('falling-sky-save');
  } catch {
    // ignore
  }
}

export interface Settings {
  music: number;
  sfx: number;
  showDamage: boolean;
  /** auto: joystick on touch devices, tap elsewhere. */
  controls: 'auto' | 'touch' | 'tap';
  /** Ask phones for full screen when play starts. */
  fullscreen: boolean;
  /** Pixel scale of the game frame in CSS pixels: 0 picks it from the screen. Snapped to whole device pixels when drawn. */
  zoom: 0 | 1 | 1.5 | 2 | 3;
  /** The crab that fetches loot. */
  pet: boolean;
  /** Loot filter: which of the lower rarities show on the ground. Mythic, set and divine always show. */
  loot: { common: boolean; magic: boolean; rare: boolean };
}

const DEFAULT_SETTINGS: Settings = { music: 0.4, sfx: 0.7, showDamage: true, controls: 'auto', fullscreen: true, zoom: 0, pet: false, loot: { common: true, magic: true, rare: true } };

/** The rarities the loot filter hides, for `World.setLootFilter`. */
export function hiddenLoot(s: Settings): Rarity[] {
  return (['common', 'magic', 'rare'] as const).filter((r) => !s.loot[r]);
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...saved, loot: { ...DEFAULT_SETTINGS.loot, ...(saved.loot ?? {}) } };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS, loot: { ...DEFAULT_SETTINGS.loot } };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
