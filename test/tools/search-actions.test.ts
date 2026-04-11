import { describe, it, expect } from "vitest";
import { searchActions } from "../../src/tools/search-actions.js";
import catalog from "../fixtures/catalog-subset.json" with { type: "json" };
import type { CatalogEntry } from "../../src/types.js";

const entries = catalog as CatalogEntry[];

describe("searchActions", () => {
  it("returns matches for a keyword query", () => {
    const results = searchActions(entries, "environments");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("list_environments");
  });

  it("ranks exact matches higher", () => {
    const results = searchActions(entries, "list flows");

    expect(results[0].id).toBe("list_flows");
  });

  it("returns empty array for no matches", () => {
    const results = searchActions(entries, "xyznonexistent");

    expect(results).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const results = searchActions(entries, "org", 2);

    expect(results.length).toBe(2);
  });

  it("is case insensitive", () => {
    const results = searchActions(entries, "LIST ENVIRONMENTS");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("list_environments");
  });

  it("matches on tags", () => {
    const results = searchActions(entries, "snapshots");

    expect(results.some((r) => r.id === "list_snapshots")).toBe(true);
  });

  it("matches on description keywords", () => {
    const results = searchActions(entries, "fingerprint");

    expect(results.some((r) => r.id === "search_artifacts_by_sha")).toBe(true);
  });
});
