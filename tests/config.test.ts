import { describe, expect, it } from "vitest";
import { LEGACY_READONLY_WARNING, requireAllowedProperties, resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("defaults to the stored-auth read-only containment profile", () => {
    const config = resolveConfig({ env: {}, flags: {} });

    expect(config.mode).toBe("read_only");
    expect(config.authMode).toBe("stored");
    expect(config.allowedProperties).toEqual([]);
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.totalDeadlineMs).toBe(45_000);
  });

  it("supports explicit Application Default Credentials auth mode", () => {
    expect(resolveConfig({ env: { GSC_SEO_MCP_AUTH_MODE: "adc" }, flags: {} }).authMode).toBe("adc");
    expect(resolveConfig({ env: { GSC_SEO_MCP_AUTH_MODE: "stored" }, flags: { authMode: "adc" } }).authMode).toBe("adc");
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_AUTH_MODE: "magic" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_AUTH_MODE/
    );
  });

  it("parses an exact JSON property allowlist and lets flags override it", () => {
    const fromEnv = resolveConfig({
      env: {
        GSC_SEO_MCP_ALLOWED_PROPERTIES: '["https://example.com/","sc-domain:example.org"]'
      },
      flags: {}
    });
    expect(fromEnv.allowedProperties).toEqual(["https://example.com/", "sc-domain:example.org"]);

    const fromFlags = resolveConfig({
      env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:ignored.example"]' },
      flags: { allowedProperties: ["sc-domain:flag.example"] }
    });
    expect(fromFlags.allowedProperties).toEqual(["sc-domain:flag.example"]);
  });

  it("requires allowed properties only when starting a server", () => {
    const config = resolveConfig({ env: {}, flags: {} });

    expect(() => requireAllowedProperties(config)).toThrow(/GSC_SEO_MCP_ALLOWED_PROPERTIES/);
    expect(
      requireAllowedProperties(
        resolveConfig({
          env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com"]' },
          flags: {}
        })
      )
    ).toEqual(["sc-domain:example.com"]);
  });

  it("rejects malformed or ambiguous allowlists", () => {
    expect(() =>
      resolveConfig({ env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: "sc-domain:example.com" }, flags: {} })
    ).toThrow(/valid JSON/);
    expect(() =>
      resolveConfig({ env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '{"site":"example.com"}' }, flags: {} })
    ).toThrow(/JSON array/);
    expect(() =>
      resolveConfig({ env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: "[]" }, flags: {} })
    ).toThrow(/non-empty JSON array/);
    expect(() =>
      resolveConfig({ env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com",7]' }, flags: {} })
    ).toThrow(/JSON array/);
    expect(() =>
      resolveConfig({ env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '[" sc-domain:example.com"]' }, flags: {} })
    ).toThrow(/whitespace/);
    expect(() =>
      resolveConfig({
        env: {
          GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:Example.com","sc-domain:example.com"]'
        },
        flags: {}
      })
    ).toThrow(/normalized collision/);
    expect(() =>
      resolveConfig({
        env: {
          GSC_SEO_MCP_ALLOWED_PROPERTIES: '["https://example.com:443/","https://example.com/"]'
        },
        flags: {}
      })
    ).toThrow(/normalized collision/);
    expect(() =>
      resolveConfig({
        env: { GSC_SEO_MCP_ALLOWED_PROPERTIES: '["https://example.com"]' },
        flags: {}
      })
    ).toThrow(/trailing slash/);
  });

  it("accepts only read-only mode during WP-00 containment", () => {
    expect(resolveConfig({ env: { GSC_SEO_MCP_MODE: "read_only" }, flags: {} }).mode).toBe("read_only");
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_MODE: "operator" }, flags: {} })).toThrow(
      /disabled during WP-00/
    );
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_MODE: "full_admin" }, flags: {} })).toThrow(
      /unsupported/
    );
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_MODE: "magic" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_MODE/
    );
  });

  it("keeps legacy true read-only but rejects legacy false", () => {
    const warnings: string[] = [];
    expect(
      resolveConfig({
        env: { GSC_SEO_MCP_READONLY: "true" },
        flags: {},
        onWarning: (message) => warnings.push(message)
      }).mode
    ).toBe("read_only");
    expect(warnings).toEqual([LEGACY_READONLY_WARNING]);
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_READONLY: "false" }, flags: {} })).toThrow(
      /no longer enables writes/
    );
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_READONLY: "sometimes" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_READONLY/
    );
  });
});
