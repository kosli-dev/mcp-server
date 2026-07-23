/**
 * Inline `$ref` references in OpenAPI schemas against `components.schemas`.
 *
 * The catalog ships schemas without the spec's components section, so any
 * unresolved `$ref` would be a dangling pointer the LLM cannot follow.
 */

const REF_PREFIX = "#/components/schemas/";

export function resolveRefs(
  node: unknown,
  schemas: Record<string, unknown>,
  stack: string[] = [],
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, schemas, stack));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }

  const obj = node as Record<string, unknown>;
  const ref = obj.$ref;

  if (typeof ref === "string" && ref.startsWith(REF_PREFIX)) {
    const name = ref.slice(REF_PREFIX.length);
    if (stack.includes(name)) {
      return { description: `Recursive reference to ${name}` };
    }
    const target = schemas[name];
    if (target === undefined) {
      return node;
    }
    const resolved = resolveRefs(target, schemas, [...stack, name]);
    // Sibling keys next to $ref (e.g. a local description) override the target's.
    const { $ref: _omit, ...siblings } = obj;
    if (
      Object.keys(siblings).length > 0 &&
      resolved !== null &&
      typeof resolved === "object" &&
      !Array.isArray(resolved)
    ) {
      return { ...(resolved as Record<string, unknown>), ...siblings };
    }
    return resolved;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = resolveRefs(value, schemas, stack);
  }
  return out;
}
