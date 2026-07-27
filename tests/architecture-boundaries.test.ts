import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("WP-01 architecture boundaries", () => {
  it("keeps MCP registration as a manifest-to-dispatcher adapter", () => {
    const registration = source("mcp-server.ts");

    expect(registration).toContain("listCapabilitiesForDispatcher(dispatcher)");
    expect(registration).toContain("dispatcher.dispatch");
    expect(registration).not.toContain("gscCapabilityRegistry");
    expect(registration).not.toMatch(
      /GscService|createToolHandlers|process\.env|service\.|oauth|google-client|config\.js/
    );
  });

  it("keeps stdio transport limited to connecting an already-built server", () => {
    const transport = source("transport.ts");

    expect(transport).toContain("server.connect");
    expect(transport).not.toMatch(/createGscMcpServer|GscService|process\.env|allowedProperties/);
  });

  it("keeps kernel modules independent of transport, CLI, OAuth, and concrete Google clients", () => {
    for (const file of ["kernel/profile.ts", "kernel/manifest.ts", "kernel/ports.ts", "kernel/dispatcher.ts"]) {
      const content = source(file);
      expect(content, file).not.toMatch(/transport\.js|cli\.js|oauth\.js|google-client\.js/);
    }
  });

  it("removes executable mutation methods from the containment runtime and Google client", () => {
    for (const file of ["types.ts", "oauth.ts", "google-client.ts", "schemas.ts"]) {
      expect(source(file), file).not.toMatch(/submitSitemap|submitSitemapInputSchema|submitSitemapOutputSchema/);
    }
  });

  it("exports only the kernel-bound credentialed runtime surface", () => {
    const oauth = source("oauth.ts");

    expect(oauth).toContain("export function createRuntimeMcpServer");
    expect(oauth).not.toContain("export function createRuntimeService");
  });

  it("derives the public schema-contract view from the manifest", () => {
    expect(source("schemas.ts")).not.toContain("toolSchemaContracts");
    expect(source("kernel/manifest.ts")).toContain("GSC_TOOL_SCHEMA_CONTRACTS");
  });
});

describe("WP-02 resource and budget boundaries", () => {
  it("installs deterministic budgets in the production composition root", () => {
    const bootstrap = source("app/bootstrap.ts");

    expect(bootstrap).toContain("createInMemoryBudgetPort()");
    expect(bootstrap).not.toContain("createPassThroughBudgetPort()");
  });

  it("keeps business-date validation independent of JavaScript date parsing", () => {
    for (const file of ["resources/calendar-date.ts", "schemas.ts"]) {
      expect(source(file), file).not.toContain("Date.parse");
    }
  });

  it("keeps the Google gateway behind normalized typed executor inputs", () => {
    const gateway = source("google-client.ts");

    expect(gateway).not.toMatch(
      /searchAnalyticsInputSchema|inspectUrlInputSchema|\.parse\(input\)/
    );
    expect(source("kernel/adapters.ts")).toContain(
      "request.resource.property.apiValue"
    );
  });

  it("uses the bounded stdio transport before SDK message deserialization", () => {
    const transport = source("transport.ts");
    const sizeCheck = transport.indexOf(
      "STDIO_JSON_RPC_FRAME_MAX_BYTES"
    );
    const deserialize = transport.indexOf("deserializeMessage(line)");

    expect(sizeCheck).toBeGreaterThanOrEqual(0);
    expect(deserialize).toBeGreaterThan(sizeCheck);
    expect(transport).toContain(
      "new BoundedStdioServerTransport()"
    );
  });
});
