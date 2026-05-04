import type { CatalogEntry, Config } from "../types.js";
import { KosliClient } from "../client/kosli-client.js";

type FetchFn = typeof globalThis.fetch;

export function pickFields(data: unknown, fields: string[]): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => pickFields(item, fields));
  }
  if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in obj) {
        picked[field] = obj[field];
      }
    }
    return picked;
  }
  return data;
}

function isErrorResult(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).error === true
  );
}

export type ToolMode = "GET" | "WRITE";

export async function executeAction(
  catalog: CatalogEntry[],
  config: Config,
  actionId: string,
  params: Record<string, unknown>,
  fields?: string[],
  fetchFn: FetchFn = globalThis.fetch,
  mode?: ToolMode,
): Promise<unknown> {
  const entry = catalog.find((e) => e.id === actionId);
  if (!entry) {
    return { error: true, message: `Unknown action: ${actionId}` };
  }

  if (mode === "GET" && entry.method !== "GET") {
    return {
      error: true,
      message: `Action "${actionId}" is a ${entry.method} operation. Use execute_write_action instead.`,
    };
  }

  if (mode === "WRITE" && entry.method === "GET") {
    return {
      error: true,
      message: `Action "${actionId}" is a GET operation. Use execute_read_action instead.`,
    };
  }

  const client = new KosliClient(config, fetchFn);
  const result = await client.execute(entry, params);

  // Never strip error shapes — pickFields would reduce them to {}
  // and hide the failure from the LLM.
  if (fields && fields.length > 0 && !isErrorResult(result)) {
    return pickFields(result, fields);
  }

  return result;
}
