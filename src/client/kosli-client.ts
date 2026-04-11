import type { CatalogEntry, Config } from "../types.js";

export interface ErrorResponse {
  error: true;
  status: number;
  statusText: string;
  message: string;
}

type FetchFn = typeof globalThis.fetch;

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
    const url = this.buildUrl(entry, params);
    const init: RequestInit = {
      method: entry.method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    };

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
    } else if (Object.keys(extraParams).length > 0) {
      init.body = JSON.stringify(extraParams);
    }

    return this.doFetch(url, init);
  }

  private buildUrl(entry: CatalogEntry, params: Record<string, unknown>): string {
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
        throw new Error(
          `Missing required path parameter: ${param.name} for ${entry.method} ${entry.path}`,
        );
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
    } catch (err) {
      return {
        error: true,
        status: 0,
        statusText: "Network Error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
