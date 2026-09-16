import { describe, it, expect, vi } from "vitest";
import { executeAction, pickFields } from "../../src/tools/execute-action.js";
import catalog from "../fixtures/catalog-subset.json" with { type: "json" };
import type { CatalogEntry, Config } from "../../src/types.js";

const entries = catalog as CatalogEntry[];
const config: Config = {
  apiKey: "test-key",
  baseUrl: "https://app.kosli.com",
};

describe("executeAction", () => {
  it("finds the action and calls the client", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: ["prod", "staging"] }),
    });

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fetchFn: mockFetch });

    expect(result).toEqual({ environments: ["prod", "staging"] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns error for unknown action ID", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "nonexistent_action", {}, { fetchFn: mockFetch });

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

    await executeAction(entries, config, "get_trail", { flow_name: "my-flow",
      trail_name: "v1.0", org: "test-org" }, { fetchFn: mockFetch });

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

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fields: ["name", "type"], fetchFn: mockFetch });

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

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fetchFn: mockFetch });

    expect(result).toEqual({ name: "prod", type: "ECS", tags: {} });
  });

  it("rejects write action in GET mode", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "create_or_update_policy", { org: "test-org" }, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({
      error: true,
      message: 'Action "create_or_update_policy" is a PUT operation. Use execute_write_action instead.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects read action in WRITE mode", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

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

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({ environments: [] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("allows write action in WRITE mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policy: "created" }),
    });

    const result = await executeAction(entries, config, "create_or_update_policy", { org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

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

    const result = await executeAction(entries, config, "list_environments", { org: "test-org" }, { fields: ["name", "type"], fetchFn: mockFetch });

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

    await executeAction(entries, config, "create_control", { body: jsonBody, org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/test-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("still accepts body fields spread at the top level", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "create_control", { ...jsonBody, org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/test-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("unwraps when path params accompany the body key", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "create_control", { org: "other-org", body: jsonBody }, { fetchFn: mockFetch, mode: "WRITE" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/controls/other-org"),
      expect.objectContaining({ body: JSON.stringify(jsonBody) }),
    );
  });

  it("does not unwrap when an undeclared sibling key is present", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "create_control", { body: jsonBody, extra: 1, org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

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

    await executeAction([entry], config, "post_with_body_prop", { body: { body: "text" }, org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ body: { body: "text" } }) }),
    );
  });

  it("leaves non-object body values alone", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "create_control", { body: "not-an-object", org: "test-org" }, { fetchFn: mockFetch, mode: "WRITE" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ body: "not-an-object" }) }),
    );
  });
});

