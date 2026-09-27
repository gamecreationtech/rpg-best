/** Positions for the right-thumb cluster: a big attack button with five skills on an arc. */
export const CLUSTER = {
  size: 250,
  attack: 86,
  skill: 60,
  radius: 150,
  /** Degrees from "left of the attack button" toward "above it". */
  angles: [152, 132, 112, 92, 72],
};

/** Centre of a skill button relative to the cluster's bottom-right corner. */
export function skillPosition(index: number): { right: number; bottom: number } {
  const a = ((CLUSTER.angles[index] ?? 90) * Math.PI) / 180;
  const cx = CLUSTER.attack / 2 + 6;
  const cy = CLUSTER.attack / 2 + 6;
  // Angle 180 is left of the attack button, 90 is straight above it
  return { right: cx - Math.cos(a) * CLUSTER.radius - CLUSTER.skill / 2, bottom: cy + Math.sin(a) * CLUSTER.radius - CLUSTER.skill / 2 };
}
