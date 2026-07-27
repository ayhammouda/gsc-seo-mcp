# Manual MCP QA Runbook

Use this after transport, OAuth, containment, or tool-surface changes.

> **Release freeze:** this runbook gathers validation evidence but cannot authorize a tag or publication before WP-10 completes and the holistic remediation freeze is explicitly lifted.

## Prerequisites

- Local checks pass:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:e2e`
  - `npm run build`
- Google Cloud OAuth credentials exist and the Search Console API is enabled.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set only in your local shell or MCP client environment.
- At least one real test property is selected for the exact startup allowlist.

## Test 1: MCP Inspector Over stdio

Start Inspector from the repo root:

```bash
npm run build
export GSC_SEO_MCP_ALLOWED_PROPERTIES='["sc-domain:example.com"]'
npx @modelcontextprotocol/inspector node dist/cli.js stdio
```

Verify:

- [ ] Inspector connects over stdio.
- [ ] The tool list contains exactly four tools:
  - `gsc_list_sites`
  - `gsc_search_analytics`
  - `gsc_list_sitemaps`
  - `gsc_inspect_url`
- [ ] Sitemap submission and derived-analysis tools are absent.
- [ ] No protocol corruption or unexplained disconnect appears in Inspector.
- [ ] No non-protocol logs appear on stdout.

## Test 2: OAuth Flow

Stored-token mode:

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
node dist/cli.js auth login
node dist/cli.js auth status
```

Verify:

- [ ] Login opens a loopback OAuth flow.
- [ ] `auth status` reports credential presence and scopes without printing tokens.
- [ ] The default scope is `https://www.googleapis.com/auth/webmasters.readonly`.

ADC mode:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/webmasters.readonly
GSC_SEO_MCP_AUTH_MODE=adc node dist/cli.js auth status
```

Verify:

- [ ] `auth status` reports Application Default Credentials mode and the readonly Search Console scope.
- [ ] No OAuth client secret is required by the MCP server in ADC mode.

## Test 3: Read-Only Tools

For automated live smoke coverage, set a token store from a successful `auth login`, then run:

```bash
GSC_LIVE_E2E=true \
GSC_SEO_MCP_TOKEN_STORE_PATH=/path/to/tokens.json \
GSC_SEO_MCP_ALLOWED_PROPERTIES='["https://example.com/"]' \
GSC_TEST_SITE_URL=https://example.com/ \
npm run test:live
```

Call these against a property your account can access:

- [ ] `gsc_list_sites`
- [ ] `gsc_search_analytics`
- [ ] `gsc_list_sitemaps`
- [ ] `gsc_inspect_url`

Expected: calls succeed or return clear Google permission/property errors without leaking tokens.

Also verify containment:

- [ ] `gsc_list_sites` returns only properties that normalize to the configured allowlist.
- [ ] A property-bearing call for a non-allowlisted property is denied before Google is called.
- [ ] A normalization-equivalent caller alias is authorized only as the configured property identity.
- [ ] A Search Analytics request for 1,001 rows is rejected.
- [ ] A Search Analytics request with an inclusive date range longer than 90 calendar days is rejected.
- [ ] An impossible date, unknown input key, fifth filter group, ninth filter in a group, or pagination window ending after row 25,000 is rejected.
- [ ] A URL-prefix property without its trailing slash and an inspected URL outside the property are rejected.
- [ ] Exact-boundary budget tests in `tests/kernel/budgets.test.ts`, `tests/transport.test.ts`, and `tests/e2e/deterministic-budgets.e2e.test.ts` pass.

## Test 4: Startup And Mode Guards

Verify a missing allowlist fails server startup:

```bash
env -u GSC_SEO_MCP_ALLOWED_PROPERTIES node dist/cli.js stdio
```

- [ ] Expected: non-zero exit before a Google client or MCP transport starts.

Verify every unsupported access setting fails:

```bash
GSC_SEO_MCP_MODE=operator node dist/cli.js auth status
GSC_SEO_MCP_MODE=full_admin node dist/cli.js auth status
GSC_SEO_MCP_MODE=unexpected node dist/cli.js auth status
GSC_SEO_MCP_READONLY=false node dist/cli.js auth status
```

- [ ] Every command exits non-zero with a containment-specific error.
- [ ] `GSC_SEO_MCP_READONLY=true` remains accepted only as deprecated read-only compatibility.

## Test 5: HTTP Surface Is Absent

```bash
node dist/cli.js http
```

- [ ] Expected: non-zero exit with an unknown-command error.
- [ ] `gsc-seo-mcp --help` does not advertise HTTP.

## Test 6: Fresh Package Install

```bash
npm pack
npm install -g ./gsc-seo-mcp-*.tgz
gsc-seo-mcp --version
gsc-seo-mcp --help
```

Verify:

- [ ] CLI version matches `package.json`.
- [ ] No token files, `.env` files, or generated tarballs are included in the package.
- [ ] Packed CLI help advertises only stdio and authentication commands.
- [ ] Packed CLI rejects the `http` command.
- [ ] Packed server exposes exactly the same four read tools when started with a non-empty allowlist.

## Evidence Log

| Test | Pass/Fail | Tester | Date | Notes |
| --- | --- | --- | --- | --- |
| Inspector stdio | | | | |
| OAuth flow | | | | |
| Read-only tools | | | | |
| Startup and mode guards | | | | |
| HTTP surface absent | | | | |
| Fresh package install | | | | |
