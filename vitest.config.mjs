import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/helpers/build-supervisor.mjs"],
    include: ["tests/**/*.spec.ts"],
    fileParallelism: false,
  },
});
