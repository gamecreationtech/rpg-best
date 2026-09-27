import { CONSUMABLES } from '../../data/consumables';
import { CLASSES } from '../../data/classes';
import { PLEDGES } from '../../data/pledges';
import { SKILLS } from '../../data/skills';
import { ATTACK_SLOT, resolveSlotSkill, unlockedSlots } from '../../sim/player';
import { castReady, skillCooldown } from '../../sim/skills/cast';
import type { World } from '../../sim/world';
import { button, clear, h, hex } from '../dom';

export type PanelKind = 'inventory' | 'character' | 'skills' | 'passives' | 'stash' | 'vendor' | 'waypoint' | 'forge' | 'bloodfountain' | 'arcana' | 'professions' | 'settings';

export interface HudHost {
  world: World;
  openPanel(kind: PanelKind): void;
  castSlot(slot: number, sx: number | null, sy: number | null): void;
  usePotion(id: (typeof CONSUMABLES)[number]['id']): void;
}

interface Message {
  el: HTMLDivElement;
  until: number;
}

/** Bars, buffs, skill bar, potions, menu buttons and the message log. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly hpBar: HTMLDivElement;
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
  private readonly hint: HTMLDivElement;
  private readonly areaBanner: HTMLDivElement;
  private time = 0;
  private drag: { slot: number; x: number; y: number; moved: boolean } | null = null;
  private readonly aimMarker: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly host: HudHost) {
    this.root = h('div', { class: 'hud-root' });
    parent.appendChild(this.root);

    const status = h('div', { class: 'status' });
    this.levelText = h('div', { class: 'status-title' });
    this.hpBar = h('div', { class: 'bar-fill hp' });
    this.mpBar = h('div', { class: 'bar-fill mp' });
    this.xpBar = h('div', { class: 'bar-fill xp' });
    this.hpText = h('div', { class: 'bar-text' });
    this.mpText = h('div', { class: 'bar-text' });
    this.goldText = h('div', { class: 'gold' });
    status.append(
      this.levelText,
      h('div', { class: 'bar' }, this.hpBar, this.hpText),
      h('div', { class: 'bar' }, this.mpBar, this.mpText),
      h('div', { class: 'bar thin' }, this.xpBar),
      this.goldText,
    );
    this.buffBar = h('div', { class: 'buff-bar' });
    this.root.append(status, this.buffBar);

    this.areaBanner = h('div', { class: 'area-banner' });
    this.root.appendChild(this.areaBanner);
    this.aimMarker = h('div', { class: 'aim-marker' });
    this.root.appendChild(this.aimMarker);

    const bottom = h('div', { class: 'bottom' });
    this.log = h('div', { class: 'log' });
    const row1 = h('div', { class: 'row-top' });
    const potionRow = h('div', { class: 'potions' });
    for (const c of CONSUMABLES) {
      const b = button('', () => host.usePotion(c.id), 'potion');
      b.style.setProperty('--c', hex(c.color));
      b.appendChild(h('span', { class: 'potion-key' }, c.key));
      b.appendChild(h('span', { class: 'potion-count' }, '0'));
      b.title = c.name;
      potionRow.appendChild(b);
      this.potions.push(b);
    }
    const menu = h('div', { class: 'menu-row' });
    const menuButtons: [string, PanelKind, string][] = [
      ['Bag', 'inventory', 'I'],
      ['Hero', 'character', 'C'],
      ['Skills', 'skills', 'K'],
      ['Passives', 'passives', 'P'],
      ['Menu', 'settings', 'Esc'],
    ];
    for (const [label, kind, key] of menuButtons) {
      const b = button(label, () => host.openPanel(kind), 'menu-btn');
      b.appendChild(h('span', { class: 'key' }, key));
      menu.appendChild(b);
    }
    row1.append(potionRow, menu);
    const skillRow = h('div', { class: 'skills' });
    const keys = ['LMB', 'Q', 'E', 'R', 'Y', 'RMB'];
    for (let i = 0; i < 6; i++) {
      const b = h('button', { class: 'slot' });
      const wipe = h('div', { class: 'wipe' });
      const label = h('div', { class: 'slot-label' });
      b.append(wipe, label, h('span', { class: 'key' }, keys[i]!));
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.drag = { slot: i, x: e.clientX, y: e.clientY, moved: false };
      });
      b.addEventListener('pointermove', (e) => {
        if (!this.drag || this.drag.slot !== i) return;
        if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 28) {
          this.drag.moved = true;
          this.aimMarker.style.display = 'block';
          this.aimMarker.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        }
      });
      const finish = (e: PointerEvent) => {
        if (!this.drag || this.drag.slot !== i) return;
        const d = this.drag;
        this.drag = null;
        this.aimMarker.style.display = 'none';
        if (d.moved) host.castSlot(i, e.clientX, e.clientY);
        else host.castSlot(i, null, null);
      };
      b.addEventListener('pointerup', finish);
      b.addEventListener('pointercancel', () => {
        this.drag = null;
        this.aimMarker.style.display = 'none';
      });
      skillRow.appendChild(b);
      this.slots.push(b);
      this.slotWipes.push(wipe);
      this.slotLabels.push(label);
    }
    bottom.append(this.log, row1, skillRow);
    this.root.appendChild(bottom);
    this.hint = h('div', { class: 'hint-line' });
    this.root.appendChild(this.hint);
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

  setHint(text: string): void {
    this.hint.textContent = text;
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
    this.mpText.textContent = `${Math.floor(p.mana)} / ${d.maxMana}`;
    this.goldText.textContent = `${p.gold} gold`;

    // Buffs
    clear(this.buffBar);
    for (const b of w.buffs) {
      const chip = h('div', { class: 'buff' }, h('span', {}, b.name), h('div', { class: 'buff-time' }));
      chip.style.borderColor = hex(b.color);
      (chip.lastChild as HTMLDivElement).style.width = `${(b.remaining / b.duration) * 100}%`;
      this.buffBar.appendChild(chip);
    }
    for (const z of w.zones) {
      if (z.type === 'sanctuary' && w.dist(z.x, z.z) <= z.radius) this.buffBar.appendChild(h('div', { class: 'buff', style: 'border-color:#ffe87a' }, 'Sanctuary'));
    }

    // Skill slots
    const unlocked = unlockedSlots(p.level);
    for (let i = 0; i < 6; i++) {
      const b = this.slots[i]!;
      const id = resolveSlotSkill(p, p.slots[i] ?? null);
      const locked = i >= unlocked;
      b.classList.toggle('locked', locked);
      if (locked) {
        this.slotLabels[i]!.textContent = `Lv ${[1, 1, 5, 10, 15, 20][i]}`;
        this.slotWipes[i]!.style.setProperty('--p', '0');
        b.classList.remove('nomana');
        continue;
      }
      if (!id) {
        this.slotLabels[i]!.textContent = '';
        this.slotWipes[i]!.style.setProperty('--p', '0');
        continue;
      }
      if (id === ATTACK_SLOT) {
        this.slotLabels[i]!.textContent = 'Attack';
        this.slotWipes[i]!.style.setProperty('--p', String(Math.min(1, w.attackTimer * d.atkSpd) * 100));
        b.classList.remove('nomana');
        continue;
      }
      const def = SKILLS[id]!;
      this.slotLabels[i]!.textContent = def.name;
      const total = skillCooldown(w, def) || (def.effect.kind === 'projectile' && def.effect.rateLimited === 'cast' ? d.castInterval : 1 / d.atkSpd);
      const left = w.cooldowns[id] ?? (def.effect.kind === 'projectile' && def.effect.rateLimited === 'cast' ? w.castTimer : def.effect.kind === 'projectile' && def.effect.rateLimited === 'attack' ? w.attackTimer : 0);
      this.slotWipes[i]!.style.setProperty('--p', String(Math.min(1, left / Math.max(total, 0.001)) * 100));
      const ready = castReady(w, id);
      b.classList.toggle('nomana', !ready.ok && ready.reason === 'Not enough mana');
      b.classList.toggle('noweapon', !ready.ok && ready.reason.startsWith('Needs'));
      b.style.setProperty('--c', hex(def.pledgeId ? PLEDGES[def.pledgeId]!.color : cls.color));
    }
    for (let i = 0; i < CONSUMABLES.length; i++) {
      const c = CONSUMABLES[i]!;
      const b = this.potions[i]!;
      (b.querySelector('.potion-count') as HTMLSpanElement).textContent = String(p.potions[c.id]);
      b.classList.toggle('empty', p.potions[c.id] <= 0);
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
}
