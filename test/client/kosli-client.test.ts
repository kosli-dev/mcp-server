import { describe, it, expect, vi, beforeEach } from "vitest";
import { KosliClient } from "../../src/client/kosli-client.js";
import type { CatalogEntry, Config } from "../../src/types.js";

const config: Config = {
  apiKey: "test-api-key",
  org: "test-org",
  baseUrl: "https://app.kosli.com",
  readOnly: true,
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

const putPolicyEntry: CatalogEntry = {
  id: "put_policy",
  method: "PUT",
  path: "/policies/{org}",
  summary: "Create or update policy",
  description: "Create or update a policy.",
  tags: ["Policies"],
  parameters: [
    { name: "org", in: "path", required: true, description: "Organization name" },
  ],
  requestBody: [
    {
      name: "body",
      required: true,
      description: "Request body (multipart/form-data)",
    },
  ],
  searchText: "create or update policy",
};

const createFlowJsonEntry: CatalogEntry = {
  id: "create_flow",
  method: "POST",
  path: "/flows/{org}",
  summary: "Create flow",
  description: "Create a flow.",
  tags: ["Flows"],
  parameters: [
    { name: "org", in: "path", required: true, description: "Organization name" },
  ],
  requestBody: [
    {
      name: "body",
      required: true,
      description: "Request body (application/json)",
    },
  ],
  searchText: "create flow",
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
      "https://app.kosli.com/api/v2/environments/test-org",
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
      "https://app.kosli.com/api/v2/trails/test-org/my-flow/my-trail",
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
      "https://app.kosli.com/api/v2/environments/other-org",
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

  describe("multipart/form-data encoding", () => {
    it("sends FormData body and omits Content-Type header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });

      await client.execute(putPolicyEntry, {
        name: "provenance",
        type: "env",
        policy_file: {
          filename: "provenance-policy.yaml",
          content: "version: 1\nrules:\n  - type: provenance\n    required: true\n",
          contentType: "application/yaml",
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("PUT");
      expect(init.body).toBeInstanceOf(FormData);
      // Content-Type must NOT be pre-set — fetch generates it with the boundary.
      expect(init.headers).not.toHaveProperty("Content-Type");
      // Auth and User-Agent still applied.
      expect(init.headers).toMatchObject({
        Authorization: "Bearer test-api-key",
        "User-Agent": "kosli-mcp-server",
      });

      const form = init.body as FormData;
      expect(form.get("name")).toBe("provenance");
      expect(form.get("type")).toBe("env");
      const file = form.get("policy_file");
      expect(file).toBeInstanceOf(Blob);
      expect((file as File).name).toBe("provenance-policy.yaml");
      expect((file as Blob).type).toBe("application/yaml");
      expect(await (file as Blob).text()).toContain("type: provenance");
    });

    it("defaults file contentType to application/octet-stream", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await client.execute(putPolicyEntry, {
        policy_file: { filename: "x.txt", content: "hello" },
      });

      const form = mockFetch.mock.calls[0][1].body as FormData;
      expect((form.get("policy_file") as Blob).type).toBe("application/octet-stream");
    });

    it("treats non-file object values as JSON-encoded form fields", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await client.execute(putPolicyEntry, {
        metadata: { owner: "security-team" },
      });

      const form = mockFetch.mock.calls[0][1].body as FormData;
      expect(form.get("metadata")).toBe('{"owner":"security-team"}');
    });

    it("still sends JSON body for application/json endpoints", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await client.execute(createFlowJsonEntry, { name: "my-flow" });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toBe('{"name":"my-flow"}');
      expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    });
  });
});
