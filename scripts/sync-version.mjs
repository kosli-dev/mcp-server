// Regenerates src/version.ts from package.json.
//
// Run automatically by npm's `version` lifecycle hook, so `npm version <x>`
// updates package.json, package-lock.json, and src/version.ts together. Run it
// by hand (`npm run sync-version`) if a version ever gets edited directly.
//
// src/version.ts exists because the shipped code cannot read package.json:
// tsconfig's rootDir is "src", so importing ../package.json shifts the outDir
// layout, and scripts/pack-mcpb.sh strips package.json from the .mcpb bundle.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../", import.meta.url);
const pkgPath = new URL("package.json", repoRoot);
const targetPath = new URL("src/version.ts", repoRoot);

const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`sync-version: package.json has no usable version (got ${JSON.stringify(version)})`);
  process.exit(1);
}

const contents = `/**
 * This server's version, available at runtime.
 *
 * GENERATED from package.json by scripts/sync-version.mjs — do not edit by
 * hand. npm's \`version\` lifecycle hook regenerates it, so \`npm version <x>\`
 * keeps package.json and this file in step.
 *
 * It is a literal rather than a read of package.json because neither
 * alternative works: tsconfig sets \`rootDir: "src"\`, so importing
 * ../package.json shifts the outDir layout and breaks the bin path; and
 * scripts/pack-mcpb.sh deletes package.json from the bundle after using it to
 * install dependencies, so reading it at runtime throws for .mcpb users.
 *
 * test/version.test.ts fails if this drifts from package.json.
 */
export const VERSION = ${JSON.stringify(version)};
`;

const existing = (() => {
  try {
    return readFileSync(targetPath, "utf8");
  } catch {
    return null;
  }
})();

if (existing === contents) {
  console.log(`sync-version: src/version.ts already at ${version}`);
} else {
  writeFileSync(targetPath, contents);
  console.log(`sync-version: wrote ${fileURLToPath(targetPath)} at ${version}`);
}
