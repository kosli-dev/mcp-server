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

export async function executeAction(
  catalog: CatalogEntry[],
  config: Config,
  actionId: string,
  params: Record<string, unknown>,
  fields?: string[],
  fetchFn: FetchFn = globalThis.fetch,
): Promise<unknown> {
  const entry = catalog.find((e) => e.id === actionId);
  if (!entry) {
    return { error: true, message: `Unknown action: ${actionId}` };
  }

  const client = new KosliClient(config, fetchFn);
  const result = await client.execute(entry, params);

  if (fields && fields.length > 0) {
    return pickFields(result, fields);
  }

  return result;
}
