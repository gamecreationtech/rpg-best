
import { Creator, loadTownDraft } from '../ui/game/creator';
import type { ConsumableId } from '../data/consumables';
import { difficultyForLevel, zoneById } from '../data/zones';
import { Music } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { PixelView } from '../render2d/pixelView';
import { createPlayer, type PlayerState } from '../sim/player';
import { decodeSave, deserialize, encodeSave, serialize } from '../sim/save';
import type { SimEvent } from '../sim/types';
import { Autoplay } from '../sim/autoplay';
import { SIM_DT, World } from '../sim/world';
import { Hud, type PanelKind } from '../ui/game/hud';
import { Panels } from '../ui/game/panels';
import { Screens } from '../ui/game/screens';
import { GameCursor } from '../ui/game/cursor';
import { DevMenu } from '../ui/game/devMenu';
import { canFullscreen, enterFullscreen, exitFullscreen, installHint, isFullscreen, isStandalone, isTouchDevice } from './fullscreen';
import { Input } from './input';
import { deleteSave, hiddenLoot, listHeroes, loadGame, loadSettings, MAX_HEROES, saveGame, saveSettings, type HeroSummary, type Settings } from './storage';
import { loadArt } from '../art/images';

type State = 'title' | 'class' | 'pledge' | 'playing';

