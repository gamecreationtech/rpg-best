/**
 * Pixel-art window chrome drawn by code: nine-slice frames for panels, insets
 * and buttons, exported as CSS variables holding data URLs. Everything is drawn
 * at one dot per pixel and scaled with pixelated rendering by the stylesheet.
 */

interface FrameColors {
  outer: string;
  light: string;
  body: string;
  dark: string;
  fill: string;
}

const FRAMES: Record<string, FrameColors> = {
  // The main window: stone-grey bevel on near-black
  panel: { outer: '#0a0a12', light: '#6c6c7c', body: '#44444f', dark: '#26262e', fill: '#101018' },
  // Sunken areas such as the bag and the stat sheet
  inset: { outer: '#0a0a12', light: '#26262e', body: '#1a1a22', dark: '#4a4a56', fill: '#0c0c13' },
  // Buttons: raised, pressed, gold (important) and red (dangerous)
  btn: { outer: '#0a0a12', light: '#8e94a2', body: '#4e5260', dark: '#2a2c36', fill: '#33364a' },
  btnOn: { outer: '#0a0a12', light: '#e8b45a', body: '#7a5a2a', dark: '#3a2a12', fill: '#4a3a1a' },
  btnGold: { outer: '#0a0a12', light: '#ffe08a', body: '#c8a040', dark: '#5a4010', fill: '#6a5020' },
  btnRed: { outer: '#0a0a12', light: '#d06060', body: '#7a2a2a', dark: '#3a1010', fill: '#4a1a1a' },
  btnDim: { outer: '#0a0a12', light: '#3a3c48', body: '#2a2c36', dark: '#1a1c24', fill: '#20222c' },
  // Item slots and the selection ring
  slot: { outer: '#0a0a12', light: '#3a3a46', body: '#26262e', dark: '#5c5c6a', fill: '#14141c' },
  slotOn: { outer: '#0a0a12', light: '#ffe08a', body: '#e8b45a', dark: '#8a6a2a', fill: '#2a2418' },
  tab: { outer: '#0a0a12', light: '#5c5c6a', body: '#3a3a46', dark: '#1e1e26', fill: '#1c1c26' },
  tabOn: { outer: '#0a0a12', light: '#e8b45a', body: '#8a6a2a', dark: '#3a2a12', fill: '#101018' },
};

/** Border thickness in dots; the CSS scales it. */
export const FRAME_BORDER = 4;

function drawFrame(c: FrameColors): string {
  const size = FRAME_BORDER * 2 + 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = c.fill;
  ctx.fillRect(0, 0, size, size);
  // From the outside in: outline, highlight, body, inner shadow (bevel lit from the top-left)
  const ring = (inset: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(inset, inset, size - inset * 2, 1);
    ctx.fillRect(inset, size - 1 - inset, size - inset * 2, 1);
    ctx.fillRect(inset, inset, 1, size - inset * 2);
    ctx.fillRect(size - 1 - inset, inset, 1, size - inset * 2);
  };
  ring(0, c.outer);
  ring(1, c.light);
  ring(2, c.body);
  ring(3, c.dark);
  // Darker bottom-right edges for the bevel
  ctx.fillStyle = c.dark;
  ctx.fillRect(1, size - 2, size - 2, 1);
  ctx.fillRect(size - 2, 1, 1, size - 2);
  ctx.fillStyle = c.light;
  ctx.fillRect(3, 3, size - 6, 1);
  ctx.fillRect(3, 3, 1, size - 6);
  // Notched corners so the frame reads as pixel art
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, 1, 1);
  ctx.clearRect(size - 1, 0, 1, 1);
  ctx.clearRect(0, size - 1, 1, 1);
  ctx.clearRect(size - 1, size - 1, 1, 1);
  return canvas.toDataURL();
}

let installed = false;

/** Generates every frame once and publishes them as CSS variables on the root element. */
export function installPixelChrome(): void {
  if (installed) return;
  installed = true;
  const root = document.documentElement.style;
  for (const [name, colors] of Object.entries(FRAMES)) root.setProperty(`--px-${name}`, `url("${drawFrame(colors)}")`);
}
