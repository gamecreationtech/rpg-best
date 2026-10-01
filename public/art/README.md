# Hand-made art

Drop image files here to replace the game's generated drawings. Every file is
optional: if it is missing, the code-drawn version is used.

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
