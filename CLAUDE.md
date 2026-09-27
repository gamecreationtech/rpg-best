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

TypeScript, Three.js, Vite, Vitest. Static deploy on every push to the main
branch. Saves in IndexedDB with an export code.

## Conventions

- Feature branches and pull requests against `main`. Merging deploys.
- Keep `README.md` status and the design docs current when a decision changes.
- Commit messages: short imperative subject, body explaining why when useful.
- Ship each change with a plain-language "what to look for" note for the
  producer.
