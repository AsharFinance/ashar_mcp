import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ESM project
    globals: true,
    environment: "node",

    // Test file locations
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],

    // Timeouts
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Retry flaky tests once
    retry: 1,

    // Coverage
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/types.ts",
        "src/version.ts",
        "src/__tests__/**",
      ],
      thresholds: {
        branches: 50,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
});
