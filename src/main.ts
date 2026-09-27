import './ui/style.css';
import { startLoop } from './app/loop';
import { Showcase } from './app/showcase';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const showcase = new Showcase(canvas, ui);
startLoop((dt) => {
  if (!window.fs.paused) showcase.update(dt);
});

// Hooks for automated screenshots and manual poking from the console.
declare global {
  interface Window {
    fs: { showcase: Showcase; paused: boolean; step(seconds: number): void };
  }
}
window.fs = {
  showcase,
  paused: false,
  step(seconds: number) {
    const steps = Math.ceil(seconds / (1 / 60));
    for (let i = 0; i < steps; i++) showcase.update(1 / 60, i === steps - 1);
  },
};
