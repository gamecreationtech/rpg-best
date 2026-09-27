import type { BufferGeometry } from 'three';

export interface CharacterRecipe {
  id: string;
  name: string;
  /** Short flavour line shown in the showcase. */
  blurb: string;
  /** Approximate height in metres, used for camera framing. */
  height: number;
  /** Floats above the ground instead of standing. */
  hover?: boolean;
  /** Ambient light tint for this character's glow parts, used by effects. */
  glowColor: number;
  build(): BufferGeometry;
}
