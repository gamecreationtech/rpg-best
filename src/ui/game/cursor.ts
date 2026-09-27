import { h } from '../dom';

export type CursorState = 'default' | 'hand' | 'attack' | 'ui';

const SHAPES: Record<CursorState, string> = {
  // A blade-like pointer with a gold edge
  default: `<svg viewBox="0 0 32 32" width="32" height="32"><path d="M6 3 L26 15 L16 17 L13 27 Z" fill="#101420" stroke="#e8b45a" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 7 L20 14 L14 15 L12 21 Z" fill="#e8b45a" opacity="0.35"/></svg>`,
  // Same pointer with a small gold ring: something can be used
  hand: `<svg viewBox="0 0 32 32" width="32" height="32"><path d="M6 3 L26 15 L16 17 L13 27 Z" fill="#101420" stroke="#ffe066" stroke-width="1.6" stroke-linejoin="round"/><circle cx="23" cy="24" r="5" fill="none" stroke="#ffe066" stroke-width="1.8"/><circle cx="23" cy="24" r="1.6" fill="#ffe066"/></svg>`,
  // Red crosshair over enemies
  attack: `<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="9" fill="none" stroke="#ff5a5a" stroke-width="1.8"/><circle cx="16" cy="16" r="2" fill="#ff5a5a"/><path d="M16 2 V8 M16 24 V30 M2 16 H8 M24 16 H30" stroke="#ff5a5a" stroke-width="1.8"/></svg>`,
  // Plain pointer for panels and buttons
  ui: `<svg viewBox="0 0 32 32" width="32" height="32"><path d="M6 3 L26 15 L16 17 L13 27 Z" fill="#e8e0d0" stroke="#101420" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
};

/** Hot spot of each shape in pixels from the top-left of the 32px box. */
const HOTSPOT: Record<CursorState, [number, number]> = { default: [6, 3], hand: [6, 3], attack: [16, 16], ui: [6, 3] };

/**
 * A code-drawn cursor that replaces the browser arrow while a mouse is used.
 * It follows the pointer on every element so panels and buttons feel like part of the game too.
 */
export class GameCursor {
  private readonly el: HTMLDivElement;
  private state: CursorState = 'default';
  private visible = false;

  constructor() {
    this.el = h('div', { class: 'game-cursor' });
    this.el.innerHTML = SHAPES.default;
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') {
        this.hide();
        return;
      }
      this.show();
      const [hx, hy] = HOTSPOT[this.state];
      this.el.style.transform = `translate(${e.clientX - hx}px, ${e.clientY - hy}px)`;
    });
    document.addEventListener('mouseleave', () => this.hide());
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this.el.classList.add('press');
    });
    document.addEventListener('pointerup', () => this.el.classList.remove('press'));
    window.addEventListener('blur', () => this.hide());
  }

  setState(state: CursorState): void {
    if (state === this.state) return;
    this.state = state;
    this.el.innerHTML = SHAPES[state];
  }

  private show(): void {
    if (this.visible) return;
    this.visible = true;
    this.el.style.display = 'block';
    document.body.classList.add('custom-cursor');
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.display = 'none';
    document.body.classList.remove('custom-cursor');
  }
}
