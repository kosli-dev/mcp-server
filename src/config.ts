import type { Config } from "./types.js";

export function loadConfig(): Config {
  const apiKey = process.env.KOSLI_API_TOKEN || process.env.KOSLI_API_KEY;
  if (!apiKey) {
    throw new Error("KOSLI_API_TOKEN (or KOSLI_API_KEY) environment variable is required");
  }

  const org = process.env.KOSLI_ORG;
  if (!org) {
    throw new Error("KOSLI_ORG environment variable is required");
  }

  const baseUrl = process.env.KOSLI_BASE_URL || "https://app.kosli.com";

  return { apiKey, org, baseUrl };
}
