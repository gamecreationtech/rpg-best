import { CLASSES } from '../../data/classes';
import { ARCANA_OPS, BLOOD_OPS, FORGE_OPS, STATIONS } from '../../data/crafting';
import { PLEDGES } from '../../data/pledges';
import { GENERAL_TREE, CLASS_TREES } from '../../data/passives';
import { PROFESSIONS, PROFESSION_PERKS } from '../../data/professions';
import { SKILLS, skillsFor } from '../../data/skills';
import { RARITIES } from '../../data/items';
import { PROVING_GROUNDS } from '../../data/placeholderEnemies';
import { EQUIP_KEYS, keyLabel, type EquipKey } from '../../sim/items/equipment';
import { applyArcana, applyBlood, applyForge, canBlood, canForge } from '../../sim/items/crafting';
import type { Item } from '../../sim/items/item';
import { buyPrice, sellPrice } from '../../sim/items/vendor';
import { ATTACK_SLOT, allocateStat, canLearnPassive, canLearnSkill, canUnlockUltimate, learnPassive, learnSkill, professionXpToNext, revokeUltimate, unlockUltimate, unlockedSlots } from '../../sim/player';
import { skillCooldown } from '../../sim/skills/cast';
import type { World } from '../../sim/world';
import type { Settings } from '../../app/storage';
import { button, clear, h, hex } from '../dom';
import { ItemGrid, itemCard, itemIcon } from './itemGrid';
import type { PanelKind } from './hud';

export interface PanelHost {
  world: World;
  settings: Settings;
  applySettings(): void;
  fullscreen: { supported: boolean; active(): boolean; toggle(): void; hint: string | null };
  message(text: string, color?: number): void;
  close(): void;
  travel(area: 'town' | 'arena'): void;
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
  private selected: Item | null = null;
  private selectedFrom: 'bag' | 'equip' | 'stash' | 'vendor' | null = null;
  private stashPage = 0;
  private cellSize = 30;

  constructor(parent: HTMLElement, private readonly host: PanelHost) {
    this.titleEl = h('div', { class: 'panel-title' });
    this.body = h('div', { class: 'panel-body' });
    const closeBtn = button('Close', () => host.close(), 'btn ghost close');
    this.root = h('div', { class: 'panel-overlay' }, h('div', { class: 'panel-head' }, this.titleEl, closeBtn), this.body);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.style.display = 'none';
    parent.appendChild(this.root);
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
    this.cellSize = Math.max(22, Math.min(34, Math.floor((Math.min(window.innerWidth, 720) - 32) / 12)));
    this.render();
  }

  close(): void {
    this.kind = null;
    this.root.style.display = 'none';
    clear(this.body);
  }