/** Owns the world, the view, the interface and the loop. */
export class Game {
  private state: State = 'title';
  private world: World | null = null;
  private view: PixelView | null = null;
  private hud: Hud | null = null;
  private panels: Panels | null = null;
  private dev: DevMenu | null = null;
  private readonly screens: Screens;
  private readonly input: Input;
  readonly sfx = new Sfx();
  readonly music = new Music();
  readonly settings: Settings = loadSettings();
  /** The hero plays itself while this is set (Settings > Autoplay); any manual move or cast switches it off. */
  private autoplay: Autoplay | null = null;
  /** Creator mode: the producer rearranging the town, or null. */
  private creator: Creator | null = null;
  private seed = Math.floor(Math.random() * 1e9);
  private hasSave = false;
  /** The saved heroes on this device and the slot the hero in play is saved to. */
  private heroes: HeroSummary[] = [];
  private slot = 1;
  private accumulator = 0;
  private time = 0;
  private autosaveTimer = 0;
  private readonly mobile: boolean;
  private readonly aim = { x: 0, z: 0 };
  private readonly moveDir = { x: 0, z: 0 };
  private readonly gameUi: HTMLDivElement;
  private readonly cursor = new GameCursor();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly ui: HTMLElement) {
    this.mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.gameUi = document.createElement('div');
    this.gameUi.className = 'game-ui';
    ui.appendChild(this.gameUi);
    this.screens = new Screens(ui, {
      newGame: () => {
        this.goFullscreenOnPhones();
        this.beginNewGame();
      },
      // Play: with heroes saved, the hero select; with none, straight to the class pick
      continueGame: () => {
        this.goFullscreenOnPhones();
        if (this.heroes.length) this.showHeroes();
        else this.beginNewGame();
      },
      playHero: (slot) => void this.continueGame(slot),
      deleteHero: async (slot) => {
        await deleteSave(slot);
        await this.refreshHeroes();
        if (this.heroes.length) this.showHeroes();
        else this.showTitle();
      },
      login: () => {
        // Accounts come with the online update; until then the title says so
        this.screens.titleNote = 'Google sign-in arrives with the online update. Play as a guest for now: your hero is saved on this device.';
        this.screens.splash();
      },
      // Pledges are sworn at level 20, so a new hero starts right after the class pick
      chooseClass: (id) => {
        if (this.mobile) this.screens.zoomSelect(id);
        else this.start(createPlayer(id, null), Math.floor(Math.random() * 1e9), true);
      },
      chooseZoom: (id, zoom) => {
        this.settings.zoom = zoom;
        saveSettings(this.settings);
        this.start(createPlayer(id, null), Math.floor(Math.random() * 1e9), true);
        this.hud?.message(`Playing at ${zoom}x. Change it any time in Menu, under Screen.`, 0xa0a8c0);
      },
      choosePledge: (_classId, pledgeId) => {
        if (!this.world || !this.world.choosePledge(pledgeId)) return;
        this.screens.hide();
        this.drainEvents();
        void this.autosave();
      },
      respawn: () => this.respawn(),
      cancelToTitle: () => this.showTitle(),
    });
    this.input = new Input(canvas, {
      active: () => this.state === 'playing' && !!this.world && !this.panels?.isOpen && !this.creator && !this.world.playerDead && !this.world.pledgePending,
      tapEnemy: (sx, sy) => {
        const e = this.view!.pickEnemy(sx, sy);
        if (!e) return false;
        this.setAutoplay(false);
        this.world!.setTarget(e.id);
        return true;
      },
      tapInteractable: (sx, sy) => {
        const id = this.view!.pickInteractable(sx, sy);
        if (id < 0) return false;
        this.setAutoplay(false);
        this.world!.interact(id);
        return true;
      },
      tapGround: (sx, sy) => {
        this.setAutoplay(false);
        if (this.view!.view.unproject(sx, sy, this.aim)) this.world!.moveTo(this.aim.x, this.aim.z);
      },
      attackAt: (sx, sy) => {
        this.setAutoplay(false);
        if (this.view!.view.unproject(sx, sy, this.aim)) this.world!.attackAt(this.aim.x, this.aim.z);
      },
      castSlot: (slot, sx, sy) => { this.setAutoplay(false); this.castSlot(slot, sx, sy); },
      usePotion: (id) => this.usePotion(id),
      setMoveInput: (x, z) => {
        // Keys and the joystick speak in screen directions; the isometric world is turned 45 degrees
        if (!this.view) return;
        if (x || z) this.setAutoplay(false);
        this.view.screenDirToWorld(x, z, this.moveDir);
        this.world?.setMoveInput(this.moveDir.x, this.moveDir.z);
      },
      joystick: (active, x, y, dx, dy) => this.hud?.setJoystick(active, x, y, dx, dy),
      openPanel: (kind) => this.openPanel(kind),
      escape: () => {
        if (this.creator) this.setCreator(false);
        else if (this.panels?.isOpen) this.closePanel();
        else if (this.state === 'playing') this.openPanel('settings');
      },
      toggleHero: () => {
        if (this.panels?.isOpen) this.closePanel();
        else if (this.state === 'playing' && this.world && !this.world.playerDead) this.openPanel('inventory');
      },
      toggleDev: () => this.dev?.toggle(),
      interactNearby: () => {
        this.setAutoplay(false);
        if (this.world && !this.world.interactNearby()) this.hud?.message('Nothing to use here');
      },
    });
    // Audio can only start after a tap
    const unlock = () => {
      this.sfx.unlock();
      this.sfx.setVolume(this.settings.sfx);
      if (this.sfx.context) {
        this.music.start(this.sfx.context);
        this.music.setVolume(this.settings.music);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.autosave();
    });
  }

  /** Shows an error in the message log so a tester can read it back to us. */
  reportError(e: unknown): void {
    const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    this.hud?.message(`Error: ${text.slice(0, 120)}`, 0xff6060);
  }

  async init(): Promise<void> {
    // Optional hand-made images load alongside the save, before anything is drawn
    await Promise.all([this.refreshHeroes(), loadArt()]);
    this.showTitle();
  }

  private async refreshHeroes(): Promise<void> {
    this.heroes = await listHeroes();
    this.hasSave = this.heroes.length > 0;
  }

  private showTitle(): void {
    this.state = 'title';
    this.screens.clearDead();
    this.screens.hasSave = this.hasSave;
    this.screens.heroes = this.heroes;
    this.screens.installHint = installHint();
    this.screens.splash();
  }

  private showHeroes(): void {
    this.state = 'title';
    this.screens.clearDead();
    this.screens.heroes = this.heroes;
    this.screens.heroSelect();
  }

  /** The first empty slot, for a new hero. */
  private freeSlot(): number | null {
    for (let slot = 1; slot <= MAX_HEROES; slot++) if (!this.heroes.some((hero) => hero.slot === slot)) return slot;
    return null;
  }

  /** Phones in a browser tab: ask for full screen on the first tap. iPhones ignore this and need the home-screen install. */
  private goFullscreenOnPhones(): void {
    if (isTouchDevice() && !isStandalone() && this.settings.fullscreen) void enterFullscreen();
  }

  toggleFullscreen(): void {
    if (isFullscreen()) void exitFullscreen();
    else void enterFullscreen();
  }

  private beginNewGame(): void {
    const slot = this.freeSlot();
    if (slot === null) {
      this.showHeroes();
      return;
    }
    this.slot = slot;
    this.state = 'class';
    this.screens.classSelect();
  }

  private async continueGame(slot: number): Promise<void> {
    const save = await loadGame(slot);
    if (!save) {
      await this.refreshHeroes();
      this.showTitle();
      return;
    }
    this.slot = slot;
    this.start(save.player, save.seed, false);
  }

  private start(player: PlayerState, seed: number, fresh: boolean): void {
    this.seed = seed;
    this.teardown();
    this.world = new World(player, seed);
    // The producer's town arrangement from creator mode, kept in this browser
    const draft = loadTownDraft();
    if (draft) {
      this.world.applyTownLayout(draft);
      if (this.world.area === 'town') this.world.teleportTo(this.world.town.spawn.x, this.world.town.spawn.z);
    }
    this.view = new PixelView(this.canvas, this.gameUi, this.world, this.mobile, (id) => { this.setAutoplay(false); this.world?.pickup(id); });
    this.world.setLootFilter(hiddenLoot(this.settings));
    this.view.zoom = this.settings.zoom;
    if (this.settings.pet) this.world.togglePet(true);
    this.buildHud();
    // Development menu: stat sliders and a level-up button, shown with F4 or ?dev
    this.dev = new DevMenu(this.gameUi, this.world, () => this.hud?.update(0));
    if (location.search.includes('dev')) this.dev.toggle(true);
    this.panels = new Panels(this.gameUi, {
      world: this.world,
      settings: this.settings,
      fullscreen: { supported: canFullscreen(), active: () => isFullscreen(), toggle: () => this.toggleFullscreen(), hint: installHint() },
      applySettings: () => {
        saveSettings(this.settings);
        this.sfx.setVolume(this.settings.sfx);
        this.music.setVolume(this.settings.music);
        if (this.hud && this.hud.touch !== this.touchControls) this.buildHud();
        if (this.view) this.view.zoom = this.settings.zoom;
        if (this.world && this.world.pet.active !== this.settings.pet) this.world.togglePet(this.settings.pet);
        this.world?.setLootFilter(hiddenLoot(this.settings));
      },
      message: (t, c) => this.hud?.message(t, c),
      close: () => this.closePanel(),
      autoplay: () => !!this.autoplay,
      setAutoplay: (on) => this.setAutoplay(on),
      openCreator: () => this.setCreator(true),
      travel: (area, zoneId, level) => {
        this.closePanel();
        this.world!.travel(area, zoneId, level);
      },
      exportCode: () => encodeSave(serialize(this.world!.player, this.seed)),
      importCode: async (code) => {
        try {
          const data = decodeSave(code);
          const p = deserialize(data);
          await saveGame(p, data.seed, this.slot);
          this.start(p, data.seed, false);
          this.hud?.message('Hero imported into this slot', 0x9fe08f);
          return true;
        } catch {
          return false;
        }
      },
      saveNow: () => this.autosave(),
      quitToTitle: () => {
        void this.autosave().then(async () => {
          this.teardown();
          await this.refreshHeroes();
          this.showTitle();
        });
      },
      deleteSave: async () => {
        await deleteSave(this.slot);
        this.teardown();
        await this.refreshHeroes();
        this.showTitle();
      },
    });
    this.state = 'playing';
    this.screens.clearDead();
    this.screens.hide();
    this.hud!.banner(fresh ? 'Falling Sky' : 'Welcome back');
    this.hud!.message(fresh ? (this.touchControls ? 'Drag on the ground to move. Attack hits what is in reach. Tap skills to cast.' : 'Tap to move. Tap an enemy to attack. Tap a skill to cast it.') : `Level ${player.level}, ${player.gold} gold.`);
    this.hud!.message('Find the gold waypoint to travel to the zones.', 0xa0a8c0);
    this.drainEvents();
    if (fresh) void this.autosave();
  }

  /** Joystick and button cluster on touch devices unless the menu says otherwise. */
  private get touchControls(): boolean {
    const c = this.settings.controls;
    if (c === 'touch') return true;
    if (c === 'tap') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private buildHud(): void {
    if (!this.world) return;
    const touch = this.touchControls;
    this.hud?.destroy();
    this.hud = new Hud(this.gameUi, {
      world: this.world,
      openPanel: (kind) => this.openPanel(kind),
      castSlot: (slot, sx, sy) => this.castSlot(slot, sx, sy),
      usePotion: (id) => this.usePotion(id),
      attackHeld: (on) => {
        if (on) this.setAutoplay(false);
        if (this.world) this.world.attackHeld = on;
      },
      attackOnce: () => {
        this.setAutoplay(false);
        if (this.world && !this.panels?.isOpen) this.world.attackOnce();
      },
      interactNearby: () => {
        this.setAutoplay(false);
        if (this.world && !this.panels?.isOpen) this.world.interactNearby();
      },
    }, touch);
    this.input.mode = touch ? 'touch' : 'tap';
    if (this.panels?.isOpen) this.hud.root.classList.add('hidden');
  }

  private teardown(): void {
    this.creator?.destroy();
    this.creator = null;
    this.world = null;
    this.view = null;
    this.dev = null;
    this.hud?.destroy();
    this.hud = null;
    this.panels = null;
    while (this.gameUi.firstChild) this.gameUi.removeChild(this.gameUi.firstChild);
    this.accumulator = 0;
  }

  private openPanel(kind: PanelKind): void {
    if (!this.panels || !this.world || this.world.playerDead || this.creator) return;
    // Any menu is the player taking over; the settings switch is the only way back on
    this.setAutoplay(false);
    this.world.stop();
    this.panels.open(kind);
    this.hud?.root.classList.add('hidden');
    this.sfx.play('uiClick');
  }

  private closePanel(): void {
    this.panels?.close();
    this.hud?.root.classList.remove('hidden');
    this.sfx.play('uiClick');
  }

  private castSlot(slot: number, sx: number | null, sy: number | null): void {
    if (!this.world || !this.view || this.panels?.isOpen || this.world.playerDead) return;
    let aim: { x: number; z: number } | null = null;
    if (sx !== null && sy !== null && this.view.view.unproject(sx, sy, this.aim)) aim = { x: this.aim.x, z: this.aim.z };
    this.world.castSlot(slot, aim);
  }

  private usePotion(id: ConsumableId): void {
    this.setAutoplay(false);
    if (!this.world || this.panels?.isOpen) return;
    this.world.useConsumable(id);
  }

  private respawn(): void {
    if (!this.world) return;
    this.screens.clearDead();
    this.screens.hide();
    this.world.respawn();
    this.state = 'playing';
  }

  /** Creator mode on or off. It only works in town; the hero stands still while the producer arranges things. */
  setCreator(on: boolean): void {
    if (on === !!this.creator || !this.world || !this.view) return;
    if (on) {
      if (this.world.area !== 'town') {
        this.hud?.message('Creator mode works in town', 0xff8a8a);
        return;
      }
      this.closePanel();
      this.setAutoplay(false);
      this.world.stop();
      this.view.creator = { x: this.world.px, z: this.world.pz };
      const world = this.world;
      this.creator = new Creator(this.gameUi, { world, view: this.view, exit: () => this.setCreator(false) });
      this.hud?.root.classList.add('hidden');
    } else {
      this.creator?.destroy();
      this.creator = null;
      this.view.creator = null;
      this.hud?.root.classList.remove('hidden');
      this.hud?.message('Creator mode closed. Your town is kept in this browser until you reset it.', 0xa0a8c0);
    }
  }

  setAutoplay(on: boolean): void {
    if (on === !!this.autoplay) return;
    this.autoplay = on ? new Autoplay() : null;
    this.hud?.setAutoplay(on);
    this.hud?.message(on ? 'Autoplay on: the hero fights on its own. Touch anything to take over.' : 'Autoplay off', 0xffd860);
    if (!on) this.world?.setMoveInput(0, 0);
  }

  /** The autoplay driver's decisions for one simulation step. A death ends it: the player respawns by hand. */
  private driveAutoplay(): void {
    if (!this.autoplay || !this.world) return;
    if (this.world.playerDead) {
      this.setAutoplay(false);
      return;
    }
    this.autoplay.step(this.world, SIM_DT);
  }

  private async autosave(): Promise<void> {
    if (!this.world) return;
    await saveGame(this.world.player, this.seed, this.slot);
    this.hasSave = true;
  }

  private drainEvents(): void {
    const w = this.world!;
    const events = w.events.splice(0, w.events.length);
    for (const ev of events) this.handleEvent(ev);
  }

  private handleEvent(ev: SimEvent): void {
    this.view?.handleEvent(ev);
    switch (ev.type) {
      case 'sound':
        this.sfx.play(ev.id);
        break;
      case 'message':
        this.hud?.message(ev.text, ev.color);
        break;
      case 'open':
        if (ev.panel === 'town_portal') {
          this.world!.travel('town');
        } else if (ev.panel === 'return_portal') {
          this.world!.travel('arena');
        } else {
          this.openPanel(ev.panel);
        }
        break;
      case 'area':
        this.hud?.banner(ev.area === 'town' ? 'Town' : zoneById(ev.zone ?? this.world!.zoneId).name + (ev.level ? `, ${difficultyForLevel(ev.level)?.name ?? `level ${ev.level}`}` : ''));
        this.sfx.play('portal');
        void this.autosave();
        break;
      case 'level_up':
        this.hud?.banner(`Level ${ev.level}`);
        void this.autosave();
        break;
      case 'pledge_choice':
        if (this.panels?.isOpen) this.closePanel();
        this.screens.pledgeSelect(this.world!.player.classId, true);
        break;
      case 'player_died':
        this.screens.dead();
        break;
      case 'pickup':
        if (ev.item) this.hud?.message(`Picked up ${ev.item.name}`);
        break;
      default:
        break;
    }
  }

  /** Mouse hover: name tag on merchants and stations, a hand cursor on anything clickable. */
  private updateHover(): void {
    if (!this.view || !this.world) return;
    const m = this.input.mouse;
    if (!m.isMouse || this.panels?.isOpen || this.world.playerDead) {
      this.view.hoverInteractable = -1;
      this.world.aimPoint = null;
      this.cursor.setState('ui');
      return;
    }
    // Over the interface the cursor is a plain pointer
    const over = document.elementFromPoint(m.x, m.y);
    if (over && over !== this.canvas && over.closest('button, .panel-overlay, .screen, .drop-label')) {
      this.view.hoverInteractable = -1;
      this.cursor.setState('ui');
      return;
    }
    const it = this.view.pickInteractable(m.x, m.y, 40);
    this.view.hoverInteractable = it;
    const enemy = it < 0 ? this.view.pickEnemy(m.x, m.y, 34) : null;
    this.cursor.setState(it >= 0 ? 'hand' : enemy ? 'attack' : 'default');
    if (this.view.view.unproject(m.x, m.y, this.aim)) this.world.aimPoint = { x: this.aim.x, z: this.aim.z };
  }

  update(dt: number, render = true): void {
    this.time += dt;
    this.input.update(dt);
    if (this.state !== 'playing' || !this.world || !this.view || !this.hud) return;
    const paused = this.panels?.isOpen ?? false;
    if (!paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < 5) {
        this.driveAutoplay();
        this.world.step(SIM_DT);
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 45) {
        this.autosaveTimer = 0;
        void this.autosave();
      }
    }
    this.drainEvents();
    this.updateHover();
    this.view.dim = paused ? 1 : 0;
    this.view.update(dt, this.time);
    this.creator?.update();
    this.hud.update(dt);
    if (render) this.view.render();
  }
}
