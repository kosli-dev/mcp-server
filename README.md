# Kosli MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [Kosli](https://kosli.com) API to LLM clients (Claude Code, Claude Desktop, etc.).

> [!WARNING]
> **This server is in beta.** Tool names, parameters, and behaviour may change between releases. If you need stability, pin a version — e.g. `npx -y @kosli/mcp-server@0.4.0` instead of `npx -y @kosli/mcp-server`.

Rather than hand-coding a tool per endpoint, the server ships a catalog generated from Kosli's OpenAPI spec and exposes three generic tools:

- **`search_actions`** — fuzzy-search the catalog for relevant API actions by natural-language query.
- **`execute_read_action`** — invoke any GET action by ID (read-only, auto-allowed by MCP clients).
- **`execute_write_action`** — invoke any POST/PUT/PATCH/DELETE action by ID (requires approval in MCP clients — see [the caution under Usage](#usage)).

This keeps the tool surface small and lets the catalog stay in sync with the Kosli API by regenerating. MCP clients use the tool annotations to auto-allow reads while gating writes behind user approval.

## Requirements

- Node.js ≥ 22
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
| `KOSLI_BASE_URL` | no | `https://app.kosli.com` | EU (default), US (`https://app.us.kosli.com`), or your single-tenant endpoint. |

## Wire up to an MCP client

### Claude Code

Run this from your project directory (or use `--scope user` for global):

```bash
claude mcp add kosli \
  -e KOSLI_API_TOKEN=your-token \
  -- npx -y @kosli/mcp-server
```

### Claude Desktop (Desktop Extension)

Download the latest `.mcpb` file from [Releases](https://github.com/kosli-dev/mcp-server/releases), then drag it into Claude Desktop or double-click to install. Claude Desktop will prompt you for your API token. This is the recommended method for Claude Desktop as secrets are stored in the OS keychain rather than in a plain-text config file.

> [!NOTE]
> When installing from a `.mcpb` file, Claude Desktop shows a warning that the extension has not been verified by Anthropic. This is expected for any extension installed from a file rather than from the built-in directory. Sideloaded extensions also do not auto-update — you'll need to download and reinstall new versions manually. Both of these limitations go away once the extension is listed in Anthropic's [Connectors Directory](https://claude.com/docs/connectors/building/submission).

### Claude Desktop (manual)

Alternatively, add the following to your `claude_desktop_config.json` (Settings → Developer → Edit Config). This method auto-updates via `npx` on each restart, but stores secrets in plain text:

```json
{
  "mcpServers": {
    "kosli": {
      "command": "npx",
      "args": ["-y", "@kosli/mcp-server"],
      "env": {
        "KOSLI_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Other MCP clients

The server communicates over stdio. Point any MCP-compatible client at the package via `npx -y @kosli/mcp-server` and set the `KOSLI_API_TOKEN` environment variable.

### Local checkout

If you're running from a local checkout instead:

```json
{
  "mcpServers": {
    "kosli": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "KOSLI_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Usage

Typical LLM flow:

1. Call `search_actions` with a natural-language query (e.g. `"list environments"`) to discover action IDs and their parameter schemas.
2. Call `execute_read_action` (for GET actions) or `execute_write_action` (for POST/PUT/PATCH/DELETE) with the chosen `actionId` and a `params` object.

> [!IMPORTANT]
> `execute_write_action` creates, modifies, and deletes real resources in your Kosli organization. MCP clients gate these calls behind an approval prompt — read the action ID and parameters before approving. An LLM may select the wrong action, or the right action with the wrong parameters, and approval is the only checkpoint before the call is made. Treat deletions and anything touching service accounts or API keys with particular care.

For `GET`/`DELETE`, non-path params become query parameters; for other methods they become the JSON body.

### Naming the organization

Both execute tools take an `org`, so one running server reaches any organization
your token has access to:

```json
{ "actionId": "list_environments", "org": "cyber-dojo", "fields": ["name"] }
```

It is required for every action whose path contains `{org}`, which is all but
four of them. There is no configured default: a call that names no org is
refused rather than sent to one nobody chose.

`KOSLI_ORG` used to supply that default and has been removed. A config that
still sets it starts fine, the value is ignored, and the server says so on
stderr.

An org can also arrive as `params.org`. The two must agree: two different names
are rejected rather than resolved, since the same tools perform writes.

A write's request body may not name any of the action's own parameters, `org`
included. Such a field would overwrite what you supplied and send the request
somewhere else, while the approval prompt still showed your value.

The org must be one name, given as a non-empty string. Anything else is rejected
rather than coerced, because coercing invents a name: `["cyber-dojo",
"kosli-public"]` would request the org `cyber-dojo,kosli-public`.

Four actions are not organization-scoped: `get_user_default_org`,
`list_system_attestation_types`, and the two `/schemas/...` actions. Passing an
org to one of those is rejected rather than ignored.

An org your token cannot reach returns the usual error object with the API's
status, `403` for both a non-member and a non-existent org. Kosli staff accounts
can read any org, so a successful read does not prove a write would be allowed.

Both execute tools accept an optional `fields` array to request only specific top-level fields from each object in the response. This dramatically reduces response size and token usage:

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
npm run pack:mcpb    # build a .mcpb bundle for Claude Desktop
```

## Layout

```
src/
  index.ts              # bin: builds a server and connects stdio
  org.ts                # which parameter is the org, shared by three places
  server.ts             # registers the three MCP tools
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
