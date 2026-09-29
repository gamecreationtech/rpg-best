import { ARCANA_OPS, BLOOD_OPS, FORGE_OPS, STATIONS } from '../../data/crafting';
import { PROFESSIONS, PROFESSION_PERKS } from '../../data/professions';
import { ITEM_RULES, RARITIES } from '../../data/items';
import { ZONES } from '../../data/zones';
import { LEVELING } from '../../data/classes';

/** Monster levels offered on the waypoint's Beyond 100 page. */
const BEYOND_LEVELS = [125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500];
import { EQUIP_KEYS, keyLabel, type EquipKey } from '../../sim/items/equipment';
import { applyArcana, applyBlood, applyForge, canBlood, canForge } from '../../sim/items/crafting';
import type { Item } from '../../sim/items/item';
import { buyPrice, sellPrice } from '../../sim/items/vendor';
import { canEquipItem, professionXpToNext, setPiecesWorn } from '../../sim/player';
import type { World } from '../../sim/world';
import type { Settings } from '../../app/storage';
import { button, clear, h, hex } from '../dom';
import { ItemGrid, itemCard, itemIcon } from './itemGrid';
import { GOLD, HeroMenu, MUTED, TEXT, label, pbtn, pxText } from './heroMenu';
import { installPixelChrome } from '../pixelChrome';
import type { PanelKind } from './hud';

export interface PanelHost {
  world: World;
  settings: Settings;
  applySettings(): void;
  fullscreen: { supported: boolean; active(): boolean; toggle(): void; hint: string | null };
  message(text: string, color?: number): void;
  close(): void;
  travel(area: 'town' | 'arena', zoneId?: string, level?: number): void;
  exportCode(): string;
  importCode(code: string): Promise<boolean>;
  saveNow(): Promise<void>;
  quitToTitle(): void;
  deleteSave(): Promise<void>;
}

const TITLES: Record<PanelKind, string> = {
  inventory: 'Inventory',
  character: 'Character',
  skills: 'Skills',
  passives: 'Passives',
  stash: 'Stash',
  vendor: 'Merchant',
  waypoint: 'Waypoint',
  forge: STATIONS.forge.name,
  bloodfountain: STATIONS.bloodfountain.name,
  arcana: STATIONS.arcana.name,
  professions: 'Professions',
  settings: 'Menu',
};

/** Modal panels. The game pauses while one is open. Every action re-renders the panel. */
export class Panels {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  kind: PanelKind | null = null;
  private readonly hero: HeroMenu;
  private selected: Item | null = null;
  private selectedFrom: 'bag' | 'equip' | 'stash' | 'vendor' | null = null;
  private stashPage = 0;
  /** Waypoint: the normal zone list, or the Beyond 100 page that replays zones at a picked monster level. */
  private wpPage: 'zones' | 'beyond' = 'zones';
  private beyondLevel = BEYOND_LEVELS[0]!;
  private cellSize = 30;
  /** Which half of a two-part panel a phone shows: the stock or the bag, the gear or the bag. */
  private half: 'left' | 'bag' = 'left';

  constructor(parent: HTMLElement, private readonly host: PanelHost) {
    this.titleEl = h('div', { class: 'panel-title' });
    this.body = h('div', { class: 'panel-body' });
    const closeBtn = button('Close', () => host.close(), 'btn ghost close');
    this.root = h('div', { class: 'panel-overlay' }, h('div', { class: 'panel-head' }, this.titleEl, closeBtn), this.body);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    installPixelChrome();
    this.hero = new HeroMenu({ world: host.world, message: (t, c) => host.message(t, c), close: () => host.close() });
  }

  /** Phones and tablets: no hover, one column, big tap targets. */
  private get touch(): boolean {
    return !this.hero.mouse;
  }

  /** On touch a two-part panel shows one half at a time under a pair of tabs. */
  private halves(left: string, leftEl: HTMLElement, bagEl: HTMLElement): HTMLElement[] {
    if (!this.touch) return [h('div', { class: 'two-col' }, leftEl, bagEl)];
    const tabs = h('div', { class: 'tabs halves' },
      button(left, () => { this.half = 'left'; this.render(); }, 'btn small' + (this.half === 'left' ? ' on' : '')),
      button('Bag', () => { this.half = 'bag'; this.render(); }, 'btn small' + (this.half === 'bag' ? ' on' : '')),
    );
    return [tabs, this.half === 'left' ? leftEl : bagEl];
  }

