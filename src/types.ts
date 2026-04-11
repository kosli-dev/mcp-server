export interface ActionParam {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description: string;
  schema?: Record<string, unknown>;
}

export interface RequestBodyParam {
  name: string;
  required: boolean;
  description: string;
  schema?: Record<string, unknown>;
}

export interface CatalogEntry {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: ActionParam[];
  requestBody: RequestBodyParam[] | null;
  searchText: string;
}

export interface Config {
  apiKey: string;
  org: string;
  baseUrl: string;
}
