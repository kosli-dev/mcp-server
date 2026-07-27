import { describe, it, expect, vi } from "vitest";
import { executeAction, pickFields } from "../../src/tools/execute-action.js";
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

    const result = await executeAction(entries, config, "list_environments", {}, undefined, mockFetch);

    expect(result).toEqual({ environments: ["prod", "staging"] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns error for unknown action ID", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "nonexistent_action", {}, undefined, mockFetch);

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
    }, undefined, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trails/test-org/my-flow/v1.0"),
      expect.anything(),
    );
  });

  it("applies field selection to the response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { name: "prod", type: "ECS", description: "Production", tags: {} },
        { name: "staging", type: "ECS", description: "Staging", tags: {} },
      ]),
    });

    const result = await executeAction(
      entries, config, "list_environments", {},
      ["name", "type"],
      mockFetch,
    );

    expect(result).toEqual([
      { name: "prod", type: "ECS" },
      { name: "staging", type: "ECS" },
    ]);
  });

  it("returns full response when fields is undefined", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ name: "prod", type: "ECS", tags: {} }),
    });

    const result = await executeAction(entries, config, "list_environments", {}, undefined, mockFetch);

    expect(result).toEqual({ name: "prod", type: "ECS", tags: {} });
  });

  it("rejects write action in GET mode", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "put_policy", {}, undefined, mockFetch, "GET");

    expect(result).toEqual({
      error: true,
      message: 'Action "put_policy" is a PUT operation. Use execute_write_action instead.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects read action in WRITE mode", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", {}, undefined, mockFetch, "WRITE");

    expect(result).toEqual({
      error: true,
      message: 'Action "list_environments" is a GET operation. Use execute_read_action instead.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows GET action in GET mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: [] }),
    });

    const result = await executeAction(entries, config, "list_environments", {}, undefined, mockFetch, "GET");

    expect(result).toEqual({ environments: [] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("allows write action in WRITE mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policy: "created" }),
    });

    const result = await executeAction(entries, config, "put_policy", {}, undefined, mockFetch, "WRITE");

    expect(result).toEqual({ policy: "created" });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("preserves error responses when fields is set (does not strip to {})", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({ message: "Environment not found" }),
    });

    const result = await executeAction(
      entries, config, "list_environments", {},
      ["name", "type"],
      mockFetch,
    );

    expect(result).toEqual({
      error: true,
      status: 404,
      statusText: "Not Found",
      message: "Environment not found",
    });
  });
});

describe("pickFields", () => {
  it("picks specified fields from an object", () => {
    const data = { name: "prod", type: "ECS", description: "long text", tags: {} };
    expect(pickFields(data, ["name", "type"])).toEqual({ name: "prod", type: "ECS" });
  });

  it("picks fields from each item in an array", () => {
    const data = [
      { name: "a", value: 1, extra: "x" },
      { name: "b", value: 2, extra: "y" },
    ];
    expect(pickFields(data, ["name", "value"])).toEqual([
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ]);
  });

  it("ignores fields that don't exist", () => {
    const data = { name: "prod" };
    expect(pickFields(data, ["name", "missing"])).toEqual({ name: "prod" });
  });

  it("returns primitives unchanged", () => {
    expect(pickFields("hello", ["name"])).toBe("hello");
    expect(pickFields(42, ["name"])).toBe(42);
    expect(pickFields(null, ["name"])).toBe(null);
  });

  it("handles nested arrays", () => {
    const data = [
      { name: "env", artifacts: [{ name: "art1", fp: "abc" }] },
    ];
    expect(pickFields(data, ["name", "artifacts"])).toEqual([
      { name: "env", artifacts: [{ name: "art1", fp: "abc" }] },
    ]);
  });
});

describe("request body unwrapping", () => {
  const jsonBody = { identifier: "ctrl-1", name: "Control 1" };

  function mockFetchOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ created: true }),
    });
  }

  it("unwraps params nested under a body key for JSON write actions", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "post_control", { body: jsonBody }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/test-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("still accepts body fields spread at the top level", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "post_control", { ...jsonBody }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/test-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("unwraps when path params accompany the body key", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "post_control", { org: "other-org", body: jsonBody }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/other-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("does not unwrap when an undeclared sibling key is present", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "post_control", { body: jsonBody, extra: 1 }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ body: jsonBody, extra: 1 }) }),
    );
  });

  it("does not unwrap when the request body schema declares a body property", async () => {
    const entry: CatalogEntry = {
      id: "post_with_body_prop",
      method: "POST",
      path: "/things/{org}",
      summary: "Create a thing",
      description: "",
      tags: [],
      parameters: [{ name: "org", in: "path", required: true, description: "" }],
      requestBody: [{
        name: "body",
        required: true,
        description: "Request body (application/json)",
        schema: { type: "object", properties: { body: { type: "string" } } },
      }],
      searchText: "create a thing",
    };
    const mockFetch = mockFetchOk();

    await executeAction([entry], config, "post_with_body_prop", { body: { body: "text" } }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ body: { body: "text" } }) }),
    );
  });

  it("leaves non-object body values alone", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "post_control", { body: "not-an-object" }, undefined, mockFetch, "WRITE");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ body: "not-an-object" }) }),
    );
  });
});
