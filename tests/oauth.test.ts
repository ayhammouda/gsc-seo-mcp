import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createRuntimeMcpServer, runLocalOAuthLogin, validateOAuthCallback } from "../src/oauth.js";
import { createMemoryLogger } from "../src/security.js";
import type { TokenStore } from "../src/auth/token-store.js";
import type { AppConfig } from "../src/types.js";

const readOnlyConfig = (): AppConfig => ({
  authMode: "stored",
  mode: "read_only",
  allowedProperties: [],
  tokenStorePath: "/tmp/gsc-seo-mcp-test-tokens.json",
  requestTimeoutMs: 30_000,
  totalDeadlineMs: 45_000
});

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
    const config = readOnlyConfig();
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
      ...readOnlyConfig(),
      authMode: "adc"
    };
    const store: TokenStore = {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve()
    };

    await expect(runLocalOAuthLogin(config, store, createMemoryLogger())).rejects.toThrow(/application-default login/);
  });

  it.each(["operator", "full_admin", "unexpected", undefined])(
    "rejects mode %s before OAuth configuration or callback setup",
    async (mode) => {
      const config = { ...readOnlyConfig(), mode } as unknown as AppConfig;
      const store: TokenStore = {
        load: () => Promise.reject(new Error("token store must not be read")),
        save: () => Promise.reject(new Error("token store must not be written"))
      };

      await expect(runLocalOAuthLogin(config, store, createMemoryLogger())).rejects.toThrow(
        /only GSC_SEO_MCP_MODE=read_only/
      );
    }
  );
});

describe("createRuntimeMcpServer", () => {
  it.each(["operator", "full_admin", "unexpected", undefined])(
    "rejects mode %s synchronously before runtime construction",
    (mode) => {
      const config = { ...readOnlyConfig(), mode } as unknown as AppConfig;

      expect(() => createRuntimeMcpServer(config)).toThrow(/only GSC_SEO_MCP_MODE=read_only/);
    }
  );

  it("keeps the credential-bearing service private and lazy behind policy", async () => {
    let tokenStoreReads = 0;
    const store: TokenStore = {
      load: () => {
        tokenStoreReads += 1;
        return Promise.resolve(null);
      },
      save: () => Promise.resolve()
    };
    const config = { ...readOnlyConfig(), allowedProperties: ["https://example.com/"] };
    const server = createRuntimeMcpServer(config, store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "oauth-kernel-boundary", version: "0.1.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "gsc_list_sitemaps",
        arguments: { site_url: "sc-domain:denied.example" }
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
    expect(tokenStoreReads).toBe(0);
  });

  it("snapshots runtime configuration before the lazy credential path can observe caller mutation", async () => {
    let tokenStoreReads = 0;
    const store: TokenStore = {
      load: () => {
        tokenStoreReads += 1;
        return Promise.resolve(null);
      },
      save: () => Promise.resolve()
    };
    const config = { ...readOnlyConfig(), allowedProperties: ["https://example.com/"] };
    const server = createRuntimeMcpServer(config, store);
    config.mode = "operator";
    config.authMode = "adc";
    config.requestTimeoutMs = 1;
    config.totalDeadlineMs = 1;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "oauth-config-snapshot", version: "0.1.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "gsc_list_sites",
        arguments: {}
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toMatch(/No Google credentials found/);
    } finally {
      await client.close();
      await server.close();
    }

    expect(tokenStoreReads).toBe(1);
  });

  it("does not export the raw runtime service constructor", async () => {
    const oauthModule: object = await import("../src/oauth.js");

    expect("createRuntimeService" in oauthModule).toBe(false);
  });
});
