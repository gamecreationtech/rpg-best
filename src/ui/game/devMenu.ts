import type { StatKey } from '../../data/stats';
import type { World } from '../../sim/world';
import { button, clear, h } from '../dom';

interface DevSlider {
  key: StatKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const SLIDERS: DevSlider[] = [
  { key: 'moveSpeed', label: 'Movement speed', min: 0, max: 300, step: 5, unit: '%' },
  { key: 'cdr', label: 'Cooldown reduction', min: 0, max: 90, step: 1, unit: '%' },
  { key: 'fasterCast', label: 'Faster cast rate', min: 0, max: 400, step: 5, unit: '%' },
  { key: 'critChance', label: 'Critical chance', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'critDamage', label: 'Critical damage', min: 0, max: 500, step: 5, unit: '%' },
  { key: 'fireRes', label: 'Fire resist', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'coldRes', label: 'Cold resist', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'lightningRes', label: 'Lightning resist', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'poisonRes', label: 'Poison resist', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'armor', label: 'Armor', min: 0, max: 5000, step: 10, unit: '' },
  { key: 'block', label: 'Block chance', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'dodge', label: 'Evasion', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'range', label: 'Attack range', min: 0, max: 400, step: 5, unit: ' px' },
  { key: 'projSpeed', label: 'Projectile speed', min: 0, max: 300, step: 5, unit: '%' },
  { key: 'goldFind', label: 'Gold find', min: 0, max: 500, step: 5, unit: '%' },
  { key: 'magicFind', label: 'Magic find', min: 0, max: 500, step: 5, unit: '%' },
];

/**
 * The development menu: a strip on the left with a slider and an Apply button
 * per stat, plus a level-up button. Bonuses go into the world's dev stats,
 * which add to the character sheet and are never saved. Toggled with F4 or
 * `?dev` in the address. Meant to be deleted before release.
 */
export class DevMenu {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, private readonly world: World, private readonly onChange: () => void) {
    this.body = h('div', { class: 'dev-body' });
    this.root = h('div', { class: 'dev-menu' }, h('div', { class: 'dev-head' }, 'Dev menu', h('span', { class: 'dim' }, ' (F4 to hide)')), this.body);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.render();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.style.display = this.open ? 'flex' : 'none';
    if (this.open) this.render();
  }

  private render(): void {
    clear(this.body);
    const w = this.world;
    for (const s of SLIDERS) {
      const current = w.devStats[s.key] ?? 0;
      const value = h('span', { class: 'dev-value' }, `${current}${s.unit}`);
      const range = h('input', { type: 'range', min: s.min, max: s.max, step: s.step, value: current }) as HTMLInputElement;
      range.addEventListener('input', () => {
        value.textContent = `${range.value}${s.unit}`;
      });
      const apply = button('Apply', () => {
        w.devStats[s.key] = Number(range.value);
        w.markDirty();
        w.recomputeStats();
        this.onChange();
        row.classList.add('applied');
        setTimeout(() => row.classList.remove('applied'), 300);
      }, 'btn small');
      const row = h('div', { class: 'dev-row' }, h('div', { class: 'dev-label' }, s.label, value), h('div', { class: 'dev-controls' }, range, apply));
      this.body.appendChild(row);
    }
    this.body.append(
      h('div', { class: 'dev-actions' },
        button('Level up', () => {
          w.devLevelUp();
          this.onChange();
        }, 'btn small primary'),
        button('Reset all', () => {
          for (const k of Object.keys(w.devStats) as StatKey[]) delete w.devStats[k];
          w.markDirty();
          w.recomputeStats();
          this.onChange();
          this.render();
        }, 'btn small ghost'),
      ),
    );
  }
}
