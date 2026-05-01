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
| `KOSLI_READ_WRITE` | no | — | Set to `true` to enable write operations (POST, PUT, DELETE). The server is **read-only by default**. |

## Wire up to an MCP client

### Claude Code

Run this from your project directory (or use `--scope user` for global):

```bash
claude mcp add kosli -e KOSLI_API_TOKEN=your-token -e KOSLI_ORG=your-org -- npx -y @kosli/mcp-server
```

### Claude Desktop

Add the following to your `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "kosli": {
      "command": "npx",
      "args": ["-y", "@kosli/mcp-server"],
      "env": {
        "KOSLI_API_TOKEN": "your-token",
        "KOSLI_ORG": "your-org"
      }
    }
  }
}
```

### Other MCP clients

The server communicates over stdio. Point any MCP-compatible client at the package via `npx -y @kosli/mcp-server` and set the `KOSLI_API_TOKEN` and `KOSLI_ORG` environment variables.

### Local checkout

If you're running from a local checkout instead:

```json
{
  "mcpServers": {
    "kosli": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "KOSLI_API_TOKEN": "your-token",
        "KOSLI_ORG": "your-org"
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

`execute_action` accepts an optional `fields` array to request only specific top-level fields from each object in the response. This dramatically reduces response size and token usage:

```json
{
  "actionId": "get_snapshot_snapshots__org___env_name___snapshot_expression__get",
  "params": { "env_name": "prod-aws", "snapshot_expression": "-1" },
  "fields": ["name", "compliant", "fingerprint", "reasons_for_incompliance"]
}
```

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