  /** The hero menu (Tab): inventory, gear and stats on one tab, skills and passives on the other. */
  get isHero(): boolean {
    return this.kind === 'inventory' || this.kind === 'character' || this.kind === 'skills' || this.kind === 'passives';
  }

  get isOpen(): boolean {
    return this.kind !== null;
  }

  open(kind: PanelKind): void {
    this.kind = kind;
    this.selected = null;
    this.selectedFrom = null;
    this.root.style.display = 'flex';
    this.titleEl.textContent = TITLES[kind];
    // The bag is 18 wide: cells shrink so every column fits on a phone
    this.cellSize = Math.max(18, Math.min(34, Math.floor((Math.min(window.innerWidth, 720) - 32) / ITEM_RULES.inventoryCols)));
    this.half = 'left';
    if (this.isHero) {
      this.hero.reset();
      this.hero.tab = kind === 'skills' ? 'skills' : kind === 'passives' ? 'passives' : kind === 'character' && !this.hero.mouse ? 'stats' : 'inventory';
    }
    this.root.classList.toggle('hero', this.isHero || kind === 'waypoint');
    this.render();
  }

  close(): void {
    this.hero.hideTip();
    this.kind = null;
    this.root.style.display = 'none';
    clear(this.body);
  }

  render(): void {
    if (!this.kind) return;
    clear(this.body);
    const w = this.host.world;
    if (this.isHero) {
      this.hero.render(this.body);
      return;
    }
    switch (this.kind) {
      case 'stash': this.renderStash(w); break;
      case 'vendor': this.renderVendor(w); break;
      case 'waypoint': this.renderWaypoint(w); break;
      case 'forge':
      case 'bloodfountain':
      case 'arcana': this.renderCrafting(w, this.kind); break;
      case 'professions': this.renderProfessions(w); break;
      case 'settings': this.renderSettings(w); break;
    }
  }

  // ---------------------------------------------------------------- shared bits

  private bagGrid(w: World, onItem: (item: Item) => void, onCell?: (col: number, row: number) => void): HTMLElement {
    const grid = new ItemGrid(w.player.inventory, {
      onItemTap: (item) => onItem(item),
      onCellTap: (col, row) => onCell?.(col, row),
    });
    grid.selected = this.selected;
    grid.setCellSize(this.cellSize);
    grid.render();
    return h('div', { class: 'grid-wrap' }, h('div', { class: 'section-label' }, `Bag  (${w.player.inventory.freeCells} cells free)`), grid.root);
  }

  private equipList(w: World, onItem: (item: Item, key: EquipKey) => void): HTMLElement {
    const rows = EQUIP_KEYS.map((key) => {
      const item = w.player.equipment.get(key);
      const b = button('', () => item && onItem(item, key), 'equip-row' + (item && item === this.selected ? ' selected' : ''));
      b.append(h('span', { class: 'equip-key' }, keyLabel(key)));
      if (item) {
        b.append(itemIcon(item, 18), h('span', { class: 'equip-name', style: `color:${hex(RARITIES[item.rarity].color)}` }, item.name));
      } else {
        b.append(h('span', { class: 'equip-name dim' }, 'empty'));
      }
      return b;
    });
    return h('div', { class: 'equip-list' }, h('div', { class: 'section-label' }, 'Equipped'), ...rows);
  }

  /** The tapped item with its stats and the actions for it; pinned at the top on touch so it is always in view. */
  private selectedCard(w: World, actions: HTMLElement[], hint = 'Tap an item to see its stats.'): HTMLElement | null {
    const cls = 'selected-card' + (this.touch ? ' sticky' : '');
    if (!this.selected) return h('div', { class: cls }, h('div', { class: 'item-card dim' }, hint));
    const compare = this.selectedFrom !== 'equip' ? w.player.equipment.get(w.player.equipment.targetKey(this.selected)) : null;
    const card = itemCard(this.selected, compare && compare !== this.selected ? compare : null, this.selected.setId ? setPiecesWorn(w.player, this.selected.setId) : 0, w.player.level);
    const usable = canEquipItem(w.player, this.selected);
    if (!usable.ok) card.append(h('div', { class: 'item-line down' }, usable.reason!));
    return h('div', { class: cls }, card, h('div', { class: 'actions' }, ...actions));
  }

  private select(item: Item, from: 'bag' | 'equip' | 'stash' | 'vendor'): void {
    this.selected = item;
    this.selectedFrom = from;
    this.render();
  }

  // ---------------------------------------------------------------- stash

