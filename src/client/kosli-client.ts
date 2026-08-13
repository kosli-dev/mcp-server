import type { CatalogEntry, Config } from "../types.js";
import { VERSION } from "../version.js";

export interface ErrorResponse {
  error: true;
  status: number;
  statusText: string;
  message: string;
}

/**
 * Shape for a file-valued param in a multipart request. Strings, numbers,
 * and booleans are passed as plain form fields; objects matching this shape
 * are uploaded as files. `content` is the file body as text (e.g. YAML);
 * binary uploads are not supported — the LLM transport is JSON-only.
 */
export interface FileParam {
  filename: string;
  content: string;
  contentType?: string;
}

type FetchFn = typeof globalThis.fetch;

function getRequestContentType(entry: CatalogEntry): string | undefined {
  const body = entry.requestBody?.[0];
  if (!body) return undefined;
  // The generator encodes content type in the description as
  // "Request body (application/json)" / "Request body (multipart/form-data)".
  const match = body.description.match(/\(([^)]+)\)/);
  return match?.[1];
}

function isFileParam(v: unknown): v is FileParam {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.filename === "string" && typeof o.content === "string";
}

function buildFormData(params: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (isFileParam(value)) {
      const blob = new Blob([value.content], {
        type: value.contentType ?? "application/octet-stream",
      });
      form.append(key, blob, value.filename);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        form.append(key, String(item));
      }
    } else if (typeof value === "object") {
      // Non-file objects are JSON-encoded so nested structures survive.
      form.append(key, JSON.stringify(value));
    } else {
      form.append(key, String(value));
    }
  }
  return form;
}

export class KosliClient {
  private config: Config;
  private fetch: FetchFn;

  constructor(config: Config, fetchFn: FetchFn = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchFn;
  }

  async execute(
    entry: CatalogEntry,
    params: Record<string, unknown>,
  ): Promise<unknown | ErrorResponse> {
    const urlResult = this.buildUrl(entry, params);
    if (typeof urlResult !== "string") return urlResult;
    const url = urlResult;

    // Collect non-path params as query params for GET, body for others
    const pathParamNames = new Set(
      entry.parameters.filter((p) => p.in === "path").map((p) => p.name),
    );
    const extraParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!pathParamNames.has(key)) {
        extraParams[key] = value;
      }
    }

    const isMultipart = getRequestContentType(entry) === "multipart/form-data";
    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "User-Agent": `kosli-mcp-server/${VERSION}`,
    };
    // For multipart, let fetch set Content-Type with the generated boundary.
    if (!isMultipart) {
      baseHeaders["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method: entry.method, headers: baseHeaders };

    if (entry.method === "GET" || entry.method === "DELETE") {
      const queryEntries = Object.entries(extraParams).filter(
        ([, v]) => v !== undefined,
      );
      if (queryEntries.length > 0) {
        const searchParams = new URLSearchParams();
        for (const [k, v] of queryEntries) {
          searchParams.set(k, String(v));
        }
        const separator = url.includes("?") ? "&" : "?";
        return this.doFetch(`${url}${separator}${searchParams.toString()}`, init);
      }
    } else if (isMultipart) {
      init.body = buildFormData(extraParams);
    } else if (Object.keys(extraParams).length > 0) {
      init.body = JSON.stringify(extraParams);
    }

    return this.doFetch(url, init);
  }

  private buildUrl(entry: CatalogEntry, params: Record<string, unknown>): string | ErrorResponse {
    let path = entry.path;

    for (const param of entry.parameters) {
      if (param.in !== "path") continue;

      let value: unknown;
      if (param.name === "org") {
        value = params.org ?? this.config.org;
      } else {
        value = params[param.name];
      }

      if (value === undefined && param.required) {
        return {
          error: true,
          status: 0,
          statusText: "Invalid Request",
          message: `Missing required path parameter: ${param.name} for ${entry.method} ${entry.path}`,
        };
      }

      if (value !== undefined) {
        path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
      }
    }

    return `${this.config.baseUrl}/api/v2${path}`;
  }

  private async doFetch(url: string, init: RequestInit): Promise<unknown | ErrorResponse> {
    try {
      const response = await this.fetch(url, init);

      if (!response.ok) {
        let message: string;
        try {
          const body = await response.json();
          message = (body as Record<string, string>).message ?? response.statusText;
        } catch {
          message = response.statusText;
        }
        return {
          error: true,
          status: response.status,
          statusText: response.statusText,
          message,
        };
      }

      return response.json();
    } catch {
      // Do not forward the raw error: it may contain internal hostnames,
      // proxy URLs, or other topology that could leak via the LLM.
      return {
        error: true,
        status: 0,
        statusText: "Network Error",
        message: "Request failed before reaching the Kosli API",
      };
    }
  }
}
