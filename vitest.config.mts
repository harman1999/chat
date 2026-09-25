import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${root}src`,
      "@server": `${root}server`,
    },
  },
  test: {
    /**
     * Two suites with different needs:
     *  - `integration` drives the real API over HTTP against Postgres + Redis
     *  - `component` renders React in jsdom with the network stubbed
     */
    projects: [
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // One Postgres, one Redis — parallel files would race on the rows.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["tests/component/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/component/setup.ts"],
        },
      },
    ],
    env: {
      // src/services/http.ts treats anything but the literal "false" as mock
      // mode, so a test would otherwise pass while exercising fixtures.
      NEXT_PUBLIC_USE_MOCK: "false",
    },
  },
});
