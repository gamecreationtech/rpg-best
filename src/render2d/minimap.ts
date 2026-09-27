import { Tile } from '../sim/map/tilemap';
import type { World } from '../sim/world';

/** A small canvas drawn from the tile map a few times a second. Code-drawn, no images. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private timer = 0;
  private base: HTMLCanvasElement | null = null;
  private baseArea = '';

  constructor(parent: HTMLElement, private readonly world: World, private readonly size: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = size;
    this.canvas.height = Math.round(size * 0.75);
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  private rebuildBase(): void {
    const map = this.world.map;
    const base = document.createElement('canvas');
    base.width = map.cols;
    base.height = map.rows;
    const c = base.getContext('2d')!;
    const img = c.createImageData(map.cols, map.rows);
    for (let i = 0; i < map.tiles.length; i++) {
      const t = map.tiles[i];
      const o = i * 4;
      let rgb: [number, number, number] = [26, 24, 30];
      if (t === Tile.Floor) rgb = [86, 72, 58];
      else if (t === Tile.Safe) rgb = [62, 84, 58];
      else if (t === Tile.Stair) rgb = [80, 110, 170];
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 220;
    }
    c.putImageData(img, 0, 0);
    this.base = base;
    this.baseArea = this.world.area + this.world.map.cols;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    if (!this.base || this.baseArea !== this.world.area + this.world.map.cols) this.rebuildBase();
    const w = this.world;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const scale = 3;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,7,12,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 - w.px * scale, H / 2 - w.pz * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base!, 0, 0, w.map.cols * scale, w.map.rows * scale);
    for (const it of w.interactables) {
      if (!it.active) continue;
      ctx.fillStyle = it.kind === 'vendor' ? '#ffd060' : it.kind.includes('portal') || it.kind === 'waypoint' ? '#7fb8ff' : '#e0a0ff';
      ctx.fillRect(it.x * scale - 2, it.z * scale - 2, 4, 4);
    }
    for (const d of w.drops) {
      if (!d.alive) continue;
      ctx.fillStyle = d.item ? '#ffdd00' : '#c8a040';
      ctx.fillRect(d.x * scale - 1, d.z * scale - 1, 2, 2);
    }
    for (const e of w.enemies) {
      if (!e.alive || e.dead) continue;
      ctx.fillStyle = e.dummy ? '#a0a0a0' : e.def?.ai === 'ranged' ? '#ffa040' : '#ff4040';
      const s = e.def?.id === 'brute' ? 4 : 3;
      ctx.fillRect(e.x * scale - s / 2, e.z * scale - s / 2, s, s);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w.px * scale - 2, w.pz * scale - 2, 4, 4);
    ctx.restore();
  }
}
