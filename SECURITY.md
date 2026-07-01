# Security Policy

## Supported Versions

Security fixes target the latest published `0.x` release and `main`.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting when available, or open a minimal public issue that asks for a private contact path without including exploit details, tokens, client secrets, authorization codes, or refresh tokens.

## Security Model

- The default OAuth scope is `https://www.googleapis.com/auth/webmasters.readonly`.
- `GSC_SEO_MCP_READONLY=true` disables sitemap submission before Google API calls.
- Access tokens, refresh tokens, authorization codes, and client secrets must never be logged.
- stdio mode must keep stdout reserved for MCP protocol frames only.
- HTTP transport binds to `127.0.0.1` by default and validates Host and Origin headers.
- Non-local HTTP binding is blocked until real remote authentication is added.

## Local Token Store

The default file token store uses restrictive permissions for app-created directories and token files. It is not encrypted yet, so use an OS-protected profile and avoid syncing the token store to cloud drives or backups.
