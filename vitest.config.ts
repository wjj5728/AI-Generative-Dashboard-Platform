import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@json-render/core': path.resolve(
        __dirname,
        'packages/contracts/node_modules/@json-render/core/dist/index.mjs',
      ),
      '@ai-dashboard/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@ai-dashboard/datasource-contract': path.resolve(
        __dirname,
        'packages/datasource-contract/src/index.ts',
      ),
      '@ai-dashboard/component-catalog': path.resolve(
        __dirname,
        'packages/component-catalog/src/index.ts',
      ),
    },
  },
});