  private renderStash(w: World): void {
    const tabs = h('div', { class: 'tabs' }, ...w.player.stash.map((_, i) => button(`Page ${i + 1}`, () => { this.stashPage = i; this.render(); }, 'btn small' + (i === this.stashPage ? ' on' : ''))));
    const page = w.player.stash[this.stashPage]!;
    const stashGrid = new ItemGrid(page, {
      onItemTap: (item) => { if (!w.moveBetween(item, page, w.player.inventory)) this.host.message('Bag is full', 0xff8080); this.render(); },
      onCellTap: () => {},
    });
    // The stash is narrower than the bag, so its cells can be bigger
    stashGrid.setCellSize(Math.max(18, Math.min(34, Math.floor((Math.min(window.innerWidth, 720) - 32) / ITEM_RULES.stashCols))));
    stashGrid.render();
    this.body.append(
      h('div', { class: 'dim pad' }, 'Tap an item to move it between your bag and the stash.'),
      tabs,
      ...this.halves('Stash', h('div', { class: 'grid-wrap' }, h('div', { class: 'section-label' }, `Stash page ${this.stashPage + 1}`), stashGrid.root), this.bagGrid(w, (item) => { if (!w.moveBetween(item, w.player.inventory, page)) this.host.message('Stash page is full', 0xff8080); this.render(); })),
    );
  }

  // ---------------------------------------------------------------- vendor

  private renderVendor(w: World): void {
    const stock = h('div', { class: 'stock' }, h('div', { class: 'section-label' }, 'For sale'), ...w.vendorStock.map((item) =>
      h('div', { class: 'stock-row' + (item === this.selected ? ' selected' : '') + (canEquipItem(w.player, item).ok ? '' : ' unusable') },
        button('', () => this.select(item, 'vendor'), 'stock-name'),
        h('span', { class: 'price' }, `${buyPrice(item)}g`),
        button('Buy', () => { const r = w.buyItem(item); if (!r.ok) this.host.message(r.reason ?? 'Cannot buy', 0xff8080); this.selected = null; this.render(); }, 'btn small' + (w.player.gold >= buyPrice(item) ? ' primary' : ' disabled')),
      ),
    ));
    for (const row of stock.querySelectorAll<HTMLButtonElement>('.stock-name')) {
      const item = w.vendorStock[Array.from(stock.querySelectorAll('.stock-row')).indexOf(row.parentElement!)]!;
      row.append(itemIcon(item, 18), h('span', { style: `color:${hex(RARITIES[item.rarity].color)}` }, item.name));
    }
    const actions: HTMLElement[] = [];
    if (this.selected && this.selectedFrom === 'bag') {
      const sel = this.selected;
      actions.push(button(`Sell for ${sellPrice(sel)} gold`, () => { w.sellItem(sel); this.selected = null; this.render(); }, 'btn primary'));
    } else if (this.selected && this.selectedFrom === 'vendor') {
      const sel = this.selected;
      actions.push(button(`Buy for ${buyPrice(sel)} gold`, () => { const r = w.buyItem(sel); if (!r.ok) this.host.message(r.reason ?? 'Cannot buy', 0xff8080); this.selected = null; this.render(); }, 'btn primary' + (w.player.gold >= buyPrice(sel) ? '' : ' disabled')));
    }
    const bulk = (rarity: 'common' | 'magic', label: string) => {
      const items = w.player.inventory.items.filter((i) => i.rarity === rarity);
      const gold = items.reduce((sum, i) => sum + sellPrice(i), 0);
      return button(items.length ? `Sell all ${label} (${items.length} for ${gold}g)` : `Sell all ${label}`, () => {
        const r = w.sellAll(rarity);
        this.host.message(r.count ? `Sold ${r.count} ${label.toLowerCase()} items for ${r.gold} gold` : `No ${label.toLowerCase()} items to sell`, r.count ? 0xffd060 : 0xff8080);
        this.selected = null;
        this.render();
      }, 'btn small' + (items.length ? '' : ' disabled'));
    };
    this.body.append(
      h('div', { class: 'dim pad' }, `${w.player.gold} gold. Items sell for 40% of their value.`),
      h('div', { class: 'actions' }, bulk('common', 'Common'), bulk('magic', 'Magic')),
      this.selectedCard(w, actions, 'Tap something for sale or in your bag to see its stats, then buy or sell it here.')!,
      ...this.halves('For sale', stock, this.bagGrid(w, (item) => this.select(item, 'bag'))),
    );
  }

