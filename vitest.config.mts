import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      /**
       * The `server-only` marker resolves to a no-op under the "react-server"
       * condition and to a module that throws under every other one. Next sets
       * that condition; a Node test run does not. Point it at the package's own
       * empty module so the server seams stay unit testable.
       */
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /**
     * `.tsx` as well, or a component suite is collected by nobody and passes
     * by not existing. Each such file opts into jsdom with its own
     * `@vitest-environment` pragma, the way `picks/clock.test.ts` already
     * does — the server seams are the majority and stay on `node`.
     */
    include: ["src/**/*.test.{ts,tsx}"],
    /**
     * A server-seam test is CPU-bound, not slow to answer: a file's first test
     * builds the template database (`src/test/db.ts`) and every test boots its
     * own copy. Under contention (a second suite, `next build`, a dev server)
     * the same test that takes 3s alone took 22s, and 20s turned a busy
     * machine into a wall of unrelated timeouts. 60s still catches a hang.
     */
    testTimeout: 60_000,
    /**
     * Half the cores. The run is CPU-bound, so more workers do not finish it
     * sooner (57s at 8 workers, 60s at the default 15 on a 16-core machine);
     * they only make each test wait longer, which doubled the slowest test.
     */
    maxWorkers: "50%",
    /**
     * Off unless `npm run test:coverage` asks for it. Istanbul rather than v8
     * because fallow reads only Istanbul's `coverage-final.json`, which it
     * uses for exact per-function CRAP scores (`.fallowrc.jsonc`).
     */
    coverage: {
      provider: "istanbul",
      reporter: ["json", "text-summary"],
      include: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    },
  },
});
