# gsc-seo-mcp TypeScript MVP Implementation Plan

## Summary

This repository implements `gsc-seo-mcp` as a Node.js/TypeScript MCP server. The package exposes Google Search Console data through seven MCP tools over stdio and Streamable HTTP.

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

## Decisions

- Use `@modelcontextprotocol/sdk@1.29.0` because v2 packages are still beta and the SDK README says v1 remains the supported production line until the 2026-07-28 v2 release.
- Use `googleapis@173.0.0`; package inspection confirmed `google.searchconsole({ version: "v1", auth })`, `sites.list`, `searchanalytics.query`, `sitemaps.list`, `sitemaps.submit`, and `urlInspection.index.inspect`.
- Use `zod/v4` for all tool input and output schemas.
- Target Node `>=22.7.5` because MCP Inspector requires it.
- Allow MCP transports to start without OAuth credentials so clients can initialize and list tools. Live tool calls fail clearly until either stored credentials exist or `GSC_SEO_MCP_AUTH_MODE=adc` can resolve Google Application Default Credentials with the Search Console scope.

## Assumptions

- Automated tests must not call Google or the network.
- Local OAuth uses a loopback callback on `127.0.0.1`; users must configure compatible OAuth credentials.
- Streamable HTTP is loopback-only (`127.0.0.1` or `localhost`) until real remote authentication exists; Host and Origin validation reduce browser DNS-rebinding risk but are not treated as remote auth.
- Search Analytics output includes Google API caveats that rows are click-sorted and may not contain every possible row.
- URL Inspection reports indexed-state data from Google systems; it is not a live crawl test.

## TODO(prod)

- Replace the file token store with encrypted OS-backed storage.
- Add real remote authentication before allowing non-local HTTP binding.

## Verification Plan

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm pack`
- `npx --yes --package ./gsc-seo-mcp-*.tgz gsc-seo-mcp --help`
- MCP Inspector `tools/list` over stdio and Streamable HTTP
- Spoofed Host/Origin HTTP requests return `403`
