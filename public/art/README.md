# Hand-made art

Drop image files here to replace the game's generated drawings. Every file is
optional: if it is missing, the code-drawn version is used.

## Item icons: `items/<id>.png`

- One PNG per item, named after the item's id in `src/data/items.ts`
  (`sword.png`, `bow.png`, `tower_shield.png` ...). Today the game looks for
  the ids listed in `ITEM_ART_IDS` in `src/art/images.ts`; add an id there
  when you add a file.
- Best at 16 by 16 pixels with a transparent background, drawn at that size:
  the game shows icons at a whole-number scale and never smooths them. A
  larger square image whose side is a multiple of 16 (32, 64, 128) is shrunk
  to 16 once at load by averaging blocks, which keeps the silhouette but loses
  fine detail, so real pixel art at 16 or 32 always looks better than a
  shrunk painting.
- Use the Grim palette where you can so it sits next to the generated icons.
- The icon is the same for every rarity; the rarity shows on the frame and
  the name.
