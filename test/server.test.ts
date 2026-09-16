import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { Config } from "../src/types.js";

// The registered tools are what a client actually sees, so this covers the
// wiring: a schema that no longer admits `org`, or a handler wired to the wrong
// mode, is invisible to a test of executeAction alone.
const config: Config = {
  apiKey: "test-key",
  baseUrl: "https://app.kosli.com",
};

const fetchMock = vi.fn();
let client: Client;

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  client = new Client({ name: "test", version: "0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer(config).connect(serverSide), client.connect(clientSide)]);
});

afterEach(() => fetchMock.mockReset());

function respondOk() {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
}

describe("createServer", () => {
  it("offers org on both execute tools and on neither other input", async () => {
    const { tools } = await client.listTools();
    const inputs = Object.fromEntries(
      tools.map((t) => [t.name, Object.keys(t.inputSchema.properties ?? {})]),
    );

    expect(inputs.execute_read_action).toContain("org");
    expect(inputs.execute_write_action).toContain("org");
    expect(inputs.search_actions).not.toContain("org");
  });

  it("sends the org a client supplies", async () => {
    respondOk();

    await client.callTool({
      name: "execute_read_action",
      arguments: { actionId: "list_environments", org: "cyber-dojo" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo",
      expect.anything(),
    );
  });

  // params carries every path segment and the whole request body, so a handler
  // that forwarded everything except params would still pass the org tests.
  it("passes params through to the request", async () => {
    respondOk();

    await client.callTool({
      name: "execute_read_action",
      arguments: {
        actionId: "get_environment",
        org: "cyber-dojo",
        params: { env_name: "aws-prod" },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.kosli.com/api/v2/environments/cyber-dojo/aws-prod",
      expect.anything(),
    );
  });

  it("refuses a call that names no org, rather than choosing one", async () => {
    const result = await client.callTool({
      name: "execute_read_action",
      arguments: { actionId: "list_environments" },
    });

    expect(JSON.stringify(result.content)).toContain("none was named");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a null org as not supplied, rather than rejecting it at the schema", async () => {
    respondOk();

    const result = await client.callTool({
      name: "execute_read_action",
      arguments: { actionId: "list_environments", org: null },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("none was named");
  });

  it("passes fields through, and returns the result as compact JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ name: "prod", type: "ECS" }]),
    });

    const result = await client.callTool({
      name: "execute_read_action",
      arguments: { actionId: "list_environments", org: "cyber-dojo", fields: ["name"] },
    });

    expect(result.content).toEqual([{ type: "text", text: '[{"name":"prod"}]' }]);
  });

  it("keeps writes out of the read tool", async () => {
    const result = await client.callTool({
      name: "execute_read_action",
      arguments: { actionId: "create_control", org: "cyber-dojo" },
    });

    expect(JSON.stringify(result.content)).toContain("Use execute_write_action instead");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
