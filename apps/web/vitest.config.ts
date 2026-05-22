import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest config for the web app — kept intentionally narrow so
 * landing the first unit test doesn't accidentally pull in jsdom, the
 * full React testing toolchain, or env-shimming infrastructure that
 * the current test surface doesn't need.
 *
 * Why this config exists at all: `.github/workflows/ci.yml`'s
 * "Test TypeScript (Vitest)" job runs `pnpm --filter web exec vitest
 * run --passWithNoTests` IF and ONLY IF this file exists; otherwise it
 * skips with "No Vitest config yet". Adding the path-traversal test
 * for `resolveBackHref` (see `confirm-page-header.test.ts`) is the
 * first FE unit test in the repo, so this file unlocks the CI gate.
 *
 * The `@/` path alias mirrors `apps/web/tsconfig.json`'s
 * `compilerOptions.paths` so test imports stay drop-in identical to
 * the runtime imports under `src/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});
