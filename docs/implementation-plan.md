# Original gsc-seo-mcp TypeScript MVP Implementation Plan

> **Historical design record:** this document describes the original seven-tool, HTTP-capable MVP. It is not current operator or release guidance. WP-00 containment, the WP-01 capability kernel, and WP-02 strict-resource/deterministic-budget contracts supersede those surfaces, and publishing remains frozen through WP-10 and until the freeze is explicitly lifted.

## Current Containment Boundary

- MCP transport is stdio-only; the CLI and packed artifact do not expose anonymous HTTP.
- A frozen versioned manifest registers exactly four direct read tools: site inventory, Search Analytics, sitemap listing, and URL inspection.
- Every active call traverses the capability dispatcher; the credential-bearing service remains private and lazy behind static policy and budget ports.
- MCP startup requires a non-empty, normalization-unique static allowlist of at most 1,000 valid Search Console property identifiers.
- Only `read_only` mode is accepted. Operator, full-admin, unknown, and legacy write-enable configurations are rejected.
- Shared branded parsers establish property, URL, sitemap-target, and calendar facts before authorization. URL-prefix properties require their trailing slash and caller aliases resolve to the configured upstream API identity.
- Search Analytics accepts at most 1,000 rows, a 25,000-row pagination window, bounded filters, and an inclusive 90-day calendar range.
- Bounded stdio framing, strict JSON input/output limits, and fail-fast in-memory actor/property/process concurrency are mandatory in the local composition root.
- Write and derived-analysis tools are unavailable, and the packed runtime exposes no sitemap mutation method.

## Original Summary

The original MVP implemented `gsc-seo-mcp` as a Node.js/TypeScript MCP server with seven MCP tools over stdio and Streamable HTTP. That surface is retained here only as historical context.

## Verified Official References

- MCP transport spec 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP TypeScript SDK v1 docs: https://ts.sdk.modelcontextprotocol.io/
- MCP TypeScript SDK v1 server docs: https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/server.md
- Search Console API index: https://developers.google.com/webmaster-tools/v1/api_reference_index
- Search Analytics query: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console authorization: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Sitemaps list: https://developers.google.com/webmaster-tools/v1/sitemaps/list
- Sitemaps submit: https://developers.google.com/webmaster-tools/v1/sitemaps/submit
- URL Inspection `index.inspect`: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- URL Inspection result shape: https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult

## Original Decisions

- Use `@modelcontextprotocol/sdk@1.29.0` because v2 packages are still beta and the SDK README says v1 remains the supported production line until the 2026-07-28 v2 release.
- Use `googleapis@173.0.0`; package inspection confirmed `google.searchconsole({ version: "v1", auth })`, `sites.list`, `searchanalytics.query`, `sitemaps.list`, `sitemaps.submit`, and `urlInspection.index.inspect`.
- Use `zod/v4` for all tool input and output schemas.
- Target Node `>=22.7.5` because MCP Inspector requires it.
- Allow MCP transports to start without OAuth credentials so clients can initialize and list tools. Live tool calls fail clearly until either stored credentials exist or `GSC_SEO_MCP_AUTH_MODE=adc` can resolve Google Application Default Credentials with the Search Console scope.

## Original Assumptions

- Automated tests must not call Google or the network.
- Local OAuth uses a loopback callback on `127.0.0.1`; users must configure compatible OAuth credentials.
- The original Streamable HTTP design was loopback-only (`127.0.0.1` or `localhost`). WP-00 removes that transport rather than treating loopback controls as authentication.
- Search Analytics output includes Google API caveats that rows are click-sorted and may not contain every possible row.
- URL Inspection reports indexed-state data from Google systems; it is not a live crawl test.

## TODO(prod)

- Replace the file token store with encrypted OS-backed storage.
- Design and review an authenticated HTTP transport profile before reintroducing any MCP HTTP command.

## Verification Plan

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm pack`
- `npx --yes --package ./gsc-seo-mcp-*.tgz gsc-seo-mcp --help`
- MCP Inspector `tools/list` over stdio with a non-empty exact property allowlist
- Packed CLI help and command handling prove the HTTP surface is absent
- `tools/list` contains exactly the four approved direct read tools
- Startup, mode, manifest, dispatcher-port, semantic-resource, strict-schema, byte/item/depth/node, concurrency, row/window/filter, and date-range guards fail closed
