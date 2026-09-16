import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchActions } from "./tools/search-actions.js";
import { executeAction, type ToolMode } from "./tools/execute-action.js";
import catalog from "./catalog.json" with { type: "json" };
import hints from "./hints.json" with { type: "json" };
import type { CatalogEntry, ActionHints, Config } from "./types.js";
import { VERSION } from "./version.js";

const entries = catalog as CatalogEntry[];

/** Builds the server with its three tools registered. */
export function createServer(config: Config) {
  const ORG_INPUT = z.string().nullable().optional().describe(
    'Kosli organization to run this call against, e.g. "cyber-dojo". Required for every action whose path contains {org}, which is all but four of them. There is no default: a call that names no org is refused rather than sent somewhere you did not choose.',
  );

  const run = (mode: ToolMode) =>
    async ({ actionId, params, fields, org }: {
      actionId: string;
      params: Record<string, unknown>;
      fields?: string[];
      org?: string | null;
    }) => ({
      content: [{
        type: "text" as const,
        text: JSON.stringify(
          await executeAction(entries, config, actionId, params, { fields, mode, org }),
        ),
      }],
    });

  const server = new McpServer({
    name: "kosli",
    version: VERSION,
  });

  server.registerTool(
    "search_actions",
    {
      title: "Search actions",
      description: "Search for available Kosli API actions by natural-language query. Returns matching actions with their IDs, descriptions, and parameter schemas. Use this to discover what actions are available before calling execute_read_action or execute_write_action.",
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
      description: "Execute a read-only (GET) Kosli API action by its ID with the given parameters. Use search_actions first to find the action ID and required parameters. Set 'org' to say which organization the call runs against; there is no default.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        actionId: z.string().describe("The action ID from search_actions results"),
        org: ORG_INPUT,
        params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the action (path params or query params)"),
        fields: z.array(z.string()).optional().describe("Only include these fields in each object of the response. Dramatically reduces response size. Example: [\"name\",\"compliant\",\"fingerprint\",\"reasons_for_incompliance\"]"),
      },
    },
    run("GET"),
  );

  server.registerTool(
    "execute_write_action",
    {
      title: "Execute write action",
      description: "Execute a write (POST, PUT, PATCH, DELETE) Kosli API action by its ID with the given parameters. Use search_actions first to find the action ID and required parameters. Set 'org' to say which organization the write lands in; there is no default, so check it before approving.",
      annotations: {
        destructiveHint: true,
        readOnlyHint: false,
      },
      inputSchema: {
        actionId: z.string().describe("The action ID from search_actions results"),
        org: ORG_INPUT,
        params: z.record(z.string(), z.unknown()).optional().default({}).describe("Parameters for the action (path params, query params, or body)"),
        fields: z.array(z.string()).optional().describe("Only include these fields in each object of the response. Dramatically reduces response size."),
      },
    },
    run("WRITE"),
  );

  return server;
}
