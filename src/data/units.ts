/**
 * The original design data is expressed in pixels with 32px tiles. The 3D world
 * uses one unit per tile, so every distance and speed in `src/data/` is in
 * pixels and gets multiplied by PX when the simulation uses it.
 */
export const PX = 1 / 32;
/** Milliseconds in data, seconds in the simulation. */
export const MS = 1 / 1000;
