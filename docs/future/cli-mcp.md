# Future: a CLI-backed write-side MCP

Captured 2026-04-13. Parked, not scheduled.

## Decision

The API-backed MCP in this repo stays the **read** tool. If demand emerges, build a separate MCP (separate repo) backed by the `kosli` CLI for the **write side**: attestations, fingerprinting, environment reporting. The two MCPs coexist; users wire both into their client and each does what it's best at.

## Why not route reads through the CLI

Considered and rejected. For reads the API MCP is strictly better: one HTTP call vs fork/exec + CLI startup + HTTP call; native JSON vs parsing CLI output; one breakage surface (OpenAPI) vs two (OpenAPI + CLI flag surface); simpler install (no separate Go binary required).

## Why the CLI is worth wrapping for writes

These capabilities exist in the CLI and fundamentally can't be replicated by a remote-only MCP:

- **Local fingerprinting.** `kosli fingerprint` over Docker images, tarballs, directories. The API can accept a fingerprint but can't compute one from a file on the user's machine.
- **Reading local evidence.** `attest junit`, `attest snyk`, `attest sonar`, `report evidence *` read files from the user's filesystem.
- **CI-context auto-detection.** When run inside GitHub Actions / GitLab / Bitbucket / Azure, the CLI fills `--commit`, `--build-url`, `--repo-url` automatically.
- **External tool composition.** `attest snyk`, `attest sonar` invoke or parse outputs from those tools; reimplementing this in an MCP is a non-starter.
- **Signing / trust chain.** If attestation signing is added, it will live in the CLI.

The conversational payoff: *"Hey Claude, I just built this image — fingerprint it and attest the JUnit results to the current trail"* becomes possible.

## Trigger to start

Start the project when any of these occur:

- Users (internal or external) ask for conversational attestation flows from their laptop or from CI.
- A demo or sales scenario needs "Claude does the attestation" to land well.
- Kosli ships a feature (e.g. signed attestations) that only the CLI supports and that users want Claude to drive.

Until then: not worth building. The API MCP covers current demand.

## Design sketch (revisit when picking this up)

- **Separate repo**, e.g. `mcp-cli-server`. Separate npm package. Separate release cadence.
- **Scope: write-only commands.** `attest *`, `report *`, `fingerprint`, `begin trail`, `snapshot report`, `create policy/flow/environment`, archival verbs. All read verbs (`get`, `list`, `search`, `diff`, `log`, `status`) stay on the API MCP.
- **Tool shape — open question.** Two candidates:
  - *Catalog-driven* (mirrors this repo). Parse `kosli <cmd> --help` output at build time into a catalog, expose `search_commands` + `run_command`. Cheap to maintain, handles every flag, but Claude gets generic tool descriptions.
  - *Hand-curated*. One MCP tool per high-value write command, with hand-written descriptions and parameter schemas tailored to the LLM. Smaller surface, better prompts, more maintenance. Current guess: this is the right call for writes — the commands have rich flag shapes and the quality of tool descriptions matters more on the write side (wrong attestation is worse than a failed read).
- **Auth.** Defer to the user's existing `~/.kosli` config and/or env vars. Don't reinvent. Fail fast with a clear message if `kosli` isn't on `PATH` or isn't configured.
- **Transport.** stdio, same as this repo. CLI must run locally, so a remote-hosted variant doesn't make sense.
- **Distribution.** Same pecking order as the API MCP: npm + `npx` first, MCPB later if non-CLI-savvy users show up (though CLI-savvy is basically the audience here).
- **Testing.** Stub the `kosli` subprocess the way we stub `fetch` in this repo — inject a process-runner function, fixture-drive the stdout/stderr/exit-code triples.

## What to reuse from this repo when the time comes

- The catalog-generation pattern, if going catalog-driven.
- The test style: inject the I/O boundary (`fetchFn` here, `execFn` there), fixture-drive it, no network / no subprocess in tests.
- The error-as-value contract (no throws across the MCP boundary).
- The ESM / NodeNext / strict TS setup.
- `CLAUDE.md` conventions for the new repo.

## What explicitly doesn't carry over

- The OpenAPI catalog generator — writes don't correspond 1:1 to API endpoints.
- The `org` fallback from env — CLI has its own profile logic; don't double-configure.
