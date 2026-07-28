# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Security

- Added WP-00 containment: stdio-only MCP transport, a mandatory exact property allowlist, read-only mode enforcement, and fail-closed internal write-scope checks.
- Limited Search Analytics requests to 1,000 rows and an inclusive 90-day date range.
- Established a technical release freeze through WP-10 and until it is explicitly lifted.
- Made the local package private and removed registry install descriptors so the unrelated unscoped npm package cannot be mistaken for this project.
- Added the WP-01 capability kernel so input validation and resource selection precede static policy, budget reservation, lazy service access, output validation, and terminal audit.
- Added WP-02 branded property, URL, sitemap-target, and calendar values with normalized policy identity, exact configured Google identity, and strict containment.
- Added bounded stdio framing plus deterministic raw-input, normalized-query, post-filter-output, and local concurrency budgets.

### Changed

- Reduced the public MCP surface to four direct read tools: site inventory, Search Analytics, sitemap listing, and URL inspection.
- Deprecated `GSC_SEO_MCP_READONLY=true`; write-enabling legacy settings and unsupported access modes are now rejected.
- Replaced literal tool registration, handler-local authorization, and the separate schema-contract map with a frozen versioned manifest and one dispatcher.
- Copied runtime configuration into an immutable local-stdio profile and a fresh immutable request context per invocation.
- Tightened the pre-1.0 MCP input contract: strict unknown-key handling, trailing-slash URL-prefix properties, valid calendar dates, bounded filters, and a 25,000-row pagination window.
- Replaced the production local pass-through budget with fail-fast in-memory actor/property/process reservations and fixed 30-second attempt / 45-second total deadlines.

### Added

- Added the reviewed containment ADR plus pinned baseline, contract, Google Discovery, and reference performance fixtures.
- Added the WP-01 kernel ADR, migration contract, threat-model delta, generated profile/tool truth table, and dispatcher boundary tests.
- Added the WP-02 resource/budget ADR, migration and threat-model deltas, deterministic budget contract, boundary corpora, and pinned schema/manifest/budget fixtures.
- Added a checked-in, source-only `.mcp.json` that requires an explicit property allowlist and keeps read-only mode fixed.
- GitHub Actions CI, dependency audit, CodeQL, OpenSSF Scorecard, Dependabot, and release workflows.
- Added an MCPB 0.4 release-candidate manifest, pinned pack/validate tooling, production-only dependency staging, SHA-256 checksums, and an unpacked stdio smoke test.
- MCP Registry metadata in `server.json` and Glama metadata in `glama.json`.
- Real stdio subprocess smoke coverage, package metadata checks, workflow checks, and schema contract checks.
- Contributor, security, release, manual QA, and test strategy documentation.

### Removed

- Removed the anonymous MCP HTTP CLI surface.
- Removed public sitemap submission and derived-analysis tools during containment.
- Removed the mutation method from the packed runtime service and Google client and removed the exported direct-handler execution path.

## [0.1.0] - 2026-07-01

### Added

- Initial TypeScript MCP server for Google Search Console SEO data.
- stdio and loopback Streamable HTTP transports.
- OAuth login/status commands and local file token store.
- Search Console tools for sites, search analytics, sitemaps, URL inspection, declining pages, and keyword opportunities.
