/** Full-screen helpers. Android browsers honour requestFullscreen; iPhones only go full screen when installed to the home screen. */

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function canFullscreen(): boolean {
  return !!document.documentElement.requestFullscreen && !isStandalone();
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Must be called from a tap or key press. Silently does nothing where unsupported. */
export async function enterFullscreen(): Promise<boolean> {
  if (!canFullscreen() || isFullscreen()) return isFullscreen();
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // Lock to the current orientation when the browser allows it
    const o = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
    if (o?.lock) o.lock(o.type.startsWith('landscape') ? 'landscape' : 'portrait').catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
}

/** Plain-language install hint for the current phone, or null on desktop and when already installed. */
export function installHint(): string | null {
  if (isStandalone() || !isTouchDevice()) return null;
  if (isIOS()) return 'For a full-screen game on iPhone: tap the Share button in Safari, then "Add to Home Screen", and open Falling Sky from there.';
  return 'For a full-screen game: open the browser menu and choose "Add to Home screen" or "Install app", then launch it from there.';
}
