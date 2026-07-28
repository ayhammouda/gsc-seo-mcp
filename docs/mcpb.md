# MCP Bundle (MCPB)

The repository contains an MCPB 0.4 manifest and a pinned build toolchain for
the `0.1.0` bundle candidate. An MCPB is a ZIP-based local MCP server bundle
that includes its manifest, compiled server, runtime dependencies, and user
configuration.

## Build and validate

From a clean checkout:

```bash
npm ci
npm run mcpb:validate
npm run mcpb:pack
npm run mcpb:smoke
```

The pack command builds the TypeScript server, creates an isolated production
dependency tree with `npm ci --omit=dev --ignore-scripts`, validates the staged
manifest with the pinned official MCPB CLI, and writes:

```text
artifacts/gsc-seo-mcp-v0.1.0.mcpb
artifacts/gsc-seo-mcp-v0.1.0.mcpb.sha256
```

Verify the checksum from the artifact directory:

```bash
cd artifacts
shasum -a 256 -c gsc-seo-mcp-v0.1.0.mcpb.sha256
```

The generated files are ignored by Git. Never commit a bundle, checksum,
credential file, token store, `.env` file, or generated `dist/` directory.
The smoke command unpacks the bundle into a temporary directory, starts its
actual bundled stdio entry point with a non-sensitive test allowlist, and
verifies the four contained read tools returned by `tools/list`.

## Authentication

The `0.1.0` bundle candidate intentionally uses Google Application Default
Credentials (ADC). Before installing or launching it, create read-only ADC:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly
```

During installation, set **Allowed Search Console properties** to a JSON array
of exact property identifiers:

```json
["sc-domain:example.com", "https://www.example.com/"]
```

The bundle passes that value to `GSC_SEO_MCP_ALLOWED_PROPERTIES`, fixes
`GSC_SEO_MCP_AUTH_MODE=adc`, and fixes `GSC_SEO_MCP_MODE=read_only`. It does not
collect or include OAuth client secrets, access tokens, refresh tokens, or a
token store.

## Publication status

The bundle is a local release candidate only. The repository's technical
release freeze still blocks tags, GitHub Releases, npm publishing, MCP Registry
publishing, and public MCPB distribution until the release-integrity,
provenance, SBOM, rollback, dependency, and named-owner gates in
`.github/RELEASE.md` are complete.
