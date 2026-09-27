import './ui/style.css';
import { Game } from './app/game';
import { startLoop } from './app/loop';
import { Showcase } from './app/showcase';
import { Lab } from './lab/lab';
import { PLACEHOLDER_ENEMIES } from './data/placeholderEnemies';

// Phones: no double-tap zoom, no pinch zoom, no long-press menus while playing
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  const target = e.target as HTMLElement | null;
  // Only the play area: buttons and panels must keep every tap
  if (now - lastTouchEnd < 300 && !target?.closest('button, input, textarea, .panel-overlay, .screen')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement | null)?.closest('canvas, button, .cluster')) e.preventDefault(); });

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

declare global {
  interface Window {
    fs: { showcase?: Showcase; game?: Game; lab?: Lab; paused: boolean; step(seconds: number): void; data?: { PLACEHOLDER_ENEMIES: typeof PLACEHOLDER_ENEMIES } };
  }
}

// Offline cache and home-screen install, production builds only
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined));
}

if (location.search.includes('lab')) {
  // Desktop-only art lab: candidate looks for the game, nothing here touches it
  const lab = new Lab(canvas, ui);
  startLoop((dt) => {
    if (!window.fs.paused) lab.update(dt);
  });
  window.fs = {
    lab,
    paused: false,
    step(seconds: number) {
      const steps = Math.ceil(seconds / (1 / 60));
      for (let i = 0; i < steps; i++) lab.update(1 / 60, i === steps - 1);
    },
  };
} else if (location.search.includes('showcase')) {
  const showcase = new Showcase(canvas, ui);
  startLoop((dt) => {
    if (!window.fs.paused) showcase.update(dt);
  });
  window.fs = {
    showcase,
    paused: false,
    step(seconds: number) {
      const steps = Math.ceil(seconds / (1 / 60));
      for (let i = 0; i < steps; i++) showcase.update(1 / 60, i === steps - 1);
    },
  };
} else {
  const game = new Game(canvas, ui);
  void game.init();
  startLoop(
    (dt) => {
      if (!window.fs.paused) game.update(dt);
    },
    (e) => game.reportError(e),
  );
  window.addEventListener('error', (e) => game.reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => game.reportError(e.reason));
  window.fs = {
    game,
    paused: false,
    data: { PLACEHOLDER_ENEMIES },
    step(seconds: number) {
      const steps = Math.ceil(seconds / (1 / 60));
      for (let i = 0; i < steps; i++) game.update(1 / 60, i === steps - 1);
    },
  };
}
