import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createGscMcpServer } from "../../src/mcp-server.js";
import type { GSC_TOOL_NAMES } from "../../src/mcp-server.js";
import { toolSchemaContracts } from "../../src/schemas.js";
import type { GscService, SearchAnalyticsOutput } from "../../src/types.js";

type ToolName = (typeof GSC_TOOL_NAMES)[number];
type ServiceCallName = "listSites" | "searchAnalytics" | "listSitemaps" | "submitSitemap" | "inspectUrl";
type ClientCallToolResult = Awaited<ReturnType<Client["callTool"]>>;

interface ToolCase {
  name: ToolName;
  arguments: Record<string, unknown>;
  expectedCalls: Partial<Record<ServiceCallName, number>>;
  readonly?: boolean;
  hasWriteScope?: boolean;
  expectedWriteScopeChecks?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredContentFrom(result: ClientCallToolResult): Record<string, unknown> {
  if ("structuredContent" in result && isRecord(result.structuredContent)) {
    return result.structuredContent;
  }
  throw new Error("Expected structuredContent object in tool result");
}

function createCountingService(): { calls: Record<ServiceCallName, number>; service: GscService } {
  const calls: Record<ServiceCallName, number> = {
    listSites: 0,
    searchAnalytics: 0,
    listSitemaps: 0,
    submitSitemap: 0,
    inspectUrl: 0
  };
  const analyticsResult: SearchAnalyticsOutput = {
    rows: [
      {
        keys: ["https://example.com/page", "mcp"],
        clicks: 12,
        impressions: 1200,
        ctr: 0.01,
        position: 8
      }
    ],
    note: "Results are sorted by clicks."
  };

  return {
    calls,
    service: {
      listSites: () => {
        calls.listSites += 1;
        return Promise.resolve({ sites: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
      },
      searchAnalytics: () => {
        calls.searchAnalytics += 1;
        return Promise.resolve(analyticsResult);
      },
      listSitemaps: () => {
        calls.listSitemaps += 1;
        return Promise.resolve({ sitemaps: [{ path: "https://example.com/sitemap.xml", errors: 0, warnings: 0 }] });
      },
      submitSitemap: () => {
        calls.submitSitemap += 1;
        return Promise.resolve();
      },
      inspectUrl: () => {
        calls.inspectUrl += 1;
        return Promise.resolve({ indexStatus: { verdict: "PASS" } });
      }
    }
  };
}

async function withInMemoryClient<T>(
  deps: { service: GscService; readonly: boolean; hasWriteScope: () => Promise<boolean> },
  run: (client: Client) => Promise<T>
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createGscMcpServer(deps);
  const client = new Client({ name: "mcp-tools-e2e", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function expectedCallCounts(expected: Partial<Record<ServiceCallName, number>>): Record<ServiceCallName, number> {
  return {
    listSites: expected.listSites ?? 0,
    searchAnalytics: expected.searchAnalytics ?? 0,
    listSitemaps: expected.listSitemaps ?? 0,
    submitSitemap: expected.submitSitemap ?? 0,
    inspectUrl: expected.inspectUrl ?? 0
  };
}

const toolCases: ToolCase[] = [
  {
    name: "gsc_list_sites",
    arguments: {},
    expectedCalls: { listSites: 1 }
  },
  {
    name: "gsc_search_analytics",
    arguments: {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      dimensions: ["query", "page"]
    },
    expectedCalls: { searchAnalytics: 1 }
  },
  {
    name: "gsc_list_sitemaps",
    arguments: { site_url: "https://example.com/" },
    expectedCalls: { listSitemaps: 1 }
  },
  {
    name: "gsc_submit_sitemap",
    arguments: { site_url: "https://example.com/", sitemap_url: "https://example.com/sitemap.xml" },
    expectedCalls: { submitSitemap: 1 },
    readonly: false,
    hasWriteScope: true,
    expectedWriteScopeChecks: 1
  },
  {
    name: "gsc_inspect_url",
    arguments: { site_url: "https://example.com/", inspection_url: "https://example.com/page" },
    expectedCalls: { inspectUrl: 1 }
  },
  {
    name: "gsc_find_declining_pages",
    arguments: {
      site_url: "https://example.com/",
      current_start_date: "2026-02-01",
      current_end_date: "2026-02-28",
      previous_start_date: "2026-01-01",
      previous_end_date: "2026-01-31"
    },
    expectedCalls: { searchAnalytics: 2 }
  },
  {
    name: "gsc_find_keyword_opportunities",
    arguments: {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-31"
    },
    expectedCalls: { searchAnalytics: 1 }
  }
];

describe("MCP tool E2E over in-memory transport", () => {
  it.each(toolCases)("calls $name through the MCP client and validates structured output", async (toolCase) => {
    const { calls, service } = createCountingService();
    let writeScopeChecks = 0;

    await withInMemoryClient(
      {
        service,
        readonly: toolCase.readonly ?? true,
        hasWriteScope: () => {
          writeScopeChecks += 1;
          return Promise.resolve(toolCase.hasWriteScope ?? false);
        }
      },
      async (client) => {
        const result = await client.callTool({ name: toolCase.name, arguments: toolCase.arguments });
        const structuredContent = structuredContentFrom(result);

        toolSchemaContracts[toolCase.name].output.parse(structuredContent);
        expect(result.isError).not.toBe(true);
      }
    );

    expect(calls).toEqual(expectedCallCounts(toolCase.expectedCalls));
    expect(writeScopeChecks).toBe(toolCase.expectedWriteScopeChecks ?? 0);
  });

  it("fails readonly sitemap submission before scope checks or Google calls", async () => {
    const { calls, service } = createCountingService();
    let writeScopeChecks = 0;

    await withInMemoryClient(
      {
        service,
        readonly: true,
        hasWriteScope: () => {
          writeScopeChecks += 1;
          return Promise.resolve(true);
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "gsc_submit_sitemap",
          arguments: { site_url: "https://example.com/", sitemap_url: "https://example.com/sitemap.xml" }
        });

        expect(result.isError).toBe(true);
      }
    );

    expect(calls.submitSitemap).toBe(0);
    expect(writeScopeChecks).toBe(0);
  });
});
