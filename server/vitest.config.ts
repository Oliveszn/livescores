import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true, // lets you use describe/it/expect without importing them
    environment: "node", // we're testing a Node.js backend, not a browser
    coverage: {
      provider: "v8",
      reporter: ["text", "html"], // text = terminal output, html = visual report
      include: ["src/**/*.ts"], // only measure coverage on your source files
      exclude: ["src/db/**", "src/server.ts"], // skip db config and entry point
    },
  },
});
