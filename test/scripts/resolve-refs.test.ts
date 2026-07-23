import { describe, it, expect } from "vitest";
import { resolveRefs } from "../../scripts/resolve-refs.js";

describe("resolveRefs", () => {
  it("inlines a top-level $ref", () => {
    const schemas = {
      Input: { type: "object", properties: { name: { type: "string" } } },
    };
    expect(resolveRefs({ $ref: "#/components/schemas/Input" }, schemas)).toEqual(
      schemas.Input,
    );
  });

  it("inlines nested $refs inside properties and arrays", () => {
    const schemas = {
      Item: { type: "string" },
      List: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/Item" } },
        },
      },
    };
    expect(resolveRefs({ $ref: "#/components/schemas/List" }, schemas)).toEqual({
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" } },
      },
    });
  });

  it("resolves $refs inside anyOf", () => {
    const schemas = { A: { type: "integer" } };
    expect(
      resolveRefs({ anyOf: [{ $ref: "#/components/schemas/A" }, { type: "null" }] }, schemas),
    ).toEqual({ anyOf: [{ type: "integer" }, { type: "null" }] });
  });

  it("breaks reference cycles instead of recursing forever", () => {
    const schemas = {
      Node: {
        type: "object",
        properties: { child: { $ref: "#/components/schemas/Node" } },
      },
    };
    expect(resolveRefs({ $ref: "#/components/schemas/Node" }, schemas)).toEqual({
      type: "object",
      properties: { child: { description: "Recursive reference to Node" } },
    });
  });

  it("keeps sibling keys next to $ref, overriding the target's", () => {
    const schemas = { A: { type: "string", description: "from target" } };
    expect(
      resolveRefs({ $ref: "#/components/schemas/A", description: "local override" }, schemas),
    ).toEqual({ type: "string", description: "local override" });
  });

  it("leaves unknown and non-component $refs untouched", () => {
    expect(resolveRefs({ $ref: "#/components/schemas/Missing" }, {})).toEqual({
      $ref: "#/components/schemas/Missing",
    });
    expect(resolveRefs({ $ref: "external.json#/Thing" }, {})).toEqual({
      $ref: "external.json#/Thing",
    });
  });

  it("passes through primitives and null", () => {
    expect(resolveRefs("string", {})).toBe("string");
    expect(resolveRefs(null, {})).toBeNull();
    expect(resolveRefs(42, {})).toBe(42);
  });

  it("allows the same schema to be referenced twice on non-cyclic paths", () => {
    const schemas = {
      Leaf: { type: "string" },
      Pair: {
        type: "object",
        properties: {
          first: { $ref: "#/components/schemas/Leaf" },
          second: { $ref: "#/components/schemas/Leaf" },
        },
      },
    };
    expect(resolveRefs({ $ref: "#/components/schemas/Pair" }, schemas)).toEqual({
      type: "object",
      properties: { first: { type: "string" }, second: { type: "string" } },
    });
  });
});
