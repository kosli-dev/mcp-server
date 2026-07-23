import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogEntry, ActionParam, RequestBodyParam } from "../src/types.js";
import { resolveRefs } from "./resolve-refs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_URL = "https://app.kosli.com/api/v2/openapi.json";
const OUTPUT_PATH = join(__dirname, "..", "src", "catalog.json");

interface OpenAPIParam {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

interface OpenAPIRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParam[];
  requestBody?: OpenAPIRequestBody;
  deprecated?: boolean;
}

interface OpenAPISpec {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

function generateId(operationId: string | undefined, method: string, path: string): string {
  if (operationId) {
    return operationId;
  }
  const segments = path.replace(/[{}]/g, "").split("/").filter(Boolean);
  return `${method.toLowerCase()}_${segments.join("_")}`;
}

function buildSearchText(entry: Pick<CatalogEntry, "summary" | "description" | "tags" | "path" | "method">): string {
  const pathWords = entry.path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .join(" ");
  const parts = [
    entry.summary,
    entry.description,
    entry.method.toLowerCase(),
    pathWords,
    ...entry.tags,
  ];
  return parts.join(" ").toLowerCase();
}

function extractRequestBodyParams(
  requestBody: OpenAPIRequestBody | undefined,
  schemas: Record<string, unknown>,
): RequestBodyParam[] | null {
  if (!requestBody?.content) return null;

  const contentType = Object.keys(requestBody.content)[0];
  const schema = requestBody.content[contentType]?.schema;
  if (!schema) return null;

  return [{
    name: "body",
    required: requestBody.required ?? false,
    description: `Request body (${contentType})`,
    schema: resolveRefs(schema, schemas) as Record<string, unknown>,
  }];
}

async function main() {
  console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
  const response = await fetch(OPENAPI_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }

  const spec: OpenAPISpec = await response.json();
  const schemas = spec.components?.schemas ?? {};
  const entries: CatalogEntry[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === "parameters" || method === "servers") continue;
      if (operation.deprecated) continue;

      const id = generateId(operation.operationId, method, path);
      const summary = operation.summary ?? "";
      const description = operation.description ?? "";
      const tags = operation.tags ?? [];

      const parameters: ActionParam[] = (operation.parameters ?? []).map((p) => ({
        name: p.name,
        in: p.in as ActionParam["in"],
        required: p.required ?? false,
        description: p.description ?? "",
        schema: p.schema ? (resolveRefs(p.schema, schemas) as Record<string, unknown>) : p.schema,
      }));

      const requestBody = extractRequestBodyParams(operation.requestBody, schemas);

      const entry: CatalogEntry = {
        id,
        method: method.toUpperCase(),
        path,
        summary,
        description,
        tags,
        parameters,
        requestBody,
        searchText: buildSearchText({ summary, description, tags, path, method }),
      };

      entries.push(entry);
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Generated ${entries.length} catalog entries -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
