import type { Config } from "./types.js";

export function loadConfig(): Config {
  const apiKey = process.env.KOSLI_API_TOKEN || process.env.KOSLI_API_KEY;
  if (!apiKey) {
    throw new Error("KOSLI_API_TOKEN (or KOSLI_API_KEY) environment variable is required");
  }

  // Trimmed so the existing check also catches a whitespace-only value, which
  // is truthy and would otherwise become the org path segment on every call.
  const org = process.env.KOSLI_ORG?.trim();
  if (!org) {
    throw new Error("KOSLI_ORG environment variable is required, and must not be blank");
  }

  const baseUrl = process.env.KOSLI_BASE_URL || "https://app.kosli.com";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error(`KOSLI_BASE_URL is not a valid URL: ${baseUrl}`);
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(
      `KOSLI_BASE_URL must use https:// (got ${parsedUrl.protocol}//). The bearer token is sent with every request.`,
    );
  }

  return { apiKey, org, baseUrl };
}
