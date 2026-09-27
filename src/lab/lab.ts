import { h } from '../ui/dom';
import { PALETTES, type Palette } from '../gen/pixel/palettes';
import { Pixel3D } from './pixel3d';
import { Scene2D, type Lighting, type Projection } from './scene2d';
import type { ClassId } from '../data/classes';
import type { SpriteSize } from '../gen/pixel/sprites';

type Look = 'iso' | 'top' | '3d';

interface LookInfo {
  id: Look;
  name: string;
  blurb: string;
}

const LOOKS: LookInfo[] = [
  { id: 'iso', name: 'Isometric pixel art', blurb: 'Diamond floor tiles, hand-drawn style sprites, torchlight. The Diablo 1 / Diablo 2 look.' },
  { id: 'top', name: 'Top-down 16-bit', blurb: 'Square tiles seen from above, same sprites. The SNES console RPG look.' },
  { id: '3d', name: 'Pixelated 3D', blurb: 'Our current 3D characters shrunk to a tiny frame with flattened colours and dark edges.' },
];

const RESOLUTIONS: [number, number][] = [
  [320, 180],
  [427, 240],
  [640, 360],
];

interface Settings {
  look: Look;
  palette: Palette;
  width: number;
  height: number;
  size: SpriteSize;
  outline: boolean;
  lighting: Lighting;
  heroClass: ClassId;
  levels: number;
}

/**
 * The art lab: a desktop-only test page that shows candidate looks for the game,
 * side by side with the current one, with every knob on screen. Nothing here
 * touches the game; it exists so the producer can pick a direction by eye.
 */
export class Lab {
  readonly settings: Settings = {
    look: 'iso',
    palette: PALETTES[0]!,
    width: 427,
    height: 240,
    size: 'large',
    outline: true,
    lighting: 'dither',
    heroClass: 'knight',
    levels: 6,
  };
  readonly scene: Scene2D;
  private pixel3d: Pixel3D | null = null;
  private readonly display: HTMLCanvasElement;
  private readonly dctx: CanvasRenderingContext2D;
  private readonly root: HTMLDivElement;
  private readonly blurb: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly groups = new Map<string, HTMLDivElement>();
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private autoCast = 0;

