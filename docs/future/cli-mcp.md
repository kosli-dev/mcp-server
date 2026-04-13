# Future: a CLI-backed local-context MCP

Captured 2026-04-13. Parked, not scheduled.

## Decision

The API-backed MCP in this repo already handles **API-expressible** operations — anything whose payload fits in a JSON HTTP request. That includes most reads *and* many writes (archive, create-by-name, attach policy, begin trail, etc.). If demand emerges, build a **separate** MCP, in a separate repo, backed by the `kosli` CLI to cover **local-context** operations that a remote MCP fundamentally can't do. The two MCPs coexist; users wire both in and each does what it's best at.

## The real distinction — API-expressible vs local-context

Not read vs write.

**API-expressible** (the current MCP handles these):

- Anything whose request payload the caller can construct from memory or from data already in the system.
- Covers most reads and many writes: `create_*`, `archive_*`, `attach_policy`, `begin_trail`, `attest_*` *when a fingerprint is already known and no file attachments are needed*.

**Local-context** (only the CLI can do these usefully from where the user is):

- **Local fingerprinting.** `kosli fingerprint` over a Docker image, tarball, or directory. The API accepts a fingerprint; it does not compute one. A process running elsewhere can't reach the user's Docker socket or filesystem.
- **Evidence file uploads.** JUnit XML, Snyk JSON, Sonar reports, arbitrary attachments. These are multipart uploads that need file bytes the MCP process may not have.
- **CI-context auto-detection.** Filling `--commit`, `--build-url`, `--repo-url` from GitHub Actions / GitLab / Bitbucket / Azure env vars. Works only when the CLI runs inside the build.
- **External tool composition.** `attest snyk`, `attest sonar` invoke or parse other tools' outputs.
- **Signing / trust chain** (future). If attestation signing lands in the CLI, it stays there.

The conversational payoff: *"Hey Claude, I just built this image — fingerprint it and attest the JUnit results to the current trail"* becomes possible.

## Why not route reads through the CLI

Considered and rejected. For API-expressible operations (reads and writes alike) the current MCP is strictly better: one HTTP call vs fork/exec + CLI startup + HTTP call; native JSON vs parsing CLI output; one breakage surface (OpenAPI) vs two (OpenAPI + CLI flag surface); simpler install (no Go binary required). A CLI wrapper only earns its keep where the CLI does something HTTP-alone can't.

## Near-term gap in the current MCP — multipart uploads

Independent of a future CLI MCP, the current `KosliClient.execute` only sends JSON bodies. Endpoints that accept file attachments (most of the `attest *` and `report evidence *` family) would need a multipart code path to work end-to-end. Right now they work in "metadata only" mode — e.g. `attest_artifact` with a pre-computed fingerprint and no attachments. If we want the API MCP to cover the evidence-upload writes itself (no CLI), that's the missing piece. Worth considering *before* spinning up a CLI MCP, because it could shrink the CLI MCP's scope further (leaving only fingerprinting, CI-context detection, and external-tool composition).

## Trigger to start the CLI MCP

Start it when any of these occur:

- Users (internal or external) ask for conversational flows that require the user's filesystem or Docker socket — "fingerprint this image," "report my local test results," "attest the directory I just built."
- A demo or sales scenario needs "Claude does the attestation from inside the CI run."
- Kosli ships a capability that lives only in the CLI (e.g. signed attestations) and users want Claude to drive it.

Until any of that is real, the API MCP (plus the multipart gap above, if it becomes painful) covers demand.

## Design sketch (revisit when picking this up)

- **Separate repo**, e.g. `mcp-cli-server`. Separate npm package, separate release cadence.
- **Scope: local-context operations only.** Not "writes" in general — API-expressible writes stay on the API MCP. The CLI MCP's commands are the ones listed under "local-context" above: `fingerprint`, attestations with attachments or CI-context auto-fill, evidence reporting that reads local files, tool-composition verbs (`attest snyk`, `attest sonar`).
- **Tool shape — open question.**
  - *Catalog-driven* (mirrors this repo). Parse `kosli <cmd> --help` output at build time into a catalog, expose `search_commands` + `run_command`. Cheap to maintain, handles every flag, but Claude gets generic tool descriptions.
  - *Hand-curated.* One MCP tool per high-value command, with hand-written descriptions and parameter schemas tailored to the LLM. Smaller surface, better prompts, more maintenance. Current guess: this is the right call — the commands have rich flag shapes and the quality of tool descriptions matters more when the operation has side effects on the user's machine (wrong attestation is worse than a failed read).
- **Auth.** Defer to the user's existing `~/.kosli` config and/or env vars. Don't reinvent. Fail fast with a clear message if `kosli` isn't on `PATH` or isn't configured.
- **Transport.** stdio, same as this repo. CLI must run locally, so a remote-hosted variant doesn't make sense.
- **Distribution.** npm + `npx` first, MCPB later only if non-CLI-savvy users show up (which is unlikely for a tool that requires a Go binary already).
- **Testing.** Inject the subprocess runner the way we inject `fetch` in this repo — fixture-drive stdout/stderr/exit-code triples.

## What to reuse from this repo when the time comes

- The catalog-generation pattern, if going catalog-driven.
- The test style: inject the I/O boundary (`fetchFn` here, `execFn` there), fixture-drive it, no network or subprocess in tests.
- The error-as-value contract (no throws across the MCP boundary).
- The ESM / NodeNext / strict TS setup.
- `CLAUDE.md` conventions, adapted.

## What explicitly doesn't carry over

- The OpenAPI catalog generator — CLI commands don't correspond 1:1 to API endpoints (one CLI command often calls several endpoints plus local work).
- The `org` fallback from env — the CLI has its own profile logic; don't double-configure.
