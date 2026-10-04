import { TOWN_BOUNDS, TOWN_LAYOUT, copyTownLayout, parseTownLayoutCode, townLayoutCode, townPieces, type Spot, type TownLayoutData, type TownPiece } from '../../data/townLayout';
import { TILE_H, TILE_W } from '../../render2d/camera';
import type { PixelView } from '../../render2d/pixelView';
import type { World } from '../../sim/world';
import { button, h } from '../dom';

/**
 * Creator mode: the producer rearranges the town by hand. Dragging a piece
 * moves it, dragging the ground looks around, and "Get code" gives a code to
 * paste to the engineer, who copies it into `src/data/townLayout.ts`. The
 * draft is kept in this browser until it is reset or the shipped layout
 * changes, so the town stays as arranged between visits.
 */
export interface CreatorHost {
  world: World;
  view: PixelView;
  exit(): void;
}

const DRAFT_KEY = 'fs.townDraft';

/** The draft rearrangement saved in this browser, when it was made from today's layout. */
export function loadTownDraft(): TownLayoutData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { base: string; code: string };
    // A draft made from an older layout is dropped: the shipped town has moved on
    if (saved.base !== townLayoutCode(TOWN_LAYOUT)) return null;
    return parseTownLayoutCode(saved.code);
  } catch {
    return null;
  }
}

