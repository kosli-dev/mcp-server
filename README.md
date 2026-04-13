# Kosli MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [Kosli](https://kosli.com) API to LLM clients (Claude Code, Claude Desktop, etc.).

Rather than hand-coding a tool per endpoint, the server ships a catalog generated from Kosli's OpenAPI spec and exposes two generic tools:

- **`search_actions`** — fuzzy-search the catalog for relevant API actions by natural-language query.
- **`execute_action`** — invoke any action by ID with parameters (path, query, or body).

This keeps the tool surface small and lets the catalog stay in sync with the Kosli API by regenerating.

## Requirements

- Node.js ≥ 20
- A Kosli API token

## Install & build

```bash
npm install
npm run build
```

## Configure

The server reads configuration from environment variables:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `KOSLI_API_TOKEN` | yes | — | Preferred. `KOSLI_API_KEY` is accepted as a fallback. |
| `KOSLI_ORG` | yes | — | Default org used when a path param `org` is not supplied. |
| `KOSLI_BASE_URL` | no | `https://app.kosli.com` | Override for self-hosted instances. |

## Wire up to an MCP client

Example `.mcp.json`:

```json
{
  "mcpServers": {
    "kosli": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "KOSLI_API_TOKEN": "${KOSLI_API_TOKEN}",
        "KOSLI_ORG": "${KOSLI_ORG}"
      }
    }
  }
}
```

## Usage

Typical LLM flow:

1. Call `search_actions` with a natural-language query (e.g. `"list environments"`) to discover action IDs and their parameter schemas.
2. Call `execute_action` with the chosen `actionId` and a `params` object.

The `org` path parameter defaults to `KOSLI_ORG` if not supplied. For `GET`/`DELETE`, non-path params become query parameters; for other methods they become the JSON body.

## Regenerate the catalog

`src/catalog.json` is committed and bundled into the build. Refresh it from the live OpenAPI spec with:

```bash
npm run generate-catalog
```

## Development

```bash
npm test             # run the test suite (vitest)
npm run test:watch   # watch mode
npm run build        # compile to dist/
npm start            # run the built server over stdio
```

## Layout

```
src/
  index.ts              # MCP server entry point (stdio transport)
  config.ts             # env-var loading
  types.ts              # shared types (CatalogEntry, Config, …)
  catalog.json          # generated action catalog
  client/kosli-client.ts
  tools/search-actions.ts
  tools/execute-action.ts
scripts/
  generate-catalog.ts   # fetches OpenAPI spec → catalog.json
test/                   # vitest specs mirroring src/
```
