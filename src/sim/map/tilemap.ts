import type { ZoneLayout } from '../../data/zones';
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

  /**
   * Moves a circle from (x, z) toward (nx, nz), sliding along any wall it
   * meets instead of stopping dead. The circle is pushed out of every wall
   * tile it overlaps; if it still overlaps afterwards (a wall corner pinches
   * it), the move falls back to one axis at a time, and finally stays put.
   */
  slide(x: number, z: number, nx: number, nz: number, radius: number, out: { x: number; z: number }): void {
    let sx = nx;
    let sz = nz;
    for (let pass = 0; pass < 3; pass++) {
      const c0 = Math.floor(sx - radius);
      const c1 = Math.floor(sx + radius);
      const r0 = Math.floor(sz - radius);
      const r1 = Math.floor(sz + radius);
      let pushed = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (this.walkable(c, r)) continue;
          const px = Math.max(c, Math.min(sx, c + 1));
          const pz = Math.max(r, Math.min(sz, r + 1));
          const dx = sx - px;
          const dz = sz - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const push = radius - d + 0.001;
          sx += (dx / d) * push;
          sz += (dz / d) * push;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    if (!this.circleBlocked(sx, sz, radius) && Math.hypot(sx - x, sz - z) <= Math.hypot(nx - x, nz - z) + 0.01) {
      out.x = sx;
      out.z = sz;
      return;
    }
    out.x = this.circleBlocked(nx, z, radius) ? x : nx;
    out.z = this.circleBlocked(out.x, nz, radius) ? z : nz;
  }

  /** Reports whether a straight line crosses a wall, visiting every tile the line touches. */
  lineBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
    let c = Math.floor(x0);
    let r = Math.floor(z0);
    const c1 = Math.floor(x1);
    const r1 = Math.floor(z1);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const stepC = dx > 0 ? 1 : -1;
    const stepR = dz > 0 ? 1 : -1;
    const tDeltaC = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaR = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxC = dx !== 0 ? (dx > 0 ? c + 1 - x0 : x0 - c) * tDeltaC : Infinity;
    let tMaxR = dz !== 0 ? (dz > 0 ? r + 1 - z0 : z0 - r) * tDeltaR : Infinity;
    for (let i = 0; i < 4096; i++) {
      if (!this.walkable(c, r)) return true;
      if (c === c1 && r === r1) return false;
      if (tMaxC < tMaxR) {
        c += stepC;
        tMaxC += tDeltaC;
      } else {
        r += stepR;
        tMaxR += tDeltaR;
      }
      if (tMaxC > 1 && tMaxR > 1 && (c !== c1 || r !== r1)) return false;
    }
    return false;
  }

  /** Like lineBlocked, but for a body of the given radius: the centre line and both edges must be clear. */
  lineBlockedWide(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
    if (this.lineBlocked(x0, z0, x1, z1)) return true;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return this.circleBlocked(x0, z0, radius);
    const nx = (-dz / len) * radius;
    const nz = (dx / len) * radius;
    return this.lineBlocked(x0 + nx, z0 + nz, x1 + nx, z1 + nz) || this.lineBlocked(x0 - nx, z0 - nz, x1 - nx, z1 - nz);
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

/** The old open field, kept for tests and as the Proving Grounds layout. */
export function buildArena(seed: number): ArenaLayout {
  return buildZone('field', 80, 60, seed);
}

/**
 * Builds a zone map of the given layout. Every layout walls the border two
 * tiles thick, clears a spawn area on the left, floods from the spawn and
 * seals off every pocket the hero could not reach.
 */
export function buildZone(layout: ZoneLayout, cols: number, rows: number, seed: number): ArenaLayout {
  const rng = new Rng(seed);
  const map = new TileMap(cols, rows, layout === 'caves' || layout === 'crypt' ? Tile.Wall : Tile.Floor);
  const spawn = { x: 8.5, z: Math.floor(rows / 2) + 0.5 };
  switch (layout) {
    case 'field': carveField(map, rng, spawn); break;
    case 'caves': carveCaves(map, rng, spawn); break;
    case 'ruins': carveRuins(map, rng, spawn); break;
    case 'crypt': carveCrypt(map, rng, spawn); break;
  }
  // Border and the spawn clearing
  for (let c = 0; c < cols; c++) for (const r of [0, 1, rows - 1, rows - 2]) map.set(c, r, Tile.Wall);
  for (let r = 0; r < rows; r++) for (const c of [0, 1, cols - 1, cols - 2]) map.set(c, r, Tile.Wall);
  const sc = Math.floor(spawn.x);
  const sr = Math.floor(spawn.z);
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) if (Math.hypot(dc, dr) <= 4.2) map.set(sc + dc, sr + dr, Tile.Floor);
  const reachable = map.reachableFrom(sc, sr);
  for (let i = 0; i < reachable.length; i++) if (!reachable[i] && map.tiles[i] !== Tile.Wall) map.tiles[i] = Tile.Wall;
  return { map, spawn, reachable };
}

