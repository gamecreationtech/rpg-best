/** Isometric 2:1 projection constants: one world unit (a tile) is a 32x16 diamond. */
export const TILE_W = 32;
export const TILE_H = 16;
/** Pixels per world unit of height. */
export const Y_PX = 12;
/** Ellipse radii on the floor for a world circle of radius 1. */
export const RING_RX = (TILE_W / 2) * Math.SQRT2;
export const RING_RY = RING_RX / 2;

export interface Projector {
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean;
}

/**
 * The camera: a small internal frame scaled up by a whole number so every source
 * pixel stays a crisp square. Positions are snapped to whole pixels. The
 * projection converts world units (x east, z south, y up) to frame pixels and
 * to window pixels for the HTML overlays.
 */
export class IsoCamera implements Projector {
  /** Internal frame size in pixels. */
  width = 640;
  height = 360;
  /** Whole-number upscale. */
  scale = 2;
  /** Where the frame sits in the window. */
  offsetX = 0;
  offsetY = 0;
  /** Frame pixel at the top-left of the view. */
  camX = 0;
  camY = 0;
  private windowW = 1280;
  private windowH = 720;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private lookX = 0;
  private lookZ = 0;
  private targetX = 0;
  private targetZ = 0;

  /** Chooses the frame size for the window: about 640x360 at a whole-number scale, always filling the window. */
  fit(windowW: number, windowH: number, targetW = 640, targetH = 360): void {
    this.windowW = windowW;
    this.windowH = windowH;
    this.scale = Math.max(1, Math.floor(Math.min(windowW / targetW, windowH / targetH)));
    this.width = Math.ceil(windowW / this.scale);
    this.height = Math.ceil(windowH / this.scale);
    this.offsetX = Math.floor((windowW - this.width * this.scale) / 2);
    this.offsetY = Math.floor((windowH - this.height * this.scale) / 2);
  }

  snapTo(x: number, z: number): void {
    this.lookX = this.targetX = x;
    this.lookZ = this.targetZ = z;
    this.updateCam();
  }

  lookAt(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
  }

  kick(k: number): void {
    this.shake = Math.min(1, this.shake + k);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 9);
    this.lookX += (this.targetX - this.lookX) * k;
    this.lookZ += (this.targetZ - this.lookZ) * k;
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 7);
      this.shakeX = Math.round((Math.random() - 0.5) * this.shake * 8);
      this.shakeY = Math.round((Math.random() - 0.5) * this.shake * 6);
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this.updateCam();
  }

  private updateCam(): void {
    const sx = (this.lookX - this.lookZ) * (TILE_W / 2);
    const sy = (this.lookX + this.lookZ) * (TILE_H / 2);
    this.camX = Math.round(sx - this.width / 2) + this.shakeX;
    this.camY = Math.round(sy - this.height / 2) + this.shakeY;
  }

  /** World to frame pixels (unrounded). */
  frameX(x: number, z: number): number {
    return (x - z) * (TILE_W / 2) - this.camX;
  }

  frameY(x: number, y: number, z: number): number {
    return (x + z) * (TILE_H / 2) - y * Y_PX - this.camY;
  }

  /** Depth for painter's ordering: larger draws later (closer to the viewer). */
  depth(x: number, z: number): number {
    return x + z;
  }

  /** World to window pixels, for HTML overlays. Always succeeds; the caller clips. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    out.x = this.offsetX + this.frameX(x, z) * this.scale;
    out.y = this.offsetY + this.frameY(x, y, z) * this.scale;
    return out.x > -200 && out.y > -200 && out.x < this.windowW + 200 && out.y < this.windowH + 200;
  }

  /** Window pixels to the world point on the floor under them. */
  unproject(sx: number, sy: number, out: { x: number; z: number }): boolean {
    const fx = (sx - this.offsetX) / this.scale + this.camX;
    const fy = (sy - this.offsetY) / this.scale + this.camY;
    const a = fx / (TILE_W / 2);
    const b = fy / (TILE_H / 2);
    out.x = (a + b) / 2;
    out.z = (b - a) / 2;
    return true;
  }

  /** A direction on the screen (right, down) to the matching world direction, unit length. */
  screenDirToWorld(dx: number, dy: number, out: { x: number; z: number }): void {
    // Screen x = (x - z), screen y = (x + z) / 2 in tile units
    const x = (dx + 2 * dy) / 2;
    const z = (2 * dy - dx) / 2;
    const len = Math.hypot(x, z);
    if (len < 1e-6) {
      out.x = 0;
      out.z = 0;
      return;
    }
    const k = Math.min(1, Math.hypot(dx, dy)) / len;
    out.x = x * k;
    out.z = z * k;
  }
}
