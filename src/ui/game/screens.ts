import { CLASSES, CLASS_LIST, LEVELING, type ClassId } from '../../data/classes';
import { pledgesFor } from '../../data/pledges';
import { SKILLS } from '../../data/skills';
import { PALETTES } from '../../gen/pixel/palettes';
import { heroSheet, type HeroLook } from '../../gen/pixel/characters';
import { isoTiles } from '../../gen/pixel/sprites';
import { button, clear, h, hex } from '../dom';

export interface ScreenHost {
  newGame(): void;
  continueGame(): void;
  /** Accounts are not live yet: the title says so and offers guest play. */
  login(): void;
  chooseClass(id: ClassId): void;
  /** Phones: the zoom picked right after the class, before play starts. */
  chooseZoom(classId: ClassId, zoom: 1 | 1.5): void;
  choosePledge(classId: ClassId, id: string): void;
  respawn(): void;
  cancelToTitle(): void;
}

/** Full-screen states: title, class pick, pledge pick, death. */
export class Screens {
  readonly root: HTMLDivElement;
  hasSave = false;
  /** Set once accounts exist and the player is signed in: the title then shows a single Play button. */
  loggedIn = false;
  /** A line under the title buttons, such as the sign-in notice. */
  titleNote: string | null = null;
  installHint: string | null = null;

  constructor(parent: HTMLElement, private readonly host: ScreenHost) {
    this.root = h('div', { class: 'screen' });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.appendChild(this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
    clear(this.root);
  }

  private show(...children: (HTMLElement | null)[]): void {
    clear(this.root);
    this.root.style.display = 'flex';
    this.root.append(...children.filter((c): c is HTMLElement => !!c));
  }

  splash(): void {
    // Play picks up the saved hero when there is one, else starts a new one
    const play = () => (this.hasSave ? this.host.continueGame() : this.host.newGame());
    this.show(
      h('div', { class: 'title-block' }, h('h1', { class: 'title' }, 'Falling Sky')),
      h(
        'div',
        { class: 'title-buttons' },
        this.loggedIn ? button('Play', play, 'btn big primary') : button('Login', () => this.host.login(), 'btn big primary'),
        this.loggedIn ? null : button('Play as Guest', play, 'btn big'),
        this.hasSave ? button('New hero', () => this.host.newGame(), 'btn ghost') : null,
      ),
      this.titleNote ? h('div', { class: 'title-note' }, this.titleNote) : null,
      this.installHint ? h('div', { class: 'title-note install' }, this.installHint) : null,
    );
  }

  classSelect(): void {
    // Just the name and the pledges the class can swear at level 20
    const cards = CLASS_LIST.map((c) =>
      h(
        'div',
        { class: 'card', style: `--c:${hex(c.color)}` },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'card-stats dim' }, `Pledges: ${pledgesFor(c.id).map((p) => p.name).join(', ')}`),
        button('Choose ' + c.name, () => this.host.chooseClass(c.id), 'btn primary'),
      ),
    );
    this.show(h('h2', { class: 'screen-title' }, 'Choose your class'), h('div', { class: 'cards' }, ...cards), button('Back', () => this.host.cancelToTitle(), 'btn ghost'));
  }

  /** Phones ask for the zoom after the class, with a live preview of each. */
  zoomSelect(classId: ClassId): void {
    const cls = CLASSES[classId];
    const cards = ([1, 1.5] as const).map((z) =>
      h(
        'div',
        { class: 'card zoom-card', style: `--c:${hex(cls.color)}` },
        h('div', { class: 'card-title' }, `${z}x`),
        zoomPreview(classId, z),
        h('div', { class: 'card-text' }, z === 1 ? 'See more of the map around you. The hero is small.' : 'A closer view. The hero is half again as big and easier to follow.'),
        button(`Play at ${z}x`, () => this.host.chooseZoom(classId, z), 'btn primary'),
      ),
    );
    this.show(
      h('h2', { class: 'screen-title' }, 'Choose your zoom'),
      h('div', { class: 'title-note' }, 'How big the world is drawn on your screen. You can change it any time in Menu, under Screen.'),
      h('div', { class: 'cards' }, ...cards),
    );
  }

  /** `forced`: the level-20 choice during play, with no way back. */
  pledgeSelect(classId: ClassId, forced = false): void {
    const cls = CLASSES[classId];
    const cards = pledgesFor(classId).map((p) =>
      h(
        'div',
        { class: 'card', style: `--c:${hex(p.color)}` },
        h('div', { class: 'card-title' }, p.name),
        h('div', { class: 'card-sub' }, p.title),
        h('div', { class: 'card-text' }, p.description),
        h('div', { class: 'card-stats dim' }, 'Skills: ' + p.skills.map((s) => SKILLS[s]?.name ?? s).join(', ')),
        button('Pledge to ' + p.name, () => this.host.choosePledge(classId, p.id), 'btn primary'),
      ),
    );
    this.show(
      h('h2', { class: 'screen-title' }, forced ? `Level ${LEVELING.pledgeLevel}: ${cls.name}, swear your pledge` : `${cls.name}: choose a pledge`),
      forced ? h('div', { class: 'title-note' }, 'The world waits. Nothing can hurt you until you choose, and you cannot move.') : null,
      h('div', { class: 'cards' }, ...cards),
      forced ? null : button('Back', () => this.host.cancelToTitle(), 'btn ghost'),
    );
  }

  dead(): void {
    this.root.classList.add('dead');
    this.show(h('h1', { class: 'title death' }, 'You died'), h('div', { class: 'title-note' }, 'No penalty. Your gear and gold are safe.'), button('Return to town', () => this.host.respawn(), 'btn big primary'));
  }

  clearDead(): void {
    this.root.classList.remove('dead');
  }
}

/** A slice of town floor with the class's hero standing on it, drawn at the given whole scale. */
function zoomPreview(classId: ClassId, zoom: 1 | 1.5): HTMLCanvasElement {
  // Drawn at twice the CSS size so 1.5x is a whole 3 pixels per game pixel, as it is on a phone screen
  const scale = zoom * 2;
  const W = 400;
  const H = 260;
  const c = h('canvas', { class: 'zoom-preview' }) as HTMLCanvasElement;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const pal = PALETTES.find((p) => p.id === 'grim')!;
  const tiles = isoTiles(pal, 'small', 11);
  ctx.fillStyle = '#' + pal.background.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, W, H);
  // A diamond grid of floor tiles filling the box at this scale
  const tw = tiles.tileW * scale;
  const th = tiles.tileH * scale;
  const cols = Math.ceil(W / tw) + 2;
  const rows = Math.ceil(H / (th / 2)) + 2;
  for (let r = -1; r < rows; r++) {
    for (let col = -1; col < cols; col++) {
      const x = col * tw + (r % 2 ? tw / 2 : 0) - tw / 2;
      const y = r * (th / 2) - th / 2;
      const tile = tiles.floor[(r * 7 + col * 3) & 3]!;
      ctx.drawImage(tile, Math.round(x), Math.round(y), tw, th);
    }
  }
  const look: HeroLook = { classId, pledgeId: null, weapon: classId === 'knight' ? 'sword' : classId === 'sorcerer' ? 'staff' : 'bow', offhand: classId === 'knight' ? 'wooden' : null };
  const sheet = heroSheet(look, pal, 'small', true);
  const anim = sheet.front.idle;
  const frame = anim.frames[0]!;
  const fx = Math.round(W / 2 - anim.originX * scale);
  const fy = Math.round(H * 0.62 - anim.originY * scale);
  ctx.drawImage(frame, fx, fy, frame.width * scale, frame.height * scale);
  return c;
}
