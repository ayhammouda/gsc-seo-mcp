import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryLogger } from "../src/security.js";
import { serveHttp } from "../src/transport.js";
import type { GscService } from "../src/types.js";

const fakeService = (): GscService => ({
  listSites: () => Promise.resolve({ sites: [] }),
  searchAnalytics: () => Promise.resolve({ rows: [], note: "Results are sorted by clicks." }),
  listSitemaps: () => Promise.resolve({ sitemaps: [] }),
  submitSitemap: () => Promise.resolve(),
  inspectUrl: () => Promise.resolve({ indexStatus: {} })
});

describe("serveHttp", () => {
  const servers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("rejects malformed Host before MCP handling instead of hanging", async () => {
    const server = await serveHttp(
      { host: "127.0.0.1", port: 0, path: "/mcp" },
      { service: fakeService(), readonly: true },
      createMemoryLogger()
    );
    servers.push(server);
    const port = new URL(server.url).port;

    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: "/mcp",
          method: "POST",
          headers: {
            Host: "bad host",
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream"
          },
          timeout: 750
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on("timeout", () => {
        req.destroy(new Error("request timed out"));
      });
      req.on("error", reject);
      req.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0.0.0" } }
        })
      );
    });

    expect(status).toBe(403);
  });
});
