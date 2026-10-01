import { RARITIES } from '../../data/items';
import { SETS, describeSetBonus } from '../../data/sets';
import { itemIconSprite } from '../../gen/pixel/icons';
import { shrunk } from '../../art/images';
import { formatStat, type StatKey } from '../../data/stats';
import type { Inventory } from '../../sim/items/inventory';
import { describeItem, type Item } from '../../sim/items/item';
import { clear, h, hex } from '../dom';

export interface GridCallbacks {
  onItemTap: (item: Item, grid: Inventory) => void;
  onCellTap: (col: number, row: number, grid: Inventory) => void;
  /** A small tag in the corner of each block (the merchant's price). */
  label?: (item: Item) => string;
  /** Blocks drawn faded (wares the hero's class cannot use). */
  dim?: (item: Item) => boolean;
  /** The pointer moved over an item, or off every item (null). */
  onItemHover?: (item: Item | null, x: number, y: number) => void;
}

/** Renders an item grid (the 16x18 bag or a 12x12 stash page) with items as blocks. Tapping an item selects it; tapping a cell moves the selection. */
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
    if (this.cb.onItemHover) {
      const hover = this.cb.onItemHover;
      this.root.onpointermove = (e) => {
        if (e.pointerType !== 'mouse') return;
        const rect = this.root.getBoundingClientRect();
        hover(this.grid.itemAt(Math.floor((e.clientX - rect.left) / this.cell), Math.floor((e.clientY - rect.top) / this.cell)), e.clientX, e.clientY);
      };
      this.root.onpointerleave = () => hover(null, 0, 0);
    }
    for (const item of this.grid.items) {
      const el = h('div', { class: 'grid-item' + (item === this.selected ? ' selected' : '') });
      el.style.left = `${item.col * this.cell}px`;
      el.style.top = `${item.row * this.cell}px`;
      el.style.width = `${item.size[0] * this.cell - 2}px`;
      el.style.height = `${item.size[1] * this.cell - 2}px`;
      el.style.borderColor = hex(RARITIES[item.rarity].color);
      if (this.cb.dim?.(item)) el.classList.add('dim-item');
      el.appendChild(fitItemIcon(item, item.size[0] * this.cell - 10, item.size[1] * this.cell - 10));
      const tag = this.cb.label?.(item);
      if (tag) el.appendChild(h('span', { class: 'price-tag' }, tag));
      this.root.appendChild(el);
    }
  }
}

/** The item's icon in a square of about `size` pixels. */
export function itemIcon(item: Item, size: number): HTMLCanvasElement {
  return fitItemIcon(item, size, size);
}

/**
 * The item's icon fitted into a box: drawn at the largest whole-number scale
 * that fits, or, when even its own size is too big for the box (a hand-made
 * drawing in a small slot), shrunk by a whole factor and drawn at one.
 */
export function fitItemIcon(item: Item, boxW: number, boxH: number): HTMLCanvasElement {
  let sprite = itemIconSprite(item.slot, item.weapon?.type ?? null, item.rarity, item.offhand ?? null, item.baseId);
  let s = Math.floor(Math.min(boxW / sprite.width, boxH / sprite.height));
  if (s < 1) {
    sprite = shrunk(sprite, Math.ceil(Math.max(sprite.width / Math.max(1, boxW), sprite.height / Math.max(1, boxH))));
    s = 1;
  }
  const c = document.createElement('canvas');
  c.className = 'px-icon';
  c.width = sprite.width;
  c.height = sprite.height;
  c.getContext('2d')!.drawImage(sprite, 0, 0);
  c.style.width = `${sprite.width * s}px`;
  c.style.height = `${sprite.height * s}px`;
  return c;
}

/** Tooltip body for an item. `setWorn` is how many pieces of its set the hero wears, for the set lines. */
export function itemCard(item: Item, compareTo: Item | null = null, setWorn = 0, playerLevel = Infinity): HTMLDivElement {
  const color = hex(RARITIES[item.rarity].color);
  const lines = describeItem(item);
  const stats = Object.entries(item.stats).filter(([, v]) => v) as [StatKey, number][];
  const set = item.setId ? SETS[item.setId] : null;
  const full = !!set && setWorn >= set.pieces.length;
  const setLines = set
    ? [
        h('div', { class: 'item-line', style: `color:${color}` }, `${set.name} (${setWorn} of ${set.pieces.length})`),
        h('div', { class: 'item-line' + (full ? '' : ' dim'), style: full ? `color:${color}` : '' }, `Full set: ${describeSetBonus(set).join(', ')}`),
      ]
    : [];
  return h(
    'div',
    { class: 'item-card' },
    h('div', { class: 'item-name', style: `color:${color}` }, item.name),
    h('div', { class: 'item-sub' }, `${RARITIES[item.rarity].name} ${item.slot}, `, h('span', { style: item.reqLevel > playerLevel ? 'color:#ff6a6a' : '' }, `level ${item.reqLevel}`), `, ${item.value} gold`),
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
