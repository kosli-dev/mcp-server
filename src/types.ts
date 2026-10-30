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
  baseUrl: string;
}

// Guidance search_actions attaches to an action. `note` is for what the
// catalog can't say, such as a step the model can't perform over MCP.
export interface ActionHint {
  schemaUrl?: string;
  example?: Record<string, string>;
  note?: string;
}

export type ActionHints = Record<string, ActionHint>;
