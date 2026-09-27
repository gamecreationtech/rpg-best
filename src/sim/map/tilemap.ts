import { Rng } from '../../gen/rng';

export const Tile = {
  Wall: 0,
  Floor: 1,
  Door: 2,
  Stair: 3,
  Safe: 4,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/** One unit per tile. World x maps to columns, world z maps to rows. */
export class TileMap {
  readonly tiles: Uint8Array;

  constructor(public readonly cols: number, public readonly rows: number, fill: TileId = Tile.Floor) {
    this.tiles = new Uint8Array(cols * rows).fill(fill);
  }

  get(c: number, r: number): TileId {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return Tile.Wall;
    return this.tiles[r * this.cols + c] as TileId;
  }

  set(c: number, r: number, t: TileId): void {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    this.tiles[r * this.cols + c] = t;
  }

  walkable(c: number, r: number): boolean {
    return this.get(c, r) !== Tile.Wall;
  }

  /** Is the world position inside a wall tile? */
  blockedAt(x: number, z: number): boolean {
    return !this.walkable(Math.floor(x), Math.floor(z));
  }

  /** Does a circle at (x, z) overlap any wall? */
  circleBlocked(x: number, z: number, radius: number): boolean {
    const c0 = Math.floor(x - radius);
    const c1 = Math.floor(x + radius);
    const r0 = Math.floor(z - radius);
    const r1 = Math.floor(z + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.walkable(c, r)) continue;
        // Closest point on the tile to the circle centre
        const px = Math.max(c, Math.min(x, c + 1));
        const pz = Math.max(r, Math.min(z, r + 1));
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz < radius * radius) return true;
      }
    }
    return false;
  }

  /** Walks a straight line and reports whether it crosses a wall. */
  lineBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) * 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.blockedAt(x0 + dx * t, z0 + dz * t)) return true;
    }
    return false;
  }

  /** Flood fill from a tile; returns a mask of reachable tiles. */
  reachableFrom(c: number, r: number): Uint8Array {
    const seen = new Uint8Array(this.cols * this.rows);
    if (!this.walkable(c, r)) return seen;
    const stack = [r * this.cols + c];
    seen[r * this.cols + c] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const cc = i % this.cols;
      const rr = (i - cc) / this.cols;
      const n: [number, number][] = [[cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]];
      for (const [nc, nr] of n) {
        if (!this.walkable(nc, nr)) continue;
        const j = nr * this.cols + nc;
        if (seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return seen;
  }
}

export interface TownLayout {
  map: TileMap;
  spawn: { x: number; z: number };
  vendor: { x: number; z: number };
  stash: { x: number; z: number };
  forge: { x: number; z: number };
  bloodfountain: { x: number; z: number };
  arcana: { x: number; z: number };
  waypoint: { x: number; z: number };
  /** Where the return portal appears after visiting the proving grounds. */
  returnPortal: { x: number; z: number };
  dummies: { x: number; z: number }[];
}

/** Town: 44 x 33 tiles, safe zone cols 2-41 rows 2-30, no enemies, no obstacles. */
export function buildTown(): TownLayout {
  const map = new TileMap(44, 33, Tile.Wall);
  for (let r = 2; r <= 30; r++) for (let c = 2; c <= 41; c++) map.set(c, r, Tile.Safe);
  return {
    map,
    spawn: { x: 23, z: 15 },
    vendor: { x: 15.5, z: 12.5 },
    stash: { x: 19.5, z: 9.5 },
    forge: { x: 27.5, z: 9.5 },
    bloodfountain: { x: 31.5, z: 12.5 },
    arcana: { x: 23.5, z: 8 },
    waypoint: { x: 30.5, z: 18.5 },
    returnPortal: { x: 34.5, z: 21.5 },
    dummies: [12.5, 15.5, 18.5, 21.5, 24.5].map((x) => ({ x, z: 22.5 })),
  };
}

export interface ArenaLayout {
  map: TileMap;
  spawn: { x: number; z: number };
  /** Reachable floor tiles as (col,row) pairs, for enemy spawning. */
  reachable: Uint8Array;
}

/** Open field: 80 x 60 tiles with about 90 scattered obstacle clusters. */
export function buildArena(seed: number): ArenaLayout {
  const cols = 80;
  const rows = 60;
  const map = new TileMap(cols, rows, Tile.Floor);
  const rng = new Rng(seed);
  for (let c = 0; c < cols; c++) {
    map.set(c, 0, Tile.Wall);
    map.set(c, 1, Tile.Wall);
    map.set(c, rows - 1, Tile.Wall);
    map.set(c, rows - 2, Tile.Wall);
  }
  for (let r = 0; r < rows; r++) {
    map.set(0, r, Tile.Wall);
    map.set(1, r, Tile.Wall);
    map.set(cols - 1, r, Tile.Wall);
    map.set(cols - 2, r, Tile.Wall);
  }
  const spawn = { x: 8.5, z: 27.5 };
  const clear = (c: number, r: number) => Math.abs(c - 8) <= 5 && Math.abs(r - 27) <= 5;
  const wall = (c: number, r: number) => {
    if (clear(c, r) || c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2) return;
    map.set(c, r, Tile.Wall);
  };
  for (let i = 0; i < 90; i++) {
    const kind = rng.next();
    const c = rng.int(3, cols - 4);
    const r = rng.int(3, rows - 4);
    if (kind < 0.45) {
      // Irregular rock blob
      const radius = rng.int(1, 4);
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const d = Math.hypot(dc, dr) + rng.range(-0.6, 0.6);
          if (d <= radius) wall(c + dc, r + dr);
        }
      }
    } else if (kind < 0.75) {
      // Wall segment
      const len = rng.int(3, 9);
      const horizontal = rng.next() < 0.5;
      for (let k = 0; k < len; k++) wall(c + (horizontal ? k : 0), r + (horizontal ? 0 : k));
    } else {
      // Pillar or block
      const w = rng.int(1, 3);
      const h = rng.int(1, 3);
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) wall(c + dc, r + dr);
    }
  }
  const reachable = map.reachableFrom(Math.floor(spawn.x), Math.floor(spawn.z));
  // Seal off pockets the player cannot reach so nothing spawns there
  for (let i = 0; i < reachable.length; i++) if (!reachable[i] && map.tiles[i] !== Tile.Wall) map.tiles[i] = Tile.Wall;
  return { map, spawn, reachable };
}
