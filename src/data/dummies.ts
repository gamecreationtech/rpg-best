import type { Element } from './stats';

/** Training dummies in town. They attack anyone who stands next to them and cannot die. */
export interface DummyDef {
  id: string;
  name: string;
  element: Element;
  damage: number;
  cooldown: number;
  color: number;
}

export const DUMMIES: DummyDef[] = [
  { id: 'fire', name: 'Fire Dummy', element: 'fire', damage: 8, cooldown: 1500, color: 0xff4400 },
  { id: 'cold', name: 'Cold Dummy', element: 'cold', damage: 7, cooldown: 1800, color: 0x44aaff },
  { id: 'lightning', name: 'Lightning Dummy', element: 'lightning', damage: 10, cooldown: 1200, color: 0xffff44 },
  { id: 'poison', name: 'Poison Dummy', element: 'poison', damage: 5, cooldown: 2000, color: 0x44ff88 },
  { id: 'physical', name: 'Physical Dummy', element: 'physical', damage: 12, cooldown: 1400, color: 0xaaaaaa },
];

export const DUMMY_RULES = {
  hp: 400,
  attackRange: 48,
  /** Seconds without damage before life resets. */
  resetAfter: 3,
};