describe("org selection", () => {
  function mockFetchOk(body: unknown = { ok: true }) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }

  it("targets the org given as the org parameter", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", {}, { fetchFn: mockFetch, mode: "GET", org: "cyber-dojo" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  it("still accepts an org supplied inside params", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", { org: "cyber-dojo" }, { fetchFn: mockFetch, mode: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  it("accepts the same org in both places", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", { org: "cyber-dojo" }, { fetchFn: mockFetch, mode: "GET", org: "cyber-dojo" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  it("rejects conflicting orgs without calling the API", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", { org: "kosli-public" }, { fetchFn: mockFetch, mode: "GET", org: "cyber-dojo" });

    expect(result).toEqual({
      error: true,
      message:
        'Conflicting orgs in one call: "cyber-dojo" and "kosli-public". The org parameter and params.org must agree — supply just one.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a blank org rather than building a URL with a missing segment", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", {}, { fetchFn: mockFetch, mode: "GET", org: "  " });

    expect(result).toEqual({
      error: true,
      message:
        "The org must be a single organization name, given as a non-empty string. Check the org parameter and params.org.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects an org on an action that is not organization-scoped", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "get_user_default_org", {}, { fetchFn: mockFetch, mode: "GET", org: "cyber-dojo" });

    expect(result).toEqual({
      error: true,
      message:
        'Action "get_user_default_org" is not organization-scoped — it takes no org. Retry with no org in the org parameter and none in params.org.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls a non-org-scoped action when no org is given", async () => {
    const mockFetch = mockFetchOk({ default_org_name: "test-org" });

    const result = await executeAction(entries, config, "get_user_default_org", {}, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({ default_org_name: "test-org" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/user/default-org",
      expect.anything(),
    );
  });

  it("trims a padded org rather than encoding the padding into the path", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", {}, { fetchFn: mockFetch, mode: "GET", org: "  cyber-dojo  " });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  it("applies the same trimming to an org supplied inside params", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", { org: "  cyber-dojo  " }, { fetchFn: mockFetch, mode: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  it("rejects a blank org supplied inside params, rather than dropping the path segment", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", { org: "" }, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({
      error: true,
      message:
        "The org must be a single organization name, given as a non-empty string. Check the org parameter and params.org.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses an org-scoped call that names no org, rather than choosing one", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(
      entries, config, "list_environments", {},
      { fetchFn: mockFetch, mode: "GET" },
    );

    expect(result).toEqual({
      error: true,
      message:
        'Action "list_environments" runs against one organization and none was named. Set the org parameter. There is no default, so that no call lands somewhere the caller did not choose.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("treats a null org as naming none at all", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(
      entries, config, "list_environments", { org: null },
      { fetchFn: mockFetch, mode: "GET", org: null },
    );

    expect(result).toEqual({
      error: true,
      message:
        'Action "list_environments" runs against one organization and none was named. Set the org parameter. There is no default, so that no call lands somewhere the caller did not choose.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a list of orgs", ["cyber-dojo", "kosli-public"]],
    ["a number, which could name a real org", 1234],
  ])("rejects %s rather than coercing it into the path", async (_label, org) => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", { org }, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({
      error: true,
      message:
        "The org must be a single organization name, given as a non-empty string. Check the org parameter and params.org.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports the unusable value, not a disagreement, when a real org is named too", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "list_environments", { org: [] }, { fetchFn: mockFetch, mode: "GET", org: "cyber-dojo" });

    expect(result).toEqual({
      error: true,
      message:
        "The org must be a single organization name, given as a non-empty string. Check the org parameter and params.org.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects an org supplied only inside params for a non-org-scoped action", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(entries, config, "get_user_default_org", { org: "cyber-dojo" }, { fetchFn: mockFetch, mode: "GET" });

    expect(result).toEqual({
      error: true,
      message:
        'Action "get_user_default_org" is not organization-scoped — it takes no org. Retry with no org in the org parameter and none in params.org.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["with only the body naming it", {}],
    ["with an undeclared sibling blocking the unwrap", { extra: 1 }],
    ["with the org also named at the top level", { org: "cyber-dojo" }],
  ])("refuses an org inside a write's request body, %s", async (_label, extra) => {
    const mockFetch = vi.fn();

    const result = await executeAction(
      entries, config, "create_control",
      { ...extra, body: { org: "other-org", identifier: "ctrl-1" } },
      { fetchFn: mockFetch, mode: "WRITE" },
    );

    expect(result).toEqual({
      error: true,
      message:
        'The request body names "org", which is also a parameter of "create_control". Supply it once, outside the body.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Not org-specific: a body field named after any declared parameter would
  // redirect the request while the approval prompt showed the caller's value.
  it("refuses a body field that collides with any other declared parameter", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(
      entries, config, "create_artifact",
      { flow_name: "caller-flow", body: { flow_name: "body-flow", fingerprint: "f" } },
      { fetchFn: mockFetch, mode: "WRITE", org: "cyber-dojo" },
    );

    expect(result).toEqual({
      error: true,
      message:
        'The request body names "flow_name", which is also a parameter of "create_artifact". Supply it once, outside the body.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("names every colliding field, not just the first", async () => {
    const mockFetch = vi.fn();

    const result = await executeAction(
      entries, config, "create_artifact",
      { body: { org: "o", flow_name: "f", fingerprint: "x" } },
      { fetchFn: mockFetch, mode: "WRITE", org: "cyber-dojo" },
    );

    expect(result).toEqual({
      error: true,
      message:
        'The request body names "org" and "flow_name", which are also parameters of "create_artifact". Supply them once, outside the body.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a request body that happens to contain a field called error", async () => {
    const mockFetch = mockFetchOk({ created: true });

    await executeAction(
      entries, config, "create_control",
      { body: { identifier: "ctrl-1", error: "not ours" } },
      { fetchFn: mockFetch, mode: "WRITE", org: "cyber-dojo" },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/controls/cyber-dojo",
      expect.objectContaining({ body: JSON.stringify({ identifier: "ctrl-1", error: "not ours" }) }),
    );
  });

  it("targets the org on a multipart write without adding it as a form field", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "create_or_update_policy", { body: { name: "policy-1" } }, { fetchFn: mockFetch, mode: "WRITE", org: "cyber-dojo" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://app.kosli.com/api/v2/policies/cyber-dojo");
    expect([...(init.body as FormData).keys()]).toEqual(["name"]);
  });

  // KosliClient's JSON-body branch counts keys without filtering undefined, so
  // an always-present org key would turn a bodyless write into one sending {}.
  it("sends no body for a write on an action that takes no org", async () => {
    const bodyless: CatalogEntry = {
      id: "bodyless_write", method: "POST", path: "/user/ping",
      summary: "", description: "", tags: [], parameters: [], requestBody: null,
      searchText: "bodyless write",
    };
    const mockFetch = mockFetchOk();

    await executeAction([bodyless], config, "bodyless_write", {}, { fetchFn: mockFetch, mode: "WRITE" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it("drops a null org instead of forwarding it as a query parameter", async () => {
    const mockFetch = mockFetchOk({ default_org_name: "test-org" });

    await executeAction(entries, config, "get_user_default_org", { org: null }, { fetchFn: mockFetch, mode: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/user/default-org",
      expect.anything(),
    );
  });

  // buildUrl's encodeURIComponent is the only thing keeping this one segment.
  it("encodes an org rather than letting it rewrite the path", async () => {
    const mockFetch = mockFetchOk();

    await executeAction(entries, config, "list_environments", {}, { fetchFn: mockFetch, mode: "GET", org: "../../user/default-org" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/..%2F..%2Fuser%2Fdefault-org",
      expect.anything(),
    );
  });

  it("applies to writes, and the org does not leak into the request body", async () => {
    const mockFetch = mockFetchOk({ created: true });
    const body = { identifier: "ctrl-1", name: "Control 1" };

    await executeAction(entries, config, "create_control", { body }, { fetchFn: mockFetch, mode: "WRITE", org: "cyber-dojo" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/controls/cyber-dojo",
      expect.objectContaining({ body: JSON.stringify(body) }),
    );
  });
});
