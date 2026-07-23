import { describe, it, expect } from "vitest";
import catalog from "../src/catalog.json" with { type: "json" };
import hints from "../src/hints.json" with { type: "json" };

// Guards against hint keys drifting from catalog action IDs (e.g. when the
// OpenAPI spec gains operationIds and generated IDs change). A dangling key
// means the hint silently never attaches to search results.
describe("hints.json", () => {
  it("every hint key matches an action ID in the real catalog", () => {
    const ids = new Set(catalog.map((entry) => entry.id));
    for (const key of Object.keys(hints)) {
      expect(ids, `hint key "${key}" does not match any catalog action ID`).toContain(key);
    }
  });
});
