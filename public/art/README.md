# Hand-made art

Drop image files here to replace the game's generated drawings. Every file is
optional: if it is missing, the code-drawn version is used.

## Hero sprites: `heroes/<classId>/<anim>_<dir>.png`

- A class listed in `HERO_ART_CLASSES` in `src/art/images.ts` (today only
  `sorcerer2`) is drawn from these instead of the code-drawn hero, whatever it
  wears. `anim` is `idle`, `walk` or `attack`; `dir` is `n` (back to the
  camera), `s` (facing the camera), `e` (facing right) or `w` (facing left).
  The `w` drawing is used as is, never a mirrored `e`.
- The idle set needs all four directions before it is used at all. Walk and
  attack are used when all four of theirs are present and otherwise fall back
  to idle, so idle alone is enough to start.
- More frames of one animation are numbered: `walk_s.png`, `walk_s_2.png`,
  `walk_s_3.png`... up to eight. Idle frames change every quarter second,
  walk and attack frames every eighth.
- Size: the code-drawn hero is 22 pixels tall; a drawing of about 22 to 30
  pixels tall sits right next to monsters and doors. It is drawn at its own
  pixel size, never scaled by a fraction. A class drawn bigger can be shrunk
  by a whole number at load (`HERO_ART_SHRINK` in `src/art/images.ts`),
  which averages blocks and keeps hard edges; Sorcerer2's 64 by 64 witch is
  shown at 32 by 32 this way. Give every frame of a class the same canvas size
  with the feet at the bottom centre: that point is placed on the ground, so
  it must not move between frames or directions. Transparent background.

## Item icons: `items/<id>.png`

- One PNG per item, named after the item's id in `src/data/items.ts`
  (`sword.png`, `bow.png`, `tower_shield.png` ...). Today the game looks for
  the ids listed in `ITEM_ART_IDS` in `src/art/images.ts`; add an id there
  when you add a file.
- Any size, with a transparent background. Transparent margins are trimmed
  at load and the drawing is kept at its own pixel size. Wherever it is shown
  it is scaled up by a whole number to fit the slot, never smoothed; when a
  slot is smaller than the drawing (a phone's bag, the vendor list) it is
  shrunk by a whole factor by averaging blocks, which keeps the silhouette but
  loses fine detail. Drawings fit best when they are at most 16 pixels per
  inventory cell of the item (a 1x3 sword within 16 by 48, a 2x2 helmet
  within 32 by 32): those show crisp in every slot on every screen. Twice
  that still shows at its own size in the bag on a big screen and on the
  worn-gear doll, and shrunk by two elsewhere.
- Use the Grim palette where you can so it sits next to the generated icons.
- The icon is the same for every rarity; the rarity shows on the frame and
  the name.
- Drawings waiting for an item that does not exist yet sit here under a
  descriptive name (`winged_totem.png`) and are not loaded until an id is
  given to them.
