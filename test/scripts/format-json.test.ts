import { describe, it, expect } from "vitest";
import { formatJsonCompact } from "../../scripts/format-json.js";

describe("formatJsonCompact", () => {
  it("inlines objects and arrays that fit within the width cap", () => {
    expect(formatJsonCompact({ name: "org", in: "path", required: true })).toBe(
      '{"name":"org","in":"path","required":true}',
    );
    expect(formatJsonCompact(["Environments"])).toBe('["Environments"]');
  });

  it("expands structures that exceed the width cap", () => {
    const value = { key: "x".repeat(120), other: 1 };
    expect(formatJsonCompact(value)).toBe(
      '{\n  "key": "' + "x".repeat(120) + '",\n  "other": 1\n}',
    );
  });

  it("accounts for nesting depth and key prefix when deciding to inline", () => {
    const inner = { field: "y".repeat(80) };
    const out = formatJsonCompact({ outer: inner }, 2, 100);
    // inner would fit at column 0 but not after indentation + key prefix
    expect(out).toBe('{\n  "outer": {\n    "field": "' + "y".repeat(80) + '"\n  }\n}');
  });

  it("keeps empty objects and arrays compact", () => {
    expect(formatJsonCompact({ a: [], b: {} })).toBe('{"a":[],"b":{}}');
    const big = { padding: "z".repeat(120), a: [], b: {} };
    expect(formatJsonCompact(big)).toContain('"a": []');
    expect(formatJsonCompact(big)).toContain('"b": {}');
  });

  it("round-trips: output parses back to the input", () => {
    const value = {
      id: "create_control",
      tags: ["Controls"],
      parameters: [
        { name: "org", in: "path", required: true, description: "d".repeat(150) },
      ],
      requestBody: [
        {
          name: "body",
          schema: {
            properties: { name: { type: "string" }, links: { anyOf: [{ type: "object" }, { type: "null" }] } },
            required: ["name"],
          },
        },
      ],
      nested: { deep: { deeper: [1, 2, 3, null, false, "s"] } },
    };
    expect(JSON.parse(formatJsonCompact(value))).toEqual(value);
  });

  it("handles scalars and strings longer than the width cap", () => {
    expect(formatJsonCompact(42)).toBe("42");
    expect(formatJsonCompact(null)).toBe("null");
    const long = "a".repeat(200);
    expect(formatJsonCompact(long)).toBe(JSON.stringify(long));
  });
});
