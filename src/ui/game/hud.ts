import { CONSUMABLES } from '../../data/consumables';
import { consumableIcon } from '../../gen/pixel/icons';
import { CLASSES } from '../../data/classes';
import { PLEDGES } from '../../data/pledges';
import { SKILLS } from '../../data/skills';
import { ATTACK_SLOT, resolveSlotSkill, unlockedSlots } from '../../sim/player';
import { castReady, skillCooldown } from '../../sim/skills/cast';
import type { World } from '../../sim/world';
import { INTERACT_INFO } from '../../render2d/interactLabels';
import { button, clear, h, hex } from '../dom';
import { CLUSTER, skillPosition } from './touchLayout';

export type PanelKind = 'inventory' | 'character' | 'skills' | 'passives' | 'stash' | 'vendor' | 'waypoint' | 'forge' | 'bloodfountain' | 'arcana' | 'professions' | 'settings';

export interface HudHost {
  world: World;
  openPanel(kind: PanelKind): void;
  castSlot(slot: number, sx: number | null, sy: number | null): void;
  usePotion(id: (typeof CONSUMABLES)[number]['id']): void;
  /** Touch attack button held down: keep attacking whatever is in reach, without moving. */
  attackHeld(on: boolean): void;
  /** Touch attack button tapped: one attack at whatever is in reach. */
  attackOnce(): void;
  /** Touch action button tapped next to a merchant, station or portal: use it. */
  interactNearby(): void;
}

interface Message {
  el: HTMLDivElement;
  until: number;
}

const KEYS = ['LMB', 'Q', 'E', 'R', 'T', 'RMB'];
const SLOT_LEVELS = [1, 1, 5, 10, 15, 20];

