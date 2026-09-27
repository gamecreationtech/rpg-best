import { describe, expect, it } from 'vitest';
import { FlowField, findPath } from './pathing';
import { Tile, TileMap, buildArena, buildTown } from './tilemap';

describe('maps', () => {
  it('town is a walled safe field', () => {
    const t = buildTown();
    expect(t.map.get(0, 0)).toBe(Tile.Wall);
    expect(t.map.get(22, 20)).toBe(Tile.Safe);
    expect(t.map.circleBlocked(t.spawn.x, t.spawn.z, 0.4)).toBe(false);
  });

  it('arena keeps the entrance clear and everything reachable', () => {
    const a = buildArena(5);
    expect(a.map.walkable(8, 27)).toBe(true);
    let floors = 0;
    let reachable = 0;
    for (let i = 0; i < a.map.tiles.length; i++) {
      if (a.map.tiles[i] !== Tile.Wall) floors++;
      if (a.reachable[i]) reachable++;
    }
    expect(floors).toBe(reachable);
    expect(floors).toBeGreaterThan(2000);
  });

  it('is deterministic per seed', () => {
    const a = buildArena(11);
    const b = buildArena(11);
    expect(Array.from(a.map.tiles)).toEqual(Array.from(b.map.tiles));
  });
});

describe('sliding', () => {
  it('slides a body along a wall corner instead of snagging on it', () => {
    const m = new TileMap(10, 10);
    m.set(3, 3, Tile.Wall);
    // A body just clipping the corner of the wall tile wants to move straight up
    const out = { x: 0, z: 0 };
    m.slide(4.36, 4.2, 4.36, 4.1, 0.38, out);
    expect(out.z).toBeLessThan(4.2);
    expect(out.x).toBeGreaterThan(4.36);
    expect(m.circleBlocked(out.x, out.z, 0.38)).toBe(false);
    // Straight into a flat wall it stops at the wall, keeping the sideways part
    m.slide(4.5, 3.5, 3.7, 3.6, 0.38, out);
    expect(out.x).toBeGreaterThanOrEqual(4.38);
    expect(out.z).toBeCloseTo(3.6, 3);
    expect(m.circleBlocked(out.x, out.z, 0.38)).toBe(false);
  });
});

describe('line of sight', () => {
  it('catches a wall tile the line only clips at a corner', () => {
    const m = new TileMap(10, 10);
    m.set(5, 5, Tile.Wall);
    // A line that crosses the wall tile's corner region for less than a third of a tile
    expect(m.lineBlocked(4.2, 5.95, 6.2, 5.05)).toBe(true);
    expect(m.lineBlocked(4.2, 6.2, 6.2, 6.2)).toBe(false);
    expect(m.lineBlocked(5.5, 2, 5.5, 4.9)).toBe(false);
    expect(m.lineBlocked(5.5, 2, 5.5, 5.1)).toBe(true);
    expect(m.lineBlocked(2.5, 2.5, 2.5, 2.5)).toBe(false);
  });
});

describe('pathing', () => {
  const map = new TileMap(10, 10, Tile.Floor);
  for (let r = 0; r < 8; r++) map.set(5, r, Tile.Wall);

  it('string-pulling never cuts a wall corner a body could not pass', () => {
    const m = new TileMap(12, 12);
    // A wall column; the goal is diagonally past its bottom end, a corner a straight line just grazes
    for (let r = 2; r <= 5; r++) m.set(6, r, Tile.Wall);
    const path = findPath(m, 5.5, 6.7, 7.5, 5.5)!;
    expect(path).not.toBeNull();
    // The first leg must clear the corner: no waypoint reached in a straight line whose body clips the wall
    let ax = 5.5;
    let az = 6.7;
    for (const p of path) {
      expect(m.lineBlockedWide(ax, az, p.x, p.z, 0.38)).toBe(false);
      ax = p.x;
      az = p.z;
    }
  });

  it('A* routes around a wall', () => {
    const path = findPath(map, 2.5, 2.5, 7.5, 2.5)!;
    expect(path).not.toBeNull();
    const last = path[path.length - 1]!;
    expect(last.x).toBeCloseTo(7.5, 1);
    expect(path.some((p) => p.z > 7)).toBe(true);
    for (let i = 1; i < path.length; i++) {
      expect(map.lineBlocked(path[i - 1]!.x, path[i - 1]!.z, path[i]!.x, path[i]!.z)).toBe(false);
    }
  });

  it('flow field points toward the target', () => {
    const ff = new FlowField(map);
    ff.update(2.5, 2.5);
    const out = { x: 0, z: 0 };
    ff.direction(7.5, 2.5, out);
    expect(out.z).toBeGreaterThan(0); // must go down around the wall
    ff.direction(3.5, 2.5, out);
    expect(out.x).toBeLessThan(0);
    expect(ff.update(2.5, 2.5)).toBe(false);
  });
});
