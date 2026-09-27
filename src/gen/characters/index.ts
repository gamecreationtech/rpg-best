import { brute } from './brute';
import { ghoul } from './ghoul';
import { skeleton } from './skeleton';
import { sorcerer } from './sorcerer';
import type { CharacterRecipe } from './types';
import { wraith } from './wraith';

export type { CharacterRecipe } from './types';

export const HERO_RECIPES: CharacterRecipe[] = [sorcerer];
export const MONSTER_RECIPES: CharacterRecipe[] = [ghoul, skeleton, brute, wraith];
export const ALL_RECIPES: CharacterRecipe[] = [...HERO_RECIPES, ...MONSTER_RECIPES];
