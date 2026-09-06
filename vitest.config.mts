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
    include: ["src/**/*.test.ts"],
  },
});
