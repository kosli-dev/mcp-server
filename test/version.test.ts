import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { VERSION } from "../src/version.js";

/**
 * The shipped code cannot read `package.json` — it is outside `rootDir` and is
 * stripped from the `.mcpb` bundle — so `VERSION` is a literal. Tests run from
 * the repo root and can read it, which makes this the guard that stops the two
 * drifting, as they did when the MCP server advertised 0.1.0 at version 0.5.0.
 */
describe("VERSION", () => {
  it("matches the version in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    expect(VERSION).toBe(pkg.version);
  });

  it("is a plain semver string, safe to embed in a User-Agent header", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  });
});