/** Open field: scattered rock blobs, wall segments and pillars. */
function carveField(map: TileMap, rng: Rng, spawn: { x: number; z: number }): void {
  const { cols, rows } = map;
  const clear = (c: number, r: number) => Math.abs(c - spawn.x) <= 5 && Math.abs(r - spawn.z) <= 5;
  const wall = (c: number, r: number) => {
    if (clear(c, r) || c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2) return;
    map.set(c, r, Tile.Wall);
  };
  const count = Math.round((cols * rows) / 53);
  for (let i = 0; i < count; i++) {
    const kind = rng.next();
    const c = rng.int(3, cols - 4);
    const r = rng.int(3, rows - 4);
    if (kind < 0.45) {
      const radius = rng.int(1, 4);
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const d = Math.hypot(dc, dr) + rng.range(-0.6, 0.6);
          if (d <= radius) wall(c + dc, r + dr);
        }
      }
    } else if (kind < 0.75) {
      const len = rng.int(3, 9);
      const horizontal = rng.next() < 0.5;
      for (let k = 0; k < len; k++) wall(c + (horizontal ? k : 0), r + (horizontal ? 0 : k));
    } else {
      const w = rng.int(1, 3);
      const h = rng.int(1, 3);
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) wall(c + dc, r + dr);
    }
  }
}

/** Caves: random fill smoothed a few times, the classic cellular automaton. */
function carveCaves(map: TileMap, rng: Rng, spawn: { x: number; z: number }): void {
  const { cols, rows } = map;
  let cells = new Uint8Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = rng.next() < 0.46 ? 1 : 0;
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const cc = c + dc;
            const rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) n++;
            else n += cells[rr * cols + cc]!;
          }
        }
        next[r * cols + c] = n >= 5 || (pass < 3 && n <= 1) ? 1 : 0;
      }
    }
    cells = next;
  }
  for (let i = 0; i < cells.length; i++) map.tiles[i] = cells[i] ? Tile.Wall : Tile.Floor;
  // A few winding tunnels so the big chambers connect
  for (let t = 0; t < 12; t++) {
    let c = rng.int(4, cols - 5);
    let r = rng.int(4, rows - 5);
    let a = rng.range(0, Math.PI * 2);
    for (let k = 0; k < 60; k++) {
      map.set(c, r, Tile.Floor);
      map.set(c + 1, r, Tile.Floor);
      a += rng.range(-0.6, 0.6);
      c = Math.max(3, Math.min(cols - 4, c + Math.round(Math.cos(a))));
      r = Math.max(3, Math.min(rows - 4, r + Math.round(Math.sin(a))));
    }
  }
  // A tunnel from the spawn into the caves
  let c = Math.floor(spawn.x);
  const r = Math.floor(spawn.z);
  while (c < cols / 2 && map.get(c + 5, r) === Tile.Wall) {
    map.set(c, r, Tile.Floor);
    map.set(c, r + 1, Tile.Floor);
    c++;
  }
}

