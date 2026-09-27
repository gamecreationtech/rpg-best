import type { Item } from './item';

/** A grid of cells; items occupy rectangles. Used for the inventory and every stash page. */
export class Inventory {
  readonly items: Item[] = [];
  private readonly cells: Int32Array;

  constructor(public readonly cols: number, public readonly rows: number) {
    this.cells = new Int32Array(cols * rows).fill(-1);
  }

  itemAt(col: number, row: number): Item | null {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    const uid = this.cells[row * this.cols + col]!;
    if (uid < 0) return null;
    return this.items.find((i) => i.uid === uid) ?? null;
  }

  fits(item: Item, col: number, row: number, ignore: Item | null = null): boolean {
    const [w, h] = item.size;
    if (col < 0 || row < 0 || col + w > this.cols || row + h > this.rows) return false;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const uid = this.cells[r * this.cols + c]!;
        if (uid >= 0 && uid !== ignore?.uid) return false;
      }
    }
    return true;
  }

  place(item: Item, col: number, row: number): boolean {
    if (!this.fits(item, col, row, this.has(item) ? item : null)) return false;
    this.remove(item);
    item.col = col;
    item.row = row;
    this.items.push(item);
    this.mark(item, item.uid);
    return true;
  }

  /** Finds the first free spot, top-left first. */
  add(item: Item): boolean {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.fits(item, c, r)) return this.place(item, c, r);
      }
    }
    return false;
  }

  remove(item: Item): boolean {
    const idx = this.items.findIndex((i) => i.uid === item.uid);
    if (idx < 0) return false;
    const stored = this.items[idx]!;
    this.mark(stored, -1);
    this.items.splice(idx, 1);
    stored.col = -1;
    stored.row = -1;
    return true;
  }

  has(item: Item): boolean {
    return this.items.some((i) => i.uid === item.uid);
  }

  get freeCells(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]! < 0) n++;
    return n;
  }

  private mark(item: Item, value: number): void {
    const [w, h] = item.size;
    for (let r = item.row; r < item.row + h; r++) {
      for (let c = item.col; c < item.col + w; c++) {
        this.cells[r * this.cols + c] = value;
      }
    }
  }

  clear(): void {
    this.items.length = 0;
    this.cells.fill(-1);
  }
}
