import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

// Starts a built server over real stdio and drives it as an MCP client would.
// The in-memory tests in test/server.test.ts cover the tool wiring; this covers
// what they can't: that the bin starts, its JSON imports load, and (given a
// bundle's entry point) that the bundled node_modules resolve.
//
//   npm run smoke                       # dist/index.js, offline
//   npm run smoke -- <path/to/index.js> # e.g. an unzipped .mcpb
//
// Set KOSLI_API_TOKEN and KOSLI_SMOKE_ORG to also run one read against the
// live API. Without both, nothing leaves the machine.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const ENTRY = resolve(process.argv[2] ?? join(REPO_ROOT, "dist", "index.js"));
const EXPECTED_TOOLS = ["execute_read_action", "execute_write_action", "search_actions"];

const { version } = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
const token = process.env.KOSLI_API_TOKEN;
const org = process.env.KOSLI_SMOKE_ORG;
const live = Boolean(token && org);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

// A failed call carries a plain message rather than JSON, so report that
// message instead of the parse error it would cause.
async function callJson(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
  const [first] = content;
  const text = first?.type === "text" ? first.text ?? "" : "";
  if (result.isError) throw new Error(`${name} returned an error: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`Smoke testing ${ENTRY} (${live ? `live, org ${org}` : "offline"})`);

  // The SDK's allowlist (PATH, HOME, and SystemRoot and friends on Windows)
  // copies no KOSLI_* variable, so the server only sees what is set here.
  // Offline, a placeholder token satisfies loadConfig.
  const env: Record<string, string> = {
    ...getDefaultEnvironment(),
    KOSLI_API_TOKEN: live ? token! : "smoke-test-placeholder",
  };
  if (process.env.KOSLI_BASE_URL) env.KOSLI_BASE_URL = process.env.KOSLI_BASE_URL;

  const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY], env, stderr: "inherit" });
  const client = new Client({ name: "kosli-smoke", version: "0" });

  try {
    // Inside the try so a failed handshake still closes the child process.
    await client.connect(transport);

    const server = client.getServerVersion();
    check(server?.version === version, `server advertises version ${version} (got ${server?.version})`);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    check(
      JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
      `lists exactly ${EXPECTED_TOOLS.join(", ")} (got ${names.join(", ")})`,
    );

    // These hints are what make an MCP client ask before a write, so a lost
    // annotation would let the model write into an org unprompted.
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
    check(hints.execute_write_action.destructiveHint === true, "execute_write_action is marked destructive");
    check(hints.execute_write_action.readOnlyHint === false, "execute_write_action is marked not read-only");
    check(hints.execute_read_action.readOnlyHint === true, "execute_read_action is marked read-only");
    check(hints.search_actions.readOnlyHint === true, "search_actions is marked read-only");

    const found = (await callJson(client, "search_actions", { query: "list environments" })) as { id: string }[];
    check(found.some((a) => a.id === "list_environments"), "search_actions finds list_environments");

    if (live) {
      const body = (await callJson(client, "execute_read_action", {
        actionId: "list_environments", org, fields: ["name"],
      })) as { error?: boolean; status?: number; message?: string } | null;
      check(!body?.error, `list_environments succeeds against the live API${body?.error ? `: ${body.status} ${body.message}` : ""}`);
    } else {
      console.log("skip - live read (set KOSLI_API_TOKEN and KOSLI_SMOKE_ORG to run it)");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`not ok - ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
