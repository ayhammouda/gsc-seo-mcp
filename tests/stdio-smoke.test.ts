import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGACY_READONLY_WARNING } from "../src/config.js";
import { GSC_TOOL_NAMES } from "../src/mcp-server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const FAST_FAILURE_TIMEOUT_MS = 5_000;
const PROCESS_TEST_TIMEOUT_MS = 15_000;

interface JsonRpcFrame {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
}

interface StdioSmokeResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface ExecFileFailure extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFrames(stdout: string): JsonRpcFrame[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRpcFrame);
}

function hasResponseId(stdout: string, id: number): boolean {
  return parseFrames(stdout).some((frame) => frame.id === id);
}

function extractToolNames(frame: JsonRpcFrame | undefined): string[] {
  if (!frame || !isRecord(frame.result)) return [];
  const tools = frame.result.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : undefined))
    .filter((toolName): toolName is string => toolName !== undefined);
}

function containmentEnv(): Record<string, string> {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      entry[0] !== "GSC_SEO_MCP_READONLY" &&
      entry[0] !== "GSC_SEO_MCP_MODE" &&
      entry[0] !== "GSC_SEO_MCP_ALLOWED_PROPERTIES"
  );
  return {
    ...Object.fromEntries(inherited),
    GSC_SEO_MCP_MODE: "read_only",
    GSC_SEO_MCP_ALLOWED_PROPERTIES: '["https://example.com/"]'
  };
}

function runStdioSmoke(): Promise<StdioSmokeResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["dist/cli.js", "stdio"], {
      cwd: repoRoot,
      env: containmentEnv(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolvePromise({ stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, CHILD_PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (hasResponseId(stdout, 2)) {
        clearTimeout(timer);
        child.stdin.end();
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      finish();
    });

    const requests = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "stdio-smoke", version: "0.0.0" }
        }
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
    ];

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
  });
}

describe("stdio transport smoke", () => {
  it("lists tools over a real stdio JSON-RPC process without stdout pollution", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const result = await runStdioSmoke();
    const frames = parseFrames(result.stdout);
    const toolsFrame = frames.find((frame) => frame.id === 2);

    expect(result.timedOut).toBe(false);
    expect(result.stderr).toBe("");
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames.every((frame) => frame.jsonrpc === "2.0")).toBe(true);
    expect(extractToolNames(toolsFrame).sort()).toEqual([...GSC_TOOL_NAMES].sort());
  });

  it("fails startup without an allowlist before opening the MCP transport", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const env = containmentEnv();
    delete env.GSC_SEO_MCP_ALLOWED_PROPERTIES;
    env.GSC_SEO_MCP_AUTH_MODE = "adc";
    let failure: ExecFileFailure | undefined;

    try {
      await execFileAsync(process.execPath, ["dist/cli.js", "stdio"], {
        cwd: repoRoot,
        env,
        timeout: FAST_FAILURE_TIMEOUT_MS
      });
    } catch (error: unknown) {
      failure = error as ExecFileFailure;
    }

    expect(failure?.code).toBe(1);
    expect(failure?.stdout).toBe("");
    expect(failure?.stderr).toContain("GSC_SEO_MCP_ALLOWED_PROPERTIES is required for server startup");
  });

  it("keeps legacy true read-only with a secret-free stderr deprecation warning", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const env = containmentEnv();
    delete env.GSC_SEO_MCP_MODE;
    env.GSC_SEO_MCP_READONLY = "true";

    const result = await execFileAsync(process.execPath, ["dist/cli.js", "auth", "status", "--auth-mode", "adc"], {
      cwd: repoRoot,
      env,
      timeout: FAST_FAILURE_TIMEOUT_MS
    });

    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      authMode: "adc",
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"]
    });
    expect(result.stderr).toContain(LEGACY_READONLY_WARNING);
    expect(result.stderr).not.toMatch(/access_token|refresh_token|client_secret|authorization code/i);
  });
});
