import { defineConfig } from 'vitest/config'

// #11/#13 introduced this: pure state-transition logic pulled out of components (no rendering, no DOM)
// so plain `node` environment is enough -- jsdom isn't needed unless a future test actually renders.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
