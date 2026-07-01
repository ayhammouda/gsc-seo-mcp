# Release Process

## One-Time Setup

### npm Trusted Publishing

Configure trusted publishing for this package on npmjs.com:

- Package: `gsc-seo-mcp`
- Publisher: GitHub Actions
- Owner: `ayhammouda`
- Repository: `gsc-seo-mcp`
- Workflow filename: `release.yml`
- Environment name: `npm`
- Allowed action: `npm publish`

The release workflow uses OIDC and `npm publish --provenance`, so it does not require a long-lived `NPM_TOKEN`.

### MCP Registry Publishing

The release workflow publishes `server.json` with:

```bash
./mcp-publisher login github-oidc
./mcp-publisher publish
```

The repository namespace must be authorized for `io.github.ayhammouda/gsc-seo-mcp`.

## Release Checklist

Replace `X.Y.Z` with the version being released.

### Pre-Release Verification

- [ ] All CI workflows are green on `main`.
- [ ] Local checks pass:
  ```bash
  npm run typecheck
  npm run lint
  npm test
  npm run build
  npm run pack:dry-run
  ```
- [ ] Version-bearing files agree:
  ```bash
  node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync("package.json")); const s=JSON.parse(fs.readFileSync("server.json")); console.log({package:p.version, server:s.version, registryPackage:s.packages[0].version})'
  rg 'GSC_SERVER_VERSION = "' src/mcp-server.ts
  ```
- [ ] `CHANGELOG.md` has an entry for `X.Y.Z`.
- [ ] `README.md`, `server.json`, `glama.json`, and `.github/TEST-STRATEGY.md` match the current tool surface.
- [ ] MCP Registry metadata validates:
  ```bash
  curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
  ./mcp-publisher validate server.json
  ```
- [ ] Manual MCP QA from `.github/INTEGRATION-TEST.md` is complete.

### Tag And Release

- [ ] Create an annotated tag:
  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  ```
- [ ] Push the tag:
  ```bash
  git push origin vX.Y.Z
  ```
- [ ] Watch the release workflow:
  ```bash
  gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
  ```
- [ ] Confirm all release jobs pass: build and test, npm publish, MCP Registry publish, GitHub Release.

### Post-Release Verification

- [ ] npm package page shows `X.Y.Z` and provenance.
- [ ] Fresh install works:
  ```bash
  npx -y gsc-seo-mcp@X.Y.Z --version
  ```
- [ ] MCP Registry shows `X.Y.Z` for `io.github.ayhammouda/gsc-seo-mcp`.
- [ ] GitHub Release `vX.Y.Z` exists with the npm tarball attached.
- [ ] A real MCP client can connect to the published package over stdio.
