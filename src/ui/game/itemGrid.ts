import { RARITIES } from '../../data/items';
import { SETS } from '../../data/sets';
import { itemIconSprite } from '../../gen/pixel/icons';
import { formatStat, type StatKey } from '../../data/stats';
import type { Inventory } from '../../sim/items/inventory';
import { describeItem, type Item } from '../../sim/items/item';
import { clear, h, hex } from '../dom';

export interface GridCallbacks {
  onItemTap: (item: Item, grid: Inventory) => void;
  onCellTap: (col: number, row: number, grid: Inventory) => void;
}

/** Renders an item grid (the 18x14 bag or a 12x12 stash page) with items as blocks. Tapping an item selects it; tapping a cell moves the selection. */
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

/** The item's pixel icon, scaled by a whole number to roughly `size` pixels. */
export function itemIcon(item: Item, size: number): HTMLCanvasElement {
  const sprite = itemIconSprite(item.slot, item.weapon?.type ?? null, item.rarity, item.offhand ?? null, item.baseId);
  const c = document.createElement('canvas');
  c.className = 'px-icon';
  c.width = sprite.width;
  c.height = sprite.height;
  c.getContext('2d')!.drawImage(sprite, 0, 0);
  const s = Math.max(1, Math.floor(size / sprite.width));
  c.style.width = `${sprite.width * s}px`;
  c.style.height = `${sprite.height * s}px`;
  return c;
}

/** Tooltip body for an item. `setWorn` is how many pieces of its set the hero wears, for the set lines. */
export function itemCard(item: Item, compareTo: Item | null = null, setWorn = 0): HTMLDivElement {
  const color = hex(RARITIES[item.rarity].color);
  const lines = describeItem(item);
  const stats = Object.entries(item.stats).filter(([, v]) => v) as [StatKey, number][];
  const set = item.setId ? SETS[item.setId] : null;
  const full = !!set && setWorn >= set.pieces.length;
  const setLines = set
    ? [
        h('div', { class: 'item-line', style: `color:${color}` }, `${set.name} (${setWorn} of ${set.pieces.length})`),
        h('div', { class: 'item-line' + (full ? '' : ' dim'), style: full ? `color:${color}` : '' }, `Full set: ${(Object.entries(set.bonus) as [StatKey, number][]).map(([k, v]) => formatStat(k, v)).join(', ')}`),
      ]
    : [];
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
    ...setLines,
    item.affixes.length > 1 ? h('div', { class: 'item-line dim' }, item.affixes.slice(1).join(', ')) : null,
    Object.values(item.forge).some((n) => n > 0) ? h('div', { class: 'item-line dim' }, `Smelted ${Object.values(item.forge).reduce((a, b) => a + b, 0)} times`) : null,
  );
}
