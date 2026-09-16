import { describe, it, expect } from "vitest";
import { isOrgPathParam, orgIsTheArgument, takesOrg } from "../src/org.js";
import type { CatalogEntry } from "../src/types.js";

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: "x", method: "GET", path: "/x/{org}", summary: "", description: "",
  tags: [], parameters: [], requestBody: null, searchText: "", ...over,
});

describe("org predicates", () => {
  it("counts only a path parameter named org", () => {
    expect(isOrgPathParam({ name: "org", in: "path", required: true, description: "" })).toBe(true);
    expect(isOrgPathParam({ name: "org", in: "query", required: false, description: "" })).toBe(false);
    expect(isOrgPathParam({ name: "flow", in: "path", required: true, description: "" })).toBe(false);
  });

  it("reads org-scope off the parameters, as buildUrl does", () => {
    expect(takesOrg(entry({ parameters: [{ name: "org", in: "path", required: true, description: "" }] }))).toBe(true);
    expect(takesOrg(entry({ parameters: [] }))).toBe(false);
  });

  it("singles out the action that writes an org rather than running in one", () => {
    expect(orgIsTheArgument(entry({ path: "/user/{org}" }))).toBe(true);
    expect(orgIsTheArgument(entry({ path: "/environments/{org}" }))).toBe(false);
  });
});
