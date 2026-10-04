import { describe, expect, it } from 'vitest';
import { createPlayer } from '../sim/player';
import { World } from '../sim/world';
import { DUMMIES } from './dummies';
import { TOWN_BOUNDS, TOWN_LAYOUT, copyTownLayout, parseTownLayoutCode, townLayoutCode, townPieces } from './townLayout';

describe('town layout', () => {
  it('reads its own code back unchanged', () => {
    const moved = copyTownLayout(TOWN_LAYOUT);
    moved.waypoint = [12.3, 20.1];
    moved.braziers[2] = [8, 9.5];
    const back = parseTownLayoutCode(townLayoutCode(moved));
    expect(back).toEqual(moved);
  });

  it('refuses a code that is not a whole town', () => {
    expect(parseTownLayoutCode('hello')).toBeNull();
    const code = townLayoutCode(TOWN_LAYOUT);
    const wp = `"waypoint": ${JSON.stringify(TOWN_LAYOUT.waypoint)}`;
    expect(code).toContain(wp);
    expect(parseTownLayoutCode(code.replace(wp, `"waypoint": [${TOWN_LAYOUT.waypoint[0]}]`))).toBeNull();
    const short = copyTownLayout(TOWN_LAYOUT);
    short.pillars.pop();
    expect(parseTownLayoutCode(townLayoutCode(short))).toBeNull();
  });

  it('keeps every piece inside the open part of town and has one spot per dummy', () => {
    expect(TOWN_LAYOUT.dummies).toHaveLength(DUMMIES.length);
    for (const p of townPieces(TOWN_LAYOUT)) {
      expect(p.spot[0]).toBeGreaterThanOrEqual(TOWN_BOUNDS.minX);
      expect(p.spot[0]).toBeLessThanOrEqual(TOWN_BOUNDS.maxX);
      expect(p.spot[1]).toBeGreaterThanOrEqual(TOWN_BOUNDS.minZ);
      expect(p.spot[1]).toBeLessThanOrEqual(TOWN_BOUNDS.maxZ);
    }
  });

  it('moves the stations and dummies in a running town at once', () => {
    const w = new World(createPlayer('knight', 'paladin'), 1);
    expect(w.area).toBe('town');
    const moved = copyTownLayout(TOWN_LAYOUT);
    moved.waypoint = [10, 10];
    moved.vendor = [20, 25];
    moved.dummies[0] = [35, 8];
    const version = w.townVersion;
    w.applyTownLayout(moved);
    expect(w.townVersion).toBe(version + 1);
    const at = (kind: string) => w.interactables.find((i) => i.kind === kind)!;
    expect([at('waypoint').x, at('waypoint').z]).toEqual([10, 10]);
    expect([at('vendor').x, at('vendor').z]).toEqual([20, 25]);
    const dummy = w.enemies.find((e) => e.alive && e.dummy === DUMMIES[0])!;
    expect([dummy.x, dummy.z]).toEqual([35, 8]);
    // The layout is copied, so changing the draft afterwards moves nothing
    moved.waypoint[0] = 5;
    expect(w.town.waypoint.x).toBe(10);
  });
});
