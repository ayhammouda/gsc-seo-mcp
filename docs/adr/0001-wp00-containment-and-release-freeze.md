# ADR 0001: WP-00 Containment And Release Freeze

- Status: Accepted for implementation; not production authorization
- Date: 2026-07-27
- Audited baseline: `b01d86d9820cd940f4077d32244c1685e6aeb572`
- Decision scope: WP-00

## Context

The audited MVP exposed anonymous loopback HTTP, mutation and compound-analysis tools, account-wide property discovery, and configuration paths that were too broad for production agent use. Later work packages will introduce the capability kernel, stronger identity and policy, governed credentials, budgets, durable operations, and release-chain integrity. Until those controls exist, the distributable runtime needs a narrow non-bypassable boundary.

## Decision

The only implemented MCP profile is a trusted local stdio process with:

- `GSC_SEO_MCP_MODE=read_only`;
- a mandatory non-empty exact property allowlist;
- four direct read tools;
- a 1,000-row Search Analytics limit and an inclusive 90-day date limit;
- no public write or compound-derived tool;
- no MCP HTTP command; and
- a release workflow that always fails before publication.

`operator`, `full_admin`, unknown modes, and legacy write enablement fail closed. Exact legacy `GSC_SEO_MCP_READONLY=true` maps to read-only for one deprecation window and emits a secret-free stderr warning.

The unscoped npm name `gsc-seo-mcp` is owned by an unrelated publisher. Containment therefore also marks this repository's package private, removes package/remote install descriptors from `server.json`, and withdraws npm/npx guidance. WP-10/WP-11 must select, reserve, and verify a collision-free identity before any registry metadata or public install command returns.

The release freeze remains in force through WP-10 and until it is explicitly lifted after the applicable work packages and independent reviews pass. A passing WP-00 build is containment evidence, not permission to publish or deploy to production.

## Ownership

The repository maintainer is accountable for preserving the freeze and for routing later owner decisions. Named product, security, and operations approvers have not yet been recorded; that absence is an explicit production blocker and cannot be inferred from code ownership.

Before lifting the freeze, the following must be recorded in successor ADRs:

- named product owner for supported deployment profiles and property policy;
- named security owner for credential, authorization, and residual-risk approval;
- named operations owner for release, incident response, rollback, and canaries.

## Consequences

- Existing HTTP, mutation, derived-tool, and legacy write-mode users receive a breaking denial.
- The source checkout and locally produced tarballs are the only supported test surfaces; the similarly named public npm package is not this project.
- Authentication setup/status may run without a property allowlist; MCP server startup may not.
- Allowlist entries remain exact policy identities; normalized caller aliases resolve only to
  the configured entry's canonical API value, as specified by the later WP-02 contract.
- Reintroducing HTTP or writes requires a new reviewed profile, not a rollback of this ADR.
