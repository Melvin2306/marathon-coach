import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Local dates and start times depend on the runner's time zone; pin one.
    env: { TZ: "Europe/Berlin" },
    include: ["tests/**/*.test.ts"],
  },
});
