/**
 * This server's version, available at runtime.
 *
 * GENERATED from package.json by scripts/sync-version.mjs — do not edit by
 * hand. npm's `version` lifecycle hook regenerates it, so `npm version <x>`
 * keeps package.json and this file in step.
 *
 * It is a literal rather than a read of package.json because neither
 * alternative works: tsconfig sets `rootDir: "src"`, so importing
 * ../package.json shifts the outDir layout and breaks the bin path; and
 * scripts/pack-mcpb.sh deletes package.json from the bundle after using it to
 * install dependencies, so reading it at runtime throws for .mcpb users.
 *
 * test/version.test.ts fails if this drifts from package.json.
 */
export const VERSION = "0.5.0";
