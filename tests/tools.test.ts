import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGscMcpServer, createToolHandlers, GSC_TOOL_NAMES } from "../src/mcp-server.js";
import type { GscService } from "../src/types.js";

const fakeService = (): GscService => ({
  listSites: vi.fn(() => Promise.resolve({ sites: [] })),
  searchAnalytics: vi.fn(() => Promise.resolve({ rows: [], note: "Results are sorted by clicks." })),
  listSitemaps: vi.fn(() => Promise.resolve({ sitemaps: [] })),
  submitSitemap: vi.fn(() => Promise.resolve(undefined)),
  inspectUrl: vi.fn(() => Promise.resolve({ indexStatus: {} }))
});

describe("MCP tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers all seven required tool names", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createGscMcpServer({ service: fakeService(), readonly: true });
    const client = new Client({ name: "test-client", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...GSC_TOOL_NAMES].sort());

    await client.close();
    await server.close();
  });

  it("fails sitemap submission before API calls in readonly mode", async () => {
    let submitCalled = false;
    const service: GscService = {
      ...fakeService(),
      submitSitemap: () => {
        submitCalled = true;
        return Promise.resolve();
      }
    };
    const handlers = createToolHandlers({ service, readonly: true });

    const result = await handlers.gsc_submit_sitemap(
      { site_url: "https://example.com/", sitemap_url: "https://example.com/sitemap.xml" },
      { signal: new AbortController().signal }
    );

    expect(result.isError).toBe(true);
    const firstContent = result.content[0];
    expect(firstContent?.type).toBe("text");
    if (firstContent?.type === "text") {
      expect(firstContent.text).toMatch(/readonly/i);
    }
    expect(submitCalled).toBe(false);
  });
});