  // ---------------------------------------------------------------- waypoint

  /** The waypoint in the same pixel window as the hero menu: one framed row per place, Travel on the right. */
  private renderWaypoint(w: World): void {
    const row = (name: string, level: number | null, desc: string, here: boolean, warn: string | null, onGo: () => void) => {
      return h(
        'div',
        { class: 'px-inset px-zone' + (here ? ' here' : '') },
        h('div', { class: 'px-row' }, pxText(name, { color: here ? GOLD : TEXT }), level === null ? null : pxText(`Level ${level}`, { color: MUTED, scale: 1 }), h('span', { class: 'grow' }), here ? label('You are here', GOLD) : pbtn('Travel', onGo, 'gold')),
        pxText(desc, { color: MUTED }),
        warn ? pxText(warn, { color: '#ff6a6a' }) : null,
      );
    };
    const list = h('div', { class: 'px-zones' });
    const capped = w.player.level >= LEVELING.maxLevel;
    if (!capped) this.wpPage = 'zones';
    if (this.wpPage === 'beyond') {
      // Beyond 100: every zone again, at a monster level the player picks. Drops follow that level.
      const select = h('select', { class: 'px-select' }) as HTMLSelectElement;
      for (const lv of BEYOND_LEVELS) select.append(h('option', { value: String(lv) }, `Level ${lv}`));
      select.value = String(this.beyondLevel);
      select.addEventListener('change', () => { this.beyondLevel = Number(select.value); this.render(); });
      list.append(h('div', { class: 'px-inset px-zone' }, h('div', { class: 'px-row' }, pxText('Monster level', { color: TEXT }), h('span', { class: 'grow' }), select),
        pxText('Heroes stop at level 100; monsters keep climbing to 500. Their life and damage grow every level, and what they drop is made at their level.', { color: MUTED })));
      for (const z of ZONES) {
        const here = w.area === 'arena' && w.zoneId === z.id && w.zoneLevel === this.beyondLevel;
        list.append(row(z.name, this.beyondLevel, z.blurb, here, null, () => this.host.travel('arena', z.id, this.beyondLevel)));
      }
    } else {
      list.append(row('Town', null, 'Merchant, stash, crafting stations and training dummies. Nothing here can hurt you except the dummies.', w.area === 'town', null, () => this.host.travel('town')));
      for (const z of ZONES) {
        const here = w.area === 'arena' && w.zoneId === z.id && !w.zoneLevel;
        const tooHigh = w.player.level + 4 < z.level;
        list.append(row(z.name, z.level, z.blurb, here, tooHigh ? `You are level ${w.player.level}; this will hurt.` : null, () => this.host.travel('arena', z.id)));
      }
    }
    const head = h('div', { class: 'px-tabs' },
      h('div', { class: 'px-tabs-title' }, pxText('Waypoint', { color: GOLD })),
      capped ? pbtn('Zones', () => { this.wpPage = 'zones'; this.render(); }, this.wpPage === 'zones' ? 'on' : 'btn') : null,
      capped ? pbtn('Beyond 100', () => { this.wpPage = 'beyond'; this.render(); }, this.wpPage === 'beyond' ? 'on' : 'btn') : null,
      pbtn('X', () => this.host.close(), 'btn'));
    this.body.append(h('div', { class: 'px-window' }, head, h('div', { class: 'px-content' }, list)));
  }

  // ---------------------------------------------------------------- crafting

