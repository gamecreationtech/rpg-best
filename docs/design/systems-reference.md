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
| Inventory and stash | `src/sim/items/inventory.ts` | 12x12 bag, three 12x12 stash pages, sized items |
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
| Interface | `src/ui/game/` | HUD, bag, character, skills, passives, stash, merchant, waypoint, three stations, professions, menu, title, class and pledge pick, death |

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

Tap to move, hold to keep walking, tap an enemy to attack it, tap an item label to pick it up, tap a station or the merchant to walk there and open it. Tap a skill button to cast it at the nearest enemy, or drag from the button to aim. Keyboard: WASD or arrows, Q E R Y, right click for the sixth slot, space to attack, 1-4 potions, I C K P for panels, F to interact, Escape for the menu.

## Known gaps

- No zones or real monsters, by request.
- Not yet installable as a home-screen app (no manifest or offline cache).
- Performance on real phones has not been measured; the target remains 60 fps.
- Equipment other than weapons and shields does not change the hero's appearance yet.
