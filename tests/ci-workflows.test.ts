import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function packageScript(name: string): string {
  const scripts = (JSON.parse(readRepoFile("package.json")) as {
    scripts: Record<string, string>;
  }).scripts;
  const script = scripts[name];
  if (script === undefined) throw new Error(`package.json is missing the ${name} script`);
  return script;
}

/**
 * Vitest CLI positional arguments are substring filters applied after `include`
 * globbing, never an additional include. Asking vitest itself which files a CI
 * command collects is the only way to prove the command reaches a directory;
 * asserting on the script string cannot.
 */
function filesCollectedBy(script: string): readonly string[] {
  const vitestInvocation = script.split("&&").at(-1)?.trim() ?? "";
  const args = vitestInvocation.replace(/^vitest\s+run\s*/, "");
  const listed = execFileSync(
    "sh",
    ["-c", `./node_modules/.bin/vitest list --filesOnly ${args}`],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return listed.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".test.ts"));
}

function testFilesOnDisk(directory = "tests"): readonly string[] {
  return readdirSync(resolve(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) return testFilesOnDisk(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("GitHub workflow coverage", () => {
  it("runs the standard checks and package smoke in CI", () => {
    const workflow = readRepoFile(".github/workflows/ci.yml");

    expect(workflow).toContain("os: [ubuntu-latest, macos-latest]");
    expect(workflow).toContain('node-version: ["22.x", "24.x"]');
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run test:unit");
    expect(workflow).toContain("npm run test:e2e");
    expect(workflow).toContain("npm run pack:dry-run");
    expect(workflow).toContain("node dist/cli.js --version");
  });

  it("collects every non-live test file across the two commands CI runs", () => {
    const collected = new Set([
      ...filesCollectedBy(packageScript("test:unit")),
      ...filesCollectedBy(packageScript("test:e2e"))
    ]);
    const expected = testFilesOnDisk().filter((path) => !path.startsWith("tests/live/"));

    expect(expected.length).toBeGreaterThan(0);
    expect([...expected].filter((path) => !collected.has(path))).toEqual([]);
  }, 60_000);

  it("keeps security and supply-chain workflows enabled", () => {
    const security = readRepoFile(".github/workflows/security.yml");
    const codeql = readRepoFile(".github/workflows/codeql.yml");
    const scorecard = readRepoFile(".github/workflows/scorecard.yml");
    const dependabot = readRepoFile(".github/dependabot.yml");

    expect(security).toContain("npm audit --omit=dev");
    expect(codeql).toContain("languages: javascript-typescript");
    expect(codeql).toContain("permissions: read-all");
    expect(codeql).toMatch(/analyze:[\s\S]*?permissions:[\s\S]*?security-events: write/);
    expect(scorecard).toContain("ossf/scorecard-action");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
  });

  it("pins every third-party action to an immutable commit", () => {
    const workflowDirectory = resolve(repoRoot, ".github/workflows");
    const actionUses = readdirSync(workflowDirectory)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .flatMap((name) => readFileSync(resolve(workflowDirectory, name), "utf8").match(/uses:\s*(\S+)/g) ?? [])
      .map((entry) => entry.replace(/^uses:\s*/, ""));

    expect(actionUses.length).toBeGreaterThan(0);
    expect(actionUses.filter((action) => !/@[0-9a-f]{40}$/.test(action))).toEqual([]);
  });

  it("retains release evidence while technically freezing every publish path", () => {
    const workflow = readRepoFile(".github/workflows/release.yml");
    const jobsSection = workflow.split(/^jobs:\s*$/m)[1];
    if (!jobsSection) throw new Error("Release workflow is missing its jobs section");
    const jobIds = [...jobsSection.matchAll(/^[ ]{2}([a-z0-9-]+):$/gm)].map((match) => match[1]);

    expect(workflow).toContain('tags:');
    expect(workflow).toContain('TAG_VERSION="${GITHUB_REF_NAME#v}"');
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run test:unit");
    expect(workflow).toContain("npm pack --json");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("release-freeze:");
    expect(workflow).toContain("Publishing frozen pending WP-10");
    expect(workflow).toContain("exit 1");
    expect(jobIds).toEqual(["build", "release-freeze"]);

    expect(workflow).not.toContain("publish-npm:");
    expect(workflow).not.toContain("publish-mcp-registry:");
    expect(workflow).not.toContain("github-release:");
    expect(workflow).not.toContain("npm publish ");
    expect(workflow).not.toContain("mcp-publisher");
    expect(workflow).not.toContain("softprops/action-gh-release");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("contents: write");
  });
});