  render(): void {
    if (!this.kind) return;
    clear(this.body);
    const w = this.host.world;
    switch (this.kind) {
      case 'inventory': this.renderInventory(w); break;
      case 'character': this.renderCharacter(w); break;
      case 'skills': this.renderSkills(w); break;
      case 'passives': this.renderPassives(w); break;
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

  private selectedCard(w: World, actions: HTMLElement[]): HTMLElement | null {
    if (!this.selected) return h('div', { class: 'item-card dim' }, 'Tap an item to see it. Tap it again for actions.');
    const compare = this.selectedFrom !== 'equip' ? w.player.equipment.get(w.player.equipment.targetKey(this.selected)) : null;
    return h('div', { class: 'selected' }, itemCard(this.selected, compare && compare !== this.selected ? compare : null), h('div', { class: 'actions' }, ...actions));
  }

  private select(item: Item, from: 'bag' | 'equip' | 'stash' | 'vendor'): void {
    this.selected = item;
    this.selectedFrom = from;
    this.render();
  }

  // ---------------------------------------------------------------- inventory

  private renderInventory(w: World): void {
    const actions: HTMLElement[] = [];
    const sel = this.selected;
    if (sel && this.selectedFrom === 'bag') {
      actions.push(
        button('Equip', () => {
          const r = w.equipItem(sel);
          if (!r.ok) this.host.message(r.reason ?? 'Cannot equip', 0xff8080);
          this.selected = null;
          this.render();
        }, 'btn primary'),
        button('Drop', () => {
          w.dropItem(sel);
          this.selected = null;
          this.render();
        }, 'btn danger'),
      );
      if (sel.slot === 'ring') {
        actions.push(button('Equip as Ring 2', () => {
          const r = w.equipItem(sel, 'ring2');
          if (!r.ok) this.host.message(r.reason ?? 'Cannot equip', 0xff8080);
          this.selected = null;
          this.render();
        }, 'btn'));
      }
    } else if (sel && this.selectedFrom === 'equip') {
      const key = EQUIP_KEYS.find((k) => w.player.equipment.get(k) === sel)!;
      actions.push(button('Unequip', () => {
        const r = w.unequipItem(key);
        if (!r.ok) this.host.message(r.reason ?? 'Cannot unequip', 0xff8080);
        this.selected = null;
        this.render();
      }, 'btn primary'));
    }
    this.body.append(
      h('div', { class: 'two-col' },
        this.equipList(w, (item) => this.select(item, 'equip')),
        this.bagGrid(w, (item) => this.select(item, 'bag'), (col, row) => {
          if (this.selected && this.selectedFrom === 'bag') {
            if (!w.player.inventory.place(this.selected, col, row)) this.host.message('Does not fit there', 0xff8080);
            this.render();
          }
        }),
      ),
      this.selectedCard(w, actions)!,
    );
  }

  // ---------------------------------------------------------------- character

  private renderCharacter(w: World): void {
    const p = w.player;
    const d = w.derived;
    const cls = CLASSES[p.classId];
    const pledge = p.pledgeId ? PLEDGES[p.pledgeId]! : null;
    const statRow = (label: string, value: string) => h('div', { class: 'stat-row' }, h('span', {}, label), h('span', { class: 'stat-val' }, value));
    const alloc = (key: 'str' | 'dex' | 'int' | 'vit', label: string, value: number) =>
      h('div', { class: 'stat-row' }, h('span', {}, label), h('span', { class: 'stat-val' }, String(value)), p.statPoints > 0 ? button('+', () => {
        allocateStat(p, key);
        w.markDirty();
        w.recomputeStats();
        this.render();
      }, 'btn small') : h('span', { class: 'btn small ghost-space' }, ''));
    this.body.append(
      h('div', { class: 'char-head' }, h('div', { class: 'char-name', style: `color:${hex(pledge ? pledge.color : cls.color)}` }, `${pledge ? pledge.name : ''} ${cls.name}`), h('div', { class: 'dim' }, `Level ${p.level}, ${p.xp} / ${p.xpToNext} experience, ${p.kills} kills`)),
      h('div', { class: 'two-col' },
        h('div', { class: 'stat-block' },
          h('div', { class: 'section-label' }, `Attributes  (${p.statPoints} points to spend)`),
          alloc('str', 'Strength', d.str), alloc('dex', 'Dexterity', d.dex), alloc('int', 'Intelligence', d.int), alloc('vit', 'Vitality', d.vit),
          h('div', { class: 'section-label' }, 'Offense'),
          statRow('Weapon damage', `${d.dmgMin} - ${d.dmgMax}`), statRow('Bonus damage', `+${Math.round(d.bonusDamage)}`), statRow('Spell damage', `+${Math.round(d.spellDmg)}`),
          statRow('Attack speed', d.atkSpd.toFixed(2)), statRow('Cast rate', `${(1 / d.castInterval).toFixed(1)} per second`),
          statRow('Critical chance', `${d.critChance.toFixed(1)}%`), statRow('Critical damage', `${Math.round(d.critDamage)}%`),
          statRow('Cooldown reduction', `${d.cdr}%`), statRow('Magic find', `${d.magicFind}%`),
        ),
        h('div', { class: 'stat-block' },
          h('div', { class: 'section-label' }, 'Defense'),
          statRow('Life', `${Math.ceil(p.hp)} / ${d.maxHp}`), statRow('Mana', `${Math.floor(p.mana)} / ${d.maxMana}`),
          statRow('Armor', `${Math.round(d.armor)} (${Math.round((d.armor / (d.armor + 650)) * 100)}% physical reduction)`),
          statRow('Dodge', `${d.dodge.toFixed(1)}%`), statRow('Block', `${d.block}%`),
          statRow('Fire / Cold', `${d.res.fire}% / ${d.res.cold}%`), statRow('Lightning / Poison', `${d.res.lightning}% / ${d.res.poison}%`),
          statRow('Life regen', `${d.hpRegen.toFixed(1)} per second`), statRow('Mana regen', `${d.manaRegen.toFixed(1)} per second`),
          statRow('Life on hit', `${d.lifeOnHit}`), statRow('Life steal', `${d.lifeSteal}%`), statRow('Move speed', `${Math.round(d.moveSpeed * 32)} px/s`),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- skills

  private renderSkills(w: World): void {
    const p = w.player;
    const list = skillsFor(p.classId, p.pledgeId).filter((s) => s.tier !== 'ultimate').sort((a, b) => (a.reqLevel ?? 1) - (b.reqLevel ?? 1));
    const slotsUnlocked = unlockedSlots(p.level);
    this.body.append(h('div', { class: 'dim pad' }, `${p.skillPoints} skill points, ${p.ultimatePoints} ultimate points. Tap a slot number to place a skill on the bar. Slot 1 (LMB) can hold Attack or a skill.`));
    const slotBar = h('div', { class: 'slot-assign' });
    for (let i = 0; i < 6; i++) {
      const id = p.slots[i];
      const name = i >= slotsUnlocked ? `Lv ${[1, 1, 5, 10, 15, 20][i]}` : id === ATTACK_SLOT ? 'Attack' : id ? SKILLS[id]!.name : 'empty';
      slotBar.appendChild(h('div', { class: 'slot-chip' + (i >= slotsUnlocked ? ' locked' : '') }, h('span', { class: 'key' }, ['LMB', 'Q', 'E', 'R', 'Y', 'RMB'][i]!), name));
    }
    this.body.appendChild(slotBar);
    for (const s of list) {
      const rank = p.skillRanks[s.id] ?? 0;
      const ult = s.upgradesTo ? SKILLS[s.upgradesTo] : null;
      const ultOn = !!ult && p.unlockedUltimates.includes(ult.id);
      const active = ultOn ? ult! : s;
      const eff = active.effect;
      const cd = skillCooldown(w, active);
      const color = s.pledgeId ? PLEDGES[s.pledgeId]!.color : CLASSES[p.classId].color;
      const learn = canLearnSkill(p, s.id);
      const row = h('div', { class: 'skill-row' + (rank ? '' : ' unlearned'), style: `--c:${hex(color)}` },
        h('div', { class: 'skill-head' },
          h('span', { class: 'skill-name' }, active.name, ultOn ? h('span', { class: 'tag ult' }, 'Ultimate') : null, s.tier === 'pledge' ? h('span', { class: 'tag' }, PLEDGES[s.pledgeId!]!.name) : null),
          h('span', { class: 'skill-rank' }, `Rank ${rank}/5`),
        ),
        h('div', { class: 'skill-desc' }, active.description),
        h('div', { class: 'skill-meta dim' }, `${active.manaCost} mana, ${cd > 0 ? cd.toFixed(1) + 's cooldown' : eff.kind === 'projectile' && eff.rateLimited ? 'no cooldown' : 'instant'}${(s.reqLevel ?? 1) > 1 ? `, level ${s.reqLevel}` : ''}${s.requires ? `, needs ${s.requires}` : ''}${'damageMult' in eff && eff.damageMult ? `, ${eff.damageMult}x damage` : ''}`),
      );
      const actions = h('div', { class: 'actions' });
      actions.appendChild(button(rank ? `Rank up (${p.skillPoints})` : `Learn (${p.skillPoints})`, () => {
        if (!learnSkill(p, s.id)) this.host.message(canLearnSkill(p, s.id).reason ?? 'Cannot learn', 0xff8080);
        this.render();
      }, 'btn small' + (learn.ok ? ' primary' : ' disabled')));
      if (rank > 0) {
        for (let i = 0; i < 6; i++) {
          if (i >= slotsUnlocked) continue;
          const here = p.slots[i] === s.id;
          actions.appendChild(button(['LMB', 'Q', 'E', 'R', 'Y', 'RMB'][i]!, () => {
            for (let k = 0; k < 6; k++) if (p.slots[k] === s.id) p.slots[k] = k === 0 ? ATTACK_SLOT : null;
            p.slots[i] = here ? (i === 0 ? ATTACK_SLOT : null) : s.id;
            this.render();
          }, 'btn small' + (here ? ' on' : '')));
        }
        if (p.slots[0] !== ATTACK_SLOT) actions.appendChild(button('Attack on LMB', () => { p.slots[0] = ATTACK_SLOT; this.render(); }, 'btn small'));
      }
      if (ult && !ultOn) {
        const can = canUnlockUltimate(p, s.id);
        actions.appendChild(button('Unlock Ultimate', () => {
          if (!unlockUltimate(p, s.id)) this.host.message(canUnlockUltimate(p, s.id).reason ?? 'Cannot unlock', 0xff8080);
          else this.host.message(`${ult.name} unlocked as an ultimate`, 0xffe066);
          this.render();
        }, 'btn small' + (can.ok ? ' gold' : ' disabled')));
      }
      if (ult && ultOn) actions.appendChild(button('Undo Ultimate', () => { revokeUltimate(p, ult.id); this.render(); }, 'btn small ghost'));
      row.appendChild(actions);
      this.body.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- passives

  private renderPassives(w: World): void {
    const p = w.player;
    this.body.appendChild(h('div', { class: 'dim pad' }, `${p.passivePoints} passive points`));
    const tree = (title: string, defs: typeof GENERAL_TREE) =>
      h('div', { class: 'tree' }, h('div', { class: 'section-label' }, title), ...defs.map((d) => {
        const rank = p.passiveRanks[d.id] ?? 0;
        const can = canLearnPassive(p, d.id);
        const req = d.requires ? defs.find((x) => x.id === d.requires)?.name : null;
        return h('div', { class: 'passive-row' + (rank ? ' learned' : '') },
          h('div', { class: 'passive-main' }, h('span', { class: 'passive-name' }, d.name), h('span', { class: 'dim' }, ` ${rank}/${d.maxRank}`), h('div', { class: 'dim small' }, `+${d.perRank} ${d.stat} per rank${req ? `, needs ${req}` : ''}`)),
          button('+', () => { if (!learnPassive(p, d.id)) this.host.message(can.reason ?? 'Cannot learn', 0xff8080); else { w.markDirty(); w.recomputeStats(); } this.render(); }, 'btn small' + (can.ok ? ' primary' : ' disabled')),
        );
      }));
    this.body.appendChild(h('div', { class: 'two-col' }, tree('General', GENERAL_TREE), tree(CLASSES[p.classId].name, CLASS_TREES[p.classId])));
  }

  // ---------------------------------------------------------------- stash

  private renderStash(w: World): void {
    const tabs = h('div', { class: 'tabs' }, ...w.player.stash.map((_, i) => button(`Page ${i + 1}`, () => { this.stashPage = i; this.render(); }, 'btn small' + (i === this.stashPage ? ' on' : ''))));
    const page = w.player.stash[this.stashPage]!;
    const stashGrid = new ItemGrid(page, {
      onItemTap: (item) => { if (!w.moveBetween(item, page, w.player.inventory)) this.host.message('Bag is full', 0xff8080); this.render(); },
      onCellTap: () => {},
    });
    stashGrid.setCellSize(this.cellSize);
    stashGrid.render();
    this.body.append(
      h('div', { class: 'dim pad' }, 'Tap an item to move it between your bag and the stash.'),
      tabs,
      h('div', { class: 'two-col' }, h('div', { class: 'grid-wrap' }, h('div', { class: 'section-label' }, `Stash page ${this.stashPage + 1}`), stashGrid.root), this.bagGrid(w, (item) => { if (!w.moveBetween(item, w.player.inventory, page)) this.host.message('Stash page is full', 0xff8080); this.render(); })),
    );
  }

  // ---------------------------------------------------------------- vendor

  private renderVendor(w: World): void {
    const stock = h('div', { class: 'stock' }, h('div', { class: 'section-label' }, 'For sale'), ...w.vendorStock.map((item) =>
      h('div', { class: 'stock-row' + (item === this.selected ? ' selected' : '') },
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
    }
    this.body.append(
      h('div', { class: 'dim pad' }, `${w.player.gold} gold. Items sell for 40% of their value.`),
      h('div', { class: 'two-col' }, stock, this.bagGrid(w, (item) => this.select(item, 'bag'))),
      this.selectedCard(w, actions)!,
    );
  }

  // ---------------------------------------------------------------- waypoint

  private renderWaypoint(w: World): void {
    const card = (name: string, desc: string, here: boolean, onGo: () => void) =>
      h('div', { class: 'card wide' }, h('div', { class: 'card-title' }, name), h('div', { class: 'card-text' }, desc), here ? h('div', { class: 'dim' }, 'You are here') : button('Travel', onGo, 'btn primary'));
    this.body.append(
      card('Town', 'Merchant, stash, crafting stations and training dummies. Nothing here can hurt you except the dummies.', w.area === 'town', () => this.host.travel('town')),
      card(PROVING_GROUNDS.name + ' (placeholder)', `An open field with respawning placeholder monsters scaled to your level. Up to ${PROVING_GROUNDS.maxAlive} at once. This stands in for the real zones until their data arrives.`, w.area === 'arena', () => this.host.travel('arena')),
    );
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
      h('div', { class: 'two-col' }, h('div', {}, this.equipList(w, (item) => this.select(item, 'equip')), ops), this.bagGrid(w, (item) => this.select(item, 'bag'))),
      this.selectedCard(w, [])!,
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
      h('div', { class: 'dim small pad' }, 'Controls: tap to move, tap an enemy to attack, tap a skill to cast at the nearest enemy, or drag from a skill to aim it. Keyboard: WASD, Q E R Y, right click, 1-4 potions, I C K P, F to interact.'),
    );
  }
}
