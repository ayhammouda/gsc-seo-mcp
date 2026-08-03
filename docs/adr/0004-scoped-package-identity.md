# ADR 0004: Scoped Package Identity

Date: 2026-08-03
Status: Accepted for WP-10 under the release freeze

## Context

ADR 0001 recorded that the unscoped npm name `gsc-seo-mcp` is owned by an unrelated publisher, and made the package private and stripped install descriptors from `server.json` so this repository could not be mistaken for it. That was containment, not resolution: WP-10 still had to select and reserve an identity this project actually owns before any release is possible.

Verified at the time of this decision:

```text
npm view gsc-seo-mcp  ->  version 1.0.1, maintainer samalyx
```

The name is genuinely taken by a third party. No release can proceed under it, and advertising it in registry metadata would direct users to unrelated code.

The complication is that one string, `gsc-seo-mcp`, was serving three distinct identities, and `tests/package.test.ts` encoded that conflation as an invariant (`GSC_SERVER_NAME === packageJson.name`, and a bin lookup keyed by `packageJson.name`):

| Identity | Location | Audience |
| --- | --- | --- |
| npm registry name | `package.json` `name` | anyone installing the package |
| MCP protocol server name | `GSC_SERVER_NAME` in `src/mcp-server.ts` | MCP clients, via the `initialize` response |
| CLI command | `package.json` `bin` key | anyone invoking the binary |

Only the first collides. Renaming all three because one is contested would change the name MCP clients key on and the command users type, for no benefit.

## Decision

### Scope the npm name only

The registry identity becomes `@ayhammouda/gsc-seo-mcp`. A scope is owned by the npm user or org that holds it, so the collision cannot recur.

The MCP protocol server name stays `gsc-seo-mcp`, and the CLI command stays `gsc-seo-mcp`. An npm `bin` key is the command name and is independent of the package name, so a scoped package can expose an unscoped command without conflict. The MCP Registry identity in `server.json` stays `io.github.ayhammouda/gsc-seo-mcp`, which is already namespaced by construction.

### Assert the three identities separately

The `GSC_SERVER_NAME === packageJson.name` invariant is deliberately removed rather than updated. It is replaced by three independent assertions, each naming a distinct regression:

- the npm name is `@ayhammouda/gsc-seo-mcp` — catches a revert to the contested unscoped name;
- `GSC_SERVER_NAME` is `gsc-seo-mcp` — catches the scope leaking into the protocol identity;
- `bin` is exactly `{ "gsc-seo-mcp": "./dist/cli.js" }` — catches the bin key drifting to the scoped name, which would make the command `@ayhammouda/gsc-seo-mcp`.

The CLI `--version` output and the bin lookup are now derived from `GSC_SERVER_NAME` rather than `packageJson.name`, so the runtime identifies itself by its protocol name.

### Do not lift the freeze

Selecting an identity satisfies one WP-10 item. `package.json` stays `private`, `server.json` still advertises no packages or remotes, the `v*` tag ruleset stays active with no bypass actor, and the freeze job in the release workflow is unchanged.

## Consequences

The packed tarball is now `ayhammouda-gsc-seo-mcp-0.1.0.tgz`, and npm's keyed `pack --json` output is keyed by `@ayhammouda/gsc-seo-mcp`. Pack-parsing fixtures were updated to mirror the real output.

Nothing changes for MCP clients or for anyone running the command: the protocol name, the tool names, the bundle name in `mcpb/manifest.json`, and the artifact filenames are untouched.

The scope is selected but **not reserved**. Reserving `@ayhammouda` on npm and verifying owner, repository, workflow, and public access requires npm account access and remains outstanding, along with the exact stdio package argument, checksum-pinned publisher validation, and the digest-continuous release workflow.
