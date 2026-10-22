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

const USER_AGENT = `kosli-mcp-server/${VERSION}`;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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
      "User-Agent": USER_AGENT,
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

      const value = params[param.name];

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
      // fetch would keep our token on a redirect to the same host. A write is
      // left to fetch, which replays its method and body on a redirect.
      const isRead = init.method === "GET";
      const response = await this.fetch(url, isRead ? { ...init, redirect: "manual" } : init);

      if (REDIRECT_STATUSES.has(response.status)) {
        return await this.download(response, url);
      }

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

      try {
        return await response.json();
      } catch {
        return {
          error: true,
          status: response.status,
          statusText: "Invalid Response",
          message: "The Kosli API returned a body that is not JSON",
        };
      }
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

  /**
   * Fetches the file a redirect points at. The target is a pre-signed
   * object-store URL that carries its own credentials, and the store refuses
   * a request that also sends our token, so the token is left off.
   */
  private async download(redirect: Response, requestUrl: string): Promise<unknown | ErrorResponse> {
    const location = redirect.headers.get("location");
    if (!location) {
      return {
        error: true,
        status: redirect.status,
        statusText: redirect.statusText,
        message: "The Kosli API redirected without saying where to",
      };
    }

    // The evidence is as private as the API that pointed at it.
    const target = new URL(location, requestUrl);
    if (target.protocol !== "https:") {
      return {
        error: true,
        status: 0,
        statusText: "Insecure Redirect",
        message: "The Kosli API redirected to a URL that does not use https",
      };
    }

    const file = await this.fetch(target.href, { headers: { "User-Agent": USER_AGENT } });

    // The body is not read: an object store's error echoes the request back.
    if (!file.ok) {
      const message = `Downloading the file failed with status ${file.status}`;
      return { error: true, status: file.status, statusText: file.statusText, message };
    }

    // Kosli signs the type into the URL: text/plain for readable files,
    // application/octet-stream for the rest, which as text is noise to a model.
    if (!file.headers.get("content-type")?.startsWith("text/")) {
      return {
        error: true,
        status: 0,
        statusText: "Binary File",
        message: "The file is binary, so it cannot be returned as text. Download it from the Kosli web app instead.",
      };
    }

    return file.text();
  }
}
