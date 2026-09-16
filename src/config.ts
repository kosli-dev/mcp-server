import type { Config } from "./types.js";

export function loadConfig(): Config {
  const apiKey = process.env.KOSLI_API_TOKEN || process.env.KOSLI_API_KEY;
  if (!apiKey) {
    throw new Error("KOSLI_API_TOKEN (or KOSLI_API_KEY) environment variable is required");
  }

  // Removed in favour of naming the org per call. Say so rather than letting a
  // stale config turn into a refusal the user cannot connect to anything.
  if (process.env.KOSLI_ORG) {
    console.error(
      "KOSLI_ORG is set but no longer used: the org is named per call now, and this value is ignored.",
    );
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

  return { apiKey, baseUrl };
}
