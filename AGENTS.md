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
- The versioned capability manifest is the only source of active tool names, schemas, MCP metadata, Google method/scope assumptions, and profile visibility.
- Every MCP registration and compatibility invocation must traverse the capability dispatcher; do not add handler-specific authorization, budget, execution, result, or logging paths.
- Core kernel modules must not depend on transport, CLI, OAuth, or concrete Google client modules.
- Use the shared branded resource parsers for Search Console properties, HTTP targets, sitemap targets, and calendar dates. Do not recreate authorization identity with raw string operations or `Date.parse`.
- Preserve the configured property `apiValue` for Google calls and use `policyKey` only for authorization, containment, collision checks, and concurrency keys.

## Security Rules

- Default to `https://www.googleapis.com/auth/webmasters.readonly`.
- Require a non-empty exact property allowlist before MCP server startup.
- Keep the public MCP surface to the four approved manifest-defined direct read tools during containment.
- Accept only `GSC_SEO_MCP_MODE=read_only`; reject operator, full-admin, unknown, and legacy write-enable configurations.
- Require URL-prefix properties to include their trailing slash; reject normalization collisions in property allowlists.
- Keep property and URL identifiers within 8,192 UTF-8 bytes and allowlists within 1,000 entries.
- Keep Search Analytics requests within 1,000 rows, a 25,000-row pagination window, four filter groups of eight filters, and an inclusive 90-day calendar range.
- Reject unknown public input fields, including unknown nested filter fields.
- Require an explicit registry, deployment profile, context factory, policy, budget, executor, error, and audit port when constructing the dispatcher.
- Registration must obtain its visible capabilities from the same branded dispatcher binding; never pass a separate registry or profile into MCP registration.
- Static policy must permit the request before budget reservation, service-provider access, credential initialization, or Google calls.
- Keep raw input assertion, normalized reservation, lease-scoped gateway accounting, raw output preflight, and post-filter output assertion mandatory in dispatcher order.
- Production local stdio composition must use the deterministic in-memory budget controller, not the compatibility pass-through port.
- Keep stdio payload enforcement before UTF-8 decoding and JSON parsing, with a 262,144-byte payload ceiling.
- Keep Google attempt timeouts at or below 30 seconds and total local read deadlines at or below 45 seconds.
- Keep mutation and compound-derived capabilities in the unsupported ledger; do not expose a mutation method from the containment gateway.
- Never log access tokens, refresh tokens, authorization codes, or client secrets.
- Do not expose an MCP HTTP command until an authenticated HTTP profile and its threat controls are implemented.
- Keep the technical release freeze in place through WP-10 and until it is explicitly lifted.
- Keep `package.json` private and omit registry install descriptors until a collision-free package identity is verified.

## Do Not Touch

- Do not commit `.env`, token stores, or generated `dist/`.
- Do not push directly to `main`; use feature branches and pull requests.
