import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "app/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 45,
        lines: 40,
      },
    },
  },
});
