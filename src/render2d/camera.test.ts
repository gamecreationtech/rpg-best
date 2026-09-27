import { describe, expect, it } from 'vitest';
import { IsoCamera, TILE_H, TILE_W } from './camera';

describe('IsoCamera', () => {
  it('fits the window at a whole-number scale that fills it', () => {
    const cam = new IsoCamera();
    cam.fit(1280, 720);
    expect(cam.scale).toBe(2);
    expect(cam.width).toBe(640);
    expect(cam.height).toBe(360);
    cam.fit(1440, 900);
    expect(cam.scale).toBe(2);
    expect(cam.width * cam.scale).toBeGreaterThanOrEqual(1440);
    expect(cam.height * cam.scale).toBeGreaterThanOrEqual(900);
  });

  it('unprojects what it projects on the floor', () => {
    const cam = new IsoCamera();
    cam.fit(1280, 720);
    cam.snapTo(20, 15);
    const win = { x: 0, y: 0 };
    const back = { x: 0, z: 0 };
    for (const [x, z] of [[20, 15], [3.25, 7.5], [40, 2]] as const) {
      cam.project(x, 0, z, win);
      cam.unproject(win.x, win.y, back);
      expect(back.x).toBeCloseTo(x, 5);
      expect(back.z).toBeCloseTo(z, 5);
    }
  });

  it('keeps the look point in the middle of the frame', () => {
    const cam = new IsoCamera();
    cam.fit(1280, 720);
    cam.snapTo(10, 10);
    expect(Math.round(cam.frameX(10, 10))).toBe(320);
    expect(Math.round(cam.frameY(10, 0, 10))).toBe(180);
    // One tile east moves half a tile right and half a tile down on screen
    expect(cam.frameX(11, 10) - cam.frameX(10, 10)).toBe(TILE_W / 2);
    expect(cam.frameY(11, 0, 10) - cam.frameY(10, 0, 10)).toBe(TILE_H / 2);
  });

  it('turns screen directions into world directions', () => {
    const cam = new IsoCamera();
    const out = { x: 0, z: 0 };
    // Screen up is world north-west (-x, -z)
    cam.screenDirToWorld(0, -1, out);
    expect(out.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(out.z).toBeCloseTo(-Math.SQRT1_2, 5);
    // Screen right is world (+x, -z)
    cam.screenDirToWorld(1, 0, out);
    expect(out.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(out.z).toBeCloseTo(-Math.SQRT1_2, 5);
    cam.screenDirToWorld(0, 0, out);
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
  });
});
