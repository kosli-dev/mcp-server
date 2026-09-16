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

/**
 * The catalog advertises an action's request body as a parameter named
 * "body", so callers often send `params: { body: {...} }` even though the
 * client spreads top-level params into the request body. Unwrap that shape
 * when it's unambiguous: the entry takes a request body, nothing it declares
 * is genuinely called "body", and every sibling key is a declared parameter.
 */
function unwrapBodyParam(
  entry: CatalogEntry,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const body = params.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) return params;
  if (!entry.requestBody) return params;
  if (entry.parameters.some((p) => p.name === "body")) return params;
  const schema = entry.requestBody[0]?.schema;
  const properties = schema?.properties;
  if (properties && typeof properties === "object" && "body" in properties) return params;
  const declared = new Set(entry.parameters.map((p) => p.name));
  const siblings = Object.keys(params).filter((k) => k !== "body");
  if (!siblings.every((k) => declared.has(k))) return params;
  const { body: _unwrapped, ...rest } = params;
  return { ...rest, ...(body as Record<string, unknown>) };
}

/**
 * The org a call is aimed at, as it will actually be used: trimmed, and
 * `undefined` when nothing was supplied. `null` counts as nothing, matching
 * `KosliClient.buildUrl`, which falls back to `config.org` on a nullish
 * `params.org`. An empty string means "supplied, but unusable", which
 * `orgError` turns into a rejection.
 */
function normalizeOrg(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  // Only a string can name an org. `params` is a record of `unknown`, so the
  // model can put anything here, and coercing it would turn a value that is not
  // a name into one that looks like a name: `["a", "b"]` reads as the org "a,b"
  // and an org id reads as an org called "1234". Both would then pass the
  // agreement check below as a single name. Hand back the unusable marker
  // instead and let orgError say so.
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Check the orgs a call names, returning a message when the request cannot be
 * honoured as written. This is the only place the target org is decided, so
 * both execute tools behave identically and every way of naming one obeys the
 * same rules.
 *
 * `named` holds the distinct orgs the call mentions, already normalized. There
 * are three ways to name one and they must agree: the `org` argument,
 * `params.org`, and — for a write — an `org` inside the request body, which
 * `unwrapBodyParam` flattens over the top level. Two different names are
 * rejected rather than resolved: the same code path performs writes, and
 * guessing wrong would write to the wrong organization.
 */
function orgError(entry: CatalogEntry, named: string[]): string | undefined {
  const takesOrg = entry.parameters.some((p) => p.name === "org" && p.in === "path");
  if (!takesOrg) {
    if (named.length === 0) return undefined;
    return `Action "${entry.id}" is not organization-scoped — it takes no org. Retry with no org in the org parameter, in params.org, or in the request body.`;
  }

  // Before any disagreement: an unusable value is the thing to report, and
  // reporting it as a nameless org disagreeing with a real one would send the
  // caller to drop one of the two rather than to fix the bad value.
  if (named.includes("")) {
    return "The org must be a single organization name, given as a non-empty string. Check the org parameter, params.org, and any org in the request body, or omit all of them to use the configured default.";
  }

  if (named.length > 1) {
    const quoted = named.map((o) => `"${o}"`).join(" and ");
    return `Conflicting orgs in one call: ${quoted}. The org parameter, params.org, and an org in the request body must agree — supply just one.`;
  }

  return undefined;
}

export async function executeAction(
  catalog: CatalogEntry[],
  config: Config,
  actionId: string,
  params: Record<string, unknown>,
  fields?: string[],
  fetchFn: FetchFn = globalThis.fetch,
  mode?: ToolMode,
  org?: string,
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

  // Collect the org from every channel before deciding. `unwrapBodyParam`
  // flattens a write's request body over the top level, so params.org has to be
  // read before the unwrap and the body's org after it — otherwise the spread
  // picks a winner and the disagreement is never seen. When the unwrap declines,
  // `unwrapped` is `params` and the body's org is never read. That is correct:
  // an unflattened body cannot reach the path, so there is nothing to check.
  const beforeUnwrap = normalizeOrg(params.org);
  const unwrapped = unwrapBodyParam(entry, params);
  const named = [...new Set(
    [normalizeOrg(org), beforeUnwrap, normalizeOrg(unwrapped.org)]
      .filter((o): o is string => o !== undefined),
  )];

  const message = orgError(entry, named);
  if (message) return { error: true, message };

  // The checked value is the one that goes out, so buildUrl cannot see a
  // different org from the one that was approved. With nothing named, the key
  // is dropped rather than left as a null that would ride along as a stray
  // query parameter.
  const withOrg = { ...unwrapped };
  if (named.length === 0) delete withOrg.org;
  else withOrg.org = named[0];

  const client = new KosliClient(config, fetchFn);
  const result = await client.execute(entry, withOrg);

  // Never strip error shapes — pickFields would reduce them to {}
  // and hide the failure from the LLM.
  if (fields && fields.length > 0 && !isErrorResult(result)) {
    return pickFields(result, fields);
  }

  return result;
}
