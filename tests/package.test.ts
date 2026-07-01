import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GSC_SERVER_NAME, GSC_SERVER_VERSION } from "../src/mcp-server.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface PackageJson {
  name: string;
  version: string;
  bin: Record<string, string>;
  files: string[];
}

interface ServerJson {
  name: string;
  version: string;
  packages: Array<{
    registryType: string;
    identifier: string;
    version: string;
    transport: { type: string };
  }>;
}

interface PackFile {
  path: string;
}

interface PackResult {
  files: PackFile[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as T;
}

describe("package metadata", () => {
  it("keeps runtime, npm, and MCP Registry versions in sync", () => {
    const packageJson = readJson<PackageJson>("package.json");
    const serverJson = readJson<ServerJson>("server.json");
    const registryPackage = serverJson.packages[0];

    expect(GSC_SERVER_NAME).toBe(packageJson.name);
    expect(GSC_SERVER_VERSION).toBe(packageJson.version);
    expect(serverJson.version).toBe(packageJson.version);
    expect(registryPackage?.version).toBe(packageJson.version);
    expect(registryPackage?.identifier).toBe(packageJson.name);
    expect(registryPackage?.registryType).toBe("npm");
    expect(registryPackage?.transport.type).toBe("stdio");
  });

  it("exposes an executable package CLI and version flag", async () => {
    const packageJson = readJson<PackageJson>("package.json");
    const cliPath = packageJson.bin[packageJson.name];

    expect(cliPath).toBe("./dist/cli.js");
    if (!cliPath) throw new Error(`Missing ${packageJson.name} bin entry`);

    const { stdout } = await execFileAsync(process.execPath, [resolve(repoRoot, cliPath), "--version"], {
      cwd: repoRoot
    });
    expect(stdout.trim()).toBe(`${packageJson.name} ${packageJson.version}`);
  });

  it("packs only runtime files and public metadata", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024
    });
    const [packResult] = JSON.parse(stdout) as PackResult[];
    if (!packResult) throw new Error("npm pack did not return a package result");
    const paths = new Set(packResult.files.map((file) => file.path));

    expect(paths.has("dist/cli.js")).toBe(true);
    expect(paths.has("README.md")).toBe(true);
    expect(paths.has("LICENSE")).toBe(true);
    expect(paths.has("server.json")).toBe(true);
    expect(paths.has("glama.json")).toBe(true);
    expect(paths.has("SECURITY.md")).toBe(true);
    expect(paths.has("CHANGELOG.md")).toBe(true);
    expect([...paths].some((path) => path.startsWith("src/"))).toBe(false);
    expect([...paths].some((path) => path.startsWith("tests/"))).toBe(false);
    expect([...paths].some((path) => path.endsWith(".tgz"))).toBe(false);
    expect([...paths].some((path) => path.startsWith(".env"))).toBe(false);
  });
});
