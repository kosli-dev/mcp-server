import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { VERSION } from "../../src/version.js";
import { KosliClient } from "../../src/client/kosli-client.js";
import type { CatalogEntry, Config } from "../../src/types.js";

const config: Config = {
  apiKey: "test-api-key",
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

const putPolicyEntry: CatalogEntry = {
  id: "create_or_update_policy",
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
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new KosliClient(config, mockFetch);
  });

  it("fills the org path segment from params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ environments: [] }),
    });

    await client.execute(listEnvEntry, { org: "test-org" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/test-org",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "User-Agent": `kosli-mcp-server/${VERSION}`,
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
      org: "test-org",
      flow_name: "my-flow",
      trail_name: "my-trail",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/trails/test-org/my-flow/my-trail",
      expect.anything(),
    );
  });

  // The client knows nothing about orgs: executeAction refuses a call that names
  // none, and if that check were ever bypassed this must fail rather than pick.
  it("has no org of its own to fall back on", async () => {
    const mockFetch = vi.fn();
    const client = new KosliClient(config, mockFetch);

    const result = await client.execute(listEnvEntry, {});

    expect(result).toMatchObject({ error: true, message: expect.stringContaining("Missing required path parameter: org") });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns structured error on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({ message: "Environment not found" }),
    });

    const result = await client.execute(listEnvEntry, { org: "test-org" });

    expect(result).toEqual({
      error: true,
      status: 404,
      statusText: "Not Found",
      message: "Environment not found",
    });
  });

  it("returns structured error on network failure without leaking raw error detail", async () => {
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443"));

    const result = await client.execute(listEnvEntry, { org: "test-org" });

    expect(result).toEqual({
      error: true,
      status: 0,
      statusText: "Network Error",
      message: "Request failed before reaching the Kosli API",
    });
    // Specifically: the internal IP from the raw error must not surface.
    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
  });

  // The realistic cause is a proxy or sign-in page answering instead of the API.
  it("says the body was not JSON, rather than blaming the network", async () => {
    mockFetch.mockResolvedValue(new Response("<html>", { status: 200 }));

    const result = await client.execute(listEnvEntry, { org: "test-org" });

    expect(result).toEqual({
      error: true,
      status: 200,
      statusText: "Invalid Response",
      message: "The Kosli API returned a body that is not JSON",
    });
  });

  it("returns structured error on missing required path param (does not throw)", async () => {
    const result = await client.execute(getTrailEntry, { org: "test-org", flow_name: "my-flow" });

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
        org: "test-org",
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
        "User-Agent": `kosli-mcp-server/${VERSION}`,
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
        org: "test-org",
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
        org: "test-org",
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

      await client.execute(createFlowJsonEntry, { org: "test-org", name: "my-flow" });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toBe('{"name":"my-flow"}');
      expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    });
  });

  describe("redirects", () => {
    const signedUrl = "https://app.kosli.com/downloads/evidence/sbom.json?X-Amz-Signature=abc";

    function redirectTo(location: string | null) {
      const headers = location === null ? undefined : { location };
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers }));
    }

    it("follows the redirect without our token, and returns a text file as text", async () => {
      redirectTo(signedUrl);
      mockFetch.mockResolvedValueOnce(
        new Response('{"bomFormat":"CycloneDX"}', {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );

      const result = await client.execute(getTrailEntry, {
        org: "test-org",
        flow_name: "my-flow",
        trail_name: "my-trail",
      });

      expect(result).toBe('{"bomFormat":"CycloneDX"}');
      expect(mockFetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
      const [url, init] = mockFetch.mock.calls[1];
      expect(url).toBe(signedUrl);
      expect(init.headers).toEqual({ "User-Agent": `kosli-mcp-server/${VERSION}` });
    });

    it("returns an error for a binary file instead of decoding it", async () => {
      redirectTo(signedUrl);
      const file = new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
        headers: { "content-type": "application/octet-stream" },
      });
      mockFetch.mockResolvedValueOnce(file);

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({ error: true, status: 0, statusText: "Not Plain Text" });
      expect(file.bodyUsed).toBe(false);
    });

    // A proxy can redirect to its sign-in page, which must not reach the model.
    it("returns an error for an HTML page instead of its markup", async () => {
      redirectTo("https://sso.example.com/login");
      const page = new Response("<html><form>", { headers: { "content-type": "text/html" } });
      mockFetch.mockResolvedValueOnce(page);

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({ error: true, status: 0, statusText: "Not Plain Text" });
      expect(page.bodyUsed).toBe(false);
    });

    // An object store's error body can echo the request back, so it is never read.
    it("returns the status of a failed download without reading its body", async () => {
      redirectTo(signedUrl);
      // HTTP/2 has no reason phrase, so statusText can be empty.
      const file = new Response("<Error>...</Error>", {
        status: 403,
        statusText: "",
        headers: { "content-type": "application/xml" },
      });
      mockFetch.mockResolvedValueOnce(file);

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toEqual({
        error: true,
        status: 403,
        statusText: "",
        message: "Following the Kosli API's redirect failed with status 403. The API token is not sent on a redirect.",
      });
      expect(file.bodyUsed).toBe(false);
    });

    it("returns structured error when the download fails on the network", async () => {
      redirectTo(signedUrl);
      mockFetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({ error: true, statusText: "Network Error" });
    });

    it("resolves a relative Location against the request URL", async () => {
      redirectTo("/downloads/evidence/sbom.json?X-Amz-Signature=abc");
      mockFetch.mockResolvedValueOnce(new Response("ok", { headers: { "content-type": "text/plain" } }));

      await client.execute(listEnvEntry, { org: "test-org" });

      expect(mockFetch.mock.calls[1][0]).toBe(signedUrl);
    });

    it("refuses a redirect to plain http", async () => {
      redirectTo("http://app.kosli.com/downloads/evidence/sbom.json");

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({ error: true, status: 0, statusText: "Insecure Redirect" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // A write that redirects must be replayed by fetch, not turned into a GET.
    it("leaves redirects on a write to fetch", async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({}) });

      await client.execute(createFlowJsonEntry, { org: "test-org", name: "my-flow" });

      expect(mockFetch.mock.calls[0][1]).not.toHaveProperty("redirect");
    });

    it("says a Location that cannot be parsed is a bad redirect", async () => {
      redirectTo("http://[");

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({
        error: true,
        status: 302,
        message: "The Kosli API redirected to a URL that cannot be parsed",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns an error for a redirect with no Location", async () => {
      redirectTo(null);

      const result = await client.execute(listEnvEntry, { org: "test-org" });

      expect(result).toMatchObject({ error: true, status: 302 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
