import './ui/style.css';
import { Game } from './app/game';
import { startLoop } from './app/loop';
import { Showcase } from './app/showcase';
import { PLACEHOLDER_ENEMIES } from './data/placeholderEnemies';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

declare global {
  interface Window {
    fs: { showcase?: Showcase; game?: Game; paused: boolean; step(seconds: number): void; data?: { PLACEHOLDER_ENEMIES: typeof PLACEHOLDER_ENEMIES } };
  }
}

if (location.search.includes('showcase')) {
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
  startLoop((dt) => {
    if (!window.fs.paused) game.update(dt);
  });
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
