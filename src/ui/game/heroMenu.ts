import { CLASSES } from '../../data/classes';
import { EQUIP_SLOTS, RARITIES } from '../../data/items';
import { GENERAL_TREE, CLASS_TREES } from '../../data/passives';
import { PLEDGES } from '../../data/pledges';
import { SKILLS, skillsFor, type SkillDef } from '../../data/skills';
import { formatStat, type StatKey } from '../../data/stats';
import { itemIconSprite } from '../../gen/pixel/icons';
import { EQUIP_KEYS, keyLabel, type EquipKey } from '../../sim/items/equipment';
import type { Item } from '../../sim/items/item';
import { ATTACK_SLOT, allocateStat, canEquipItem, canLearnPassive, canLearnSkill, canUnlockUltimate, learnPassive, learnSkill, revokeUltimate, unlearnSkill, unlockUltimate, unlockedSlots } from '../../sim/player';
import type { World } from '../../sim/world';
import { clear, h, hex } from '../dom';


/** On touch devices the stats get their own tab; with a mouse they sit beside the bag. */
export type HeroTab = 'inventory' | 'stats' | 'skills' | 'passives';

export interface HeroMenuHost {
  world: World;
  message(text: string, color?: number): void;
  close(): void;
}

interface TextOptions {
  color?: string;
  /** 1 for the small size; anything else is the normal size. */
  scale?: number;
  /** Kept for the callers; the browser wraps text on its own. */
  maxChars?: number;
}

/** Menu text in the game's normal font; only the frames and icons stay pixel art. */
export function pxText(text: string, opts: TextOptions = {}): HTMLElement {
  const el = h('span', { class: 'mt' + (opts.scale === 1 ? ' small' : '') }, text);
  if (opts.color) el.style.color = opts.color;
  return el;
}

export const MUTED = '#8b93a8';
export const TEXT = '#d9dce6';
export const GOLD = '#e8b45a';
const GREEN = '#6ae06a';
const RED = '#ff6a6a';
const BLUE = '#8fb8ff';

/** A pixel-framed button with pixel text. */
export function pbtn(label: string, onClick: () => void, kind: 'btn' | 'gold' | 'red' | 'on' | 'dim' = 'btn', color = TEXT): HTMLButtonElement {
  const b = h('button', { class: `pxb ${kind}`, onclick: () => onClick() }, pxText(label, { color: kind === 'dim' ? MUTED : color }));
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}

export function label(text: string, color = MUTED): HTMLElement {
  return pxText(text, { color });
}

/**
 * What a skill does in numbers for the hero as it stands: cooldown at this
 * rank (and at rank 5), the damage range it would deal now, and the sum
 * behind it so the player can see what to raise.
 */
function skillInfo(w: World, def: SkillDef, rank: number): { cooldown: string; damage: string; formula: string | null } {
  const d = w.derived;
  const eff = def.effect;
  const atRank = Math.max(1, rank);
  const rankBonus = def.rankBonus ?? 0.2;
  const rankMult = 1 + atRank * rankBonus;
  const cdNow = (rank >= 5 && def.rank5Cooldown ? def.rank5Cooldown : def.cooldown) / 1000 * (1 - d.cdr / 100);
  const cd5 = (def.rank5Cooldown ?? def.cooldown) / 1000 * (1 - d.cdr / 100);
  let cooldown = cdNow > 0 ? `${cdNow.toFixed(1)}s` : eff.kind === 'projectile' && eff.rateLimited ? `none (limited by ${eff.rateLimited} speed)` : 'none';
  if (cdNow > 0 && rank < 5 && cd5 < cdNow) cooldown += ` (${cd5.toFixed(1)}s at rank 5)`;
  // The base roll: weapon plus the stat that scales it
  const magic = d.isMagicWeapon;
  const scalesWithInt = 'scalesWithInt' in eff && !!eff.scalesWithInt && !magic;
  let statBonus = magic ? d.int * 0.5 + d.spellDmg : d.str * 0.5 + d.bonusDamage;
  if (scalesWithInt) statBonus += d.int * 0.5 + d.spellDmg;
  const baseText = `weapon ${d.dmgMin}-${d.dmgMax} + ${magic ? `Intelligence ${d.int}` : `Strength ${d.str}`} x 0.5${magic ? (d.spellDmg ? ` + spell damage ${d.spellDmg}` : '') : (d.bonusDamage ? ` + bonus damage ${d.bonusDamage}` : '')}${scalesWithInt ? ` + Intelligence ${d.int} x 0.5` : ''}`;
  const hit = (mult: number) => [Math.max(1, Math.round((d.dmgMin + statBonus) * mult * rankMult * d.dmgMult)), Math.max(1, Math.round((d.dmgMax + statBonus) * mult * rankMult * d.dmgMult))];
  const chain = (mult: number) => `(${baseText}) x ${mult} skill x ${rankMult.toFixed(2)} rank (1 + ${rankBonus} per rank)${d.dmgMult !== 1 ? ` x ${d.dmgMult.toFixed(2)} bonuses` : ''}`;
  const when = rank ? '' : ' at rank 1';
  const mult = 'damageMult' in eff ? eff.damageMult ?? 0 : 0;
  if (mult > 0) {
    const [lo, hi] = hit(mult);
    let extra = '';
    if (eff.kind === 'projectile' && eff.count && eff.count > 1) extra = ` per bolt, ${eff.count} bolts`;
    else if (eff.kind === 'aoe') extra = ` to everything within ${eff.radius} px`;
    else if (eff.kind === 'melee' && eff.arc) extra = ` in a ${eff.arc}\u00b0 arc`;
    else if (eff.kind === 'zone') extra = ` per tick`;
    return { cooldown, damage: `${lo} to ${hi}${extra}${when}`, formula: chain(mult) };
  }
  if (eff.kind === 'beam') {
    const [lo, hi] = hit(eff.drainMult);
    return { cooldown, damage: `${lo} to ${hi} every ${(eff.interval / 1000).toFixed(1)}s for ${(eff.duration / 1000).toFixed(0)}s${when}`, formula: chain(eff.drainMult) };
  }
  if (eff.kind === 'curse') return { cooldown, damage: `${eff.pctPerSec}% of the target's life per second for ${(eff.duration / 1000).toFixed(0)}s, kills below ${eff.executeBelowPct}% life`, formula: 'scales with the target\'s life, not your gear' };
  if (eff.kind === 'melee' && eff.bleed) return { cooldown, damage: `${eff.bleed.pctOfMaxHp}% of the target's life over ${(eff.bleed.duration / 1000).toFixed(0)}s`, formula: 'scales with the target\'s life, not your gear' };
  if (eff.kind === 'buff') return { cooldown, damage: `none, a ${(eff.duration / 1000).toFixed(0)}s buff`, formula: null };
  return { cooldown, damage: 'none', formula: null };
}

