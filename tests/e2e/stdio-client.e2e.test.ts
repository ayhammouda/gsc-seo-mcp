import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { GSC_TOOL_NAMES } from "../../src/mcp-server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function safeEnv(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extra }).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function isReadable(value: unknown): value is Readable {
  return typeof value === "object" && value !== null && "setEncoding" in value && "on" in value;
}

describe("stdio client E2E", () => {
  it("connects to the compiled CLI through the SDK stdio client without stderr noise", async () => {
    const tokenDir = await mkdtemp(join(tmpdir(), "gsc-stdio-e2e-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/cli.js", "stdio"],
      cwd: repoRoot,
      env: safeEnv({ GSC_SEO_MCP_TOKEN_STORE_PATH: join(tokenDir, "tokens.json") }),
      stderr: "pipe"
    });
    let stderr = "";
    const stderrStream = transport.stderr;
    if (isReadable(stderrStream)) {
      stderrStream.setEncoding("utf8");
      stderrStream.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }
    const client = new Client({ name: "stdio-e2e", version: "0.1.0" });

    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...GSC_TOOL_NAMES].sort());
      expect(stderr).toBe("");
    } finally {
      await client.close();
    }
  });
});
