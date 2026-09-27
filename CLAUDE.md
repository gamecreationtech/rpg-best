# Falling Sky

Falling Sky is an isometric action RPG in the tradition of Diablo 2, built for
mobile and desktop browsers as a Progressive Web App. The producer is a designer,
not a programmer: explain changes in plain language and let them review by
playing the deployed build.

Read `docs/design/game-design-document.md` and `docs/design/technical-design.md`
before making changes. They hold the decisions; do not relitigate them in code.

## Hard rules

- **All art is code.** Never commit image, model, texture, font or audio files.
  Meshes, materials, animation, effects, UI icons and sounds are generated at
  runtime by code in `src/gen/`, `src/render/`, `src/audio/` or `src/ui/`.
- **Performance is a feature.** 60 fps with 200 monsters on a 2021 mid-range
  phone. Instanced rendering, GPU animation, a capped particle pool, one shadow
  map, no allocation in the hot loop. Any change that adds draw calls or
  per-frame allocations must justify itself.
- **Simulation is pure.** `src/sim/` never imports Three.js or touches the DOM.
  It runs on a fixed timestep, is deterministic given a seed, and is unit tested.
- **One thumb.** Every interaction works with tap or click. No hover-only or
  keyboard-only features.

## Stack

TypeScript, Three.js, Vite, Vitest. Static deploy on every push to the default
branch. Saves in IndexedDB with an export code. `tools/pwa.ts` draws the app
icons per pixel and emits the manifest and service worker at build time; that
is the one place generated images are allowed, and only into `dist/`.

## Current state

Playable pre-alpha. Read `docs/design/systems-reference.md` for what exists and
where every number lives. Game data is in `src/data/` (transcribed from the
producer's export, in pixels with 32px tiles; multiply by `PX` in the sim). The
simulation is `src/sim/world.ts` plus `combat.ts` and `skills/cast.ts`; it emits
`SimEvent`s that `src/render/world/gameView.ts`, the HUD and audio consume.
Zones and real monsters are intentionally absent; `src/data/placeholderEnemies.ts`
stands in and should be deleted when their data arrives. `npm run check` must
pass before every push.

## Verifying visuals

The page exposes `window.fs` with `game` (or `showcase` at `?showcase`), `paused`,
`step(seconds)` and `data` for automated screenshots. Headless Chromium with
SwiftShader renders it; pause the loop first and use `step` so only the final
frame renders. The capture script lives in the session scratchpad, not the repo.

## Conventions

- Feature branches and pull requests against `main`. Merging deploys.
- Keep `README.md` status and the design docs current when a decision changes.
- Commit messages: short imperative subject, body explaining why when useful.
- Ship each change with a plain-language "what to look for" note for the
  producer.
