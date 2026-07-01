import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createGscMcpServer } from "../../src/mcp-server.js";
import type { GscService } from "../../src/types.js";

type ClientCallToolResult = Awaited<ReturnType<Client["callTool"]>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredContentFrom(result: ClientCallToolResult): Record<string, unknown> {
  if ("structuredContent" in result && isRecord(result.structuredContent)) {
    return result.structuredContent;
  }
  throw new Error("Expected structuredContent object in tool result");
}

function textContentFrom(result: ClientCallToolResult): string {
  if (!("content" in result)) return "";
  const contentBlocks: unknown = result.content;
  if (!Array.isArray(contentBlocks)) return "";
  const textBlocks: string[] = [];
  for (const content of contentBlocks) {
    if (isRecord(content) && content.type === "text" && typeof content.text === "string") {
      textBlocks.push(content.text);
    }
  }
  return textBlocks.join("\n");
}

async function callTool(service: GscService, name: string, args: Record<string, unknown>): Promise<ClientCallToolResult> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createGscMcpServer({ service, readonly: true });
  const client = new Client({ name: "payload-budget", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}

describe("model-visible payload budget", () => {
  it("does not duplicate large structured Search Console payloads into text content", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      keys: [`query-${index}`, `https://example.com/page-${index}`],
      clicks: 100 - index,
      impressions: 10_000 + index,
      ctr: 0.01,
      position: 8
    }));
    const service: GscService = {
      listSites: () => Promise.resolve({ sites: [] }),
      searchAnalytics: () => Promise.resolve({ rows, note: "Results are sorted by clicks." }),
      listSitemaps: () => Promise.resolve({ sitemaps: [] }),
      submitSitemap: () => Promise.resolve(),
      inspectUrl: () => Promise.resolve({ indexStatus: {} })
    };

    const result = await callTool(service, "gsc_search_analytics", {
      site_url: "https://example.com/",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      dimensions: ["query", "page"]
    });
    const structuredContent = structuredContentFrom(result);
    const structuredJson = JSON.stringify(structuredContent);
    const textContent = textContentFrom(result);

    expect(textContent).toBe("Returned 50 search analytics rows.");
    expect(textContent).not.toBe(structuredJson);
    expect(textContent.length).toBeLessThan(128);
    expect(textContent.length).toBeLessThan(structuredJson.length / 20);
  });

  it("redacts secrets from tool error text before it becomes model-visible content", async () => {
    const service: GscService = {
      listSites: () =>
        Promise.reject(
          new Error(
            "Google failed with access_token=ya29.access refresh_token=1//refresh code=4/abc client_secret=GOCSPX-secret Authorization: Bearer bearer-secret"
          )
        ),
      searchAnalytics: () => Promise.resolve({ rows: [], note: "Results are sorted by clicks." }),
      listSitemaps: () => Promise.resolve({ sitemaps: [] }),
      submitSitemap: () => Promise.resolve(),
      inspectUrl: () => Promise.resolve({ indexStatus: {} })
    };

    const result = await callTool(service, "gsc_list_sites", {});
    const serialized = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("ya29.access");
    expect(serialized).not.toContain("1//refresh");
    expect(serialized).not.toContain("4/abc");
    expect(serialized).not.toContain("GOCSPX-secret");
    expect(serialized).not.toContain("bearer-secret");
  });
});
