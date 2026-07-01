import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runLive = process.env.GSC_LIVE_E2E === "true";
const describeLive = runLive ? describe : describe.skip;

function safeEnv(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extra }).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

async function withLiveClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const tokenStorePath = process.env.GSC_SEO_MCP_TOKEN_STORE_PATH ?? join(await mkdtemp(join(tmpdir(), "gsc-live-e2e-")), "tokens.json");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js", "stdio"],
    cwd: repoRoot,
    env: safeEnv({ GSC_SEO_MCP_TOKEN_STORE_PATH: tokenStorePath, GSC_SEO_MCP_READONLY: "true" }),
    stderr: "pipe"
  });
  const client = new Client({ name: "gsc-live-e2e", version: "0.1.0" });

  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

describeLive("live Google Search Console MCP E2E", () => {
  it("calls read-only tools through the packaged stdio server", async () => {
    const siteUrl = process.env.GSC_TEST_SITE_URL;
    if (!siteUrl) {
      throw new Error("GSC_TEST_SITE_URL is required when GSC_LIVE_E2E=true");
    }

    await withLiveClient(async (client) => {
      const sites = await client.callTool({ name: "gsc_list_sites", arguments: {} });
      expect(sites.isError).not.toBe(true);

      const analytics = await client.callTool({
        name: "gsc_search_analytics",
        arguments: {
          site_url: siteUrl,
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          dimensions: ["query"],
          row_limit: 10
        }
      });
      expect(analytics.isError).not.toBe(true);
    });
  });
});