function saveTownDraft(layout: TownLayoutData | null): void {
  try {
    if (layout) localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: townLayoutCode(TOWN_LAYOUT), code: townLayoutCode(layout) }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the arrangement still lasts until the page closes
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export class Creator {
  private readonly root: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly dots = new Map<string, HTMLDivElement>();
  private readonly codeBox: HTMLDivElement;
  private layout: TownLayoutData;
  private pieces: TownPiece[];
  private selected: string | null = null;
  private readonly undo: TownLayoutData[] = [];
  private drag: { mode: 'piece'; path: string; dx: number; dz: number; moved: boolean; before: TownLayoutData } | { mode: 'pan'; sx: number; sy: number; x: number; z: number } | null = null;
  private readonly tmp = { x: 0, z: 0 };
  private readonly out = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly host: CreatorHost) {
    this.layout = copyTownLayout(host.world.town.layout);
    this.pieces = townPieces(this.layout);
    this.layer = h('div', { class: 'creator-layer' });
    this.info = h('div', { class: 'creator-info' });
    this.codeBox = h('div', { class: 'creator-code', style: 'display:none' });
    const bar = h('div', { class: 'creator-bar' },
      h('div', { class: 'creator-hint' }, 'Drag anything in town to move it. Drag the ground to look around.'),
      h('div', { class: 'creator-title' }, 'Creator'),
      this.info,
      h('div', { class: 'creator-actions' },
        button('Get code', () => this.showCode(), 'btn small primary'),
        button('Undo', () => this.stepBack(), 'btn small'),
        button('Reset town', () => this.reset(), 'btn small danger'),
        button('Exit', () => this.host.exit(), 'btn small'),
      ),
    );
    this.root = h('div', { class: 'creator' }, this.layer, bar, this.codeBox);
    for (const p of this.pieces) {
      const dot = h('div', { class: 'creator-dot' + (p.path === 'spawn' ? ' start' : '') });
      this.dots.set(p.path, dot);
      this.layer.appendChild(dot);
    }
    this.layer.addEventListener('pointerdown', (e) => this.down(e));
    this.layer.addEventListener('pointermove', (e) => this.move(e));
    this.layer.addEventListener('pointerup', (e) => this.up(e));
    this.layer.addEventListener('pointercancel', (e) => this.up(e));
    parent.appendChild(this.root);
    this.showInfo();
  }

  destroy(): void {
    this.root.remove();
  }

  /** Every frame: the dots follow their pieces on screen. */
  update(): void {
    const cam = this.host.view.view;
    for (const p of this.pieces) {
      const dot = this.dots.get(p.path)!;
      cam.project(p.spot[0], 0, p.spot[1], this.out);
      dot.style.transform = `translate(${this.out.x.toFixed(0)}px, ${this.out.y.toFixed(0)}px)`;
    }
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.layer.setPointerCapture(e.pointerId);
    const path = this.host.view.townPieceAt(e.clientX, e.clientY);
    if (path) {
      const spot = this.spotOf(path)!;
      this.ground(e);
      this.select(path);
      this.drag = { mode: 'piece', path, dx: spot[0] - this.tmp.x, dz: spot[1] - this.tmp.z, moved: false, before: copyTownLayout(this.layout) };
    } else {
      const c = this.host.view.creator!;
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, x: c.x, z: c.z };
    }
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'pan') {
      // The ground under the finger stays under it: move the view by the opposite of the drag
      const cam = this.host.view.view;
      const fx = (e.clientX - d.sx) / cam.scale / (TILE_W / 2);
      const fy = (e.clientY - d.sy) / cam.scale / (TILE_H / 2);
      const c = this.host.view.creator!;
      c.x = Math.min(44, Math.max(0, d.x - (fx + fy) / 2));
      c.z = Math.min(33, Math.max(0, d.z - (fy - fx) / 2));
      return;
    }
    this.ground(e);
    const spot = this.spotOf(d.path)!;
    const x = round1(Math.min(TOWN_BOUNDS.maxX, Math.max(TOWN_BOUNDS.minX, this.tmp.x + d.dx)));
    const z = round1(Math.min(TOWN_BOUNDS.maxZ, Math.max(TOWN_BOUNDS.minZ, this.tmp.z + d.dz)));
    if (x === spot[0] && z === spot[1]) return;
    spot[0] = x;
    spot[1] = z;
    d.moved = true;
    this.host.world.applyTownLayout(this.layout);
    this.showInfo();
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (this.layer.hasPointerCapture(e.pointerId)) this.layer.releasePointerCapture(e.pointerId);
    if (d?.mode === 'piece' && d.moved) {
      this.undo.push(d.before);
      if (this.undo.length > 50) this.undo.shift();
      saveTownDraft(this.layout);
    }
  }

  /** The floor point under the pointer, into `tmp`. */
  private ground(e: PointerEvent): void {
    this.host.view.view.unproject(e.clientX, e.clientY, this.tmp);
  }

  private spotOf(path: string): Spot | null {
    return this.pieces.find((p) => p.path === path)?.spot ?? null;
  }

  private select(path: string | null): void {
    if (this.selected) this.dots.get(this.selected)?.classList.remove('on');
    this.selected = path;
    if (path) this.dots.get(path)?.classList.add('on');
    this.showInfo();
  }

  private showInfo(): void {
    const p = this.pieces.find((q) => q.path === this.selected);
    this.info.textContent = p ? `${p.label}: ${p.spot[0]}, ${p.spot[1]}` : 'Nothing picked yet';
  }

  /** Takes a whole new layout (undo, reset): the pieces are rebuilt around its arrays. */
  private use(layout: TownLayoutData): void {
    this.layout = layout;
    this.pieces = townPieces(layout);
    this.host.world.applyTownLayout(layout);
    this.showInfo();
  }

  private stepBack(): void {
    const prev = this.undo.pop();
    if (!prev) return;
    this.use(prev);
    saveTownDraft(this.layout);
  }

  private reset(): void {
    if (!window.confirm('Put everything in town back where it was?')) return;
    this.undo.push(copyTownLayout(this.layout));
    this.use(copyTownLayout(TOWN_LAYOUT));
    saveTownDraft(null);
  }

  private showCode(): void {
    const code = townLayoutCode(this.layout);
    const text = h('textarea', { class: 'code', readonly: true, rows: 10 });
    text.value = code;
    const status = h('div', { class: 'dim small' }, 'Paste this whole code in a message to Claude to make it the town for everyone.');
    const copy = button('Copy', () => {
      text.select();
      const done = () => { status.textContent = 'Copied. Paste it in a message to Claude.'; };
      if (navigator.clipboard) void navigator.clipboard.writeText(code).then(done, () => { document.execCommand('copy'); done(); });
      else {
        document.execCommand('copy');
        done();
      }
    }, 'btn small primary');
    this.codeBox.replaceChildren(
      h('div', { class: 'creator-title' }, 'Your town code'),
      text,
      status,
      h('div', { class: 'creator-actions' }, copy, button('Close', () => { this.codeBox.style.display = 'none'; }, 'btn small')),
    );
    this.codeBox.style.display = 'block';
    text.focus();
    text.select();
  }
}
