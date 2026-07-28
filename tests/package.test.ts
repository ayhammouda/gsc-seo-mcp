import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GSC_SERVER_NAME, GSC_SERVER_VERSION, GSC_TOOL_NAMES } from "../src/mcp-server.js";
import { STDIO_JSON_RPC_FRAME_MAX_BYTES } from "../src/transport.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const PROCESS_TEST_TIMEOUT_MS = 20_000;

interface PackageJson {
  name: string;
  version: string;
  private: boolean;
  bin: Record<string, string>;
  files: string[];
}

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  title: string;
  version: string;
  websiteUrl: string;
  repository: {
    url: string;
    source: string;
  };
  packages?: unknown[];
  remotes?: unknown[];
}

interface ProjectMcpJson {
  mcpServers: {
    "gsc-seo": {
      type: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
}

interface PackFile {
  path: string;
}

interface PackResult {
  filename: string;
  files: PackFile[];
}

interface ExecFileFailure extends Error {
  code?: number | string;
  killed?: boolean;
  stderr?: string;
  stdout?: string;
}

interface PackagedStdioResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface PackagedFatalFrameResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSinglePackResult(output: string): PackResult {
  const parsed: unknown = JSON.parse(output);
  const candidates: unknown[] = Array.isArray(parsed)
    ? (parsed as unknown[])
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  const candidate = candidates[0];

  if (
    candidates.length !== 1 ||
    !isRecord(candidate) ||
    typeof candidate.filename !== "string" ||
    !Array.isArray(candidate.files) ||
    !candidate.files.every(
      (file) => isRecord(file) && typeof file.path === "string"
    )
  ) {
    throw new Error("npm pack did not return exactly one valid package result");
  }

  return candidate as unknown as PackResult;
}

describe("npm pack JSON compatibility", () => {
  const packResult: PackResult = {
    filename: "gsc-seo-mcp-0.1.0.tgz",
    files: [{ path: "dist/cli.js" }]
  };

  it.each([
    ["npm 10/11 array", JSON.stringify([packResult])],
    ["npm 12 keyed object", JSON.stringify({ "gsc-seo-mcp": packResult })]
  ])("parses one successful %s result", (_label, output) => {
    expect(parseSinglePackResult(output)).toEqual(packResult);
  });

  it.each([
    ["empty object", JSON.stringify({})],
    [
      "invalid file entry",
      JSON.stringify({
        "gsc-seo-mcp": {
          filename: "gsc-seo-mcp-0.1.0.tgz",
          files: [{}]
        }
      })
    ],
    ["multiple array results", JSON.stringify([packResult, packResult])],
    [
      "multiple keyed results",
      JSON.stringify({ first: packResult, second: packResult })
    ]
  ])("rejects %s", (_label, output) => {
    expect(() => parseSinglePackResult(output)).toThrow(
      "npm pack did not return exactly one valid package result"
    );
  });
});

function toolNamesFromResult(result: unknown): string[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  return result.tools
    .map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : undefined))
    .filter((name): name is string => name !== undefined);
}

function runPackagedStdioSmoke(packagedCli: string, packageDirectory: string): Promise<PackagedStdioResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [packagedCli, "stdio"], {
      cwd: packageDirectory,
      env: {
        GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com"]',
        GSC_SEO_MCP_AUTH_MODE: "adc",
        GSC_SEO_MCP_MODE: "read_only"
      },
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
    const hasToolsResponse = () =>
      stdout
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .some((line) => {
          try {
            const frame = JSON.parse(line) as { id?: unknown };
            return frame.id === 2;
          } catch {
            return false;
          }
        });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 5_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (hasToolsResponse()) {
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
          clientInfo: { name: "packed-stdio-smoke", version: "0.0.0" }
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

function runPackagedFatalFrame(
  packagedCli: string,
  packageDirectory: string
): Promise<PackagedFatalFrameResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [packagedCli, "stdio"], {
      cwd: packageDirectory,
      env: {
        GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com"]',
        GSC_SEO_MCP_AUTH_MODE: "adc",
        GSC_SEO_MCP_MODE: "read_only"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 2_000);

    child.stdin.on("error", () => {
      // The child intentionally closes its input on the fatal frame.
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, timedOut, exitCode, signal });
    });

    child.stdin.write(
      Buffer.alloc(STDIO_JSON_RPC_FRAME_MAX_BYTES + 1, 0x61)
    );
  });
}

