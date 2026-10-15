import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB-touching tests run against a throwaway database, never dev data.
    env: {
      DATABASE_URL: "file:./var/test.db",
    },
  },
});
