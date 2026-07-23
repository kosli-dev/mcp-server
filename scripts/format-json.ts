/**
 * Width-capped compact JSON formatter for the generated catalog.
 *
 * Objects and arrays that fit within `width` columns are inlined on one
 * line; anything larger is expanded with `indent`-space indentation. This
 * keeps the catalog diffable and readable without sprawling small objects
 * (a param, a tag list) over many lines.
 */

export function formatJsonCompact(value: unknown, indent = 2, width = 100): string {
  return fmt(value, "", 0, indent, width);
}

function fmt(value: unknown, currentIndent: string, offset: number, indent: number, width: number): string {
  const inline = JSON.stringify(value);
  if (inline === undefined) return "null";
  if (currentIndent.length + offset + inline.length <= width) return inline;

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = currentIndent + " ".repeat(indent);
    const items = value.map((item) => childIndent + fmt(item, childIndent, 0, indent, width));
    return "[\n" + items.join(",\n") + "\n" + currentIndent + "]";
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const childIndent = currentIndent + " ".repeat(indent);
    const lines = entries.map(([key, v]) => {
      const prefix = JSON.stringify(key) + ": ";
      return childIndent + prefix + fmt(v, childIndent, prefix.length, indent, width);
    });
    return "{\n" + lines.join(",\n") + "\n" + currentIndent + "}";
  }

  // A scalar longer than the width cap cannot be broken.
  return inline;
}