  private renderCrafting(w: World, kind: 'forge' | 'bloodfountain' | 'arcana'): void {
    const station = STATIONS[kind];
    const sel = this.selected;
    const ops = h('div', { class: 'ops' }, h('div', { class: 'section-label' }, 'Operations'));
    const afford = (cost: number) => w.player.gold >= cost;
    const done = (msg: string | undefined) => {
      if (msg) this.host.message(msg, hex(station.color) ? station.color : undefined);
      w.markDirty();
      w.recomputeStats();
      w.emit({ type: 'sound', id: 'forgeSmelt' });
      this.render();
    };
    if (kind === 'forge') {
      for (const op of FORGE_OPS) {
        const ok = sel ? canForge(op, sel) : { ok: false, reason: 'Pick an item' };
        ops.appendChild(button(`${op.name}  ${op.cost}g`, () => { if (!sel) return; if (!afford(op.cost)) return this.host.message('Not enough gold', 0xff8080); const r = applyForge(op, sel); if (!r.ok) return this.host.message(r.reason!, 0xff8080); w.spendGold(op.cost); done(r.message); }, 'btn' + (ok.ok && afford(op.cost) ? ' primary' : ' disabled')));
        ops.appendChild(h('div', { class: 'dim small' }, `${op.description} (${op.slots.join(', ')}, max ${5} uses)${sel && !ok.ok ? ': ' + ok.reason : ''}`));
      }
    } else if (kind === 'bloodfountain') {
      for (const op of BLOOD_OPS) {
        const ok = sel ? canBlood(op, sel) : { ok: false, reason: 'Pick an item' };
        ops.appendChild(button(`${op.name}  ${op.cost}g`, () => { if (!sel) return; if (!afford(op.cost)) return this.host.message('Not enough gold', 0xff8080); const r = applyBlood(op, sel); if (!r.ok) return this.host.message(r.reason!, 0xff8080); w.spendGold(op.cost); done(r.message); }, 'btn' + (ok.ok && afford(op.cost) ? ' primary' : ' disabled')));
        ops.appendChild(h('div', { class: 'dim small' }, `${op.description} (${op.slots.length ? op.slots.join(', ') : 'any item'})`));
      }
    } else {
      for (const op of ARCANA_OPS) {
        ops.appendChild(button(`${op.name}  ${op.cost}g`, () => { if (!sel) return; if (!afford(op.cost)) return this.host.message('Not enough gold', 0xff8080); const r = applyArcana(op, sel, w.rng); if (!r.ok) return this.host.message(r.reason!, 0xff8080); w.spendGold(op.cost); done(r.message); }, 'btn' + (sel && afford(op.cost) ? ' primary' : ' disabled')));
        ops.appendChild(h('div', { class: 'dim small' }, op.description));
      }
    }
    this.body.append(
      h('div', { class: 'dim pad' }, `${w.player.gold} gold. Pick an item from your bag or your equipment, then choose an operation.`),
      this.selectedCard(w, [], 'Tap a worn item or one in your bag to see its stats, then choose an operation.')!,
      ...(this.touch
        ? [ops, ...this.halves('Equipped', this.equipList(w, (item) => this.select(item, 'equip')), this.bagGrid(w, (item) => this.select(item, 'bag')))]
        : [h('div', { class: 'two-col' }, h('div', {}, this.equipList(w, (item) => this.select(item, 'equip')), ops), this.bagGrid(w, (item) => this.select(item, 'bag')))]),
    );
  }

  // ---------------------------------------------------------------- professions

  private renderProfessions(w: World): void {
    const p = w.player;
    this.body.appendChild(h('div', { class: 'dim pad' }, 'Gathering nodes live in the zones, so professions cannot gain experience yet. The ladder below is what each will unlock.'));
    for (const pr of PROFESSIONS) {
      const st = p.professions[pr.id];
      const need = professionXpToNext(st.level);
      this.body.appendChild(h('div', { class: 'prof-row', style: `--c:${hex(pr.color)}` },
        h('div', { class: 'prof-head' }, h('span', { class: 'prof-name' }, pr.name), h('span', { class: 'dim' }, `Level ${st.level}, ${st.xp}/${need}`)),
        h('div', { class: 'bar thin' }, h('div', { class: 'bar-fill xp', style: `width:${(st.xp / need) * 100}%` })),
        h('div', { class: 'dim small' }, pr.description),
        h('div', { class: 'perks' }, ...PROFESSION_PERKS.map((pk) => h('span', { class: 'perk' + (st.level >= pk.level ? ' on' : '') }, `${pk.level}: ${pk.text}`))),
      ));
    }
  }

  // ---------------------------------------------------------------- settings

