import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["packages/**/*.{test,spec}.ts"],
    exclude: ["**/dist/**", "**/generated/**", "**/*.integration.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        "packages/core/src/domain/**": {
          lines: 95,
          functions: 95,
          statements: 95,
          branches: 90,
        },
        "packages/core/src/app/**": {
          lines: 85,
          functions: 85,
          statements: 85,
          branches: 80,
        },
      },
      exclude: ["**/generated/**", "**/*.test.ts", "**/*.spec.ts", "**/__fixtures__/**"],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
