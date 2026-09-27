import { RARITIES } from '../../data/items';
import { formatStat, type StatKey } from '../../data/stats';
import type { Inventory } from '../../sim/items/inventory';
import { describeItem, type Item } from '../../sim/items/item';
import { clear, h, hex } from '../dom';

export interface GridCallbacks {
  onItemTap: (item: Item, grid: Inventory) => void;
  onCellTap: (col: number, row: number, grid: Inventory) => void;
}

/** Renders a 12x12 grid with items as blocks. Tapping an item selects it; tapping a cell moves the selection. */
export class ItemGrid {
  readonly root: HTMLDivElement;
  private cell = 30;
  selected: Item | null = null;

  constructor(private readonly grid: Inventory, private readonly cb: GridCallbacks) {
    this.root = h('div', { class: 'item-grid' });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  setCellSize(px: number): void {
    this.cell = px;
  }

  render(): void {
    clear(this.root);
    const { cols, rows } = this.grid;
    this.root.style.width = `${cols * this.cell}px`;
    this.root.style.height = `${rows * this.cell}px`;
    this.root.style.backgroundSize = `${this.cell}px ${this.cell}px`;
    this.root.onclick = (e) => {
      const rect = this.root.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / this.cell);
      const row = Math.floor((e.clientY - rect.top) / this.cell);
      const item = this.grid.itemAt(col, row);
      if (item) this.cb.onItemTap(item, this.grid);
      else this.cb.onCellTap(col, row, this.grid);
    };
    for (const item of this.grid.items) {
      const el = h('div', { class: 'grid-item' + (item === this.selected ? ' selected' : '') });
      el.style.left = `${item.col * this.cell}px`;
      el.style.top = `${item.row * this.cell}px`;
      el.style.width = `${item.size[0] * this.cell - 2}px`;
      el.style.height = `${item.size[1] * this.cell - 2}px`;
      el.style.borderColor = hex(RARITIES[item.rarity].color);
      el.appendChild(itemIcon(item, Math.min(item.size[0], item.size[1]) * this.cell * 0.55));
      this.root.appendChild(el);
    }
  }
}

/** A code-drawn glyph for an item: a simple SVG silhouette by slot, tinted by rarity. */
export function itemIcon(item: Item, size: number): SVGSVGElement {
  const color = hex(RARITIES[item.rarity].color);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const shapes: Record<string, string> = {
    weapon: 'M12 2 L14 4 L14 16 L12 22 L10 16 L10 4 Z',
    shield: 'M12 2 L21 5 L20 13 C19 18 15 21 12 22 C9 21 5 18 4 13 L3 5 Z',
    helmet: 'M12 3 C6 3 4 8 4 12 L4 16 L8 16 L8 12 L16 12 L16 16 L20 16 L20 12 C20 8 18 3 12 3 Z',
    chest: 'M6 3 L9 5 L15 5 L18 3 L21 6 L18 9 L18 21 L6 21 L6 9 L3 6 Z',
    gloves: 'M7 3 L10 3 L10 9 L14 9 L14 3 L17 3 L17 13 L20 14 L19 21 L7 21 L5 13 Z',
    boots: 'M8 2 L15 2 L15 12 L20 16 L20 21 L4 21 L4 14 L8 12 Z',
    ring: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8 Z',
    belt: 'M2 9 L22 9 L22 15 L2 15 Z M9 7 L15 7 L15 17 L9 17 Z',
    amulet: 'M12 3 L14 8 L19 9 L15 13 L16 18 L12 15 L8 18 L9 13 L5 9 L10 8 Z',
    totem: 'M9 2 L15 2 L15 22 L9 22 Z M6 6 L18 6 L18 9 L6 9 Z',
    relic: 'M12 2 L20 8 L16 22 L8 22 L4 8 Z',
    charm: 'M12 3 C8 3 4 7 4 11 C4 16 12 21 12 21 C12 21 20 16 20 11 C20 7 16 3 12 3 Z',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', shapes[item.slot] ?? shapes.charm!);
  path.setAttribute('fill', color);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('opacity', '0.9');
  svg.appendChild(path);
  return svg;
}

/** Tooltip body for an item. */
export function itemCard(item: Item, compareTo: Item | null = null): HTMLDivElement {
  const color = hex(RARITIES[item.rarity].color);
  const lines = describeItem(item);
  const stats = Object.entries(item.stats).filter(([, v]) => v) as [StatKey, number][];
  return h(
    'div',
    { class: 'item-card' },
    h('div', { class: 'item-name', style: `color:${color}` }, item.name),
    h('div', { class: 'item-sub' }, `${RARITIES[item.rarity].name} ${item.slot}, level ${item.reqLevel}, ${item.value} gold`),
    ...lines.map((l) => h('div', { class: 'item-line' }, l)),
    ...stats.map(([k, v]) => {
      const delta = compareTo ? v - (compareTo.stats[k] ?? 0) : 0;
      return h('div', { class: 'item-line stat' }, formatStat(k, v), compareTo && delta !== 0 ? h('span', { class: delta > 0 ? 'up' : 'down' }, ` (${delta > 0 ? '+' : ''}${Math.round(delta * 100) / 100})`) : null);
    }),
    item.affixes.length > 1 ? h('div', { class: 'item-line dim' }, item.affixes.slice(1).join(', ')) : null,
    Object.values(item.forge).some((n) => n > 0) ? h('div', { class: 'item-line dim' }, `Smelted ${Object.values(item.forge).reduce((a, b) => a + b, 0)} times`) : null,
  );
}
