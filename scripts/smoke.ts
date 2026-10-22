import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [first] = result.content as { type: string; text?: string }[];
  return first?.type === "text" ? first.text ?? "" : "";
}

async function main() {
  console.log(`Smoke testing ${ENTRY} (${live ? `live, org ${org}` : "offline"})`);

  // The transport passes only a minimal environment by default, so set what
  // the server needs. Offline, a placeholder token satisfies loadConfig.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    KOSLI_API_TOKEN: live ? token! : "smoke-test-placeholder",
  };
  if (process.env.KOSLI_BASE_URL) env.KOSLI_BASE_URL = process.env.KOSLI_BASE_URL;

  const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY], env, stderr: "inherit" });
  const client = new Client({ name: "kosli-smoke", version: "0" });
  await client.connect(transport);

  try {
    const server = client.getServerVersion();
    check(server?.version === version, `server advertises version ${version} (got ${server?.version})`);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    check(
      JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
      `lists exactly ${EXPECTED_TOOLS.join(", ")} (got ${names.join(", ")})`,
    );

    const search = await client.callTool({ name: "search_actions", arguments: { query: "list environments" } });
    const found = JSON.parse(textOf(search)) as { id: string }[];
    check(found.some((a) => a.id === "list_environments"), "search_actions finds list_environments");

    if (live) {
      const read = await client.callTool({
        name: "execute_read_action",
        arguments: { actionId: "list_environments", org, fields: ["name"] },
      });
      const body = JSON.parse(textOf(read));
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
