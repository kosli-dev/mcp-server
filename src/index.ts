import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchActions } from "./tools/search-actions.js";
import { executeAction } from "./tools/execute-action.js";
import catalog from "./catalog.json" with { type: "json" };
import type { CatalogEntry } from "./types.js";

const entries = catalog as CatalogEntry[];
const config = loadConfig();

const server = new McpServer({
  name: "kosli",
  version: "0.1.0",
});

server.tool(
  "search_actions",
  "Search for available Kosli API actions by natural-language query. Returns matching actions with their IDs, descriptions, and parameter schemas. Use this to discover what actions are available before calling execute_action.",
  {
    query: z.string().describe("Natural-language search query (e.g. 'list environments', 'get trail', 'search artifacts')"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return"),
  },
  async ({ query, limit }) => {
    const results = searchActions(entries, query, limit);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results),
        },
      ],
    };
  },
);

server.tool(
  "execute_action",
  "Execute a Kosli API action by its ID with the given parameters. Use search_actions first to find the action ID and required parameters.",
  {
    actionId: z.string().describe("The action ID from search_actions results"),
    params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the action (path params, query params, or body)"),
    fields: z.array(z.string()).optional().describe("Only include these fields in each object of the response. Dramatically reduces response size. Example: [\"name\",\"compliant\",\"fingerprint\",\"reasons_for_incompliance\"]"),
  },
  async ({ actionId, params, fields }) => {
    const result = await executeAction(entries, config, actionId, params, fields);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
