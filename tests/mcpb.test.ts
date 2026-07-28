import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GSC_TOOL_NAMES } from "../src/mcp-server.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHILD_PROCESS_TIMEOUT_MS = 10_000;

interface PackageJson {
  version: string;
  scripts: Record<string, string>;
  overrides: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface McpbManifest {
  manifest_version: string;
  name: string;
  version: string;
  server: {
    type: string;
    entry_point: string;
    mcp_config: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
  tools: Array<{ name: string }>;
  user_config: Record<
    string,
    {
      type: string;
      required?: boolean;
      sensitive?: boolean;
      default?: unknown;
    }
  >;
  compatibility: {
    runtimes: Record<string, string>;
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as T;
}

describe("MCPB distribution candidate", () => {
  it("pins the official MCPB toolchain without an advisory-prone tmp release", () => {
    const packageJson = readJson<PackageJson>("package.json");

    expect(packageJson.devDependencies["@anthropic-ai/mcpb"]).toBe("2.1.2");
    expect(packageJson.overrides.tmp).toBe("0.2.7");
    expect(packageJson.scripts["mcpb:validate"]).toBe("mcpb validate mcpb/manifest.json");
    expect(packageJson.scripts["mcpb:pack"]).toBe(
      "npm run build && node scripts/build-mcpb.mjs"
    );
    expect(packageJson.scripts["mcpb:smoke"]).toBe("node scripts/smoke-mcpb.mjs");
  });

  it("keeps the bundle metadata aligned with the contained runtime", () => {
    const packageJson = readJson<PackageJson>("package.json");
    const manifest = readJson<McpbManifest>("mcpb/manifest.json");

    expect(manifest.manifest_version).toBe("0.4");
    expect(manifest.name).toBe("gsc-seo-mcp");
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.server).toEqual({
      type: "node",
      entry_point: "server/dist/cli.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/dist/cli.js", "stdio"],
        env: {
          GSC_SEO_MCP_AUTH_MODE: "adc",
          GSC_SEO_MCP_ALLOWED_PROPERTIES: "${user_config.allowed_properties}",
          GSC_SEO_MCP_MODE: "read_only"
        }
      }
    });
    expect(manifest.tools.map(({ name }) => name)).toEqual(GSC_TOOL_NAMES);
    expect(manifest.compatibility.runtimes.node).toBe(">=22.7.5");
  });

  it("requires an exact allowlist without collecting credentials in the manifest", () => {
    const manifest = readJson<McpbManifest>("mcpb/manifest.json");
    const allowedProperties = manifest.user_config.allowed_properties;

    expect(Object.keys(manifest.user_config)).toEqual(["allowed_properties"]);
    expect(allowedProperties?.type).toBe("string");
    expect(allowedProperties?.required).toBe(true);
    expect(allowedProperties?.default).toBeUndefined();
    expect(allowedProperties?.sensitive).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toMatch(
      /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID|TOKEN_STORE|refresh_token|access_token/i
    );
  });

  it("does not expose the parent environment to bundled smoke-test code", () => {
    const smokeScript = readFileSync(resolve(repoRoot, "scripts", "smoke-mcpb.mjs"), "utf8");

    expect(smokeScript).toContain('GSC_SEO_MCP_ALLOWED_PROPERTIES: \'["sc-domain:example.com"]\'');
    expect(smokeScript).toContain('GSC_SEO_MCP_AUTH_MODE: "adc"');
    expect(smokeScript).toContain('GSC_SEO_MCP_MODE: "read_only"');
    expect(smokeScript).not.toContain("...process.env");
  });

  it("passes the official MCPB 0.4 schema validator", async () => {
    const cliPath = resolve(
      repoRoot,
      "node_modules",
      "@anthropic-ai",
      "mcpb",
      "dist",
      "cli",
      "cli.js"
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [cliPath, "validate", resolve(repoRoot, "mcpb", "manifest.json")],
      {
        cwd: repoRoot,
        timeout: CHILD_PROCESS_TIMEOUT_MS
      }
    );

    expect(stdout).toContain("Manifest schema validation passes!");
  });
});
