#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const bundlePath = resolve(
  repoRoot,
  process.argv[2] ?? `artifacts/gsc-seo-mcp-v${packageJson.version}.mcpb`
);
const mcpbCliPath = resolve(
  repoRoot,
  "node_modules",
  "@anthropic-ai",
  "mcpb",
  "dist",
  "cli",
  "cli.js"
);
const unpackDirectory = await mkdtemp(join(tmpdir(), "gsc-seo-mcp-mcpb-"));
const manifest = JSON.parse(await readFile(resolve(repoRoot, "mcpb", "manifest.json"), "utf8"));
const expectedTools = manifest.tools.map((tool) => tool.name);

async function listRelativeFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listRelativeFiles(resolve(directory, entry.name), relativePath)));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

try {
  await execFileAsync(process.execPath, [mcpbCliPath, "unpack", bundlePath, unpackDirectory], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024
  });

  const bundledFiles = await listRelativeFiles(unpackDirectory);
  const forbiddenFiles = bundledFiles.filter((path) =>
    /(^|\/)(\.env(?:\.|$)|tokens?\.json$|client_secret[^/]*\.json$|package-lock\.json$)/i.test(path)
  );
  if (forbiddenFiles.length > 0) {
    throw new Error(`MCPB contains forbidden files: ${forbiddenFiles.join(", ")}`);
  }

  const bundledCli = resolve(unpackDirectory, "server", "dist", "cli.js");
  const child = spawn(process.execPath, [bundledCli, "stdio"], {
    cwd: unpackDirectory,
    // Deliberately expose only non-sensitive smoke-test values. Inheriting the
    // parent environment could leak CI or developer credentials to bundled code.
    env: {
      GSC_SEO_MCP_ALLOWED_PROPERTIES: '["sc-domain:example.com"]',
      GSC_SEO_MCP_AUTH_MODE: "adc",
      GSC_SEO_MCP_MODE: "read_only"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const childClosed = new Promise((resolvePromise) => {
    child.once("close", resolvePromise);
  });
  child.stdin.on("error", () => {
    // The smoke test intentionally terminates the server after tools/list.
  });

  let stdoutBuffer = "";
  let stderr = "";
  const tools = await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => rejectPromise(new Error(`MCPB stdio smoke timed out. stderr: ${stderr}`)));
    }, 5_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (line.length === 0) continue;
        try {
          const frame = JSON.parse(line);
          if (frame.id === 2 && Array.isArray(frame.result?.tools)) {
            const names = frame.result.tools.map((tool) => tool.name);
            child.stdin.end();
            child.kill("SIGTERM");
            finish(() => resolvePromise(names));
            return;
          }
        } catch {
          child.kill("SIGTERM");
          finish(() => rejectPromise(new Error(`MCPB server wrote non-JSON data to stdout: ${line}`)));
          return;
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });
    child.on("close", (code, signal) => {
      if (!settled) {
        finish(() =>
          rejectPromise(
            new Error(
              `MCPB server exited before tools/list (code ${code}, signal ${signal}). stderr: ${stderr}`
            )
          )
        );
      }
    });

    const requests = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "mcpb-smoke", version: "0.1.0" }
        }
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
    ];
    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
  });

  const sortedTools = [...tools].sort();
  const sortedExpectedTools = [...expectedTools].sort();
  if (JSON.stringify(sortedTools) !== JSON.stringify(sortedExpectedTools)) {
    throw new Error(`Unexpected MCPB tools: ${JSON.stringify(tools)}`);
  }
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await childClosed;
  process.stdout.write(`MCPB smoke passed: ${basename(bundlePath)} exposes ${tools.length} tools\n`);
} finally {
  await rm(unpackDirectory, { recursive: true, force: true });
}
