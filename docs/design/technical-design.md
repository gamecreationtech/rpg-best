# Falling Sky: Technical Design

Status: decided on 2026-09-27. Written for both the producer and the engineers.
Plain-language summaries come first, details follow.

## 1. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Type safety keeps a large procedural codebase honest |
| Rendering | Canvas 2D into a 640x360 frame, then one WebGL 2 pass for lighting and upscaling | Pixel art needs no 3D engine; Three.js remains only for the old showcase |
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

- **Sprites.** Drawn pixel by pixel into small buffers by generator functions
  in `src/gen/pixel/` (`pixel.ts` is the toolkit: colour ramps with
  hue-shifted shadows, Bayer dithering, edge shading, outlines). A character
  is a recipe: a body drawn from three sides with idle, walk and attack frames,
  coloured from one palette, with the equipped weapon and shield drawn on. All
  sheets are generated once at start-up, hero looks on demand and cached.
- **Tiles.** 32x16 diamond floor tiles in four variants and a brick wall block,
  speckled from a seeded noise so the ground never repeats obviously.
- **Animation.** Frame sequences per action and facing. Side views are
  mirrored for left and right. Death is a fall and a fade drawn at run time.
- **Effects.** A pooled square-particle system plus drawn effects (rings, discs,
  arcs, jagged bolts, sprite bursts). Each spell event maps to a few of them.
  Rings and particles can start after a delay so an impact can follow a fall.
  A melee skill can name its `visual`: `overhead` (Heavy Strike) drops a great
  maul onto the target from above with a flash, ground cracks and a camera
  kick; `holy_shield` (Shield Bash) raises a glowing heater shield with a cross
  over the enemy; `bloody` (Hemorrhage) tears two gashes across it with blood
  flying and a pool left on the floor; `cleave` (Cleave) paints a wide red
  sweep across the arc with sparks along its rim; `void` (Void Slash) a purple
  one with a splash of void rings and motes bursting out all round the hero. Single-target visuals arrive as `melee_impact` at the
  target, arc ones ride the `melee_swing` event. Ground Stomp's aoe has
  `jump`: the sim leaps in place for that long and lands the blow on touchdown,
  drawn as cracks, a hard bright ring and two slower dust waves. Prayer draws
  small crosses of light climbing round the hero with a green glow while the
  buff runs. Rite of Blood turns the hero into a daemon while it runs: horns,
  burning eyes, a dark red skin and outline, black smoke and a red light.
  Sanctuary is a still double rim of gold and white, a breathing glow, gold
  glitter blinking all over the floor and eight candles round the edge. Holy Smite (the
  thrown one, formerly Hammer of Gods) and Holy Smite (spin) share the star
  sprite. A leap arcs higher the further it goes and trails dust. Boulder
  Toss keeps its rock out of sight for the first third of the delay, then drops
  it in a true accelerating fall onto the target ring, with a shadow that
  grows as it nears; on landing the rock lies there a moment
  while the ground cracks and shards fly. Rock Solid circles the hero with six
  rocks torn from the ground and drops one for every sixth of its shield
  that breaks.
- **UI.** HTML and CSS, with icons drawn as inline SVG generated from code.
  Text uses system fonts.
- **Audio.** Web Audio API synthesis. Oscillators, noise, envelopes, filters,
  convolution reverb generated from noise. Music is a generative sequencer.
- **Levels.** Procedural generators seeded per run. A seed reproduces a level
  exactly, which makes bugs reproducible.

### 2.1 The art lab

`src/lab/` (`?lab`, desktop only) is where the look was chosen and where new
palettes and sprite sizes can still be compared side by side: isometric pixel
art, a top-down 16-bit variant, and the old 3D showcase through a pixel filter.
It shares the generators in `src/gen/pixel/` with the game.

## 3. Performance plan

Target: 60 frames per second with 200 live monsters and heavy spell effects on
a mid-range phone from 2021 (iPhone 12 or Pixel 5 class), inside a mobile
browser.

Plain language: the game draws a tiny picture (640x360 on desktop, 400x225 on
phones) and scales it up, so the number of pixels is small no matter how big
the screen is. Sprites are pre-drawn once, effects have a hard budget, and
lighting is one cheap pass on the graphics chip.

Rules, in priority order:

1. **A small frame.** Everything is drawn into a low-resolution canvas with
   pre-rendered sprites (`drawImage` of whole frames, never per-pixel work
   during play). Only tiles and things inside the view are drawn; the map is
   scanned by the visible rectangle, not in full.
2. **One sort per frame.** Walls, props, characters, drops and projectiles go
   into one list sorted by depth (painter's order). No per-object allocation:
   the list is reused.
3. **Effects budget.** One pooled particle system with a fixed maximum (1500)
   and a priority per spawn; when the pool is full, low-priority particles
   are dropped. Drawn effects are capped at 400 live entries.
4. **Cheap lighting.** The compositor uploads the frame as one texture and a
   single fragment shader applies up to 48 point lights, quantises the light
   into dithered bands and scales the frame up with nearest sampling. No
   shadow maps, no post-processing chain.
5. **Sprite sheets are cached.** Monster, dummy and merchant sheets are built
   once per session; each hero look (class, pledge, weapon, shield) is built
   the first time it appears and kept.
6. **Simulation on a fixed timestep.** Game logic runs at a fixed rate,
   independent of rendering, in plain data structures. This is what makes
   later co-op possible and keeps tests deterministic.
7. **Spatial hashing.** Monsters, projectiles and pickups live in a grid so
   collision and targeting never scan every entity.
8. **Staggered AI.** Monsters far from the player or idle think a few times per
   second, near ones every tick. Pathfinding is flow-field based per level, so
   200 monsters share one path computation.
9. **Fixed resolution.** The frame is always about 640x360 (400x225 on phones)
   at a whole-number scale, so the pixel cost never grows with the screen.
10. **Memory discipline.** Object pools for everything spawned in combat. No
    allocation in the hot loop. iOS Safari memory limits are the ceiling.

The stress-test arena (200 monsters, all spells on cooldown-free auto-cast,
frame-time graph on screen) is a permanent scene reachable from the title
screen in development builds and is checked on every version.

## 4. Architecture

```
src/
  data/       Game data tables (classes, pledges, skills, passives, items,
              crafting, consumables, status rules). Pixels, 32px tiles.
  sim/        Pure game simulation: world, combat, skill execution, items,
              maps, pathing, saves. No rendering imports. Emits SimEvents.
  gen/        Procedural generators. gen/pixel/ holds the pixel-art toolkit,
              palettes, character sheets, tiles, props and effect sprites used
              by the game; the rest are the 3D recipes of the old showcase.
  render2d/   The game's renderer: isometric camera, the frame, particles,
              drawn effects, the lighting compositor, HTML overlays (damage
              numbers, loot tags, station tags) and the minimap.
  render/     Three.js viewport, GPU-posed crowds, particles, effects, the
              game view that draws a World. Reads sim state, never mutates it.
  audio/      Web Audio synthesis: sound effects and generative music.
  ui/         HTML/CSS/SVG interface: HUD, panels, screens, showcase panel.
  app/        Game loop, input, storage, showcase orchestration.
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
