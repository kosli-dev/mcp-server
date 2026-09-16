import type { CatalogEntry, Config } from "../types.js";
import { KosliClient } from "../client/kosli-client.js";
import { takesOrg } from "../org.js";

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
/**
 * The params to send, or the reason the call cannot be made. The payload is
 * nested rather than returned bare: it is caller-supplied JSON, so a field of
 * its own named `error` would otherwise read as a failure and cancel the call.
 */
interface Unwrapped {
  params: Record<string, unknown>;
  collision?: string;
}

function unwrapBodyParam(
  entry: CatalogEntry,
  params: Record<string, unknown>,
): Unwrapped {
  const body = params.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { params };
  if (!entry.requestBody) return { params };
  if (entry.parameters.some((p) => p.name === "body")) return { params };
  const schema = entry.requestBody[0]?.schema;
  const properties = schema?.properties;
  if (properties && typeof properties === "object" && "body" in properties) return { params };
  const declared = new Set(entry.parameters.map((p) => p.name));

  // A body field sharing a name with one of the action's own parameters would
  // overwrite what the caller put at the top level and send the request
  // somewhere else, while the approval prompt still showed the caller's value.
  // No catalog body declares such a field, so a collision is always a mistake.
  const collisions = Object.keys(body as Record<string, unknown>).filter((k) => declared.has(k));
  if (collisions.length > 0) {
    const names = collisions.map((c) => `"${c}"`);
    const listed = names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0];
    const [are, them, parameters] = collisions.length > 1
      ? ["are", "them", "parameters"]
      : ["is", "it", "a parameter"];
    return {
      params,
      collision: `The request body names ${listed}, which ${are} also ${parameters} of "${entry.id}". Supply ${them} once, outside the body.`,
    };
  }

  const siblings = Object.keys(params).filter((k) => k !== "body");
  if (!siblings.every((k) => declared.has(k))) return { params };
  const { body: _unwrapped, ...rest } = params;
  return { params: { ...rest, ...(body as Record<string, unknown>) } };
}

type OrgResolution = { error: string } | { org?: string };

/** Trimmed, or `""` when supplied but unusable; `undefined` when not supplied. */
function normalizeOrg(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  // Coercion would invent a name: ["a", "b"] reads as the org "a,b", and an org
  // id as an org called "1234". Both would then pass as a single name.
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * The one place the target org is decided. A call can name one two ways, as the
 * tool input or as `params.org`, and they must agree, because this same path
 * performs writes. There is no fallback: an org-scoped action with no org named
 * is refused.
 */
function resolveOrg(
  entry: CatalogEntry,
  org: string | null | undefined,
  params: Record<string, unknown>,
): OrgResolution {
  const named = [...new Set(
    [org, params.org].map(normalizeOrg).filter((o) => o !== undefined),
  )];

  if (!takesOrg(entry)) {
    return named.length === 0
      ? {}
      : { error: `Action "${entry.id}" is not organization-scoped — it takes no org. Retry with no org in the org parameter and none in params.org.` };
  }

  if (named.includes("")) {
    return { error: "The org must be a single organization name, given as a non-empty string. Check the org parameter and params.org." };
  }

  if (named.length > 1) {
    const quoted = named.map((o) => `"${o}"`).join(" and ");
    return { error: `Conflicting orgs in one call: ${quoted}. The org parameter and params.org must agree — supply just one.` };
  }

  if (named.length === 0) {
    return { error: `Action "${entry.id}" runs against one organization and none was named. Set the org parameter. There is no default, so that no call lands somewhere the caller did not choose.` };
  }

  return { org: named[0] };
}

export interface ExecuteOptions {
  fields?: string[];
  fetchFn?: FetchFn;
  mode?: ToolMode;
  /** `null` counts as not supplied, the same as `params.org`. */
  org?: string | null;
}

export async function executeAction(
  catalog: CatalogEntry[],
  config: Config,
  actionId: string,
  params: Record<string, unknown>,
  { fields, fetchFn = globalThis.fetch, mode, org }: ExecuteOptions = {},
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

  // The org is read from `params` as the caller wrote it. The unwrap cannot
  // introduce another one, because a body naming a declared parameter is
  // refused above rather than flattened over the top level.
  const { params: unwrapped, collision } = unwrapBodyParam(entry, params);
  if (collision) return { error: true, message: collision };

  const resolved = resolveOrg(entry, org, params);
  if ("error" in resolved) return { error: true, message: resolved.error };

  // The key here has to match what org.ts calls the org, since buildUrl looks
  // the path segment up by parameter name.
  const withOrg = { ...unwrapped };
  if (resolved.org === undefined) delete withOrg.org;
  else withOrg.org = resolved.org;

  const client = new KosliClient(config, fetchFn);
  const result = await client.execute(entry, withOrg);

  // Never strip error shapes — pickFields would reduce them to {}
  // and hide the failure from the LLM.
  if (fields && fields.length > 0 && !isErrorResult(result)) {
    return pickFields(result, fields);
  }

  return result;
}
