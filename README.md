# gsc-seo-mcp

`gsc-seo-mcp` is a TypeScript MCP server that exposes Google Search Console SEO data through local stdio and Streamable HTTP transports.

## Install

```bash
npm install -g gsc-seo-mcp
```

For local development:

```bash
npm install
npm run build
```

## Authentication

Create OAuth credentials in Google Cloud, enable the Search Console API, then set:

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
```

Login for read-only access:

```bash
gsc-seo-mcp auth login
```

Check credential presence without printing secrets:

```bash
gsc-seo-mcp auth status
```

By default, the server requests only:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

To opt into sitemap submission, run login with readonly disabled:

```bash
GSC_SEO_MCP_READONLY=false gsc-seo-mcp auth login
```

## Run

stdio:

```bash
gsc-seo-mcp stdio
```

Streamable HTTP:

```bash
gsc-seo-mcp http --host 127.0.0.1 --port 8787 --path /mcp
```

HTTP mode is intentionally loopback-only for this MVP (`127.0.0.1` or `localhost`) and validates Host and Origin headers to reduce DNS-rebinding risk. Remote binding is rejected until real HTTP authentication is added.

## Configuration

Flags override environment variables.

| Env | Purpose | Default |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID | required for login/live API calls |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | required for login/live API calls |
| `GSC_SEO_MCP_TOKEN_STORE_PATH` | Local credential store path | `~/.gsc-seo-mcp/tokens.json` |
| `GSC_SEO_MCP_READONLY` | Disable write tools when `true` | `true` |
| `GSC_SEO_MCP_HTTP_HOST` | HTTP bind host | `127.0.0.1` |
| `GSC_SEO_MCP_HTTP_PORT` | HTTP bind port | `8787` |
| `GSC_SEO_MCP_HTTP_PATH` | MCP endpoint path | `/mcp` |

## Tools

- `gsc_list_sites`
- `gsc_search_analytics`
- `gsc_list_sitemaps`
- `gsc_submit_sitemap`
- `gsc_inspect_url`
- `gsc_find_declining_pages`
- `gsc_find_keyword_opportunities`

`gsc_submit_sitemap` is annotated as destructive and fails before calling Google when readonly mode is enabled.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests mock Google and network calls.

## Security Notes

- stdio mode never writes logs to stdout.
- Access tokens, refresh tokens, authorization codes, and client secrets are redacted from logs.
- The local file token store uses restrictive permissions (`0700` for app-created directories, `0600` for token files).
- The token store is not encrypted yet; see the `TODO(prod)` marker in `src/auth/token-store.ts`.
