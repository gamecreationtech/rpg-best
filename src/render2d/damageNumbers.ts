import type { Projector } from './camera';

interface Num {
  el: HTMLSpanElement;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  drift: number;
}

/** Pooled floating text for damage, heals and misses. */
export class DamageNumbers {
  private readonly pool: Num[] = [];
  private readonly root: HTMLDivElement;
  private next = 0;
  private readonly tmp = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly view: Projector, size = 40) {
    this.root = document.createElement('div');
    this.root.className = 'dmg-layer';
    parent.appendChild(this.root);
    for (let i = 0; i < size; i++) {
      const el = document.createElement('span');
      el.className = 'dmg';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.pool.push({ el, x: 0, y: 0, z: 0, age: 99, life: 1, drift: 0 });
    }
  }

  show(text: string, x: number, y: number, z: number, cls: string, life = 0.9): void {
    const n = this.pool[this.next]!;
    this.next = (this.next + 1) % this.pool.length;
    n.el.textContent = text;
    n.el.className = 'dmg ' + cls;
    n.el.style.display = 'block';
    n.x = x + (Math.random() - 0.5) * 0.5;
    n.y = y;
    n.z = z;
    n.age = 0;
    n.life = life;
    n.drift = (Math.random() - 0.5) * 30;
  }

  update(dt: number): void {
    for (const n of this.pool) {
      if (n.age > n.life) continue;
      n.age += dt;
      if (n.age > n.life) {
        n.el.style.display = 'none';
        continue;
      }
      const t = n.age / n.life;
      if (!this.view.project(n.x, n.y, n.z, this.tmp)) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.transform = `translate(${(this.tmp.x + n.drift * t).toFixed(0)}px, ${(this.tmp.y - t * 46).toFixed(0)}px) scale(${(1.15 - t * 0.35).toFixed(2)})`;
      n.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }
}
