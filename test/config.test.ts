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
    delete process.env.KOSLI_API_TOKEN;
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

  it("prefers KOSLI_API_TOKEN over KOSLI_API_KEY", () => {
    process.env.KOSLI_API_TOKEN = "token-value";
    process.env.KOSLI_API_KEY = "key-value";
    process.env.KOSLI_ORG = "test-org";

    const config = loadConfig();

    expect(config.apiKey).toBe("token-value");
  });

  it("falls back to KOSLI_API_KEY when KOSLI_API_TOKEN is missing", () => {
    delete process.env.KOSLI_API_TOKEN;
    process.env.KOSLI_API_KEY = "key-value";
    process.env.KOSLI_ORG = "test-org";

    const config = loadConfig();

    expect(config.apiKey).toBe("key-value");
  });

  it("throws when both KOSLI_API_TOKEN and KOSLI_API_KEY are missing", () => {
    process.env.KOSLI_ORG = "test-org";
    delete process.env.KOSLI_API_KEY;
    delete process.env.KOSLI_API_TOKEN;

    expect(() => loadConfig()).toThrow("KOSLI_API_TOKEN");
  });

  it("throws when KOSLI_ORG is missing", () => {
    process.env.KOSLI_API_KEY = "test-key";
    delete process.env.KOSLI_ORG;

    expect(() => loadConfig()).toThrow("KOSLI_ORG");
  });
});
