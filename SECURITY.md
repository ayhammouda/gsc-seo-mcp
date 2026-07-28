# Security Policy

## Supported Versions

During the release freeze, security fixes target `main`. Published versions
will be listed here after the freeze is explicitly lifted.

## Reporting a Vulnerability

Use
[GitHub private vulnerability reporting](https://github.com/ayhammouda/gsc-seo-mcp/security/advisories/new).
Do not open a public issue or discussion with exploit details, tokens, client
secrets, authorization codes, refresh tokens, or private Search Console data.

## Security Model

- The default OAuth scope is `https://www.googleapis.com/auth/webmasters.readonly`.
- The frozen local-stdio containment profile accepts only `GSC_SEO_MCP_MODE=read_only`. `operator`, `full_admin`, unknown modes, and `GSC_SEO_MCP_READONLY=false` are rejected.
- MCP server startup requires a non-empty `GSC_SEO_MCP_ALLOWED_PROPERTIES` JSON array of at most 1,000 valid, normalization-unique Search Console property identifiers.
- Site inventory and property-bearing requests use normalized property identity. A permitted caller alias resolves to the configured property object, whose exact API value is the only value sent to Google.
- Only four direct read tools are registered. Write tools and derived-analysis tools are unavailable.
- URL-prefix properties require a trailing slash. Properties, inspected URLs, and dates pass shared semantic parsers before authorization; ambiguous URLs, impossible dates, cross-property targets, normalized allowlist collisions, and identifiers over 8,192 UTF-8 bytes fail closed.
- Search Analytics requests are capped at 1,000 rows, a 25,000-row window, four filter groups with eight filters each, and an inclusive 90-day calendar range.
- One frozen capability manifest drives active discovery and direct dispatch; unsupported mutation and derived names are disjoint from registration.
- Every registered call that satisfies its advertised tool schema traverses the capability dispatcher, including every property and property-containment denial. Static policy denial occurs before deterministic budget reservation, lazy service-provider access, credentials, or Google calls.
- Invocations that do not satisfy the advertised JSON Schema are rejected by the MCP SDK before the dispatcher is entered, so they produce a protocol-level `InvalidParams` error and no terminal audit event. They never reach policy, budgets, credentials, or Google. Semantic authorization rules are deliberately kept out of the wire schema so that their denials are audited.
- The production local bootstrap enforces raw invocation, normalized input, fail-fast process/actor/property concurrency, and post-filter output budgets. It permits two calls per actor, four per normalized property, and eight per process.
- Inbound stdio JSON-RPC payloads are capped at 262,144 bytes before decoding and parsing. Structured tool output is capped at 1 MiB, 1,000 primary items for collection tools, depth 32, and 50,000 nodes.
- The credential-bearing raw runtime constructor is private; its exported composition surface returns a kernel-bound MCP server.
- The containment runtime service and Google client expose no sitemap mutation method.
- Access tokens, refresh tokens, authorization codes, and client secrets must never be logged.
- stdio mode must keep stdout reserved for MCP protocol frames only.
- The MCP CLI and packed artifact are stdio-only. Anonymous HTTP transport is unavailable until an authenticated profile and its threat controls are implemented.

## Release Containment

Publishing is under a technical freeze through WP-10 and until the freeze is explicitly lifted. `package.json` is private, `server.json` has no install descriptor, and the tag-triggered workflow fails after building evidence but before publication. Tag creation itself is prohibited by policy rather than technically prevented. Passing WP-00, WP-01, or WP-02 tests does not lift the freeze.

## Kernel Compatibility Boundaries

WP-01 makes the dispatcher and all of its ports mandatory. WP-02 replaces the production pass-through budget with deterministic local byte, item, depth, node, deadline, and concurrency enforcement and adds strict normalized resources. The fixed local identity/static policy, credential-authority checks, closed error contracts, rate and Google-quota budgets, retries/fairness, protected audit, and readiness remain later work-package gates.

## Local Token Store

The default file token store uses restrictive permissions for app-created directories and token files. It is not encrypted yet, so use an OS-protected profile and avoid syncing the token store to cloud drives or backups.
