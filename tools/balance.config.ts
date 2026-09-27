import { defineConfig } from 'vitest/config';

/** Config for `npm run balance`: the leveling pace check in tools/balance.test.ts. */
export default defineConfig({
  test: {
    include: ['tools/balance.test.ts'],
    testTimeout: 600000,
  },
});
