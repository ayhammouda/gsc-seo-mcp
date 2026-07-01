# Repository Instructions

## Build And Test

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- Package smoke: `npm pack`

## Conventions

- TypeScript ESM only.
- Source lives in `src/`; tests live in `tests/`.
- Do not write logs to stdout from stdio server code.
- Tool inputs and outputs must remain Zod-typed and stable.
- Google API calls must use per-request timeout and `AbortSignal`.

## Security Rules

- Default to `https://www.googleapis.com/auth/webmasters.readonly`.
- `GSC_SEO_MCP_READONLY=true` disables write tools before Google API calls.
- Never log access tokens, refresh tokens, authorization codes, or client secrets.
- Keep HTTP default bind host at `127.0.0.1`.
- Keep Host/Origin validation enabled for HTTP transport.

## Do Not Touch

- Do not commit `.env`, token stores, or generated `dist/`.
- Do not push directly to `main`; use feature branches and pull requests.

