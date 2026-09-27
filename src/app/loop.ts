/** requestAnimationFrame loop with a clamped delta, paused while the tab is hidden. */
export function startLoop(update: (dt: number) => void): void {
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!document.hidden) update(dt);
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });
  requestAnimationFrame(frame);
}
