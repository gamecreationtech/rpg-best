import type { ConsumableId } from '../data/consumables';

export type ControlMode = 'tap' | 'touch';

export interface InputHost {
  /** True while the world should react to input. */
  active(): boolean;
  tapEnemy(sx: number, sy: number): boolean;
  tapInteractable(sx: number, sy: number): boolean;
  tapGround(sx: number, sy: number): void;
  castSlot(slot: number, sx: number | null, sy: number | null): void;
  usePotion(id: ConsumableId): void;
  setMoveInput(x: number, z: number): void;
  joystick(active: boolean, x: number, y: number, dx: number, dy: number): void;
  openPanel(kind: 'inventory' | 'character' | 'skills' | 'passives' | 'settings'): void;
  escape(): void;
  interactNearby(): void;
}

const JOY_RADIUS = 56;
const JOY_DEAD = 8;

/**
 * Pointer and keyboard input. In `tap` mode: tap to move, hold to keep walking.
 * In `touch` mode: a floating joystick appears wherever the thumb lands on empty
 * ground; tapping an enemy, a merchant or a station still works.
 */
export class Input {
  mode: ControlMode = 'tap';
  private readonly keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private holding = false;
  private holdTimer = 0;
  private pointerId = -1;
  private joy: { x: number; y: number; moved: boolean } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: InputHost) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onDown(e: PointerEvent): void {
    if (!this.host.active()) return;
    if (this.pointerId !== -1 && this.mode === 'touch') return; // one thumb steers at a time
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (e.button === 2) {
      this.host.castSlot(5, e.clientX, e.clientY);
      return;
    }
    if (this.host.tapEnemy(e.clientX, e.clientY)) return;
    if (this.host.tapInteractable(e.clientX, e.clientY)) return;
    if (this.mode === 'touch') {
      this.joy = { x: e.clientX, y: e.clientY, moved: false };
      this.host.joystick(true, e.clientX, e.clientY, 0, 0);
      return;
    }
    this.host.tapGround(e.clientX, e.clientY);
    this.holding = true;
    this.holdTimer = 0;
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.pointerId || this.pointerId === -1) {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }
    if (this.joy && e.pointerId === this.pointerId) {
      let dx = e.clientX - this.joy.x;
      let dy = e.clientY - this.joy.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.host.joystick(true, this.joy.x, this.joy.y, dx, dy);
      if (len > JOY_DEAD) {
        this.joy.moved = true;
        const k = Math.min(1, len / JOY_RADIUS);
        // Screen right is world +x, screen down is world +z
        this.host.setMoveInput((dx / (len || 1)) * k, (dy / (len || 1)) * k);
      } else {
        this.host.setMoveInput(0, 0);
      }
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.holding = false;
    if (this.joy) {
      const tapped = !this.joy.moved;
      this.joy = null;
      this.host.joystick(false, 0, 0, 0, 0);
      this.host.setMoveInput(0, 0);
      if (tapped) this.host.tapGround(e.clientX, e.clientY);
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (!down) return;
    if (k === 'escape') {
      this.host.escape();
      return;
    }
    if (!this.host.active()) {
      if (k === 'i') this.host.openPanel('inventory');
      return;
    }
    const slotKeys: Record<string, number> = { q: 1, e: 2, r: 3, y: 4 };
    if (k in slotKeys) this.host.castSlot(slotKeys[k]!, this.mouseX, this.mouseY);
    else if (k === ' ') this.host.castSlot(0, null, null);
    else if (k === '1') this.host.usePotion('hp_potion');
    else if (k === '2') this.host.usePotion('bandage');
    else if (k === '3') this.host.usePotion('mp_potion');
    else if (k === '4') this.host.usePotion('incense');
    else if (k === 'i') this.host.openPanel('inventory');
    else if (k === 'c') this.host.openPanel('character');
    else if (k === 'k') this.host.openPanel('skills');
    else if (k === 'p') this.host.openPanel('passives');
    else if (k === 'f') this.host.interactNearby();
  }

  /** Called every frame: keyboard movement and hold-to-walk. */
  update(dt: number): void {
    if (!this.host.active()) {
      if (this.joy) {
        this.joy = null;
        this.host.joystick(false, 0, 0, 0, 0);
      }
      this.host.setMoveInput(0, 0);
      return;
    }
    if (this.joy) return; // the joystick owns movement while held
    let x = 0;
    let z = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    this.host.setMoveInput(x, z);
    if (this.holding) {
      this.holdTimer += dt;
      if (this.holdTimer > 0.15) {
        this.holdTimer = 0;
        this.host.tapGround(this.mouseX, this.mouseY);
      }
    }
  }
}
