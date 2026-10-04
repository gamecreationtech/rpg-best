# Falling Sky

Falling Sky is an isometric action RPG in the tradition of Diablo 2, built for
mobile and desktop browsers as a Progressive Web App. The producer is a designer,
not a programmer: explain changes in plain language and let them review by
playing the deployed build.

Read `docs/design/game-design-document.md` and `docs/design/technical-design.md`
before making changes. They hold the decisions; do not relitigate them in code.

## Hard rules

- **All art is code, with one opt-in exception.** Sprites, tiles, animation,
  effects, UI icons and sounds are generated at runtime by code in `src/gen/`,
  `src/render2d/`, `src/audio/` or `src/ui/`. Since 2026-09-30 the producer may
  drop hand-made PNGs into `public/art/` (see its README); `src/art/images.ts`
  loads them at start-up and they replace the generated drawing for that one
  thing. Every image is optional and the game must always work with none
  present. Never generate or commit images yourself: only the producer adds
  files there. No model, texture, font or audio files.
- **The look is isometric pixel art.** A 640x360 frame scaled by a whole
  number of device pixels, 32x16 diamond tiles, a 22px hero (the Sorcerer 32px, hat included, to match the producer's drawings), outlines, the Grim palette,
  dithered torchlight. Draw at integer pixel positions; never scale a sprite
  by a fraction or blur one. `src/gen/pixel/` holds the generators.
- **Performance is a feature.** 60 fps with 200 monsters on a 2021 mid-range
  phone. A small frame, pre-drawn sprite sheets, one depth sort, a capped
  particle pool, one lighting pass, no allocation in the hot loop. Any change
  that adds per-frame work or allocations must justify itself.
- **Simulation is pure.** `src/sim/` never imports rendering code or touches the DOM.
  It runs on a fixed timestep, is deterministic given a seed, and is unit tested.
- **One thumb.** Every interaction works with tap or click. No hover-only or
  keyboard-only features.

## Stack

TypeScript, Canvas 2D plus one WebGL 2 lighting pass, Vite, Vitest. Three.js
survives only in the old 3D showcase (`?showcase`) and the lab's comparison
tab. Static deploy on every push to the default branch. Saves in IndexedDB with an export code. `tools/pwa.ts` draws the app
icons per pixel and emits the manifest and service worker at build time; that
is the one place generated images are allowed, and only into `dist/`.

## Current state

Playable pre-alpha. Read `docs/design/systems-reference.md` for what exists and
where every number lives. Game data is in `src/data/` (transcribed from the
producer's export, in pixels with 32px tiles; multiply by `PX` in the sim). The
simulation is `src/sim/world.ts` plus `combat.ts` and `skills/cast.ts`; it emits
`SimEvent`s that `src/render2d/pixelView.ts`, the HUD and audio consume.
Zones live in `src/data/zones.ts` and monsters in `src/data/monsters.ts`; both
are engineer drafts to be replaced by the producer's data when it arrives. `npm run check` must
pass before every push. `npm run balance` plays every class through every zone
for four simulated minutes and reports the leveling pace; run it after touching
monsters, zones, items or the level curve.

## Verifying visuals

The page exposes `window.fs` with `game` (or `showcase` at `?showcase`, `lab` at `?lab`), `paused`,
`step(seconds)` and `data` for automated screenshots. Headless Chromium with
SwiftShader renders it; pause the loop first and use `step` so only the final
frame renders. Keyboard input is polled every frame, so drive the hero with
real key presses (Playwright `keyboard.down`), not by setting the move input.
Crop around the hero and enlarge with pixelated scaling to judge sprites. The
capture script lives in the session scratchpad, not the repo.

## Conventions

- Feature branches and pull requests against `main`. Merging deploys.
- Keep `README.md` status and the design docs current when a decision changes.
- Commit messages: short imperative subject, body explaining why when useful.
- Ship each change with a plain-language "what to look for" note for the
  producer.