/**
 * The gear layout follows the body in three columns: helmet and amulet on
 * top, the chest between the weapon and shield, rings either side of the
 * belt, gloves and boots below. The trinkets sit under a rule.
 */
const DOLL: (EquipKey | null)[][] = [
  [null, 'helmet', 'amulet'],
  ['weapon', 'chest', 'shield'],
  ['ring1', 'belt', 'ring2'],
  ['gloves', 'boots'],
];
const TRINKETS: EquipKey[] = ['totem', 'charm', 'relic'];

/**
 * The hero menu: one pixel-art window with Inventory and Skills tabs. Inventory
 * shows the worn gear as a paper doll, the whole stat sheet under it and the bag
 * beside it. Skills holds the skill list, the slot bar and the passive trees.
 */
export class HeroMenu {
  tab: HeroTab = 'inventory';
  private selected: Item | null = null;
  private selectedFrom: 'bag' | 'equip' | null = null;
  private cell = 30;

  constructor(private readonly host: HeroMenuHost) {}

  /** Stat points placed with + and \u2212 but not yet confirmed. */
  private readonly pending = { str: 0, dex: 0, int: 0, vit: 0 };

  private clearPending(): void {
    this.pending.str = this.pending.dex = this.pending.int = this.pending.vit = 0;
  }

  reset(): void {
    this.clearPending();
    this.selected = null;
    this.selectedFrom = null;
    this.hideTip();
  }

