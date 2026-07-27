import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createContainedGscMcpServer } from "../../src/app/bootstrap.js";
import { GSC_TOOL_SCHEMA_CONTRACTS } from "../../src/kernel/index.js";
import type { GSC_TOOL_NAMES } from "../../src/kernel/index.js";
import type { GscService, SearchAnalyticsOutput } from "../../src/types.js";

type ToolName = (typeof GSC_TOOL_NAMES)[number];
type ServiceCallName = "listSites" | "searchAnalytics" | "listSitemaps" | "inspectUrl";
type ClientCallToolResult = Awaited<ReturnType<Client["callTool"]>>;

interface ToolCase {
  name: ToolName;
  arguments: Record<string, unknown>;
  expectedCalls: Partial<Record<ServiceCallName, number>>;
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
      inspectUrl: () => {
        calls.inspectUrl += 1;
        return Promise.resolve({ indexStatus: { verdict: "PASS" } });
      }
    }
  };
}

async function withInMemoryClient<T>(
  service: GscService,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createContainedGscMcpServer({
    getService: () => service,
    mode: "read_only",
    allowedProperties: ["https://example.com/"],
    requestTimeoutMs: 30_000,
    totalDeadlineMs: 45_000
  });
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
    name: "gsc_inspect_url",
    arguments: { site_url: "https://example.com/", inspection_url: "https://example.com/page" },
    expectedCalls: { inspectUrl: 1 }
  }
];

describe("MCP tool E2E over in-memory transport", () => {
  it.each(toolCases)("calls $name through the MCP client and validates structured output", async (toolCase) => {
    const { calls, service } = createCountingService();
    await withInMemoryClient(
      service,
      async (client) => {
        const result = await client.callTool({ name: toolCase.name, arguments: toolCase.arguments });
        const structuredContent = structuredContentFrom(result);

        GSC_TOOL_SCHEMA_CONTRACTS[toolCase.name].output.parse(structuredContent);
        expect(result.isError).not.toBe(true);
      }
    );

    expect(calls).toEqual(expectedCallCounts(toolCase.expectedCalls));
  });

  it("preserves exact Search Analytics schema boundaries through MCP", async () => {
    const { calls, service } = createCountingService();
    const exactFilter = {
      dimension: "query",
      operator: "equals",
      expression: "x".repeat(4_096)
    };
    const exactGroups = Array.from({ length: 4 }, () => ({
      group_type: "and",
      filters: Array.from({ length: 8 }, () => exactFilter)
    }));

    await withInMemoryClient(service, async (client) => {
      const exact = await client.callTool({
        name: "gsc_search_analytics",
        arguments: {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          row_limit: 1_000,
          start_row: 24_000,
          filters: exactGroups
        }
      });
      expect(exact.isError).not.toBe(true);

      const invalidArguments: Record<string, unknown>[] = [
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          filters: [...exactGroups, exactGroups[0]]
        },
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          filters: [
            {
              group_type: "and",
              filters: [...exactGroups[0]!.filters, exactFilter]
            }
          ]
        },
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          filters: [
            {
              group_type: "and",
              filters: [
                { ...exactFilter, expression: "x".repeat(4_097) }
              ]
            }
          ]
        },
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          row_limit: 1_000,
          start_row: 24_001
        },
        {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-01",
          filters: [
            {
              group_type: "and",
              filters: [
                {
                  ...exactFilter,
                  unexpected: true
                }
              ]
            }
          ]
        }
      ];
      for (const arguments_ of invalidArguments) {
        const invalid = await client.callTool({
          name: "gsc_search_analytics",
          arguments: arguments_
        });
        expect(invalid.isError).toBe(true);
      }
    });

    expect(calls.searchAnalytics).toBe(1);
  });

  it("does not expose or execute write or derived tools during containment", async () => {
    const { calls, service } = createCountingService();
    const hiddenCalls = [
      {
        name: "gsc_submit_sitemap",
        arguments: { site_url: "https://example.com/", sitemap_url: "https://example.com/sitemap.xml" }
      },
      {
        name: "gsc_find_declining_pages",
        arguments: {
          site_url: "https://example.com/",
          current_start_date: "2026-01-01",
          current_end_date: "2026-01-31",
          previous_start_date: "2025-12-01",
          previous_end_date: "2025-12-31"
        }
      },
      {
        name: "gsc_find_keyword_opportunities",
        arguments: {
          site_url: "https://example.com/",
          start_date: "2026-01-01",
          end_date: "2026-01-31"
        }
      }
    ];

    await withInMemoryClient(
      service,
      async (client) => {
        for (const hiddenCall of hiddenCalls) {
          const result = await client.callTool(hiddenCall);
          expect(result.isError).toBe(true);
        }
      }
    );

    expect(calls).toEqual(expectedCallCounts({}));
  });
});
