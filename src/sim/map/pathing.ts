import type { TileMap } from './tilemap';

/**
 * Flow field: every tile stores the direction toward the player. Enemies read one
 * cell instead of running their own search. Rebuilt only when the player changes tile.
 */
export class FlowField {
  readonly dist: Int32Array;
  readonly dirX: Int8Array;
  readonly dirZ: Int8Array;
  private readonly queue: Int32Array;
  targetC = -1;
  targetR = -1;

  constructor(private readonly map: TileMap) {
    const n = map.cols * map.rows;
    this.dist = new Int32Array(n);
    this.dirX = new Int8Array(n);
    this.dirZ = new Int8Array(n);
    this.queue = new Int32Array(n);
  }

  /** Recomputes if the target tile changed. Returns true when work was done. */
  update(x: number, z: number): boolean {
    const c = Math.floor(x);
    const r = Math.floor(z);
    if (c === this.targetC && r === this.targetR) return false;
    this.targetC = c;
    this.targetR = r;
    const { cols, rows } = this.map;
    this.dist.fill(-1);
    if (!this.map.walkable(c, r)) return true;
    let head = 0;
    let tail = 0;
    const start = r * cols + c;
    this.dist[start] = 0;
    this.dirX[start] = 0;
    this.dirZ[start] = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const i = this.queue[head++]!;
      const ic = i % cols;
      const ir = (i - ic) / cols;
      const d = this.dist[i]!;
      for (let k = 0; k < 4; k++) {
        const nc = ic + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nr = ir + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (this.dist[j] !== -1 || !this.map.walkable(nc, nr)) continue;
        this.dist[j] = d + 1;
        // Direction from the neighbour back toward this tile
        this.dirX[j] = ic - nc;
        this.dirZ[j] = ir - nr;
        this.queue[tail++] = j;
      }
    }
    return true;
  }

  /** Direction to move from a world position, or zeros if unreachable. */
  direction(x: number, z: number, out: { x: number; z: number }): void {
    const c = Math.floor(x);
    const r = Math.floor(z);
    if (c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) {
      out.x = 0;
      out.z = 0;
      return;
    }
    const i = r * this.map.cols + c;
    if (this.dist[i]! <= 0) {
      out.x = 0;
      out.z = 0;
      return;
    }
    // Blend the four neighbour directions to smooth diagonal movement
    let sx = this.dirX[i]!;
    let sz = this.dirZ[i]!;
    const d = this.dist[i]!;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nc < 0 || nr < 0 || nc >= this.map.cols || nr >= this.map.rows) continue;
      const j = nr * this.map.cols + nc;
      if (this.dist[j]! >= 0 && this.dist[j]! < d) {
        sx += (nc - c) * 0.5;
        sz += (nr - r) * 0.5;
      }
    }
    const len = Math.hypot(sx, sz) || 1;
    out.x = sx / len;
    out.z = sz / len;
  }

  distanceAt(x: number, z: number): number {
    const c = Math.floor(x);
    const r = Math.floor(z);
    if (c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return -1;
    return this.dist[r * this.map.cols + c]!;
  }
}

/** A* over tile centres with 8-way movement and no corner cutting. Returns world waypoints. */
export function findPath(map: TileMap, x0: number, z0: number, x1: number, z1: number, maxNodes = 6000): { x: number; z: number }[] | null {
  const sc = Math.floor(x0);
  const sr = Math.floor(z0);
  let tc = Math.floor(x1);
  let tr = Math.floor(z1);
  if (!map.walkable(tc, tr)) {
    // Snap the target to the nearest walkable tile within a small ring
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let r = tr - 3; r <= tr + 3; r++) {
      for (let c = tc - 3; c <= tc + 3; c++) {
        if (!map.walkable(c, r)) continue;
        const d = (c + 0.5 - x1) ** 2 + (r + 0.5 - z1) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [c, r];
        }
      }
    }
    if (!best) return null;
    [tc, tr] = best;
  }
  if (sc === tc && sr === tr) return [{ x: x1, z: z1 }];
  const cols = map.cols;
  const n = cols * map.rows;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const f = new Float32Array(n);
  const start = sr * cols + sc;
  const goal = tr * cols + tc;
  g[start] = 0;
  f[start] = Math.hypot(tc - sc, tr - sr);
  open.push(start);
  let expanded = 0;
  while (open.length) {
    // Smallest f (linear scan is fine for the sizes involved)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
    const cur = open[bi]!;
    open[bi] = open[open.length - 1]!;
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cc = cur % cols;
    const cr = (cur - cc) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (!map.walkable(nc, nr)) continue;
        if (dc && dr && (!map.walkable(cc + dc, cr) || !map.walkable(cc, cr + dr))) continue;
        const j = nr * cols + nc;
        if (closed[j]) continue;
        const cost = g[cur]! + (dc && dr ? 1.4142 : 1);
        if (cost < g[j]!) {
          g[j] = cost;
          came[j] = cur;
          f[j] = cost + Math.hypot(tc - nc, tr - nr);
          open.push(j);
        }
      }
    }
  }
  if (came[goal] === -1) return null;
  const path: { x: number; z: number }[] = [];
  let i = goal;
  while (i !== start) {
    const c = i % cols;
    const r = (i - c) / cols;
    path.push({ x: c + 0.5, z: r + 0.5 });
    i = came[i]!;
  }
  path.reverse();
  // End exactly where the player tapped
  if (path.length) path[path.length - 1] = { x: tc + 0.5 === x1 ? x1 : Math.max(tc + 0.15, Math.min(tc + 0.85, x1)), z: Math.max(tr + 0.15, Math.min(tr + 0.85, z1)) };
  // String-pull: drop waypoints that can be skipped in a straight line
  const pulled: { x: number; z: number }[] = [];
  let ax = x0;
  let az = z0;
  for (let k = 0; k < path.length; k++) {
    const next = path[k + 1];
    if (next && !map.lineBlocked(ax, az, next.x, next.z)) continue;
    const p = path[k]!;
    pulled.push(p);
    ax = p.x;
    az = p.z;
  }
  return pulled;
}
