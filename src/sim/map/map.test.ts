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

describe('pathing', () => {
  const map = new TileMap(10, 10, Tile.Floor);
  for (let r = 0; r < 8; r++) map.set(5, r, Tile.Wall);

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
