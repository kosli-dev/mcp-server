#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchActions } from "./tools/search-actions.js";
import { executeAction } from "./tools/execute-action.js";
import catalog from "./catalog.json" with { type: "json" };
import hints from "./hints.json" with { type: "json" };
import type { CatalogEntry, ActionHints } from "./types.js";
import { VERSION } from "./version.js";

const entries = catalog as CatalogEntry[];
const config = loadConfig();

const server = new McpServer({
  name: "kosli",
  version: VERSION,
});

server.registerTool(
  "search_actions",
  {
    title: "Search actions",
    description: `Search for available Kosli API actions by natural-language query. Returns matching actions with their IDs, descriptions, and parameter schemas. Use this to discover what actions are available before calling execute_read_action or execute_write_action. The configured Kosli org is "${config.org}".`,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: {
      query: z.string().describe("Natural-language search query (e.g. 'list environments', 'get trail', 'search artifacts')"),
      limit: z.number().optional().default(10).describe("Maximum number of results to return"),
    },
  },
  async ({ query, limit }) => {
    const results = searchActions(entries, query, limit, hints as ActionHints);
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

server.registerTool(
  "execute_read_action",
  {
    title: "Execute read action",
    description: `Execute a read-only (GET) Kosli API action by its ID with the given parameters. Use search_actions first to find the action ID and required parameters. The 'org' parameter defaults to "${config.org}" — you do not need to supply it unless querying a different organization.`,
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: {
      actionId: z.string().describe("The action ID from search_actions results"),
      params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the action (path params or query params)"),
      fields: z.array(z.string()).optional().describe("Only include these fields in each object of the response. Dramatically reduces response size. Example: [\"name\",\"compliant\",\"fingerprint\",\"reasons_for_incompliance\"]"),
    },
  },
  async ({ actionId, params, fields }) => {
    const result = await executeAction(entries, config, actionId, params, fields, undefined, "GET");
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

server.registerTool(
  "execute_write_action",
  {
    title: "Execute write action",
    description: `Execute a write (POST, PUT, PATCH, DELETE) Kosli API action by its ID with the given parameters. Use search_actions first to find the action ID and required parameters. The 'org' parameter defaults to "${config.org}" — you do not need to supply it unless querying a different organization.`,
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
    },
    inputSchema: {
      actionId: z.string().describe("The action ID from search_actions results"),
      params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the action (path params, query params, or body)"),
      fields: z.array(z.string()).optional().describe("Only include these fields in each object of the response. Dramatically reduces response size."),
    },
  },
  async ({ actionId, params, fields }) => {
    const result = await executeAction(entries, config, actionId, params, fields, undefined, "WRITE");
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
