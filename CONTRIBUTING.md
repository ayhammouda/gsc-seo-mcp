# Contributing to gsc-seo-mcp

Start here for local setup, validation, and package checks.

## 1. Install tooling

Use Node.js 22.7.5 or newer, then install dependencies:

```bash
npm ci
```

## 2. Run standard checks

These mirror the fast CI workflow:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:dry-run
```

`npm test` builds `dist/` before running Vitest because the stdio smoke test starts the compiled CLI as a real subprocess.

## 3. Validate MCP behavior

Use this order:

1. Run the automated checks above.
2. Use MCP Inspector for local tool-list and tool-call checks.
3. Confirm behavior in your target MCP client.

Detailed manual steps live in [`.github/INTEGRATION-TEST.md`](.github/INTEGRATION-TEST.md).

## 4. Package and release checks

For a local package smoke check:

```bash
npm run build
npm pack --dry-run --json
node dist/cli.js --version
```

Release workflow details live in [`.github/RELEASE.md`](.github/RELEASE.md).

## Project conventions

- Keep the server TypeScript ESM only.
- Keep MCP tool inputs and outputs Zod-typed and stable.
- Do not write logs to stdout from stdio server code.
- Keep Google API calls behind per-request timeouts and `AbortSignal`.
- Use the shared branded property, URL, and calendar parsers for authorization facts; do not add handler-local string containment or date parsing.
- Keep new public and nested input objects strict, and update the reviewed-current schema, manifest, and budget fixtures when a contract changes.
- Preserve the bounded stdio and deterministic local budget stages when changing transport, dispatcher, gateway, or output behavior.
- Default OAuth scope to `https://www.googleapis.com/auth/webmasters.readonly`.
- Do not expose an MCP HTTP command until an authenticated HTTP profile and its threat controls are implemented.
- Do not add npm or MCP Registry install guidance until a collision-free package identity is verified and the release freeze is explicitly lifted.
