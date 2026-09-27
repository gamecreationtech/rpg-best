/** requestAnimationFrame loop with a clamped delta, paused while the tab is hidden. */
export function startLoop(update: (dt: number) => void, onError?: (e: unknown) => void): void {
  let last = performance.now();
  let errors = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!document.hidden) {
      try {
        update(dt);
      } catch (e) {
        // One bad frame must not freeze the game; report it and carry on
        if (errors++ < 5) {
          console.error(e);
          onError?.(e);
        }
      }
    }
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });
  requestAnimationFrame(frame);
}
