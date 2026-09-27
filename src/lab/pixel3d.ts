import { Showcase } from '../app/showcase';
import type { Palette } from './palettes';
import { bayer } from './pixel';

export interface Pixel3DConfig {
  palette: Palette;
  width: number;
  height: number;
  /** Colour steps per channel; fewer steps means a flatter, more "drawn" look. */
  levels: number;
  outline: boolean;
}

/**
 * The third look: the existing 3D characters rendered normally, then shrunk to a
 * tiny frame, posterized to a few colour steps and given dark edges. A cheap
 * way to see whether "3D but chunky" reads as pixel art or as blurry 3D.
 */
export class Pixel3D {
  readonly canvas: HTMLCanvasElement;
  readonly showcase: Showcase;
  private readonly ctx: CanvasRenderingContext2D;
  private prev: Uint8ClampedArray | null = null;

  constructor(private readonly gl: HTMLCanvasElement, public config: Pixel3DConfig) {
    // The showcase wants a UI parent; give it one that is never attached
    this.showcase = new Showcase(gl, document.createElement('div'));
    // Frame the hero and the monsters closer than the full gallery
    this.showcase.setFocus(0);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
    this.rebuild(config);
  }

  cast(spell: 'fireball' | 'frost' | 'bolt'): void {
    this.showcase.cast(spell === 'frost' ? 'nova' : spell === 'bolt' ? 'chain' : 'fireball');
  }

  rebuild(config: Pixel3DConfig): void {
    this.config = config;
    this.canvas.width = config.width;
    this.canvas.height = config.height;
    this.ctx.imageSmoothingEnabled = false;
  }

  update(dt: number, render = true): void {
    this.showcase.update(dt, render);
    if (!render) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.gl, 0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const levels = this.config.levels;
    const step = 255 / (levels - 1);
    if (!this.prev || this.prev.length !== d.length) this.prev = new Uint8ClampedArray(d.length);
    const lum = this.prev;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      lum[p] = (d[i]! * 3 + d[i + 1]! * 6 + d[i + 2]!) / 10;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        const i = p * 4;
        // Ordered dithering hides the steps between colour bands; skipped in the
        // near-black background where it would only read as speckle
        const t = lum[p]! < 28 ? 0 : (bayer(x, y) - 0.5) * step * 0.6;
        d[i] = Math.round((d[i]! + t) / step) * step;
        d[i + 1] = Math.round((d[i + 1]! + t) / step) * step;
        d[i + 2] = Math.round((d[i + 2]! + t) / step) * step;
        if (this.config.outline && x > 0 && y > 0) {
          const l = lum[p]!;
          if (Math.abs(l - lum[p - 1]!) > 48 || Math.abs(l - lum[p - W]!) > 48) {
            d[i] = d[i]! * 0.25;
            d[i + 1] = d[i + 1]! * 0.25;
            d[i + 2] = d[i + 2]! * 0.25;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
