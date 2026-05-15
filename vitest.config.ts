import { defineConfig } from "vitest/config";

// Minimal vitest setup. We use jsdom so tests that touch DOMParser /
// HTMLImageElement / URL.createObjectURL work without extra mocks.
// Per-file env overrides via `// @vitest-environment ...` keep heavy
// jsdom out of pure-logic tests.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: false,
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
