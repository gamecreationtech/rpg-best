/**
 * Pixel-art toolkit. Everything draws into small RGBA buffers at integer
 * coordinates, then gets scaled up with nearest-neighbour sampling. No images.
 */

export type Rgb = [number, number, number];

/** A four-step colour ramp: shadow, base, light, highlight. */
export type Ramp = [Rgb, Rgb, Rgb, Rgb];

export function hex(h: number): Rgb {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function rgbFromHsl(h: number, s: number, l: number): Rgb {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [clamp(f(h + 1 / 3) * 255), clamp(f(h) * 255), clamp(f(h - 1 / 3) * 255)];
}

/**
 * Builds a ramp from one base colour the way pixel artists do: shadows shift the
 * hue toward blue and lose saturation slowly, highlights shift toward yellow.
 */
export function ramp(base: number | Rgb, contrast = 1): Ramp {
  const [r, g, b] = typeof base === 'number' ? hex(base) : base;
  const [h, s, l] = hsl(r, g, b);
  const k = contrast;
  return [
    rgbFromHsl(h + 0.05 * k, Math.min(1, s * 1.05), Math.max(0.04, l - 0.18 * k)),
    [r, g, b],
    rgbFromHsl(h - 0.03 * k, s * 0.95, Math.min(0.96, l + 0.12 * k)),
    rgbFromHsl(h - 0.06 * k, s * 0.85, Math.min(0.98, l + 0.24 * k)),
  ];
}

/** Ordered dithering thresholds, 4x4 Bayer, values 0..15. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)]! / 16;
}

/** Deterministic hash noise for speckle. */
export function noise(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class PixelBuffer {
  readonly data: Uint8ClampedArray<ArrayBuffer>;

  constructor(public readonly width: number, public readonly height: number) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  }

  clear(): void {
    this.data.fill(0);
  }

  set(x: number, y: number, c: Rgb, a = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  get(x: number, y: number): Rgb | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const i = (y * this.width + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }

  opaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.data[(y * this.width + x) * 4 + 3]! > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgb): void {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        const dx = (i + 0.5 - cx) / rx;
        const dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(i, j, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Shades a filled shape by its edges, light from the top-left: pixels whose
   * upper or left neighbour is empty (or belongs to another colour) get the light
   * tone, pixels whose lower or right neighbour is empty get the shadow tone.
   */
  shadeRamp(rampOf: (c: Rgb) => Ramp | null, x0 = 0, y0 = 0, x1 = this.width, y1 = this.height): void {
    const src = new Uint8ClampedArray(this.data);
    const at = (x: number, y: number): Rgb | null => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
      const i = (y * this.width + x) * 4;
      if (src[i + 3] === 0) return null;
      return [src[i]!, src[i + 1]!, src[i + 2]!];
    };
    const same = (a: Rgb | null, b: Rgb) => !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const c = at(x, y);
        if (!c) continue;
        const r = rampOf(c);
        if (!r) continue;
        const up = same(at(x, y - 1), c);
        const left = same(at(x - 1, y), c);
        const down = same(at(x, y + 1), c);
        const right = same(at(x + 1, y), c);
        if (!up && !left) this.set(x, y, r[3]);
        else if (!up || !left) this.set(x, y, r[2]);
        else if (!down && !right) this.set(x, y, r[0]);
        else if (!down || !right) this.set(x, y, r[0]);
      }
    }
  }

  /** One-pixel outline around every opaque region, drawn into empty pixels. */
  outline(c: Rgb): void {
    const src = new Uint8ClampedArray(this.data);
    const op = (x: number, y: number) => x >= 0 && y >= 0 && x < this.width && y < this.height && src[(y * this.width + x) * 4 + 3]! > 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (op(x, y)) continue;
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) this.set(x, y, c);
      }
    }
  }

  /** Copies another buffer in at an integer offset, skipping transparent pixels. */
  blit(src: PixelBuffer, x: number, y: number, flipX = false): void {
    for (let j = 0; j < src.height; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= this.height) continue;
      for (let i = 0; i < src.width; i++) {
        const si = (j * src.width + (flipX ? src.width - 1 - i : i)) * 4;
        if (src.data[si + 3] === 0) continue;
        const tx = x + i;
        if (tx < 0 || tx >= this.width) continue;
        const ti = (ty * this.width + tx) * 4;
        this.data[ti] = src.data[si]!;
        this.data[ti + 1] = src.data[si + 1]!;
        this.data[ti + 2] = src.data[si + 2]!;
        this.data[ti + 3] = 255;
      }
    }
  }

  /** Additive light blend, used for glowing effects. */
  blitAdd(src: PixelBuffer, x: number, y: number, strength = 1): void {
    for (let j = 0; j < src.height; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= this.height) continue;
      for (let i = 0; i < src.width; i++) {
        const si = (j * src.width + i) * 4;
        if (src.data[si + 3] === 0) continue;
        const tx = x + i;
        if (tx < 0 || tx >= this.width) continue;
        const ti = (ty * this.width + tx) * 4;
        this.data[ti] = clamp(this.data[ti]! + src.data[si]! * strength);
        this.data[ti + 1] = clamp(this.data[ti + 1]! + src.data[si + 1]! * strength);
        this.data[ti + 2] = clamp(this.data[ti + 2]! + src.data[si + 2]! * strength);
        this.data[ti + 3] = 255;
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const img = c.getContext('2d')!.createImageData(this.width, this.height);
    img.data.set(this.data);
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c;
  }
}

/** Nearest colour in a palette, for posterized looks. */
export function nearestInPalette(c: Rgb, palette: Rgb[]): Rgb {
  let best = palette[0]!;
  let bestD = Infinity;
  for (const p of palette) {
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