/**
 * Bars, buffs, potions, skill buttons, menu buttons and the message log.
 * Two layouts: a desktop bar, or a touch layout with a left-thumb joystick and a
 * right-thumb cluster of round buttons.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly hpBar: HTMLDivElement;
  /** Grey band over the life bar: the damage shield, as a share of max life. */
  private readonly shieldBar: HTMLDivElement;
  private readonly mpBar: HTMLDivElement;
  private readonly xpBar: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly mpText: HTMLDivElement;
  private readonly levelText: HTMLDivElement;
  private readonly goldText: HTMLDivElement;
  private readonly buffBar: HTMLDivElement;
  private readonly slots: HTMLButtonElement[] = [];
  private readonly slotWipes: HTMLDivElement[] = [];
  private readonly slotLabels: HTMLDivElement[] = [];
  private readonly potions: HTMLButtonElement[] = [];
  private readonly log: HTMLDivElement;
  private readonly messages: Message[] = [];
  private readonly areaBanner: HTMLDivElement;
  private readonly aimMarker: HTMLDivElement;
  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private time = 0;
  private drag: { slot: number; pointerId: number; x: number; y: number; moved: boolean } | null = null;
  /** The hold-to-repeat timer per skill slot; one at most, whatever the fingers do. */
  private readonly repeats: (number | null)[] = [null, null, null, null, null, null];

  constructor(parent: HTMLElement, private readonly host: HudHost, readonly touch: boolean) {
    this.root = h('div', { class: 'hud-root' + (touch ? ' touch' : '') });
    parent.appendChild(this.root);

    const status = h('div', { class: 'status' });
    this.levelText = h('div', { class: 'status-title' });
    this.hpBar = h('div', { class: 'bar-fill hp' });
    this.shieldBar = h('div', { class: 'bar-shield' });
    this.mpBar = h('div', { class: 'bar-fill mp' });
    this.xpBar = h('div', { class: 'bar-fill xp' });
    this.hpText = h('div', { class: 'bar-text' });
    this.mpText = h('div', { class: 'bar-text' });
    this.goldText = h('div', { class: 'gold' });
    status.append(this.levelText, h('div', { class: 'bar' }, this.hpBar, this.shieldBar, this.hpText), h('div', { class: 'bar' }, this.mpBar, this.mpText), h('div', { class: 'bar thin' }, this.xpBar), this.goldText);
    this.buffBar = h('div', { class: 'buff-bar' });
    this.areaBanner = h('div', { class: 'area-banner' });
    this.aimMarker = h('div', { class: 'aim-marker' });
    this.joyBase = h('div', { class: 'joy-base' }, (this.joyKnob = h('div', { class: 'joy-knob' })));
    this.log = h('div', { class: 'log' });
    this.root.append(status, this.buffBar, this.areaBanner, this.aimMarker, this.joyBase);

    const potionRow = h('div', { class: 'potions' });
    for (const c of CONSUMABLES) {
      const b = button('', () => host.usePotion(c.id), 'potion');
      b.style.setProperty('--c', hex(c.color));
      const icon = h('canvas', { class: 'potion-icon', width: '14', height: '14' });
      b.append(icon, h('span', { class: 'potion-key' }, c.key), h('span', { class: 'potion-count' }, ''));
      b.title = c.name;
      if (touch) potionRow.appendChild(b);
      this.potions.push(b);
    }
    const menu = h('div', { class: 'menu-row' });
    const menuButtons: [string, PanelKind, string][] = [['Hero', 'inventory', 'Tab'], ['Skills', 'skills', 'K'], ['Menu', 'settings', 'Esc']];
    for (const [label, kind, key] of menuButtons) {
      const b = button(label, () => host.openPanel(kind), 'menu-btn');
      b.appendChild(h('span', { class: 'key' }, key));
      menu.appendChild(b);
    }
    for (let i = 0; i < 6; i++) this.makeSlot(i);

    if (touch) {
      const cluster = h('div', { class: 'cluster' });
      cluster.style.width = `${CLUSTER.size}px`;
      cluster.style.height = `${CLUSTER.size}px`;
      for (let i = 0; i < 6; i++) {
        const b = this.slots[i]!;
        if (i === 0) {
          b.classList.add('attack');
          b.style.right = '6px';
          b.style.bottom = '6px';
        } else {
          const p = skillPosition(i - 1);
          b.style.right = `${p.right}px`;
          b.style.bottom = `${p.bottom}px`;
        }
        cluster.appendChild(b);
      }
      this.root.append(h('div', { class: 'bottom-left' }, this.log, potionRow), menu, cluster);
    } else {
      // Desktop: one classic bar along the bottom, left to right:
      // status, life potion and bandage, message log, mana potion and incense, skills
      status.classList.add('in-bar');
      const bar = h('div', { class: 'dbar' },
        status,
        h('div', { class: 'potions pair' }, this.potions[0]!, this.potions[1]!),
        h('div', { class: 'log-box' }, this.log),
        h('div', { class: 'potions pair' }, this.potions[2]!, this.potions[3]!),
        h('div', { class: 'skills' }, ...this.slots),
      );
      this.root.append(bar, menu);
    }
  }

  private makeSlot(i: number): void {
    const b = h('button', { class: 'slot' });
    const wipe = h('div', { class: 'wipe' });
    const label = h('div', { class: 'slot-label' });
    b.append(wipe, label, h('span', { class: 'key' }, KEYS[i]!));
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers refuse capture for a pointer that already lifted; the tap still counts
      }
      // A second finger or a tap before the last one lifted replaces the press;
      // the old repeat timer must go with it or it would fire forever
      this.stopRepeat(i);
      const drag = { slot: i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      this.drag = drag;
      if (i === 0) {
        if (this.touch && this.host.world.nextAction()) {
          // Standing next to something usable: the button is an action button
          this.host.interactNearby();
        } else if (this.touch) {
          this.host.attackOnce();
          this.host.attackHeld(true);
        } else {
          this.host.castSlot(0, null, null);
        }
      } else {
        // Hold to keep casting (fire bolt style); a drag switches to aiming
        this.repeats[i] = window.setInterval(() => {
          if (!drag.moved) this.host.castSlot(i, null, null);
        }, 130);
      }
    });
    b.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.slot !== i || i === 0) return;
      if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 28) {
        this.drag.moved = true;
        this.aimMarker.style.display = 'block';
        this.aimMarker.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      }
    });
    const finish = (e: PointerEvent, cancelled: boolean) => {
      // Whatever finger this was, a lift on this slot ends its repeat and its hold
      this.stopRepeat(i);
      if (i === 0) this.host.attackHeld(false);
      if (!this.drag || this.drag.slot !== i || this.drag.pointerId !== e.pointerId) return;
      const d = this.drag;
      this.drag = null;
      this.aimMarker.style.display = 'none';
      if (i === 0 || cancelled) return;
      if (d.moved) this.host.castSlot(i, e.clientX, e.clientY);
      else this.host.castSlot(i, null, null);
    };
    b.addEventListener('pointerup', (e) => finish(e, false));
    b.addEventListener('pointercancel', (e) => finish(e, true));
    b.addEventListener('lostpointercapture', (e) => finish(e, true));
    this.slots.push(b);
    this.slotWipes.push(wipe);
    this.slotLabels.push(label);
  }

  /** Draws the floating joystick. */
  setJoystick(active: boolean, x: number, y: number, dx: number, dy: number): void {
    this.joyBase.style.display = active ? 'block' : 'none';
    if (!active) return;
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  message(text: string, color?: number): void {
    const el = h('div', { class: 'msg' }, text);
    if (color !== undefined) el.style.color = hex(color);
    this.log.appendChild(el);
    this.messages.push({ el, until: this.time + 6 });
    while (this.messages.length > 4) this.messages.shift()!.el.remove();
  }

  banner(text: string): void {
    this.areaBanner.textContent = text;
    this.areaBanner.classList.remove('show');
    void this.areaBanner.offsetWidth;
    this.areaBanner.classList.add('show');
  }

  update(dt: number): void {
    this.time += dt;
    const w = this.host.world;
    const p = w.player;
    const d = w.derived;
    const cls = CLASSES[p.classId];
    const pledge = p.pledgeId ? PLEDGES[p.pledgeId] : null;
    this.levelText.textContent = `Level ${p.level} ${pledge ? pledge.name : cls.name}`;
    this.hpBar.style.width = `${Math.max(0, (p.hp / d.maxHp) * 100)}%`;
    this.mpBar.style.width = `${Math.max(0, (p.mana / d.maxMana) * 100)}%`;
    this.xpBar.style.width = `${Math.max(0, (p.xp / p.xpToNext) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${d.maxHp}`;
    let shield = 0;
    for (const b of w.buffs) shield += b.shield;
    this.shieldBar.style.width = `${Math.min(100, (shield / d.maxHp) * 100)}%`;
    this.mpText.textContent = `${Math.floor(p.mana)} / ${d.maxMana}`;
    this.goldText.textContent = `${p.gold} gold`;

    clear(this.buffBar);
    for (const b of w.buffs) {
      const chip = h('div', { class: 'buff' }, h('span', {}, b.name), h('div', { class: 'buff-time' }));
      chip.style.borderColor = hex(b.color);
      (chip.lastChild as HTMLDivElement).style.width = `${(b.remaining / b.duration) * 100}%`;
      this.buffBar.appendChild(chip);
    }
    if (shield > 0) this.buffBar.appendChild(h('div', { class: 'buff', style: 'border-color:#b0b0b8;color:#d0d0d8' }, `Shield ${Math.ceil(shield)}`));
    for (const z of w.zones) {
      if (z.type === 'sanctuary' && w.dist(z.x, z.z) <= z.radius) this.buffBar.appendChild(h('div', { class: 'buff', style: 'border-color:#ffe87a' }, 'Sanctuary'));
    }

    const unlocked = unlockedSlots(p.level);
    for (let i = 0; i < 6; i++) {
      const b = this.slots[i]!;
      const id = resolveSlotSkill(p, p.slots[i] ?? null);
      const locked = i >= unlocked;
      b.classList.toggle('locked', locked);
      if (locked) {
        this.slotLabels[i]!.textContent = `Lv ${SLOT_LEVELS[i]}`;
        this.slotWipes[i]!.style.setProperty('--p', '0');
        b.classList.remove('nomana', 'noweapon');
        continue;
      }
      if (!id) {
        this.slotLabels[i]!.textContent = '';
        this.slotWipes[i]!.style.setProperty('--p', '0');
        continue;
      }
      if (id === ATTACK_SLOT) {
        const use = this.touch ? w.nextAction() : null;
        b.classList.toggle('use', !!use);
        if (use) {
          const verb = 'drop' in use ? 'pick up' : INTERACT_INFO[use.use.kind].verb;
          this.slotLabels[i]!.textContent = verb.charAt(0).toUpperCase() + verb.slice(1);
          this.slotWipes[i]!.style.setProperty('--p', '0');
        } else {
          this.slotLabels[i]!.textContent = 'Attack';
          this.slotWipes[i]!.style.setProperty('--p', String(Math.min(1, w.attackTimer * d.atkSpd) * 100));
        }
        b.classList.remove('nomana', 'noweapon');
        continue;
      }
      const def = SKILLS[id]!;
      this.slotLabels[i]!.textContent = def.name;
      const rate = def.effect.kind === 'projectile' ? def.effect.rateLimited : undefined;
      const total = skillCooldown(w, def) || (rate === 'cast' ? d.castInterval : 1 / d.atkSpd);
      const left = w.cooldowns[id] ?? (rate === 'cast' ? w.castTimer : rate === 'attack' ? w.attackTimer : 0);
      this.slotWipes[i]!.style.setProperty('--p', String(Math.min(1, left / Math.max(total, 0.001)) * 100));
      const ready = castReady(w, id);
      b.classList.toggle('nomana', !ready.ok && ready.reason === 'Not enough mana');
      b.classList.toggle('noweapon', !ready.ok && ready.reason.startsWith('Needs'));
      b.style.setProperty('--c', hex(def.pledgeId ? PLEDGES[def.pledgeId]!.color : cls.color));
    }
    for (let i = 0; i < CONSUMABLES.length; i++) {
      const c = CONSUMABLES[i]!;
      const b = this.potions[i]!;
      const fill = p.potions[c.id];
      const ready = fill >= 1;
      // The drawing itself shows the dose: liquid level, roll size, stick length
      const icon = consumableIcon(c.id, fill);
      const canvas = b.querySelector('.potion-icon') as HTMLCanvasElement;
      const cx = canvas.getContext('2d')!;
      cx.clearRect(0, 0, 14, 14);
      cx.drawImage(icon, 0, 0);
      (b.querySelector('.potion-count') as HTMLSpanElement).textContent = ready ? '' : `${Math.floor(fill * 100)}%`;
      b.classList.toggle('empty', !ready);
      b.classList.toggle('cooling', w.potionCooldowns[c.id] > 0);
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (this.time > m.until) {
        m.el.remove();
        this.messages.splice(i, 1);
      } else if (this.time > m.until - 1) {
        m.el.style.opacity = String(m.until - this.time);
      }
    }
  }

  private stopRepeat(slot: number): void {
    const r = this.repeats[slot];
    if (r !== null && r !== undefined) window.clearInterval(r);
    this.repeats[slot] = null;
  }

  destroy(): void {
    for (let i = 0; i < this.repeats.length; i++) this.stopRepeat(i);
    this.root.remove();
  }
}