describe("package metadata", () => {
  it("keeps runtime, npm, and MCP Registry versions in sync", () => {
    const packageJson = readJson<PackageJson>("package.json");
    const serverJson = readJson<ServerJson>("server.json");

    expect(GSC_SERVER_NAME).toBe(packageJson.name);
    expect(GSC_SERVER_VERSION).toBe(packageJson.version);
    expect(serverJson.version).toBe(packageJson.version);
  });

  it("keeps source registry metadata bound to this repository", () => {
    const serverJson = readJson<ServerJson>("server.json");

    expect(serverJson.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json"
    );
    expect(serverJson.name).toBe("io.github.ayhammouda/gsc-seo-mcp");
    expect(serverJson.title).toBe("GSC SEO MCP");
    expect(serverJson.websiteUrl).toBe(
      "https://github.com/ayhammouda/gsc-seo-mcp"
    );
    expect(serverJson.repository).toEqual({
      url: "https://github.com/ayhammouda/gsc-seo-mcp",
      source: "github"
    });
  });

  it("technically withholds npm and registry distribution during the freeze", () => {
    const packageJson = readJson<PackageJson>("package.json");
    const serverJson = readJson<ServerJson>("server.json");

    expect(packageJson.private).toBe(true);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.packages).toBeUndefined();
    expect(serverJson.remotes).toBeUndefined();
  });

  it("provides a source-only project MCP configuration with fail-closed inputs", () => {
    const projectMcpJson = readJson<ProjectMcpJson>(".mcp.json");

    expect(projectMcpJson).toEqual({
      mcpServers: {
        "gsc-seo": {
          type: "stdio",
          command: "node",
          args: ["${CLAUDE_PROJECT_DIR:-.}/dist/cli.js", "stdio"],
          env: {
            GSC_SEO_MCP_ALLOWED_PROPERTIES:
              "${GSC_SEO_MCP_ALLOWED_PROPERTIES}",
            GSC_SEO_MCP_AUTH_MODE: "${GSC_SEO_MCP_AUTH_MODE:-stored}",
            GSC_SEO_MCP_MODE: "read_only"
          }
        }
      }
    });
  });

  it("exposes an executable package CLI and version flag", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const packageJson = readJson<PackageJson>("package.json");
    const cliPath = packageJson.bin[packageJson.name];

    expect(cliPath).toBe("./dist/cli.js");
    if (!cliPath) throw new Error(`Missing ${packageJson.name} bin entry`);

    const { stdout } = await execFileAsync(process.execPath, [resolve(repoRoot, cliPath), "--version"], {
      cwd: repoRoot,
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });
    expect(stdout.trim()).toBe(`${packageJson.name} ${packageJson.version}`);
  });

  it("keeps unpacked stdio clean and rejects HTTP before it can bind", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const temporaryDirectory = await mkdtemp(join(repoRoot, ".package-http-rejection-"));
    const sentinel = createServer();

    try {
      const { stdout: packOutput } = await execFileAsync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory],
        {
          cwd: repoRoot,
          maxBuffer: 1024 * 1024,
          timeout: CHILD_PROCESS_TIMEOUT_MS
        }
      );
      const packResult = parseSinglePackResult(packOutput);

      const archivePath = resolve(temporaryDirectory, packResult.filename);
      await execFileAsync("tar", ["-xzf", archivePath, "-C", temporaryDirectory], {
        timeout: CHILD_PROCESS_TIMEOUT_MS
      });
      const packageDirectory = resolve(temporaryDirectory, "package");
      const packagedCli = resolve(packageDirectory, "dist", "cli.js");
      const packedMutationSurfaces = [
        "dist/types.d.ts",
        "dist/oauth.js",
        "dist/oauth.d.ts",
        "dist/google-client.js",
        "dist/google-client.d.ts",
        "dist/schemas.js",
        "dist/schemas.d.ts"
      ]
        .map((path) => readFileSync(resolve(packageDirectory, path), "utf8"))
        .join("\n");
      const packedRegistration = readFileSync(resolve(packageDirectory, "dist", "mcp-server.js"), "utf8");
      const packedOauthDeclaration = readFileSync(resolve(packageDirectory, "dist", "oauth.d.ts"), "utf8");

      expect(packedMutationSurfaces).not.toMatch(
        /submitSitemap|submitSitemapInputSchema|submitSitemapOutputSchema|feedpath/
      );
      expect(packedRegistration).toContain("dispatcher.dispatch");
      expect(packedRegistration).not.toMatch(/createToolHandlers|GscService|service\./);
      expect(packedOauthDeclaration).toContain("createRuntimeMcpServer");
      expect(packedOauthDeclaration).not.toMatch(/createRuntimeService|interface RuntimeService/);

      const stdio = await runPackagedStdioSmoke(packagedCli, packageDirectory);
      const frames = stdio.stdout
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as { id?: unknown; result?: unknown });
      const toolsFrame = frames.find((frame) => frame.id === 2);
      const toolNames = toolNamesFromResult(toolsFrame?.result);

      expect(stdio.timedOut).toBe(false);
      expect(stdio.stderr).toBe("");
      expect(toolNames.sort()).toEqual([...GSC_TOOL_NAMES].sort());

      const fatalFrame = await runPackagedFatalFrame(
        packagedCli,
        packageDirectory
      );
      expect(fatalFrame.timedOut).toBe(false);
      expect(fatalFrame.exitCode).toBe(1);
      expect(fatalFrame.signal).toBeNull();
      expect(fatalFrame.stdout).toBe("");
      expect(fatalFrame.stderr).not.toMatch(
        /access_token|refresh_token|client_secret|authorization code/i
      );

      await new Promise<void>((resolveListen, rejectListen) => {
        sentinel.once("error", rejectListen);
        sentinel.listen(0, "127.0.0.1", () => {
          sentinel.off("error", rejectListen);
          resolveListen();
        });
      });
      const address = sentinel.address();
      if (!address || typeof address === "string") throw new Error("Sentinel did not expose a TCP port");

      let failure: ExecFileFailure | undefined;
      try {
        await execFileAsync(
          process.execPath,
          [packagedCli, "http", "--host", "127.0.0.1", "--port", String(address.port)],
          {
            cwd: resolve(temporaryDirectory, "package"),
            env: {
              GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com"]',
              GSC_SEO_MCP_AUTH_MODE: "adc",
              GSC_SEO_MCP_MODE: "read_only"
            },
            timeout: 2_000
          }
        );
      } catch (error: unknown) {
        failure = error as ExecFileFailure;
      }

      expect(failure).toBeDefined();
      expect(failure?.code).toBe(1);
      expect(failure?.killed).not.toBe(true);
      expect(failure?.stdout).toBe("");
      expect(failure?.stderr).toContain("Unknown command. Run gsc-seo-mcp --help.");
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        if (!sentinel.listening) {
          resolveClose();
          return;
        }
        sentinel.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("packs only runtime files and public metadata", { timeout: PROCESS_TEST_TIMEOUT_MS }, async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });
    const packResult = parseSinglePackResult(stdout);
    const paths = new Set(packResult.files.map((file) => file.path));

    expect(paths.has("dist/cli.js")).toBe(true);
    expect(paths.has("README.md")).toBe(true);
    expect(paths.has("LICENSE")).toBe(true);
    expect(paths.has("server.json")).toBe(true);
    expect(paths.has("glama.json")).toBe(true);
    expect(paths.has("SECURITY.md")).toBe(true);
    expect(paths.has("CHANGELOG.md")).toBe(true);
    expect(paths.has(".mcp.json")).toBe(false);
    expect([...paths].some((path) => path.startsWith("src/"))).toBe(false);
    expect([...paths].some((path) => path.startsWith("tests/"))).toBe(false);
    expect([...paths].some((path) => path.endsWith(".tgz"))).toBe(false);
    expect([...paths].some((path) => path.startsWith(".env"))).toBe(false);
  });
});