  constructor(private readonly gl: HTMLCanvasElement, ui: HTMLElement) {
    const s = this.settings;
    this.scene = new Scene2D({ palette: s.palette, projection: 'iso', size: s.size, outline: s.outline, lighting: s.lighting, width: s.width, height: s.height, heroClass: s.heroClass });

    // The lab draws on its own canvas above the WebGL one
    this.display = h('canvas', { class: 'lab-display' });
    this.dctx = this.display.getContext('2d', { alpha: false })!;
    gl.insertAdjacentElement('afterend', this.display);
    this.display.addEventListener('pointerdown', (e) => this.onTap(e));

    this.root = h('div', { class: 'lab' });
    ui.appendChild(this.root);
    this.blurb = h('div', { class: 'lab-blurb' });
    this.stats = h('div', { class: 'lab-stats' });

    const top = h('div', { class: 'lab-bar' }, h('div', { class: 'lab-title' }, 'Falling Sky', h('span', {}, 'art lab')));
    top.appendChild(this.group('Look', LOOKS.map((l) => [l.id, l.name] as const), () => s.look, (v) => this.setLook(v as Look)));
    top.appendChild(this.group('Palette', PALETTES.map((p) => [p.id, p.name] as const), () => s.palette.id, (v) => this.apply({ palette: PALETTES.find((p) => p.id === v)! })));
    top.appendChild(this.group('Resolution', RESOLUTIONS.map(([w, hh]) => [`${w}`, `${w}×${hh}`] as const), () => `${s.width}`, (v) => {
      const r = RESOLUTIONS.find(([w]) => `${w}` === v)!;
      this.apply({ width: r[0], height: r[1] });
    }));
    top.appendChild(this.group('Sprites', [['small', 'Small (22 px hero)'], ['large', 'Large (44 px hero)']], () => s.size, (v) => this.apply({ size: v as SpriteSize })));
    top.appendChild(this.group('Outlines', [['on', 'On'], ['off', 'Off']], () => (s.outline ? 'on' : 'off'), (v) => this.apply({ outline: v === 'on' })));
    top.appendChild(this.group('Lighting', [['dither', 'Dithered'], ['smooth', 'Smooth'], ['off', 'Off']], () => s.lighting, (v) => this.apply({ lighting: v as Lighting })));
    top.appendChild(this.group('Hero', [['knight', 'Knight'], ['sorcerer', 'Sorcerer'], ['rogue', 'Rogue']], () => s.heroClass, (v) => this.apply({ heroClass: v as ClassId })));
    top.appendChild(this.group('Colour steps', [['4', '4'], ['6', '6'], ['10', '10']], () => `${s.levels}`, (v) => this.apply({ levels: Number(v) })));
    this.root.appendChild(top);

    const bottom = h(
      'div',
      { class: 'lab-bottom' },
      h(
        'div',
        { class: 'lab-actions' },
        h('button', { class: 'chip spell fire', onclick: () => this.cast('fireball') }, 'Fireball [1]'),
        h('button', { class: 'chip spell frost', onclick: () => this.cast('frost') }, 'Frost Nova [2]'),
        h('button', { class: 'chip spell bolt', onclick: () => this.cast('bolt') }, 'Lightning [3]'),
        h('a', { class: 'chip', href: location.pathname }, 'Back to the game'),
      ),
      this.blurb,
      this.stats,
    );
    this.root.appendChild(bottom);

    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.cast('fireball');
      if (e.key === '2') this.cast('frost');
      if (e.key === '3') this.cast('bolt');
    });
    window.addEventListener('resize', () => this.fit());
    this.fit();
    this.refresh();
  }

  private group(label: string, options: readonly (readonly [string, string])[], current: () => string, pick: (v: string) => void): HTMLDivElement {
    const el = h('div', { class: 'lab-group' }, h('span', { class: 'lab-label' }, label));
    for (const [id, name] of options) {
      el.appendChild(
        h(
          'button',
          {
            class: 'chip',
            'data-id': id,
            onclick: () => {
              pick(id);
              this.refresh();
            },
          },
          name,
        ),
      );
    }
    this.groups.set(label, el);
    (el as HTMLDivElement & { current: () => string }).current = current;
    return el;
  }

  private refresh(): void {
    for (const el of this.groups.values()) {
      const current = (el as HTMLDivElement & { current: () => string }).current();
      for (const b of el.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('active', b.dataset.id === current);
    }
    const s = this.settings;
    const is3d = s.look === '3d';
    // Only the knobs that mean something for the chosen look
    this.groups.get('Sprites')!.style.display = is3d ? 'none' : '';
    this.groups.get('Lighting')!.style.display = is3d ? 'none' : '';
    this.groups.get('Hero')!.style.display = is3d ? 'none' : '';
    this.groups.get('Palette')!.style.display = is3d ? 'none' : '';
    this.groups.get('Colour steps')!.style.display = is3d ? '' : 'none';
    const look = LOOKS.find((l) => l.id === s.look)!;
    this.blurb.textContent = is3d
      ? `${look.blurb} This is the showcase gallery seen through a pixel filter; change Colour steps and Outlines to tune it.`
      : `${look.blurb} ${s.palette.blurb} Click the floor to walk; the hero swings at anything close. Keys 1, 2, 3 cast spells.`;
  }

  cast(spell: 'fireball' | 'frost' | 'bolt'): void {
    if (this.settings.look === '3d') this.pixel3d?.cast(spell);
    else this.scene.cast(spell);
  }

  private setLook(look: Look): void {
    this.settings.look = look;
    if (look === '3d') {
      this.pixel3d ??= new Pixel3D(this.gl, { palette: this.settings.palette, width: this.settings.width, height: this.settings.height, levels: this.settings.levels, outline: this.settings.outline });
    } else {
      this.apply({});
    }
    this.fit();
  }

  private apply(patch: Partial<Settings>): void {
    Object.assign(this.settings, patch);
    const s = this.settings;
    if (s.look === '3d') {
      this.pixel3d?.rebuild({ palette: s.palette, width: s.width, height: s.height, levels: s.levels, outline: s.outline });
    } else {
      this.scene.rebuild({ palette: s.palette, projection: s.look as Projection, size: s.size, outline: s.outline, lighting: s.lighting, width: s.width, height: s.height, heroClass: s.heroClass });
    }
    this.fit();
  }

  /** Integer upscale so every source pixel stays a crisp square. */
  private fit(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.display.width = W;
    this.display.height = H;
    const src = this.source();
    this.scale = Math.max(1, Math.floor(Math.min(W / src.width, H / src.height)));
    this.offX = Math.floor((W - src.width * this.scale) / 2);
    this.offY = Math.floor((H - src.height * this.scale) / 2);
  }

  private source(): HTMLCanvasElement {
    return this.settings.look === '3d' && this.pixel3d ? this.pixel3d.canvas : this.scene.canvas;
  }

  private onTap(e: PointerEvent): void {
    if (this.settings.look === '3d') return;
    const x = (e.clientX - this.offX) / this.scale;
    const y = (e.clientY - this.offY) / this.scale;
    this.scene.walkTo(x, y);
  }

  update(dt: number, render = true): void {
    const s = this.settings;
    if (s.look === '3d') {
      this.pixel3d?.update(dt, render);
    } else {
      // Keep the diorama lively even when nobody clicks
      this.autoCast -= dt;
      if (this.autoCast <= 0) {
        this.autoCast = 4 + Math.random() * 3;
        this.cast(Math.random() < 0.5 ? 'fireball' : Math.random() < 0.5 ? 'frost' : 'bolt');
      }
      this.scene.update(dt);
      if (render) this.scene.render();
    }
    if (!render) return;
    const ctx = this.dctx;
    const src = this.source();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.display.width, this.display.height);
    ctx.drawImage(src, this.offX, this.offY, src.width * this.scale, src.height * this.scale);
    this.stats.textContent = `${src.width}×${src.height} scaled ×${this.scale}   ${this.scene.stats.fps} fps`;
  }
}
