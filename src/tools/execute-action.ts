import type { CatalogEntry, Config } from "../types.js";
import { KosliClient } from "../client/kosli-client.js";

type FetchFn = typeof globalThis.fetch;

export async function executeAction(
  catalog: CatalogEntry[],
  config: Config,
  actionId: string,
  params: Record<string, unknown>,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<unknown> {
  const entry = catalog.find((e) => e.id === actionId);
  if (!entry) {
    return { error: true, message: `Unknown action: ${actionId}` };
  }

  const client = new KosliClient(config, fetchFn);
  return client.execute(entry, params);
}
