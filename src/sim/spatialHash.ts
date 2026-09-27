/**
 * Uniform grid over the map for neighbour queries. Uses linked lists in typed
 * arrays, so rebuilding every tick allocates nothing.
 */
export class SpatialHash {
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly cellsX: number;
  private readonly cellsZ: number;

  constructor(width: number, depth: number, public readonly cellSize: number, capacity: number) {
    this.cellsX = Math.ceil(width / cellSize);
    this.cellsZ = Math.ceil(depth / cellSize);
    this.head = new Int32Array(this.cellsX * this.cellsZ);
    this.next = new Int32Array(capacity);
  }

  clear(): void {
    this.head.fill(-1);
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.max(0, Math.min(this.cellsX - 1, Math.floor(x / this.cellSize)));
    const cz = Math.max(0, Math.min(this.cellsZ - 1, Math.floor(z / this.cellSize)));
    const cell = cz * this.cellsX + cx;
    this.next[id] = this.head[cell]!;
    this.head[cell] = id;
  }

  /** Calls `fn` for every id whose cell overlaps the circle. Callers do the exact distance test. */
  query(x: number, z: number, radius: number, fn: (id: number) => void): void {
    const cx0 = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const cx1 = Math.min(this.cellsX - 1, Math.floor((x + radius) / this.cellSize));
    const cz0 = Math.max(0, Math.floor((z - radius) / this.cellSize));
    const cz1 = Math.min(this.cellsZ - 1, Math.floor((z + radius) / this.cellSize));
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        let id = this.head[cz * this.cellsX + cx]!;
        while (id !== -1) {
          fn(id);
          id = this.next[id]!;
        }
      }
    }
  }
}
