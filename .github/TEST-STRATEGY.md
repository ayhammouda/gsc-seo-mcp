# Test Strategy

Canonical map of what we test, where it lives, and what still needs manual validation.

## Test Shape

```text
      / live Google E2E \     opt-in only, protected credentials
     / real MCP E2E    \     stdio and Streamable HTTP client transports
    / integration      \     package contents, workflow invariants, tool call counts
   / service/schema    \     Google mapping, config, OAuth, security, schemas
```

Keep most coverage at the service/schema layer. Add real subprocess tests only for behavior that can break across the process boundary, such as stdio framing, stdout hygiene, and CLI packaging.

## Tool Coverage

Every public MCP tool must:

- appear in `GSC_TOOL_NAMES`
- be registered by `createGscMcpServer`
- have a Zod input schema and output schema in `toolSchemaContracts`
- appear in the real stdio `tools/list` smoke test

Current tools:

| Tool | Primary coverage |
| --- | --- |
| `gsc_list_sites` | `tests/tools.test.ts`, `tests/stdio-smoke.test.ts` |
| `gsc_search_analytics` | `tests/google-client.test.ts`, `tests/schemas.test.ts` |
| `gsc_list_sitemaps` | `tests/google-client.test.ts`, `tests/schema-contract.test.ts` |
| `gsc_submit_sitemap` | `tests/tools.test.ts`, `tests/security.test.ts` |
| `gsc_inspect_url` | `tests/google-client.test.ts`, `tests/schemas.test.ts` |
| `gsc_find_declining_pages` | `tests/insights.test.ts`, `tests/schema-contract.test.ts` |
| `gsc_find_keyword_opportunities` | `tests/insights.test.ts`, `tests/schema-contract.test.ts` |

## Definition Of Done For Tool Changes

- Add happy-path and error-path coverage for new behavior.
- Update `toolSchemaContracts` for any tool input or output shape change.
- Keep `tests/stdio-smoke.test.ts` passing against the compiled CLI.
- Keep `tests/e2e/mcp-tools.e2e.test.ts` passing for every public tool.
- Keep model-visible text payloads concise; large data belongs in `structuredContent`, not duplicated in text `content`.
- Update README, `server.json`, `glama.json`, and this file if the public tool surface changes.

## Automated E2E Coverage

- `tests/e2e/mcp-tools.e2e.test.ts` calls every public tool through an SDK `Client` and `InMemoryTransport`, validates structured output, and asserts exact fake Google service call counts.
- `tests/e2e/stdio-client.e2e.test.ts` connects to `node dist/cli.js stdio` with SDK `StdioClientTransport` and verifies `tools/list` without stderr noise.
- `tests/e2e/http-client.e2e.test.ts` connects to loopback Streamable HTTP with SDK `StreamableHTTPClientTransport`.
- `tests/e2e/payload-budget.test.ts` prevents full structured payload duplication in model-visible text and verifies tool error redaction.

Run:

```bash
npm run test:e2e
```

## Live Google E2E

Live tests are opt-in and must not run on ordinary pull requests.

```bash
GSC_LIVE_E2E=true \
GSC_SEO_MCP_TOKEN_STORE_PATH=/path/to/tokens.json \
GSC_TEST_SITE_URL=https://example.com/ \
npm run test:live
```

Use read-only credentials by default. Do not enable write-scope live tests unless the target property and sitemap are explicitly disposable.

## Known Gaps

- Live Google API behavior is not exercised in default CI. Use `npm run test:live` and `.github/INTEGRATION-TEST.md` with a real OAuth client before releases.
- Remote HTTP authentication is intentionally not implemented. HTTP remains loopback-only.
