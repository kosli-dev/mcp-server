import type { ActionParam, CatalogEntry } from "./types.js";

/**
 * Three places have to agree on which parameter the org is: the check in
 * resolveOrg, the strip in search-actions, and the key executeAction writes the
 * resolved value under. buildUrl is generic and reads whatever key the
 * parameter is named. Widen this and forget that key and the call dies with
 * "Missing required path parameter", which is why it is decided once here.
 */
export function isOrgPathParam(param: ActionParam): boolean {
  return param.name === "org" && param.in === "path";
}

export function takesOrg(entry: CatalogEntry): boolean {
  return entry.parameters.some(isOrgPathParam);
}

/**
 * `PUT /user/{org}` sets the caller's default org, so its `{org}` is the thing
 * being written, not the scope it is written in. It is the one action whose org
 * the caller must choose, so search must keep advertising it. Matched on path
 * rather than id: the id has already changed once (`put_user_default_org` to
 * `set_user_default_org`) while the path stayed put.
 */
export function orgIsTheArgument(entry: CatalogEntry): boolean {
  return entry.path === "/user/{org}";
}
