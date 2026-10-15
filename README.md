# gsc-seo-mcp

**Secure, read-only Google Search Console access for AI agents, with exact
property allowlists and a hardened TypeScript MCP runtime.**

[![CI](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/ci.yml)
[![Security Audit](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/security.yml/badge.svg)](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/security.yml)
[![CodeQL](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/ayhammouda/gsc-seo-mcp/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ayhammouda/gsc-seo-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/ayhammouda/gsc-seo-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Search Console](https://img.shields.io/badge/Search%20Console-read--only-4285F4?logo=google&logoColor=white)](#security-notes)

`gsc-seo-mcp` lets MCP-compatible clients query Google Search Console without
exposing a broad or write-capable API surface. It currently provides four
direct read tools over local stdio and fails closed unless an exact Search
Console property allowlist is configured.

If this project is useful to you, consider
[starring it on GitHub](https://github.com/ayhammouda/gsc-seo-mcp) and sharing
the use case you want it to support in
[Discussions](https://github.com/ayhammouda/gsc-seo-mcp/discussions).

## Why use it

- **Read-only by design:** the default and only contained runtime profile uses
  Google's `webmasters.readonly` scope.
- **Exact property containment:** every request is checked against a required,
  normalization-aware allowlist before Google is called.
- **Bounded execution:** inputs, outputs, concurrency, and Google request time
  are capped to reduce accidental or adversarial resource use.
- **Agent-ready protocol:** Codex, Claude, Cursor, and other MCP clients can use
  the same Zod-typed tool contracts over stdio.

> **Release freeze:** npm, MCP Registry, GitHub Release, and public MCPB
> publishing are technically blocked through WP-10 and until the freeze is
> explicitly lifted.
> An active GitHub ruleset blocks creation, movement, and deletion of `v*`
> tags; if that rule is deliberately disabled, the tag workflow still builds
> evidence and fails at the freeze gate. The current runtime surface is
> intentionally limited to stdio, four direct read tools, and an exact property
> allowlist.

## Source-Only Setup

Do **not** install or execute the unscoped npm package `gsc-seo-mcp`: that registry name belongs to an unrelated publisher and is not this repository. This project's selected registry identity is `@ayhammouda/gsc-seo-mcp`. That scope is not yet reserved on npm and nothing is published — the release freeze is still active, so no npm or MCP Registry installation guidance applies yet. The MCP server name and the `gsc-seo-mcp` command are unchanged; only the registry name is scoped.

Use the audited source checkout during containment:

```bash
npm ci
npm run build
node dist/cli.js --version
```

### Project MCP configuration

The repository includes a project-scoped `.mcp.json` for clients that support
checked-in MCP server configuration. It launches the built source checkout and
does not use the unrelated npm package:

```json
{
  "mcpServers": {
    "gsc-seo": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/dist/cli.js", "stdio"],
      "env": {
        "GSC_SEO_MCP_ALLOWED_PROPERTIES": "${GSC_SEO_MCP_ALLOWED_PROPERTIES}",
        "GSC_SEO_MCP_AUTH_MODE": "${GSC_SEO_MCP_AUTH_MODE:-stored}",
        "GSC_SEO_MCP_MODE": "read_only"
      }
    }
  }
}
```

Build first, then export `GSC_SEO_MCP_ALLOWED_PROPERTIES` as a JSON array of
the exact properties this checkout may access. The missing variable has no
fallback: project configuration must fail closed instead of silently widening
access.

### Build the MCPB 0.1.0 candidate

The repository includes a manifest-format 0.4 MCP Bundle build. It packages the
compiled stdio server and production dependencies, validates the manifest with
the pinned official MCPB CLI, and writes a SHA-256 checksum:

```bash
npm run mcpb:validate
npm run mcpb:pack
npm run mcpb:smoke
```

Generated files are written to `artifacts/` and remain local while the release
freeze is active. See [MCPB packaging and authentication](docs/mcpb.md) for the
bundle contents, checksum command, ADC prerequisite, and publication status.

## Authentication

Two authentication modes are supported:

- `stored` (default): `node dist/cli.js auth login` manages a local token store using your OAuth client ID and secret.
- `adc`: use Google Application Default Credentials, such as credentials created by `gcloud auth application-default login`.

### Stored OAuth Tokens

Create OAuth credentials in Google Cloud, enable the Search Console API, then set:

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
```

Login for read-only access:

```bash
node dist/cli.js auth login
```

Check credential presence without printing secrets:

```bash
node dist/cli.js auth status
```

### Application Default Credentials

ADC mode avoids `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` at server launch time:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly

GSC_SEO_MCP_AUTH_MODE=adc \
GSC_SEO_MCP_ALLOWED_PROPERTIES='["sc-domain:example.com"]' \
node dist/cli.js stdio
```

If `gcloud` requires a custom OAuth client for non-Cloud scopes, create a Desktop OAuth client in Google Cloud and pass its downloaded JSON:

```bash
gcloud auth application-default login \
  --client-id-file=/path/to/client_secret.json \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly
```

By default, the server requests only:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

The containment profile does not provide a write-capable login or runtime mode. `operator`, `full_admin`, unknown modes, and the legacy `GSC_SEO_MCP_READONLY=false` setting are rejected.

## Run

Set an exact, static allowlist before starting the server. Use Search Console property identifiers exactly as Google returns them, including the `sc-domain:` prefix or URL-prefix trailing slash:

```bash
export GSC_SEO_MCP_ALLOWED_PROPERTIES='["sc-domain:example.com","https://www.example.com/"]'
node dist/cli.js stdio
```

The equivalent repeatable CLI flag is:

```bash
node dist/cli.js stdio \
  --allowed-property sc-domain:example.com \
  --allowed-property https://www.example.com/
```

MCP client config:

```json
{
  "mcpServers": {
    "gsc-seo": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/gsc-seo-mcp/dist/cli.js", "stdio"],
      "env": {
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "...",
        "GSC_SEO_MCP_ALLOWED_PROPERTIES": "[\"sc-domain:example.com\"]"
      }
    }
  }
}
```

The CLI does not expose an MCP HTTP command. HTTP transport can only return after an authenticated transport profile and its threat controls are implemented and reviewed.

## Configuration

Flags override environment variables.

| Env | Purpose | Default |
| --- | --- | --- |
| `GSC_SEO_MCP_AUTH_MODE` | `stored` token-store auth or `adc` Application Default Credentials | `stored` |
| `GOOGLE_CLIENT_ID` | OAuth client ID | required for `stored` auth login/live API calls |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | required for `stored` auth login/live API calls |
| `GSC_SEO_MCP_TOKEN_STORE_PATH` | Local credential store path | `~/.gsc-seo-mcp/tokens.json` |
| `GSC_SEO_MCP_ALLOWED_PROPERTIES` | Required JSON array of exact Search Console properties permitted at server startup | none; startup fails closed |
| `GSC_SEO_MCP_MODE` | Access mode; containment accepts only `read_only` | `read_only` |
| `GSC_SEO_MCP_READONLY` | Deprecated compatibility setting; only `true` is accepted | unset |

Authentication commands can run without an allowlist, but MCP server startup cannot. `gsc_list_sites` filters Google results by normalized property identity. Property-bearing calls must resolve to exactly one configured property before a Google API request; when a caller uses a normalization-equivalent alias, the configured property string remains the authoritative value sent upstream.

## Tools

- `gsc_list_sites`
- `gsc_search_analytics`
- `gsc_list_sitemaps`
- `gsc_inspect_url`

No write or derived-analysis tools are registered. Search Analytics requests are limited to 1,000 rows, a 25,000-row pagination window, four filter groups with eight filters each, and an inclusive 90-day calendar range.

URL-prefix property identifiers must include their trailing slash. Property and target URLs are parsed into immutable semantic values with IDNA host normalization, exact origin/path containment, and ambiguous URL forms rejected before policy.

## Capability Kernel

WP-01 routes every registered tool through one capability dispatcher. Registration and execution read the same dispatcher-bound registry and profile. That frozen, versioned manifest is the source of truth for tool names, MCP metadata, Zod contracts, Google methods and scopes, resource selection, budget and retry classes, and profile visibility.

For each request, the dispatcher creates a frozen local request context, checks the raw invocation budget, strictly parses and semantically normalizes the input, selects a branded resource, applies the property-containment policy, reserves the deterministic local budget, rejects an expired total deadline, accounts for the one allowed Google operation, obtains the lazy read-only service, preflights the raw result, validates and filters it, enforces the final output budget, releases its permit, and attempts one terminal audit event. Unknown and unsupported tool names, invalid input, property denials, and budget denials stop before the service provider or Google client is touched.

The credential-bearing raw service constructor is private. The exported runtime composition function snapshots configuration before installing the lazy credential path, returns a kernel-bound MCP server, and exposes no sitemap mutation method in the packed runtime.

WP-02 installs executable local input, output, and concurrency budgets: 256 KiB invocation/frame limits, 1 MiB structured output, 1,000 primary items, bounded depth/node count, two concurrent calls per actor, four per normalized property, eight per process, a 30-second Google attempt timeout, and a 45-second total read deadline. Exhaustion fails immediately without queuing, and oversized output fails rather than truncates.

The static policy, error, and ephemeral audit adapters remain explicit migration seams. Rate windows, Google quota accounting, retries, fairness, and workflow budgets remain WP-07; the deterministic local budget does not claim those production gates.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run pack:dry-run
npm run mcpb:validate
npm run mcpb:pack
npm run mcpb:smoke
```

Tests mock Google and network calls.

Quality and release docs:

- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Test strategy](.github/TEST-STRATEGY.md)
- [Manual MCP QA](.github/INTEGRATION-TEST.md)
- [MCPB packaging and authentication](docs/mcpb.md)
- [Release process](.github/RELEASE.md)
- [Security policy](SECURITY.md)
- [WP-00 containment decision](docs/adr/0001-wp00-containment-and-release-freeze.md)
- [WP-00 pinned baseline](docs/remediation/wp-00-baseline.md)
- [WP-01 capability-kernel decision](docs/adr/0002-capability-kernel.md)
- [WP-01 migration contract](docs/remediation/wp-01-kernel-migration.md)
- [WP-01 threat-model delta](docs/remediation/wp-01-threat-model-delta.md)
- [WP-01 retained evidence](docs/remediation/wp-01-evidence.md)
- [WP-02 strict-resource and budget decision](docs/adr/0003-strict-resources-and-deterministic-budgets.md)
- [WP-02 migration contract](docs/remediation/wp-02-resource-budget-migration.md)
- [WP-02 deterministic budget contract](docs/remediation/wp-02-budget-contract.md)
- [WP-02 threat-model delta](docs/remediation/wp-02-threat-model-delta.md)
- [WP-02 retained evidence](docs/remediation/wp-02-evidence.md)
- [WP-10 scoped package identity decision](docs/adr/0004-scoped-package-identity.md)

## Registry Metadata

- The npm identity is `@ayhammouda/gsc-seo-mcp`; the MCP server name and the `gsc-seo-mcp` command are deliberately unscoped. See [ADR 0004](docs/adr/0004-scoped-package-identity.md).
- `package.json` is private and `server.json` deliberately omits package and remote install descriptors during the release freeze.
- `.mcp.json` is a source-checkout client configuration, not a registry or npm distribution claim.
- `glama.json` contains source-project listing metadata only.
- `mcpb/manifest.json` describes a local bundle candidate but is not an npm or MCP Registry install descriptor.
- WP-10/WP-11 must reserve and verify a collision-free package identity before restoring distribution metadata.
- Version-bearing files and the absence of distribution descriptors are guarded by package tests and the release workflow.

## Security Notes

- stdio mode never writes logs to stdout.
- Inbound stdio frames are rejected above 262,144 payload bytes before UTF-8 decoding or JSON parsing.
- Access tokens, refresh tokens, authorization codes, and client secrets are redacted from logs.
- The local file token store uses restrictive permissions (`0700` for app-created directories, `0600` for token files).
- The token store is not encrypted yet; see the `TODO(prod)` marker in `src/auth/token-store.ts`.
- MCP transport is stdio-only; anonymous HTTP transport is not included in the CLI or packed artifact.
- Server startup requires a non-empty exact property allowlist and a read-only containment mode.
- MCP registration contains no direct Google service path; every active call that satisfies its advertised tool schema traverses the capability dispatcher. Schema-invalid arguments are rejected by the MCP SDK before the dispatcher is entered and never reach policy, budgets, or credentials.

## Community

- Ask setup and usage questions in
  [GitHub Discussions](https://github.com/ayhammouda/gsc-seo-mcp/discussions).
- Report reproducible bugs or propose focused improvements through the
  [issue templates](https://github.com/ayhammouda/gsc-seo-mcp/issues/new/choose).
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Contributions and real-world feedback are welcome. Please keep proposals within
the documented read-only containment and release-freeze boundaries.
