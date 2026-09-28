import { RARITIES } from '../data/items';
import type { Drop } from '../sim/types';
import type { Projector } from './camera';

/** Tappable name tags above items on the ground, like a Diablo loot filter. */
export class DropLabels {
  private readonly root: HTMLDivElement;
  private readonly els = new Map<number, HTMLButtonElement>();
  private readonly tmp = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly view: Projector, private readonly onPick: (id: number) => void) {
    this.root = document.createElement('div');
    this.root.className = 'drop-layer';
    parent.appendChild(this.root);
  }

  update(drops: Drop[], visible: (d: Drop) => boolean): void {
    const seen = new Set<number>();
    for (const d of drops) {
      if (!d.alive || !d.item || !visible(d)) continue;
      seen.add(d.id);
      let el = this.els.get(d.id);
      if (!el) {
        el = document.createElement('button');
        el.className = 'drop-label';
        el.textContent = d.item.name;
        el.style.color = '#' + RARITIES[d.item.rarity].color.toString(16).padStart(6, '0');
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('click', () => this.onPick(d.id));
        this.root.appendChild(el);
        this.els.set(d.id, el);
      }
      if (this.view.project(d.x, 0.9, d.z, this.tmp)) {
        el.style.display = 'block';
        el.style.transform = `translate(-50%, -100%) translate(${this.tmp.x.toFixed(0)}px, ${this.tmp.y.toFixed(0)}px)`;
      } else {
        el.style.display = 'none';
      }
    }
    for (const [id, el] of this.els) {
      if (!seen.has(id)) {
        el.remove();
        this.els.delete(id);
      }
    }
  }

  clear(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}
