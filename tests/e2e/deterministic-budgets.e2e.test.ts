import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createContainedGscMcpServer } from "../../src/app/bootstrap.js";
import {
  MAX_ACTOR_CONCURRENCY,
  MAX_ALLOWLIST_ENTRIES
} from "../../src/kernel/index.js";
import type { GscService } from "../../src/types.js";

const ALLOWED_PROPERTY = "https://example.com/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serviceWithListSites(
  listSites: GscService["listSites"]
): GscService {
  return {
    listSites,
    searchAnalytics: () =>
      Promise.resolve({ rows: [], note: "Results are sorted by clicks." }),
    listSitemaps: () => Promise.resolve({ sitemaps: [] }),
    inspectUrl: () => Promise.resolve({ indexStatus: {} })
  };
}

async function withClient<T>(
  service: GscService,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createContainedGscMcpServer({
    mode: "read_only",
    allowedProperties: [ALLOWED_PROPERTY],
    requestTimeoutMs: 30_000,
    totalDeadlineMs: 45_000,
    getService: () => service
  });
  const client = new Client({ name: "deterministic-budget-e2e", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("production deterministic budgets over MCP", () => {
  it("fails concurrent calls fast at the actor ceiling, releases permits, and recovers", async () => {
    const releaseBlockedCalls: Array<() => void> = [];
    let serviceCalls = 0;
    let block = true;
    const service = serviceWithListSites(async () => {
      serviceCalls += 1;
      if (block) {
        await new Promise<void>((resolve) => {
          releaseBlockedCalls.push(resolve);
        });
      }
      return { sites: [{ siteUrl: ALLOWED_PROPERTY }] };
    });

    await withClient(service, async (client) => {
      const active = Array.from({ length: MAX_ACTOR_CONCURRENCY }, () =>
        client.callTool({ name: "gsc_list_sites", arguments: {} })
      );
      await vi.waitFor(() => expect(serviceCalls).toBe(MAX_ACTOR_CONCURRENCY));

      const denied = await client.callTool({
        name: "gsc_list_sites",
        arguments: {}
      });
      expect(denied.isError).toBe(true);
      expect(serviceCalls).toBe(MAX_ACTOR_CONCURRENCY);

      block = false;
      for (const release of releaseBlockedCalls) release();
      const completed = await Promise.all(active);
      expect(completed.every((result) => result.isError !== true)).toBe(true);

      const recovered = await client.callTool({
        name: "gsc_list_sites",
        arguments: {}
      });
      expect(recovered.isError).not.toBe(true);
      expect(serviceCalls).toBe(MAX_ACTOR_CONCURRENCY + 1);
    });
  });

  it("accepts the exact filtered item ceiling and rejects one item over", async () => {
    const exactSites = Array.from(
      { length: MAX_ALLOWLIST_ENTRIES },
      () => ({ siteUrl: ALLOWED_PROPERTY })
    );
    await withClient(
      serviceWithListSites(() => Promise.resolve({ sites: exactSites })),
      async (client) => {
        const exact = await client.callTool({
          name: "gsc_list_sites",
          arguments: {}
        });
        expect(exact.isError).not.toBe(true);
        if (
          !isRecord(exact.structuredContent) ||
          !Array.isArray(exact.structuredContent.sites)
        ) {
          throw new Error("Expected bounded sites structured content");
        }
        expect(exact.structuredContent.sites).toHaveLength(
          MAX_ALLOWLIST_ENTRIES
        );
        expect(exact.structuredContent.sites[0]).toEqual({
          siteUrl: ALLOWED_PROPERTY
        });
      }
    );

    const overSites = [...exactSites, { siteUrl: ALLOWED_PROPERTY }];
    await withClient(
      serviceWithListSites(() => Promise.resolve({ sites: overSites })),
      async (client) => {
        const over = await client.callTool({
          name: "gsc_list_sites",
          arguments: {}
        });
        expect(over.isError).toBe(true);
        expect(JSON.stringify(over)).toContain("1000 primary items");
      }
    );
  });
});