  render(body: HTMLElement): void {
    // The window is rebuilt on every action; keep the scroll where the player left it
    const oldContent = body.querySelector<HTMLElement>('.px-content');
    const keepScroll = oldContent && oldContent.dataset.tab === this.tab ? oldContent.scrollTop : 0;
    const keepStats = body.querySelector<HTMLElement>('.px-stats')?.scrollTop ?? 0;
    clear(body);
    const w = this.host.world;
    const p = w.player;
    const cls = CLASSES[p.classId];
    const pledge = p.pledgeId ? PLEDGES[p.pledgeId]! : null;
    // Bag cells: whatever height is left under the paper doll, 18 to 30 px
    const spare = window.innerHeight - 24 - 16 - 46 - 24 - 22 - 300 - 8 - 26;
    this.cell = Math.max(18, Math.min(30, Math.floor(spare / 12), Math.floor(((Math.min(window.innerWidth, 1180) - 40) * 0.66 - 16) / 12)));
    const tabs = h(
      'div',
      { class: 'px-tabs' },
      ...((this.mouse ? ['inventory', 'skills', 'passives'] : ['inventory', 'stats', 'skills', 'passives']) as HeroTab[]).map((t) => {
        const b = h('button', { class: 'px-tab' + (t === this.tab ? ' on' : ''), onclick: () => { this.tab = t; this.render(body); } }, pxText(t === 'inventory' ? 'Inventory' : t === 'stats' ? 'Stats' : t === 'skills' ? 'Skills' : 'Passives', { color: t === this.tab ? GOLD : MUTED }));
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        return b;
      }),
      h('div', { class: 'px-tabs-title' }, pxText(`${pledge ? pledge.name + ' ' : ''}${cls.name}  Lv ${p.level}`, { color: hex(pledge ? pledge.color : cls.color) })),
      pbtn('X', () => this.host.close(), 'btn'),
    );
    const content = h('div', { class: 'px-content' + (this.tab === 'inventory' ? ' fixed' : '') });
    // The window goes into the page first so the inventory can measure the room it has
    body.append(h('div', { class: 'px-window' + (this.mouse ? '' : ' touch') }, tabs, content));
    content.dataset.tab = this.tab;
    if (this.tab === 'inventory') this.renderInventory(w, content);
    else if (this.tab === 'stats') this.renderStats(w, content);
    else if (this.tab === 'skills') this.renderSkills(w, content);
    else this.renderPassives(w, content);
    if (keepScroll) content.scrollTop = keepScroll;
    const stats = content.querySelector<HTMLElement>('.px-stats');
    if (stats && keepStats) stats.scrollTop = keepStats;
  }

  // ---------------------------------------------------------------- inventory

  private renderInventory(w: World, content: HTMLElement): void {
    const p = w.player;
    const rerender = () => this.render(content.parentElement!.parentElement!);
    // With a mouse the stats take the left third at full height with their own
    // scrollbar and the right two thirds hold the worn gear on top and the bag
    // underneath; on touch the stats have their own tab and the gear and bag get it all
    const stats = this.mouse ? h('div', { class: 'px-col stats-col' }, this.statSheet(w, rerender)) : null;
    const dollRow = (row: (EquipKey | null)[]) => h('div', { class: 'doll-row' }, ...row.map((key) => this.dollSlot(w, key, rerender)));
    const doll = h('div', { class: 'px-inset doll' }, ...DOLL.map(dollRow), h('div', { class: 'doll-rule' }), dollRow(TRINKETS));
    const side = this.mouse
      ? h('div', { class: 'px-inset px-itembox howto' }, pxText('Hover an item for its stats.\nClick to equip or take off.\nRight-click to drop.\nDrag to move it in the bag.', { color: MUTED }))
      : this.itemPanel(w, rerender);
    const top = h('div', { class: 'px-row gear-row' }, h('div', { class: 'px-col' }, label('Equipped'), doll), h('div', { class: 'px-col item-col' }, label(this.mouse ? 'How to' : 'Item'), side));
    const sortBtn = pbtn('Sort All', () => { p.inventory.sort(); w.markDirty(); this.reset(); rerender(); }, p.inventory.items.length ? 'btn' : 'dim');
    sortBtn.classList.add('tiny-wide');
    const bagBlock = h('div', { class: 'px-col bag-block' }, h('div', { class: 'px-row' }, label('Bag'), label(`${p.inventory.freeCells} cells free`), sortBtn, h('span', { class: 'grow' }), label(`${p.gold} gold`, GOLD)));
    const gearCol = h('div', { class: 'px-col gear-col' }, top, bagBlock);
    content.append(h('div', { class: 'px-inventory' }, stats, gearCol));
    // Now that the column has its size, the bag fills whatever is left
    const inv = p.inventory;
    const width = gearCol.clientWidth || 700;
    const height = Math.max(120, bagBlock.clientHeight - 30);
    this.cell = Math.max(18, Math.min(40, Math.floor((width - 16) / inv.cols), Math.floor((height - 16) / inv.rows)));
    bagBlock.append(this.bagGrid(w, rerender));
  }

  /** Touch devices: the stat sheet on its own tab, full width. */
  private renderStats(w: World, content: HTMLElement): void {
    const rerender = () => this.render(content.parentElement!.parentElement!);
    content.append(h('div', { class: 'px-inventory' }, h('div', { class: 'px-col stats-col full' }, this.statSheet(w, rerender))));
  }

