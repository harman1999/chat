/**
 * Bundles the two standalone Node entrypoints to plain JavaScript.
 *
 * The web server is compiled by Next; the WebSocket gateway and the migration
 * runner are not — they are plain TypeScript started directly. Shipping a
 * TypeScript loader to production to run them would mean carrying `tsx` and its
 * dependency tree into the runtime image, which defeats the standalone build
 * and puts a compiler on the production path.
 *
 * Bundling instead resolves the cross-directory imports (`server/` reaches into
 * `src/types` and `src/config`) into one file each, with no loader at runtime.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

/**
 * Only the optional native add-ons stay external.
 *
 * Everything else is bundled, because the runtime image is Next's standalone
 * output — and that traces only what the *web* app imports. `ws` is used
 * solely by the gateway, so nothing traced it and a runtime import of it found
 * nothing. Bundling makes `dist/` self-contained instead of dependent on
 * whatever the web build happened to pull in.
 *
 * These three are loaded inside try/catch by their parents and are absent in a
 * normal install, so they must not be resolved at build time.
 */
const external = ["pg-native", "bufferutil", "utf-8-validate", "cpu-features"];

for (const entry of ["server/ws/server.ts", "server/db/migrate.ts", "server/db/seed.ts"]) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${entry.replace(/^server\//, "").replace(/\.ts$/, ".mjs")}`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    external,
    // ESM bundles lose `__dirname` and friends; esbuild needs telling.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    logLevel: "warning",
    sourcemap: true,
    define: { "process.env.APP_VERSION": JSON.stringify(pkg.version) },
  });
  console.log(`  bundled ${entry}`);
}

// The migration runner reads these at runtime, resolved relative to its own
// file — so after bundling they have to sit beside the bundle.
cpSync("server/db/migrations", "dist/db/migrations", { recursive: true });
console.log("  copied migrations");
