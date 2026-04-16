import { describe, it, expect, vi, beforeEach } from "vitest";
import { KosliClient } from "../../src/client/kosli-client.js";
import type { CatalogEntry, Config } from "../../src/types.js";

const config: Config = {
  apiKey: "test-api-key",
  org: "test-org",
  baseUrl: "https://app.kosli.com",
};

const listEnvEntry: CatalogEntry = {
  id: "list_environments",
  method: "GET",
  path: "/environments/{org}",
  summary: "List environments",
  description: "List all environments.",
  tags: ["Environments"],
  parameters: [
    { name: "org", in: "path", required: true, description: "Organization name" },
  ],
  requestBody: null,
  searchText: "list environments",
};

const getTrailEntry: CatalogEntry = {
  id: "get_trail",
  method: "GET",
  path: "/trails/{org}/{flow_name}/{trail_name}",
  summary: "Get trail",
  description: "Get trail details.",
  tags: ["Trails"],
  parameters: [
    { name: "org", in: "path", required: true, description: "Organization name" },
    { name: "flow_name", in: "path", required: true, description: "Flow name" },
    { name: "trail_name", in: "path", required: true, description: "Trail name" },
  ],
  requestBody: null,
  searchText: "get trail",
};

describe("KosliClient", () => {
  let client: KosliClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new KosliClient(config, mockFetch);
  });

  it("builds correct URL with org auto-injected", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: [] }),
    });

    await client.execute(listEnvEntry, {});

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/fastapi/environments/test-org",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "User-Agent": "kosli-mcp-server",
        }),
      }),
    );
  });

  it("interpolates multiple path params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ trail: {} }),
    });

    await client.execute(getTrailEntry, {
      flow_name: "my-flow",
      trail_name: "my-trail",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/fastapi/trails/test-org/my-flow/my-trail",
      expect.anything(),
    );
  });

  it("allows org override via params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: [] }),
    });

    await client.execute(listEnvEntry, { org: "other-org" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/fastapi/environments/other-org",
      expect.anything(),
    );
  });

  it("returns structured error on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({ message: "Environment not found" }),
    });

    const result = await client.execute(listEnvEntry, {});

    expect(result).toEqual({
      error: true,
      status: 404,
      statusText: "Not Found",
      message: "Environment not found",
    });
  });

  it("returns structured error on network failure without leaking raw error detail", async () => {
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443"));

    const result = await client.execute(listEnvEntry, {});

    expect(result).toEqual({
      error: true,
      status: 0,
      statusText: "Network Error",
      message: "Request failed before reaching the Kosli API",
    });
    // Specifically: the internal IP from the raw error must not surface.
    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
  });

  it("returns structured error on missing required path param (does not throw)", async () => {
    const result = await client.execute(getTrailEntry, { flow_name: "my-flow" });

    expect(result).toEqual({
      error: true,
      status: 0,
      statusText: "Invalid Request",
      message: expect.stringContaining("trail_name"),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
