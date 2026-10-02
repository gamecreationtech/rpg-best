import { CONSUMABLES } from '../data/consumables';
import { Rng } from '../gen/rng';
import { ATTACK_SLOT, resolveSlotSkill } from './player';
import { castSkill } from './skills/cast';
import type { World } from './world';

/**
 * Plays the hero the way a patient player would, through the same commands the
 * input layer uses: walks to the nearest pack, fights it with every learned
 * skill that is ready, drinks potions when low, steps back from a monster at
 * a ranged hero's feet, gathers the loot once the ground is clear, and roams
 * on when nothing is left in sight. Pure: it touches only the world. The app
 * turns it on from the settings and off again at any touch or a death.
 */
export class Autoplay {
  private readonly rng = new Rng(1337);
  private think = 0;
  private chase = -1;
  private readonly avoid = new Set<number>();
  private lastX = 0;
  private lastZ = 0;
  private stuck = 0;
  private kite = 0;
  /** Seconds before the next step back; stepping back is a dodge, not a way of life */
  private kiteRest = 0;
  private roam: { x: number; z: number } | null = null;
  private lastZone: string | null = null;
  private slotNext = 1;
  private readonly badSlot = new Map<number, number>();

  reset(): void {
    this.chase = -1;
    this.avoid.clear();
    this.stuck = 0;
    this.kite = 0;
    this.roam = null;
    this.badSlot.clear();
  }

  /** One simulation step's worth of decisions. Call before `world.step`; nothing to do while dead, pledging or in town. */
  step(w: World, dt: number): void {
    if (w.playerDead || w.pledgePending || w.area !== 'arena') return;
    if (this.lastZone !== w.zoneId) {
      this.reset();
      this.lastZone = w.zoneId;
    }
    if (this.kite > 0) {
      this.kite -= dt;
      if (this.kite <= 0) w.setMoveInput(0, 0);
      return;
    }
    this.kiteRest = Math.max(0, this.kiteRest - dt);
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.25;
    this.moved = Math.hypot(w.px - this.lastX, w.pz - this.lastZ);
    this.lastX = w.px;
    this.lastZ = w.pz;
    this.potions(w);

    const alive = w.enemies.filter((e) => e.alive && !e.dead && e.def && !this.avoid.has(e.id));
    // A ranged hero steps away from a monster in its face, as a player would: one short step, away from the
    // whole crowd, then it shoots again. Hemmed in by three or more, or when the last step went nowhere, it
    // stands and shoots instead of shuffling about
    if (w.derived.isRanged && this.kiteRest <= 0) {
      const threats = alive.filter((e) => e.def!.ai === 'melee' && w.dist(e.x, e.z) < 1.4);
      if (threats.length > 0 && threats.length < 3) {
        let dx = 0;
        let dz = 0;
        for (const e of threats) {
          dx += w.px - e.x;
          dz += w.pz - e.z;
        }
        const len = Math.hypot(dx, dz) || 1;
        w.setMoveInput(dx / len, dz / len);
        this.kite = 0.3;
        this.kiteRest = this.moved < 0.3 ? 3 : 1.5;
        return;
      }
    }
    let target = w.enemies[this.chase];
    if (!target || !target.alive || target.dead || this.avoid.has(target.id)) {
      target = undefined;
      let best = Infinity;
      for (const e of alive) {
        const d = w.dist(e.x, e.z);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      this.chase = target ? target.id : -1;
      this.stuck = 0;
    }
    if (target) {
      const d = w.dist(target.x, target.z);
      if (d < 12) {
        if (w.targetId !== target.id && w.pendingPickup < 0) w.setTarget(target.id);
        this.skills(w, target.x, target.z);
      } else {
        w.moveTo(target.x, target.z);
        this.watchProgress(() => {
          this.avoid.add(target!.id);
          this.chase = -1;
        });
      }
      this.roam = null;
      return;
    }
    // Nothing to fight: gather what dropped, then wander off to find more
    if (this.loot(w)) return;
    if (!this.roam || w.dist(this.roam.x, this.roam.z) < 2) this.roam = this.somewhere(w);
    if (this.roam) {
      w.moveTo(this.roam.x, this.roam.z);
      this.watchProgress(() => { this.roam = null; });
    }
  }

  private moved = 0;

  /** Walking somewhere and getting nowhere for three seconds means giving up on it. */
  private watchProgress(giveUp: () => void): void {
    this.stuck = this.moved < 0.3 ? this.stuck + 0.25 : 0;
    if (this.stuck >= 3) {
      this.stuck = 0;
      giveUp();
    }
  }

  private potions(w: World): void {
    const p = w.player;
    const d = w.derived;
    const full = (id: 'hp_potion' | 'bandage' | 'mp_potion' | 'incense') => p.potions[id] >= 1 && w.potionCooldowns[id] <= 0 && CONSUMABLES.some((c) => c.id === id);
    if (p.hp < d.maxHp * 0.4) {
      if (full('hp_potion')) w.useConsumable('hp_potion');
      else if (full('bandage')) w.useConsumable('bandage');
    }
    if (p.mana < d.maxMana * 0.2) {
      if (full('mp_potion')) w.useConsumable('mp_potion');
      else if (full('incense')) w.useConsumable('incense');
    }
  }

  /** One ready skill a think, round robin over the bar, aimed at the target; slots that cannot be cast for a lasting reason rest a while. */
  private skills(w: World, tx: number, tz: number): void {
    const slots = w.player.slots.length;
    for (let n = 0; n < slots; n++) {
      const slot = ((this.slotNext - 1 + n) % Math.max(1, slots - 1)) + 1;
      const id = resolveSlotSkill(w.player, w.player.slots[slot] ?? null);
      if (!id || id === ATTACK_SLOT) continue;
      if ((this.badSlot.get(slot) ?? 0) > 0) {
        this.badSlot.set(slot, this.badSlot.get(slot)! - 0.25);
        continue;
      }
      const res = castSkill(w, id, { x: tx, z: tz });
      if (res.ok) {
        this.slotNext = slot + 1;
        return;
      }
      if (res.reason && !['Cooling down', 'Not enough mana', 'Out of range', 'No target', 'Casting', 'Attacking', 'Stunned', 'Busy'].includes(res.reason) && !res.reason.startsWith('Already')) this.badSlot.set(slot, 10);
    }
  }

  /** Walks to the nearest visible drop worth having when the ground is clear. Gold is walked over anyway. */
  private loot(w: World): boolean {
    if (w.pendingPickup >= 0) return true;
    let best: { id: number; d: number } | null = null;
    for (const d of w.drops) {
      if (!d.alive || !w.dropVisible(d)) continue;
      if (d.item && w.player.inventory.freeCells < d.item.size[0] * d.item.size[1]) continue;
      const dist = w.dist(d.x, d.z);
      if (dist < 14 && (!best || dist < best.d)) best = { id: d.id, d: dist };
    }
    if (!best) return false;
    w.pickup(best.id);
    return true;
  }

  /** A random open tile well away from here. */
  private somewhere(w: World): { x: number; z: number } | null {
    if (!w.arena) return null;
    for (let tries = 0; tries < 20; tries++) {
      const x = this.rng.range(2, w.map.cols - 2);
      const z = this.rng.range(2, w.map.rows - 2);
      if (w.dist(x, z) < 12) continue;
      if (!w.arena.reachable[Math.floor(z) * w.map.cols + Math.floor(x)]) continue;
      return { x, z };
    }
    return null;
  }

}
