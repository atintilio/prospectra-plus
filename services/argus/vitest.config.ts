import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['services/argus/tests/**/*.test.ts'] } });
