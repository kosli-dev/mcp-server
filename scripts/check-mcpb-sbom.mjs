#!/usr/bin/env node
// Fails unless the CycloneDX SBOM written by pack-mcpb.sh lists exactly the
// packages in the unzipped bundle's node_modules: nothing missing, nothing
// extra, compared as name@version.
//
// An SBOM that under-reports is worse than none, and the way it goes wrong is
// silent: npm sbom --omit dev drops shared production packages (zod & co.)
// while still writing a well-formed, non-empty file. Only a comparison against
// what actually shipped catches that.
//
// Usage: node scripts/check-mcpb-sbom.mjs <sbom.cdx.json> <unzipped-bundle-dir>
// Plain .mjs with no dependencies, so it runs on the consumer-floor Node too.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [sbomPath, bundleDir] = process.argv.slice(2);
if (!sbomPath || !bundleDir) {
  console.error("usage: check-mcpb-sbom.mjs <sbom.cdx.json> <unzipped-bundle-dir>");
  process.exit(2);
}

const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
if (sbom.bomFormat !== "CycloneDX" || !Array.isArray(sbom.components)) {
  console.error(`${sbomPath}: not a CycloneDX SBOM with a components list`);
  process.exit(1);
}
// npm sbom writes scoped names whole ("@scope/name"); other generators split
// the scope into "group". Accept both.
const inSbom = new Set(
  sbom.components.map((c) => {
    const name = c.group && !c.name.startsWith("@") ? `${c.group}/${c.name}` : c.name;
    return `${name}@${c.version}`;
  }),
);

// Every package root under node_modules, nested ones included. A package root
// is node_modules/<name> or node_modules/@scope/<name>; other package.json
// files inside a package (e.g. a dist/ "type" stub) are not packages.
const inBundle = new Set();
function walk(nodeModules) {
  let entries;
  try {
    entries = readdirSync(nodeModules, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const scoped of readdirSync(dir, { withFileTypes: true })) {
        if (scoped.isDirectory()) visit(join(dir, scoped.name));
      }
    } else {
      visit(dir);
    }
  }
}
function visit(pkgDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    if (pkg.name && pkg.version) inBundle.add(`${pkg.name}@${pkg.version}`);
  } catch {
    // no package.json: not a package root
  }
  walk(join(pkgDir, "node_modules"));
}
walk(join(bundleDir, "node_modules"));

if (inBundle.size === 0) {
  console.error(`${bundleDir}: no packages found under node_modules`);
  process.exit(1);
}

const missing = [...inBundle].filter((p) => !inSbom.has(p)).sort();
const extra = [...inSbom].filter((p) => !inBundle.has(p)).sort();
if (missing.length || extra.length) {
  console.error(`SBOM ${sbomPath} does not match the bundle in ${bundleDir}:`);
  for (const p of missing) console.error(`  in bundle, missing from SBOM: ${p}`);
  for (const p of extra) console.error(`  in SBOM, not in bundle:       ${p}`);
  process.exit(1);
}
console.log(`ok - SBOM lists all ${inBundle.size} bundled packages and nothing else`);
