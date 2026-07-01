import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HttpConfig } from "./types.js";
import { createGscMcpServer, type GscServerDeps } from "./mcp-server.js";
import type { Logger } from "./security.js";

function allowedHostnames(config: HttpConfig): string[] {
  const hosts = new Set([config.host]);
  if (config.host === "127.0.0.1" || config.host === "localhost") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return [...hosts];
}

function allowedHostHeaders(config: HttpConfig): string[] {
  return allowedHostnames(config).flatMap((host) => [host, `${host}:${config.port}`]);
}

function allowedOrigins(config: HttpConfig): string[] {
  return allowedHostnames(config).flatMap((host) => [`http://${host}:${config.port}`]);
}

export function validateLocalHttpRequest(req: IncomingMessage, config: HttpConfig): string | null {
  const hostHeader = req.headers.host;
  if (!hostHeader) return "Missing Host header";
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return `Invalid Host header: ${hostHeader}`;
  }
  if (!allowedHostnames(config).includes(hostname)) {
    return `Invalid Host: ${hostname}`;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!allowedHostnames(config).includes(parsed.hostname) || Number(parsed.port || 80) !== config.port) {
        return `Invalid Origin: ${origin}`;
      }
    } catch {
      return `Invalid Origin: ${origin}`;
    }
  }
  return null;
}

function reject(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

export async function serveStdio(deps: GscServerDeps): Promise<void> {
  const server = createGscMcpServer(deps);
  await server.connect(new StdioServerTransport());
}

export async function serveHttp(config: HttpConfig, deps: GscServerDeps, logger: Logger): Promise<{ close(): Promise<void>; url: string }> {
  // TODO(prod): add real remote authentication before non-local binding.
  const httpServer = createServer((req, res) => {
    void (async () => {
      const validationError = validateLocalHttpRequest(req, config);
      if (validationError) {
        reject(res, 403, validationError);
        return;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      } catch {
        reject(res, 400, "Invalid request URL");
        return;
      }
      if (parsedUrl.pathname !== config.path) {
        reject(res, 404, "Not found");
        return;
      }

      const mcpServer = createGscMcpServer(deps);
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        enableDnsRebindingProtection: true,
        allowedHosts: allowedHostHeaders(config),
        allowedOrigins: allowedOrigins(config)
      });
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        void transport.close();
        void mcpServer.close();
      };
      res.once("finish", cleanup);
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        logger.error(`HTTP transport error: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) reject(res, 500, "Internal server error");
      } finally {
        if (res.writableEnded) cleanup();
      }
    })();
  });

  await new Promise<void>((resolve, rejectPromise) => {
    httpServer.once("error", rejectPromise);
    httpServer.listen(config.port, config.host, () => resolve());
  });

  const address = httpServer.address() as AddressInfo;
  const url = `http://${config.host}:${address.port}${config.path}`;
  logger.info(`gsc-seo-mcp listening on ${url}`);
  return {
    url,
    close: () =>
      new Promise((resolve, rejectPromise) => {
        httpServer.close((error) => (error ? rejectPromise(error) : resolve()));
      })
  };
}
