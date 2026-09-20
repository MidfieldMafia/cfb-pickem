import { defineConfig } from "tsup";

export default defineConfig({
  // Bundling every module into one dist/index.js drops each file's own
  // "use client" directive — esbuild only preserves a directive prologue at
  // the very top of an output file, and the barrel entry (src/index.ts) has
  // none. One output file per source module keeps each component's own
  // directive intact; the consuming bundler (Next/Turbopack) resolves the
  // resulting extensionless relative imports between dist files itself.
  entry: ["src/**/*.{ts,tsx}"],
  format: ["esm"],
  bundle: false,
  dts: true,
  clean: true,
  sourcemap: true,
});