/** Ruins: broken building outlines with gaps and fallen pillars on open ground. */
function carveRuins(map: TileMap, rng: Rng, spawn: { x: number; z: number }): void {
  const { cols, rows } = map;
  const clear = (c: number, r: number) => Math.abs(c - spawn.x) <= 6 && Math.abs(r - spawn.z) <= 6;
  const wall = (c: number, r: number) => {
    if (clear(c, r) || c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2) return;
    map.set(c, r, Tile.Wall);
  };
  const buildings = Math.round((cols * rows) / 190);
  for (let i = 0; i < buildings; i++) {
    const w = rng.int(5, 12);
    const h = rng.int(4, 9);
    const c0 = rng.int(3, cols - w - 3);
    const r0 = rng.int(3, rows - h - 3);
    const broken = rng.next() < 0.4;
    for (let c = c0; c <= c0 + w; c++) {
      for (let r = r0; r <= r0 + h; r++) {
        const edge = c === c0 || c === c0 + w || r === r0 || r === r0 + h;
        if (!edge) continue;
        // Doorways, and missing stones on the ruined ones
        if (rng.next() < (broken ? 0.35 : 0.12)) continue;
        wall(c, r);
      }
    }
    // A pillar or two inside the larger halls
    if (w >= 8 && h >= 6) {
      wall(c0 + Math.floor(w / 3), r0 + Math.floor(h / 2));
      wall(c0 + Math.floor((2 * w) / 3), r0 + Math.floor(h / 2));
    }
  }
  // Fallen columns and rubble between the buildings
  for (let i = 0; i < Math.round((cols * rows) / 120); i++) {
    const c = rng.int(3, cols - 4);
    const r = rng.int(3, rows - 4);
    const len = rng.int(1, 4);
    const horizontal = rng.next() < 0.5;
    for (let k = 0; k < len; k++) wall(c + (horizontal ? k : 0), r + (horizontal ? 0 : k));
  }
}

/** Crypt: rooms joined by corridors, with rows of pillars in the halls. */
function carveCrypt(map: TileMap, rng: Rng, spawn: { x: number; z: number }): void {
  const { cols, rows } = map;
  const rooms: { c: number; r: number; w: number; h: number }[] = [{ c: Math.floor(spawn.x) - 4, r: Math.floor(spawn.z) - 4, w: 9, h: 9 }];
  const floor = (c: number, r: number) => {
    if (c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2) return;
    map.set(c, r, Tile.Floor);
  };
  const carve = (room: { c: number; r: number; w: number; h: number }) => {
    for (let r = room.r; r < room.r + room.h; r++) for (let c = room.c; c < room.c + room.w; c++) floor(c, r);
  };
  carve(rooms[0]!);
  const target = Math.round((cols * rows) / 260);
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = rng.int(6, 14);
    const h = rng.int(5, 11);
    const c = rng.int(3, cols - w - 3);
    const r = rng.int(3, rows - h - 3);
    if (rooms.some((o) => c < o.c + o.w + 2 && c + w + 2 > o.c && r < o.r + o.h + 2 && r + h + 2 > o.r)) continue;
    const room = { c, r, w, h };
    carve(room);
    // Pillars in the big halls
    if (w >= 9 && h >= 7) {
      for (let pc = c + 2; pc < c + w - 2; pc += 3) for (let pr = r + 2; pr < r + h - 2; pr += 3) map.set(pc, pr, Tile.Wall);
    }
    rooms.push(room);
  }
  // Corridors: each room to the nearest earlier room, two tiles wide, L-shaped
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i]!;
    let best = rooms[0]!;
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const b = rooms[j]!;
      const d = Math.hypot(a.c - b.c, a.r - b.r);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    const ac = a.c + Math.floor(a.w / 2);
    const ar = a.r + Math.floor(a.h / 2);
    const bc = best.c + Math.floor(best.w / 2);
    const br = best.r + Math.floor(best.h / 2);
    const horizontalFirst = rng.next() < 0.5;
    const dig = (c0: number, c1: number, r0: number, r1: number) => {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
        floor(c, r);
        floor(c + 1, r);
        floor(c, r + 1);
      }
    };
    if (horizontalFirst) {
      dig(ac, bc, ar, ar);
      dig(bc, bc, ar, br);
    } else {
      dig(ac, ac, ar, br);
      dig(ac, bc, br, br);
    }
  }
}