  /** Mouse users hover for stats and click to act; touch users tap to select. */
  get mouse(): boolean {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  private dollSlot(w: World, key: EquipKey | null, rerender: () => void): HTMLElement {
    if (!key) return h('div', { class: 'doll-slot empty-space' });
    const item = w.player.equipment.get(key);
    const on = !!item && item === this.selected;
    const el = h('button', { class: 'doll-slot' + (on ? ' on' : '') + (item ? '' : ' empty') });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (item) {
      el.appendChild(this.icon(item, 2));
      el.onclick = () => {
        if (this.mouse) {
          const r = w.unequipItem(key);
          if (!r.ok) this.host.message(r.reason ?? 'Cannot unequip', 0xff8080);
          this.hideTip();
          this.reset();
        } else {
          this.selected = item;
          this.selectedFrom = 'equip';
        }
        rerender();
      };
      if (this.mouse) {
        el.onmouseenter = (e) => this.showTip(w, item, 'equip', e.clientX, e.clientY);
        el.onmousemove = (e) => this.moveTip(e.clientX, e.clientY);
        el.onmouseleave = () => this.hideTip();
      }
    } else {
      el.appendChild(pxText(key.startsWith('ring') ? 'Ring' : keyLabel(key), { color: '#3a3c48', scale: 1 }));
    }
    el.title = this.mouse ? '' : keyLabel(key);
    return el;
  }

  private icon(item: Item, scale: number): HTMLCanvasElement {
    const sprite = itemIconSprite(item.slot, item.weapon?.type ?? null, item.rarity, item.offhand ?? null, item.baseId);
    const c = h('canvas', { class: 'px-icon' }) as HTMLCanvasElement;
    c.width = sprite.width;
    c.height = sprite.height;
    c.getContext('2d')!.drawImage(sprite, 0, 0);
    c.style.width = `${sprite.width * scale}px`;
    c.style.height = `${sprite.height * scale}px`;
    return c;
  }

  private bagGrid(w: World, rerender: () => void): HTMLElement {
    const inv = w.player.inventory;
    const cell = this.cell;
    const grid = h('div', { class: 'px-inset px-grid' });
    grid.style.width = `${inv.cols * cell + 16}px`;
    grid.style.height = `${inv.rows * cell + 16}px`;
    const inner = h('div', { class: 'px-grid-inner' });
    inner.style.width = `${inv.cols * cell}px`;
    inner.style.height = `${inv.rows * cell}px`;
    inner.style.backgroundSize = `${cell}px ${cell}px`;
    const cellAt = (e: MouseEvent) => {
      const rect = inner.getBoundingClientRect();
      return { col: Math.floor((e.clientX - rect.left) / cell), row: Math.floor((e.clientY - rect.top) / cell) };
    };
    // Press on an item, release elsewhere: a move. Release in place: a click.
    let drag: { item: Item; x: number; y: number; moved: boolean } | null = null;
    inner.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const { col, row } = cellAt(e);
      const item = inv.itemAt(col, row);
      if (item) {
        drag = { item, x: e.clientX, y: e.clientY, moved: false };
        inner.setPointerCapture(e.pointerId);
      } else if (this.selected && this.selectedFrom === 'bag' && !this.mouse) {
        if (!inv.place(this.selected, col, row)) this.host.message('Does not fit there', 0xff8080);
        rerender();
      }
    });
    inner.addEventListener('pointermove', (e) => {
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.moved = true;
        this.hideTip();
        inner.classList.add('dragging');
      }
      if (!drag && e.pointerType === 'mouse') {
        const { col, row } = cellAt(e);
        const item = inv.itemAt(col, row);
        if (item) this.showTip(w, item, 'bag', e.clientX, e.clientY);
        else this.hideTip();
      }
    });
    inner.addEventListener('pointerleave', () => this.hideTip());
    inner.addEventListener('contextmenu', (e) => e.preventDefault());
    inner.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      inner.classList.remove('dragging');
      const { col, row } = cellAt(e);
      if (d.moved) {
        if (inv.itemAt(col, row) !== d.item && !inv.place(d.item, col, row)) this.host.message('Does not fit there', 0xff8080);
        rerender();
        return;
      }
      if (e.pointerType === 'mouse') {
        if (e.button === 2) w.dropItem(d.item);
        else {
          const r = w.equipItem(d.item);
          if (!r.ok) this.host.message(r.reason ?? 'Cannot equip', 0xff8080);
        }
        this.hideTip();
        this.reset();
      } else {
        this.selected = d.item;
        this.selectedFrom = 'bag';
      }
      rerender();
    });
    for (const item of inv.items) {
      const el = h('div', { class: 'px-item' + (item === this.selected ? ' on' : '') });
      el.style.left = `${item.col * cell}px`;
      el.style.top = `${item.row * cell}px`;
      el.style.width = `${item.size[0] * cell}px`;
      el.style.height = `${item.size[1] * cell}px`;
      el.style.setProperty('--rc', hex(RARITIES[item.rarity].color));
      const sprite = itemIconSprite(item.slot, item.weapon?.type ?? null, item.rarity, item.offhand ?? null, item.baseId);
      el.appendChild(this.icon(item, Math.max(1, Math.floor((Math.min(item.size[0], item.size[1]) * cell - 8) / sprite.width))));
      inner.appendChild(el);
    }
    grid.appendChild(inner);
    return grid;
  }

  /**
   * The lines of an item card, top to bottom: the name with the rarity at the far
   * right, what kind of thing it is, the level it needs, a rule, the weapon's
   * damage and speed (or the armour), a rule, then every other stat with its
   * difference against what is worn.
   */
  private itemLines(w: World, item: Item, from: 'bag' | 'equip'): HTMLElement[] {
    const compare = from === 'bag' ? w.player.equipment.get(w.player.equipment.targetKey(item)) : null;
    const color = hex(RARITIES[item.rarity].color);
    const rule = () => h('div', { class: 'px-rule' });
    const kind = item.weapon
      ? `${item.weapon.twoHanded ? 'Two-handed' : 'One-handed'} ${item.weapon.ranged ? 'ranged ' : ''}weapon`
      : item.offhand
        ? `Offhand${item.offhand === 'quiver' ? ' (needs a bow)' : ''}`
        : EQUIP_SLOTS.find((e) => e.id === item.slot)?.label ?? item.slot;
    const out: HTMLElement[] = [
      h('div', { class: 'px-row between' }, pxText(item.name, { color }), pxText(`[${RARITIES[item.rarity].name}]`, { color })),
      pxText(kind, { color: MUTED }),
      pxText(`Required level ${item.reqLevel}`, { color: '#a8aec0' }),
    ];
    const usable = canEquipItem(w.player, item);
    if (!usable.ok) out.push(pxText(usable.reason!, { color: RED }));
    const diff = (d: number) => (d !== 0 ? pxText(`(${d > 0 ? '+' : ''}${Math.round(d * 100) / 100})`, { color: d > 0 ? GREEN : RED }) : null);
    const stats = Object.entries(item.stats).filter(([, v]) => v) as [StatKey, number][];
    if (item.weapon) {
      const wp = item.weapon;
      const cw = compare?.weapon;
      const dmgDelta = cw ? Math.round(((wp.dmgMin + wp.dmgMax) / 2 - (cw.dmgMin + cw.dmgMax) / 2) * 10) / 10 : 0;
      out.push(rule());
      out.push(h('div', { class: 'px-row tight' }, pxText(`${wp.dmgMin} to ${wp.dmgMax} ${wp.magic ? 'Magic' : 'Physical'} Damage`, { color: TEXT }), diff(dmgDelta)));
      out.push(h('div', { class: 'px-row tight' }, pxText(`${wp.atkSpd.toFixed(2)} Attacks per second`, { color: TEXT }), diff(cw ? Math.round((wp.atkSpd - cw.atkSpd) * 100) / 100 : 0)));
    } else if (item.stats.armor) {
      out.push(rule());
      out.push(h('div', { class: 'px-row tight' }, pxText(`${Math.round(item.stats.armor)} Armor`, { color: TEXT }), diff(compare && compare !== item ? item.stats.armor - (compare.stats.armor ?? 0) : 0)));
    }
    const rest = stats.filter(([k]) => !(k === 'armor' && !item.weapon));
    if (rest.length) {
      out.push(rule());
      for (const [k, v] of rest) {
        // "+8 Intelligence" reads better as "+8 to Intelligence"
        const text = formatStat(k, v).replace(/^(\S+)\s/, '$1 to ');
        const d = compare && compare !== item ? v - (compare.stats[k] ?? 0) : 0;
        out.push(h('div', { class: 'px-row tight' }, pxText(text, { color: BLUE }), diff(d)));
      }
    }
    if (item.affixes.length > 1) out.push(pxText(item.affixes.slice(1).join(', '), { color: MUTED, maxChars: 44 }));
    if (compare && compare !== item) {
      out.push(rule());
      out.push(pxText(`Worn: ${compare.name}`, { color: MUTED, maxChars: 44 }));
    }
    return out;
  }

  // ---- hover tooltip (mouse only)

  private tip: HTMLDivElement | null = null;
  private tipItem: Item | null = null;

  private showTip(w: World, item: Item, from: 'bag' | 'equip', x: number, y: number): void {
    // Touch devices show the item in its own box; phones also fake mouse events after a tap, so never float a card there
    if (!this.mouse) return;
    if (this.tipItem === item && this.tip) {
      this.moveTip(x, y);
      return;
    }
    this.hideTip();
    const tip = h('div', { class: 'px-inset px-tip' }, ...this.itemLines(w, item, from));
    document.body.appendChild(tip);
    this.tip = tip;
    this.tipItem = item;
    this.moveTip(x, y);
  }

  private moveTip(x: number, y: number): void {
    if (!this.tip) return;
    const r = this.tip.getBoundingClientRect();
    let left = x + 18;
    let top = y + 18;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 12;
    if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
    this.tip.style.left = `${Math.max(4, left)}px`;
    this.tip.style.top = `${Math.max(4, top)}px`;
  }

  hideTip(): void {
    this.tip?.remove();
    this.tip = null;
    this.tipItem = null;
  }

  /** Touch users: the selected item's card with its actions. */
  private itemPanel(w: World, rerender: () => void): HTMLElement {
    const sel = this.selected;
    const box = h('div', { class: 'px-inset px-itembox' });
    if (!sel) {
      box.append(pxText('Tap an item to see it. Tap an empty cell to move it there.', { color: MUTED, maxChars: 44 }));
      return box;
    }
    box.append(...this.itemLines(w, sel, this.selectedFrom === 'equip' ? 'equip' : 'bag'));
    const actions = h('div', { class: 'px-row actions' });
    if (this.selectedFrom === 'bag') {
      actions.append(
        pbtn('Equip', () => {
          const r = w.equipItem(sel);
          if (!r.ok) this.host.message(r.reason ?? 'Cannot equip', 0xff8080);
          this.reset();
          rerender();
        }, 'gold'),
      );
      if (sel.slot === 'ring') {
        actions.append(pbtn('Equip as Ring 2', () => {
          const r = w.equipItem(sel, 'ring2');
          if (!r.ok) this.host.message(r.reason ?? 'Cannot equip', 0xff8080);
          this.reset();
          rerender();
        }));
      }
      actions.append(pbtn('Drop', () => { w.dropItem(sel); this.reset(); rerender(); }, 'red'));
    } else {
      const key = EQUIP_KEYS.find((k) => w.player.equipment.get(k) === sel)!;
      actions.append(pbtn('Unequip', () => {
        const r = w.unequipItem(key);
        if (!r.ok) this.host.message(r.reason ?? 'Cannot unequip', 0xff8080);
        this.reset();
        rerender();
      }, 'gold'));
    }
    box.append(actions);
    return box;
  }

  private statSheet(w: World, rerender: () => void): HTMLElement {
    const p = w.player;
    const d = w.derived;
    const sheet = h('div', { class: 'px-inset px-stats' });
    const head = (text: string) => sheet.append(h('div', { class: 'px-stat-head' }, pxText(text, { color: GOLD })));
    const row = (name: string, value: string, extra?: HTMLElement) => sheet.append(h('div', { class: 'px-stat' }, pxText(name, { color: MUTED }), h('span', { class: 'grow' }), pxText(value, { color: TEXT }), extra ?? null));
    // Points go into a pending pile with + and \u2212 and only count once confirmed
    const pend = this.pending;
    const pendingTotal = pend.str + pend.dex + pend.int + pend.vit;
    const left = p.statPoints - pendingTotal;
    const attr = (name: string, key: 'str' | 'dex' | 'int' | 'vit', current: number) => {
      const controls = h('span', { class: 'px-row tight' });
      if (p.statPoints > 0) {
        controls.append(
          pbtn('\u2212', () => { if (pend[key] > 0) { pend[key]--; rerender(); } }, pend[key] > 0 ? 'red' : 'dim'),
          pbtn('+', () => { if (left > 0) { pend[key]++; rerender(); } }, left > 0 ? 'gold' : 'dim'),
        );
        for (const b of controls.children) b.classList.add('tiny');
      }
      const value = pend[key] > 0 ? `${current + pend[key]}` : String(current);
      sheet.append(h('div', { class: 'px-stat' }, pxText(name, { color: MUTED }), h('span', { class: 'grow' }), pxText(value, { color: pend[key] > 0 ? GREEN : TEXT }), controls));
    };
    head(`Level ${p.level}`);
    row('Experience', `${p.xp} / ${p.xpToNext}`);
    row('Kills', String(p.kills));
    head('Attributes');
    if (p.statPoints > 0) row('Points to spend', pendingTotal ? `${left} (${pendingTotal} pending)` : String(left));
    attr('Strength', 'str', d.str);
    attr('Dexterity', 'dex', d.dex);
    attr('Intelligence', 'int', d.int);
    attr('Vitality', 'vit', d.vit);
    if (p.statPoints > 0) {
      // The row is always there so the sheet does not jump when points go pending
      sheet.append(h('div', { class: 'px-row tight stat-confirm' },
        pbtn('Confirm', () => {
          if (!pendingTotal) return;
          for (const key of ['str', 'dex', 'int', 'vit'] as const) for (let i = 0; i < pend[key]; i++) allocateStat(p, key);
          this.clearPending();
          w.markDirty();
          w.recomputeStats();
          rerender();
        }, pendingTotal ? 'gold' : 'dim'),
        pbtn('Cancel', () => { this.clearPending(); rerender(); }, pendingTotal ? 'btn' : 'dim'),
      ));
    }
    head('Offense');
    row('Weapon damage', `${d.dmgMin} - ${d.dmgMax}`);
    row('Bonus damage', `+${Math.round(d.bonusDamage)}`);
    row('Spell damage', `+${Math.round(d.spellDmg)}`);
    row('Attack speed', d.atkSpd.toFixed(2));
    row('Cast rate', `${(1 / d.castInterval).toFixed(1)} /s`);
    row('Critical chance', `${d.critChance.toFixed(1)}%`);
    row('Critical damage', `${Math.round(d.critDamage)}%`);
    row('Cooldown reduction', `${d.cdr}%`);
    row('Pierce', String(d.pierce));
    row('Poison / burn chance', `${d.poisonChance}% / ${d.burnChance}%`);
    row('Magic find', `${d.magicFind}%`);
    row('Item find', `${d.itemFind}%`);
    row('Gold find', `${d.goldFind}%`);
    head('Defense');
    row('Life', `${Math.ceil(p.hp)} / ${d.maxHp}`);
    row('Mana', `${Math.floor(p.mana)} / ${d.maxMana}`);
    row('Armor', `${Math.round(d.armor)}  (${Math.round((d.armor / (d.armor + 650)) * 100)}% less)`);
    row('Dodge', `${d.dodge.toFixed(1)}%`);
    row('Block', `${d.block}%`);
    row('Life regen', `${d.hpRegen.toFixed(1)} /s`);
    row('Mana regen', `${d.manaRegen.toFixed(1)} /s`);
    row('Life on hit', String(d.lifeOnHit));
    row('Mana on hit', String(d.manaOnHit));
    row('Life steal', `${d.lifeSteal}%`);
    row('Move speed', `${Math.round(d.moveSpeed * 32)} px/s`);
    head('Resistances');
    row('Fire', `${d.res.fire}%`);
    row('Cold', `${d.res.cold}%`);
    row('Lightning', `${d.res.lightning}%`);
    row('Poison', `${d.res.poison}%`);
    return sheet;
  }

  // ---------------------------------------------------------------- skills

  private renderSkills(w: World, content: HTMLElement): void {
    const p = w.player;
    const rerender = () => this.render(content.parentElement!.parentElement!);
    const list = skillsFor(p.classId, p.pledgeId).filter((s) => s.tier !== 'ultimate').sort((a, b) => (a.reqLevel ?? 1) - (b.reqLevel ?? 1));
    const slotsUnlocked = unlockedSlots(p.level);
    const keys = ['LMB', 'Q', 'E', 'R', 'Y', 'RMB'];
    const wrap = h('div', { class: 'px-skills' });
    wrap.append(h('div', { class: 'px-row tight' }, pxText(`+${p.skillPoints} Unused Skill Points`, { color: p.skillPoints ? GOLD : MUTED }), p.ultimatePoints > 0 ? pxText(`[+${p.ultimatePoints} Unused Ultimate Skill Points]`, { color: '#ffdd44' }) : null));
    const slotBar = h('div', { class: 'px-row slotbar' });
    for (let i = 0; i < 6; i++) {
      const id = p.slots[i];
      const locked = i >= slotsUnlocked;
      const name = locked ? `Lv ${[1, 1, 5, 10, 15, 20][i]}` : id === ATTACK_SLOT ? 'Attack' : id ? SKILLS[id]!.name : 'empty';
      slotBar.append(h('div', { class: 'px-inset px-chip' + (locked ? ' locked' : '') }, pxText(keys[i]!, { color: GOLD }), pxText(name, { color: locked ? MUTED : TEXT })));
    }
    wrap.append(slotBar);
    for (const s of list) {
      const rank = p.skillRanks[s.id] ?? 0;
      const ult = s.upgradesTo ? SKILLS[s.upgradesTo] : null;
      const ultOn = !!ult && p.unlockedUltimates.includes(ult.id);
      const active = ultOn ? ult! : s;
      const color = hex(s.pledgeId ? PLEDGES[s.pledgeId]!.color : CLASSES[p.classId].color);
      const learn = canLearnSkill(p, s.id);
      const row = h('div', { class: 'px-inset px-skill' + (rank ? '' : ' unlearned') });
      row.style.setProperty('--c', color);
      const info = skillInfo(w, active, rank);
      // Every skill reads the same way: name and rank, then damage type, mana, cooldown and damage with its formula
      const line = (label: string, value: string, valueColor = TEXT) => h('div', { class: 'px-row tight skill-line' }, pxText(`${label} :`, { color: MUTED }), pxText(value, { color: valueColor }));
      const kind = info.damage.startsWith('none') ? 'Skill' : 'Attack';
      const tags = [kind, s.tier === 'pledge' ? PLEDGES[s.pledgeId!]!.name : '', (s.reqLevel ?? 1) > 1 ? `Level ${s.reqLevel}` : '', s.requires ? `needs a ${s.requires}` : ''].filter(Boolean).join(' \u00b7 ');
      const element = active.element.charAt(0).toUpperCase() + active.element.slice(1);
      row.append(
        h('div', { class: 'px-row between' }, h('span', { class: 'px-row tight' }, pxText(active.name, { color }), tags ? pxText(tags, { color: MUTED, scale: 1 }) : null), pxText(ultOn ? '[Ultimate]' : `[Rank ${rank}]`, { color: ultOn ? '#ffdd44' : rank ? GOLD : MUTED })),
        line('Damage Type', element),
        line('Mana Cost', String(active.manaCost)),
        line('Cooldown', info.cooldown),
        line('Damage', info.formula ? `${info.damage} (${info.formula})` : info.damage, rank ? TEXT : MUTED),
        pxText(active.description, { color: MUTED, scale: 1 }),
      );
      const actions = h('div', { class: 'px-row actions' });
      // A minus takes a rank back (or undoes the ultimate), a plus adds one (or goes ultimate at rank 5); the plus hides at the top
      if (ultOn) {
        actions.append(pbtn('\u2212', () => { revokeUltimate(p, ult!.id); rerender(); }, 'red'));
      } else if (rank > 0) {
        actions.append(pbtn('\u2212', () => { unlearnSkill(p, s.id); rerender(); }, 'red'));
      }
      if (rank < 5) {
        actions.append(pbtn('+', () => {
          if (!learnSkill(p, s.id)) this.host.message(canLearnSkill(p, s.id).reason ?? 'Cannot learn', 0xff8080);
          rerender();
        }, learn.ok ? 'gold' : 'dim'));
      } else if (ult && !ultOn) {
        const can = canUnlockUltimate(p, s.id);
        const plus = pbtn('+', () => {
          if (!unlockUltimate(p, s.id)) this.host.message(canUnlockUltimate(p, s.id).reason ?? 'Cannot unlock', 0xff8080);
          else this.host.message(`${ult.name} unlocked as an ultimate`, 0xffe066);
          rerender();
        }, can.ok ? 'gold' : 'dim');
        if (can.ok) plus.classList.add('glow');
        actions.append(plus);
      }
      if (rank > 0) {
        // Where it sits on the bar, as a dropdown
        const bound = p.slots.findIndex((k) => k === s.id || k === active.id);
        const select = h('select', { class: 'px-select' }) as HTMLSelectElement;
        select.append(h('option', { value: '' }, 'Not bound'));
        for (let i = 0; i < 6; i++) {
          if (i >= slotsUnlocked) continue;
          select.append(h('option', { value: String(i) }, `Bound to ${keys[i]}`));
        }
        select.value = bound >= 0 ? String(bound) : '';
        select.addEventListener('pointerdown', (e) => e.stopPropagation());
        select.addEventListener('change', () => {
          for (let k = 0; k < 6; k++) if (p.slots[k] === s.id || p.slots[k] === active.id) p.slots[k] = k === 0 ? ATTACK_SLOT : null;
          if (select.value !== '') p.slots[Number(select.value)] = active.id;
          rerender();
        });
        actions.append(select);
      }
      row.append(actions);
      wrap.append(row);
    }
    content.append(wrap);
  }

  private renderPassives(w: World, content: HTMLElement): void {
    const p = w.player;
    const rerender = () => this.render(content.parentElement!.parentElement!);
    const wrap = h('div', { class: 'px-skills' });
    const passives = h('div', { class: 'px-passives' });
    passives.append(h('div', { class: 'px-row' }, pxText('Passives', { color: GOLD }), pxText(`${p.passivePoints} points`, { color: MUTED })));
    const tree = (title: string, defs: typeof GENERAL_TREE) =>
      h('div', { class: 'px-tree' }, pxText(title, { color: MUTED }), ...defs.map((d) => {
        const rank = p.passiveRanks[d.id] ?? 0;
        const can = canLearnPassive(p, d.id);
        const req = d.requires ? defs.find((x) => x.id === d.requires)?.name : null;
        return h('div', { class: 'px-inset px-passive' + (rank ? ' learned' : '') },
          h('div', { class: 'px-col' }, h('div', { class: 'px-row' }, pxText(d.name, { color: rank ? TEXT : MUTED }), pxText(`${rank}/${d.maxRank}`, { color: MUTED })), pxText(`+${d.perRank} ${d.stat} per rank${req ? `, needs ${req}` : ''}`, { color: MUTED, scale: 1 })),
          h('span', { class: 'grow' }),
          pbtn('+', () => { if (!learnPassive(p, d.id)) this.host.message(can.reason ?? 'Cannot learn', 0xff8080); else { w.markDirty(); w.recomputeStats(); } rerender(); }, can.ok ? 'gold' : 'dim'),
        );
      }));
    passives.append(h('div', { class: 'px-trees' }, tree('General', GENERAL_TREE), tree(CLASSES[p.classId].name, CLASS_TREES[p.classId])));
    wrap.append(passives);
    content.append(wrap);
  }
}
