/**
 * On-hit procs: effects an item fires with some chance when a weapon attack
 * lands. Each proc is named so the item card can say what it does.
 */
export interface ProcDef {
  id: string;
  name: string;
  description: string;
  /** Radius around the hero in px. */
  radius: number;
  /** Share of the triggering hit dealt to everything in range. */
  damageMult: number;
  /** The AoE visual the renderer plays. */
  visual: 'stomp' | 'nova_cold' | 'nova_poison';
}

export const PROCS: Record<string, ProcDef> = {
  cry_of_the_weak: {
    id: 'cry_of_the_weak',
    name: 'Cry of the Weak',
    description: 'A shout that strikes everything within 50 px of you for 100% of the blow.',
    radius: 50,
    damageMult: 1.0,
    visual: 'stomp',
  },
};

/** An item's chance to fire a proc on attack. */
export interface ItemProc {
  id: string;
  /** Percent chance per weapon hit. */
  chance: number;
}
