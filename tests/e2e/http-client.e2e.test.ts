import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { GSC_TOOL_NAMES } from "../../src/mcp-server.js";
import { createMemoryLogger } from "../../src/security.js";
import { serveHttp } from "../../src/transport.js";
import type { GscService } from "../../src/types.js";

function fakeService(): GscService {
  return {
    listSites: () => Promise.resolve({ sites: [] }),
    searchAnalytics: () => Promise.resolve({ rows: [], note: "Results are sorted by clicks." }),
    listSitemaps: () => Promise.resolve({ sitemaps: [] }),
    submitSitemap: () => Promise.resolve(),
    inspectUrl: () => Promise.resolve({ indexStatus: {} })
  };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to reserve local port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

describe("Streamable HTTP client E2E", () => {
  it("connects to the loopback HTTP transport and lists tools through the SDK client", async () => {
    const port = await reservePort();
    const server = await serveHttp({ host: "127.0.0.1", port, path: "/mcp" }, { service: fakeService(), readonly: true }, createMemoryLogger());
    const client = new Client({ name: "http-e2e", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(server.url));

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...GSC_TOOL_NAMES].sort());
    } finally {
      await client.close();
      await server.close();
    }
  });
});
