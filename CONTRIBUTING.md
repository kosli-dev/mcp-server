# Contributing

Thanks for your interest in the Kosli MCP Server!

## Getting started

```bash
git clone https://github.com/kosli-dev/mcp-server.git
cd mcp-server
npm install
npm run build
npm test
```

## Development workflow

1. Create a branch from `main`.
2. Make your changes — run `npm test` and `npm run build` before pushing.
3. Open a pull request against `main`.

## Conventions

- **Commits and PR titles** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.).
- **TypeScript** with `strict: true`. Relative imports use `.js` extensions (ESM).
- **Tests** use Vitest. Run with `npm test` or `npm run test:watch`.

## Architecture

The server exposes three tools — `search_actions`, `execute_read_action`, and `execute_write_action` — driven by a catalog generated from Kosli's OpenAPI spec. See [CLAUDE.md](CLAUDE.md) for a detailed architecture overview.

## Adding support for new Kosli API endpoints

In most cases, just regenerate the catalog:

```bash
npm run generate-catalog
```

The new endpoint becomes discoverable automatically. No code changes needed.

## Testing the Claude Desktop extension locally

```bash
npm run pack:mcpb
open kosli-mcp-server-*.mcpb   # opens Claude Desktop install dialog
```

## Releasing

Releases are automated via GitHub Actions. See the [Releasing section in CLAUDE.md](CLAUDE.md#releasing) for the full procedure.
