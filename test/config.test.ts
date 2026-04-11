import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads valid config from env vars", () => {
    process.env.KOSLI_API_KEY = "test-key";
    process.env.KOSLI_ORG = "test-org";

    const config = loadConfig();

    expect(config.apiKey).toBe("test-key");
    expect(config.org).toBe("test-org");
    expect(config.baseUrl).toBe("https://app.kosli.com");
  });

  it("uses custom base URL when provided", () => {
    process.env.KOSLI_API_KEY = "test-key";
    process.env.KOSLI_ORG = "test-org";
    process.env.KOSLI_BASE_URL = "https://staging.kosli.com";

    const config = loadConfig();

    expect(config.baseUrl).toBe("https://staging.kosli.com");
  });

  it("throws when KOSLI_API_KEY is missing", () => {
    process.env.KOSLI_ORG = "test-org";
    delete process.env.KOSLI_API_KEY;

    expect(() => loadConfig()).toThrow("KOSLI_API_KEY");
  });

  it("throws when KOSLI_ORG is missing", () => {
    process.env.KOSLI_API_KEY = "test-key";
    delete process.env.KOSLI_ORG;

    expect(() => loadConfig()).toThrow("KOSLI_ORG");
  });
});
