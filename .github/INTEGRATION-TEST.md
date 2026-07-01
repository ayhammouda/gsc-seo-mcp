# Manual MCP QA Runbook

Use this before releases and after transport, OAuth, or tool-surface changes.

## Prerequisites

- Local checks pass:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:e2e`
  - `npm run build`
- Google Cloud OAuth credentials exist and the Search Console API is enabled.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set only in your local shell or MCP client environment.

## Test 1: MCP Inspector Over stdio

Start Inspector from the repo root:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/cli.js stdio
```

Verify:

- [ ] Inspector connects over stdio.
- [ ] The tool list includes all seven tools:
  - `gsc_list_sites`
  - `gsc_search_analytics`
  - `gsc_list_sitemaps`
  - `gsc_submit_sitemap`
  - `gsc_inspect_url`
  - `gsc_find_declining_pages`
  - `gsc_find_keyword_opportunities`
- [ ] No protocol corruption or unexplained disconnect appears in Inspector.
- [ ] No non-protocol logs appear on stdout.

## Test 2: OAuth Flow

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

## Test 3: Read-Only Tools

For automated live smoke coverage, set a token store from a successful `auth login`, then run:

```bash
GSC_LIVE_E2E=true \
GSC_SEO_MCP_TOKEN_STORE_PATH=/path/to/tokens.json \
GSC_TEST_SITE_URL=https://example.com/ \
npm run test:live
```

Call these against a property your account can access:

- [ ] `gsc_list_sites`
- [ ] `gsc_search_analytics`
- [ ] `gsc_list_sitemaps`
- [ ] `gsc_inspect_url`
- [ ] `gsc_find_declining_pages`
- [ ] `gsc_find_keyword_opportunities`

Expected: calls succeed or return clear Google permission/property errors without leaking tokens.

## Test 4: Write Guard

With default readonly mode:

- [ ] Call `gsc_submit_sitemap`.
- [ ] Expected: the tool fails before calling Google and explains that readonly mode disables submission.

With explicit write mode:

```bash
GSC_SEO_MCP_READONLY=false node dist/cli.js auth login
```

- [ ] Confirm the OAuth consent includes the write scope before testing a real sitemap submission.

## Test 5: Streamable HTTP Loopback

```bash
node dist/cli.js http --host 127.0.0.1 --port 8787 --path /mcp
```

Verify:

- [ ] Local MCP HTTP client can connect to `http://127.0.0.1:8787/mcp`.
- [ ] Spoofed Host or Origin requests are rejected.
- [ ] Binding to a non-local host remains blocked by configuration validation.

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

## Evidence Log

| Test | Pass/Fail | Tester | Date | Notes |
| --- | --- | --- | --- | --- |
| Inspector stdio | | | | |
| OAuth flow | | | | |
| Read-only tools | | | | |
| Write guard | | | | |
| HTTP loopback | | | | |
| Fresh package install | | | | |
