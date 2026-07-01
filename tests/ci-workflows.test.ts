import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
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

  it("keeps security and supply-chain workflows enabled", () => {
    const security = readRepoFile(".github/workflows/security.yml");
    const codeql = readRepoFile(".github/workflows/codeql.yml");
    const scorecard = readRepoFile(".github/workflows/scorecard.yml");
    const dependabot = readRepoFile(".github/dependabot.yml");

    expect(security).toContain("npm audit --omit=dev");
    expect(codeql).toContain("languages: javascript-typescript");
    expect(scorecard).toContain("ossf/scorecard-action");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
  });

  it("release workflow validates versions before npm and MCP Registry publish", () => {
    const workflow = readRepoFile(".github/workflows/release.yml");

    expect(workflow).toContain('tags:');
    expect(workflow).toContain('TAG_VERSION="${GITHUB_REF_NAME#v}"');
    expect(workflow).toContain("npm publish dist-package/*.tgz --provenance");
    expect(workflow).toContain("./mcp-publisher validate server.json");
    expect(workflow).toContain("./mcp-publisher login github-oidc");
    expect(workflow).toContain("./mcp-publisher publish");
    expect(workflow).toContain("softprops/action-gh-release");
  });
});
