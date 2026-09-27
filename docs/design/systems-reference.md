# Falling Sky: Systems Reference

Status: implemented on 2026-09-27 from the producer's game data export. This page
says what exists in the build, where each table lives so numbers can be tuned,
and which calls were made where the export was silent or contradictory.

Zones and monsters were deliberately left out, per the producer. Everything that
needs something to hit uses the training dummies in town or the placeholder
Proving Grounds.

## What is in the build

| System | Where the numbers live | Notes |
| --- | --- | --- |
| Classes (Knight, Sorcerer, Rogue) | `src/data/classes.ts` | Base stats, per-level growth, starting gear, preferred weapons |
| Pledges (9) | `src/data/pledges.ts` | Colour, description, unlocked skills |
| Skills (53: 18 base, 12 ultimate, 23 pledge) | `src/data/skills.ts` | Every skill is data plus one of eight behaviour kinds; `src/sim/skills/cast.ts` executes them |
| Passive trees (general + 3 class) | `src/data/passives.ts` | Ranks, per-rank stat, prerequisites |
| Stats and formulas | `src/sim/player.ts`, `src/sim/combat.ts` | Max life and mana, move speed, attack speed, cast rate, crit, armour, resistances, dodge, block, shields, life steal, cooldown reduction |
| Status effects | `src/data/status.ts`, `src/sim/combat.ts` | Stun, freeze, slow, poison, burn, bleed, death curse, shock, electrocute, with the export's proc chances |
| Items | `src/data/items.ts`, `src/sim/items/` | 10 weapons, 5 armours, 8 accessories, 4 divine specials, 6 starters; six rarities with the export's weights, multipliers and value formula; random affixes |
| Inventory and stash | `src/sim/items/inventory.ts` | 18x14 bag (`ITEM_RULES.inventoryCols/Rows`), three 12x12 stash pages, sized items |
| Equipment | `src/sim/items/equipment.ts` | 13 slots, two rings, two-handed weapons block the shield, level requirements |
| Vendor | `src/sim/items/vendor.ts` | Stock capped at magic, item level 65/20/10/5 spread, sells at 40% |
| Crafting | `src/data/crafting.ts`, `src/sim/items/crafting.ts` | Forge (4 smelts, 5 uses each), Blood Fountain (4), Arcana Oracle (enchant, transmute, infuse, reroll) |
| Consumables | `src/data/consumables.ts` | Health potion, bandage, mana potion, incense; charges refill on kills |
| Professions | `src/data/professions.ts` | Five professions with the perk ladder; they cannot gain experience until gathering nodes exist in zones |
| Town | `src/sim/map/tilemap.ts` | 44x33 safe field with merchant, stash, three stations, waypoint, return portal and five elemental training dummies |
| Map generation | `src/sim/map/tilemap.ts` | 80x60 open field with rock blobs, wall segments and pillars; unreachable pockets are sealed |
| Pathing | `src/sim/map/pathing.ts` | A* for tap-to-move, a flow field for enemies |
| Placeholder enemies | `src/data/placeholderEnemies.ts` | Four kinds borrowed from the showcase, scaled to player level. Delete this file when the real monster data arrives |
| Audio | `src/audio/` | Sixteen synthesised effects from the export table plus a generative drone score |
| Save | `src/sim/save.ts`, `src/app/storage.ts` | IndexedDB with a localStorage fallback, autosave on level up, travel and every 45 seconds, and a copyable save code |
| Full screen and install | `src/app/fullscreen.ts`, `tools/pwa.ts` | Android browsers go full screen on Play; the home-screen install (manifest, code-drawn icons, offline cache, all generated at build time) gives true full screen on every phone including iPhone |
| Rendering | `src/render2d/pixelView.ts`, `src/gen/pixel/` | Isometric pixel art: 32x16 tiles, 22px hero, Grim palette, dithered torchlight; sprites for heroes (class, pledge colour, weapon, shield), four placeholder monsters, dummies, the merchant, stations, projectiles, loot and spell effects, all generated at start-up |
| Interface | `src/ui/game/` | HUD, hero menu (inventory, gear, stats, skills, passives), stash, merchant, waypoint, three stations, professions, menu, title, class and pledge pick, death |

## Calls made where the export was unclear

- **Pledge timing.** The export says pledges are chosen after class selection in one place and at level 20 in another. Pledge skills unlock from level 5, so every class picks a pledge at character creation. Level 20 grants the ultimate point.
- **Skill slots.** Six slots: the primary (tap an enemy, or left click) holds Attack or a skill, and five skill slots unlock at levels 1, 5, 10, 15 and 20.
- **Skill damage scaling.** Skills scale from the weapon roll plus strength (melee weapons) or intelligence and spell damage (magic weapons). Void Slash adds both. Rank multiplier is 1 + rank x rankBonus.
- **Requirement level of items.** The export had a field but no formula: level = round(item level x 0.8), minimum 1.
- **Death.** Respawn in town with no penalty, as decided in the design document.
- **Wind and Storm** follow the caster. **Blizzard** covers a fixed 600px circle around the cast point.
- **Fire Prison** ticks every half second; the ultimate clamps enemies inside the ring.
- **Life Touch** drains at full strength within 200px, half strength out to 350px, then breaks.
- **Professions** track level and experience but nothing grants experience yet.
- **Units.** The export uses pixels with 32px tiles. Data stays in pixels; the world uses one unit per tile, so everything is multiplied by 1/32 at use.

## Controls

Phones and tablets get the layout mobile action RPGs use: a floating joystick
appears wherever the left thumb lands on the ground, and the right thumb has a
big Attack button with the five skill buttons on an arc around it. Tapping
Attack is one swing at whatever is already in reach; holding it keeps swinging,
and it never walks the hero anywhere. Tapping a skill casts it at the nearest
enemy; holding a skill repeats it; dragging from a skill aims it. Tapping an
enemy directly still walks to it and attacks. Loot labels, the merchant and
the stations can be tapped directly too.
Potions sit bottom-left, the menu buttons top-right (top-centre in landscape).

Desktop keeps tap-to-move: tap to move, hold to keep walking, tap an enemy to
attack it. Keyboard: WASD or arrows, Q E R Y, right click for the sixth slot,
space to attack, 1-4 potions, Tab for the hero menu (Inventory tab: worn gear
as a paper doll, the full stat sheet and the bag; Skills tab: skills, the slot
bar and the passive trees), K straight to Skills, F to interact, Escape for the
menu. I, C and P still open the matching tab. The hero menu is drawn as pixel
art: a code-drawn 5x7 font, nine-slice frames and item icons from
`src/ui/pixelFont.ts`, `src/ui/pixelChrome.ts` and `src/gen/pixel/icons.ts`,
over the game dimmed in dithered bands. The menu has a control switch:
Automatic, Joystick and buttons, or Tap.

For development only: the backquote key (or `?dev` in the address) opens a
strip on the left (`src/ui/game/devMenu.ts`) with a slider and Apply button
for movement speed, cooldown reduction, cast rate, crit, resistances, armour,
block, evasion, range, projectile speed, gold find and magic find, plus a
Level up button. The bonuses live in `World.devStats`, add to the character
sheet and are never saved. Delete the file and the key before release.

## Known gaps

- No zones or real monsters, by request.
- Performance on real phones has not been measured; the target remains 60 fps.
- Equipment other than weapons and shields does not change the hero's appearance yet.
