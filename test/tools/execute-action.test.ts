import { describe, it, expect, vi } from "vitest";
import { executeAction } from "../../src/tools/execute-action.js";
import catalog from "../fixtures/catalog-subset.json" with { type: "json" };
import type { CatalogEntry, Config } from "../../src/types.js";

const entries = catalog as CatalogEntry[];
const config: Config = {
  apiKey: "test-key",
  org: "test-org",
  baseUrl: "https://app.kosli.com",
};

describe("executeAction", () => {
  it("finds the action and calls the client", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: ["prod", "staging"] }),
    });

    const result = await executeAction(entries, config, "list_environments", {}, mockFetch);

    expect(result).toEqual({ environments: ["prod", "staging"] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns error for unknown action ID", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "nonexistent_action", {}, mockFetch);

    expect(result).toEqual({
      error: true,
      message: 'Unknown action: nonexistent_action',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("passes params through to the client", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ trail: { name: "v1.0" } }),
    });

    await executeAction(entries, config, "get_trail", {
      flow_name: "my-flow",
      trail_name: "v1.0",
    }, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trails/test-org/my-flow/v1.0"),
      expect.anything(),
    );
  });
});
