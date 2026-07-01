import { describe, expect, it } from "vitest";
import { runLocalOAuthLogin, validateOAuthCallback } from "../src/oauth.js";
import { createMemoryLogger } from "../src/security.js";
import type { TokenStore } from "../src/auth/token-store.js";
import type { AppConfig } from "../src/types.js";

describe("validateOAuthCallback", () => {
  it("accepts only the expected callback path and state", () => {
    const code = validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?code=abc&state=expected"), "expected");

    expect(code).toBe("abc");
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/wrong?code=abc&state=expected"), "expected")).toThrow(
      /callback path/i
    );
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?code=abc&state=other"), "expected")).toThrow(
      /state/i
    );
    expect(() => validateOAuthCallback(new URL("http://127.0.0.1/oauth2callback?state=expected"), "expected")).toThrow(
      /code/i
    );
  });
});

describe("runLocalOAuthLogin", () => {
  it("rejects before opening the callback server when OAuth client config is missing", async () => {
    const config: AppConfig = {
      authMode: "stored",
      tokenStorePath: "/tmp/gsc-seo-mcp-test-tokens.json",
      readonly: true,
      http: { host: "127.0.0.1", port: 8787, path: "/mcp" },
      requestTimeoutMs: 30_000
    };
    const store: TokenStore = {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve()
    };

    await expect(runLocalOAuthLogin(config, store, createMemoryLogger())).rejects.toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/
    );
  });

  it("does not run local OAuth login in ADC mode", async () => {
    const config: AppConfig = {
      authMode: "adc",
      tokenStorePath: "/tmp/gsc-seo-mcp-test-tokens.json",
      readonly: true,
      http: { host: "127.0.0.1", port: 8787, path: "/mcp" },
      requestTimeoutMs: 30_000
    };
    const store: TokenStore = {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve()
    };

    await expect(runLocalOAuthLogin(config, store, createMemoryLogger())).rejects.toThrow(/application-default login/);
  });
});