  private renderSettings(w: World): void {
    const s = this.host.settings;
    const slider = (label: string, value: number, onChange: (v: number) => void) => {
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(value * 100) });
      input.addEventListener('input', () => onChange(Number(input.value) / 100));
      return h('div', { class: 'setting-row' }, h('span', {}, label), input);
    };
    const codeOut = h('textarea', { class: 'code', readonly: true, rows: 3 });
    const codeIn = h('textarea', { class: 'code', rows: 3, placeholder: 'Paste a save code here' });
    this.body.append(
      h('div', { class: 'section-label' }, 'Volume'),
      slider('Music', s.music, (v) => { s.music = v; this.host.applySettings(); }),
      slider('Sound effects', s.sfx, (v) => { s.sfx = v; this.host.applySettings(); }),
      h('div', { class: 'section-label' }, 'Screen'),
      h('div', { class: 'actions' },
        this.host.fullscreen.supported ? button(this.host.fullscreen.active() ? 'Leave full screen' : 'Full screen', () => { this.host.fullscreen.toggle(); window.setTimeout(() => this.render(), 300); }, 'btn small') : null,
        button(s.fullscreen ? 'Full screen on play: on' : 'Full screen on play: off', () => { s.fullscreen = !s.fullscreen; this.host.applySettings(); this.render(); }, 'btn small' + (s.fullscreen ? ' on' : '')),
      ),
      h('div', { class: 'dim small' }, this.host.fullscreen.hint ?? 'Installed to the home screen: the game already runs full screen.'),
      h('div', { class: 'section-label' }, 'Zoom'),
      h('div', { class: 'actions' }, ...([0, 1, 1.5, 2, 3] as const).map((z) => button(z === 0 ? 'Automatic' : `${z}x`, () => { s.zoom = z; this.host.applySettings(); this.render(); }, 'btn small' + (s.zoom === z ? ' on' : '')))),
      h('div', { class: 'dim small' }, 'How much the pixels are enlarged. Automatic fits the screen; phones usually land on 1x, and 1.5x brings the hero closer.'),
      h('div', { class: 'section-label' }, 'Pet'),
      h('div', { class: 'actions' }, button(s.pet ? 'Crab: on' : 'Crab: off', () => { s.pet = !s.pet; this.host.applySettings(); this.render(); }, 'btn small' + (s.pet ? ' on' : ''))),
      h('div', { class: 'dim small' }, 'A small crab follows you and fetches gold and items that drop within 300 px.'),
      h('div', { class: 'section-label' }, 'Loot'),
      h('div', { class: 'actions' }, ...(['common', 'magic', 'rare'] as const).map((r) => button(`${RARITIES[r].name}: ${s.loot[r] ? 'shown' : 'hidden'}`, () => { s.loot[r] = !s.loot[r]; this.host.applySettings(); this.render(); }, 'btn small' + (s.loot[r] ? ' on' : '')))),
      h('div', { class: 'dim small' }, 'Hidden items stay on the ground unseen and neither you nor the crab pick them up. Mythic, set and divine items always show. Stand on an item and press F, or the action button, to pick it up.'),
      h('div', { class: 'section-label' }, 'Controls'),
      h('div', { class: 'actions' }, ...(['auto', 'touch', 'tap'] as const).map((c) => button(c === 'auto' ? 'Automatic' : c === 'touch' ? 'Joystick and buttons' : 'Tap to move', () => { s.controls = c; this.host.applySettings(); this.render(); }, 'btn small' + (s.controls === c ? ' on' : '')))),
      h('div', { class: 'dim small' }, 'Automatic picks the joystick on phones and tablets, tap to move elsewhere.'),
      h('div', { class: 'section-label' }, 'Save'),
      h('div', { class: 'dim small' }, `Saved automatically on level up and when you travel. Level ${w.player.level}, ${w.player.gold} gold.`),
      h('div', { class: 'actions' },
        button('Save now', () => { void this.host.saveNow().then(() => this.host.message('Saved', 0x9fe08f)); }, 'btn primary'),
        button('Show save code', () => { codeOut.value = this.host.exportCode(); codeOut.select(); }, 'btn'),
        button('Copy code', () => { codeOut.value = this.host.exportCode(); void navigator.clipboard?.writeText(codeOut.value).then(() => this.host.message('Save code copied', 0x9fe08f)); }, 'btn'),
      ),
      codeOut,
      h('div', { class: 'dim small' }, 'Move your hero to another device: paste its save code below.'),
      codeIn,
      h('div', { class: 'actions' }, button('Import code', () => { void this.host.importCode(codeIn.value).then((ok) => { if (!ok) this.host.message('That code could not be read', 0xff8080); }); }, 'btn')),
      h('div', { class: 'section-label' }, 'Game'),
      h('div', { class: 'actions' },
        button('Quit to title', () => this.host.quitToTitle(), 'btn'),
        button('Delete hero', () => { if (confirm('Delete this hero and its save? This cannot be undone.')) void this.host.deleteSave(); }, 'btn danger'),
      ),
      h('div', { class: 'dim small pad' }, 'Controls: tap to move, tap an enemy to attack, tap a skill to cast at the nearest enemy, or drag from a skill to aim it. Shift-click to attack in place without moving. Keyboard: WASD, Q E R Y, right click, 1-4 potions, I C K P, F to pick up or interact.'),
    );
  }
}
