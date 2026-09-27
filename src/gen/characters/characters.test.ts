import { describe, expect, it } from 'vitest';
import { ALL_RECIPES } from './index';

describe('character recipes', () => {
  for (const recipe of ALL_RECIPES) {
    it(`${recipe.id} builds a well-formed geometry`, () => {
      const g = recipe.build();
      const pos = g.getAttribute('position');
      expect(pos.count).toBeGreaterThan(36);
      expect(pos.count % 3).toBe(0);
      const box = g.boundingBox!;
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y).toBeLessThanOrEqual(recipe.height + 0.3);
      const glow = g.getAttribute('aGlow');
      let glowing = 0;
      for (let i = 0; i < glow.count; i++) if (glow.getX(i) > 0) glowing++;
      expect(glowing).toBeGreaterThan(0);
    });
  }
});
