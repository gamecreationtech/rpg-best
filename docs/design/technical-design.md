# Falling Sky: Technical Design

Status: decided on 2026-09-27. Written for both the producer and the engineers.
Plain-language summaries come first, details follow.

## 1. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Type safety keeps a large procedural codebase honest |
| Rendering | Three.js (WebGL 2, WebGPU when widely available on mobile) | Lean, huge community, excellent for custom geometry and shaders |
| Build | Vite | Fast builds, tiny output, first-class PWA plugin |
| Tests | Vitest | Simulation and generators are tested without a browser |
| Deploy | Static site, built on every push to the main branch | One link, always the latest version |
| Hosting | GitHub Pages, or Cloudflare Pages / Vercel if the repo stays private | See open questions in the design document |

No game engine, no editor. The game is a program, and the art is part of it.

## 2. All art in code

Plain language: nothing in the repository is a picture, a 3D model or a sound
file. Everything the player sees and hears is described by code and generated
when the game starts, or the first time it is needed.

What that means for each kind of asset:

- **Meshes.** Built from primitives (boxes, cylinders, cones, extruded shapes)
  combined and deformed by small generator functions. A monster is a recipe,
  not a file. Recipes take parameters, so one recipe yields many variants.
- **Materials.** Flat-shaded, vertex colours. No image textures. Surface
  variety comes from vertex colour noise and simple shader effects (rim light,
  emissive glow, dissolve on death).
- **Animation.** Characters are assembled from rigid parts. Poses are keyframes
  defined in code and blended. Playback runs in the vertex shader per instance.
- **Effects.** GPU particle systems and shader-driven meshes (rings, cones,
  bolts). Each spell is a small script that spawns and drives them.
- **UI.** HTML and CSS, with icons drawn as inline SVG generated from code.
  Text uses system fonts.
- **Audio.** Web Audio API synthesis. Oscillators, noise, envelopes, filters,
  convolution reverb generated from noise. Music is a generative sequencer.
- **Levels.** Procedural generators seeded per run. A seed reproduces a level
  exactly, which makes bugs reproducible.

## 3. Performance plan

Target: 60 frames per second with 200 live monsters and heavy spell effects on
a mid-range phone from 2021 (iPhone 12 or Pixel 5 class), inside a mobile
browser.

Plain language: the game draws crowds in batches, animates them on the
graphics chip, keeps a hard budget for effects, and lowers resolution rather
than frame rate when a phone struggles.

Rules, in priority order:

1. **Instanced rendering.** All monsters of one kind are one draw call. Loot,
   props and projectiles are also instanced. Target: under 100 draw calls in
   the worst fight.
2. **GPU animation.** Per-instance animation state (clip, time, direction) is
   uploaded as instance attributes. The vertex shader poses rigid parts. The
   CPU never touches vertices.
3. **Effects budget.** One pooled GPU particle system with a fixed maximum.
   Spells declare a priority. When the pool is full, low-priority effects are
   shortened or skipped. Frame rate never drops to show a particle.
4. **Cheap lighting.** One directional key light with one cascaded shadow map
   at modest resolution, hemisphere ambient, exponential fog. Spells and
   torches use emissive materials and additive sprites, not real lights.
   A small budget of real point lights may be reserved for the player.
5. **Post-processing that earns its cost.** Bloom, vignette and colour grading
   in a single combined pass. No ambient occlusion or depth of field on mobile.
6. **Simulation on a fixed timestep.** Game logic runs at a fixed rate,
   independent of rendering, in plain data structures. This is what makes
   later co-op possible and keeps tests deterministic.
7. **Spatial hashing.** Monsters, projectiles and pickups live in a grid so
   collision and targeting never scan every entity.
8. **Staggered AI.** Monsters far from the player or idle think a few times per
   second, near ones every tick. Pathfinding is flow-field based per level, so
   200 monsters share one path computation.
9. **Dynamic resolution.** Render scale adjusts between roughly 0.6 and 1.0 of
   device resolution to hold the frame rate, with device pixel ratio capped.
10. **Memory discipline.** Object pools for everything spawned in combat. No
    allocation in the hot loop. iOS Safari memory limits are the ceiling.

The stress-test arena (200 monsters, all spells on cooldown-free auto-cast,
frame-time graph on screen) is a permanent scene reachable from the title
screen in development builds and is checked on every version.

## 4. Architecture

```
src/
  sim/        Pure game simulation: entities, combat, items, skills, levels.
              No Three.js imports. Deterministic given a seed and inputs.
  gen/        Procedural generators: meshes, palettes, animations, sounds,
              level layouts. Pure functions, unit tested.
  render/     Three.js scene, instanced renderers, shaders, particles,
              post-processing. Reads sim state, never mutates it.
  audio/      Web Audio synthesis and mixing.
  ui/         HTML/CSS/SVG interface: HUD, inventory, skill trees, menus.
  input/      Tap, click and keyboard mapped to sim commands.
  app/        Boot, loop, save/load, PWA service worker, settings.
```

Rendering and UI observe the simulation. Input produces commands. The
simulation is the only thing that changes game state.

## 5. Saves

Save data is versioned JSON stored in IndexedDB. Export produces a compressed,
checksummed text code the player can copy. Import validates the checksum and
version and migrates old saves forward.

## 6. Quality gates

Every pull request runs: type check, lint, unit tests for sim and gen, a
production build, and a bundle size check. A visual and performance smoke test
in a headless browser is added once the stress arena exists.

## 7. Development workflow

- The producer reviews by playing the deployed link on a phone, not by reading
  code. Every change ships with a short plain-language note on what to look
  for.
- Each feature is a pull request against the main branch. Merging deploys.
- Decisions are recorded in `docs/design/` before or alongside the code that
  implements them.
