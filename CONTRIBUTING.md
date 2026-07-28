# Contributing to gsc-seo-mcp

Start here for local setup, validation, and package checks.

## 1. Choose an issue

Search the [issue tracker](https://github.com/ayhammouda/gsc-seo-mcp/issues)
before starting. For substantial changes, open an issue first so the scope and
security boundaries can be agreed before implementation.

Good first contributions include documentation corrections, additional test
coverage, and small fixes with a minimal reproduction. Usage questions belong
in [GitHub Discussions](https://github.com/ayhammouda/gsc-seo-mcp/discussions).

## 2. Install tooling

Use Node.js 22.7.5 or newer, then install dependencies:

```bash
npm ci
```

## 3. Run standard checks

These mirror the fast CI workflow:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:dry-run
```

`npm test` builds `dist/` before running Vitest because the stdio smoke test starts the compiled CLI as a real subprocess.

## 4. Validate MCP behavior

Use this order:

1. Run the automated checks above.
2. Use MCP Inspector for local tool-list and tool-call checks.
3. Confirm behavior in your target MCP client.

Detailed manual steps live in [`.github/INTEGRATION-TEST.md`](.github/INTEGRATION-TEST.md).

## 5. Package and release checks

For a local package smoke check:

```bash
npm run build
npm pack --dry-run --json
node dist/cli.js --version
```

Release workflow details live in [`.github/RELEASE.md`](.github/RELEASE.md).

## 6. Open a pull request

1. Create a focused branch from the latest `main`.
2. Make one coherent change and add tests where behavior changes.
3. Run the standard checks above.
4. Push the branch and open a pull request using the repository template.
5. Resolve review threads and keep the branch current until required checks pass.

The protected default branch accepts changes through pull requests. Do not
commit generated `dist/`, local credentials, token stores, or `.env` files.

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
