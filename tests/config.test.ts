import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("defaults to readonly localhost HTTP settings", () => {
    const config = resolveConfig({ env: {}, flags: {} });

    expect(config.readonly).toBe(true);
    expect(config.http.host).toBe("127.0.0.1");
    expect(config.http.port).toBe(8787);
    expect(config.http.path).toBe("/mcp");
  });

  it("lets flags override environment variables", () => {
    const config = resolveConfig({
      env: {
        GSC_SEO_MCP_READONLY: "true",
        GSC_SEO_MCP_HTTP_HOST: "localhost",
        GSC_SEO_MCP_HTTP_PORT: "9999",
        GSC_SEO_MCP_HTTP_PATH: "/env"
      },
      flags: {
        readonly: false,
        host: "127.0.0.1",
        port: 8787,
        path: "/mcp"
      }
    });

    expect(config.readonly).toBe(false);
    expect(config.http).toEqual({ host: "127.0.0.1", port: 8787, path: "/mcp" });
  });

  it("rejects invalid booleans, ports, and paths", () => {
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_READONLY: "sometimes" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_READONLY/
    );
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_HTTP_PORT: "70000" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_HTTP_PORT/
    );
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_HTTP_PATH: "mcp" }, flags: {} })).toThrow(
      /GSC_SEO_MCP_HTTP_PATH/
    );
    expect(() => resolveConfig({ env: {}, flags: { port: 0 } })).toThrow(/port/i);
  });

  it("rejects non-loopback HTTP hosts until remote auth exists", () => {
    expect(() => resolveConfig({ env: { GSC_SEO_MCP_HTTP_HOST: "0.0.0.0" }, flags: {} })).toThrow(/loopback/i);
    expect(() => resolveConfig({ env: {}, flags: { host: "::" } })).toThrow(/loopback/i);
  });
});
