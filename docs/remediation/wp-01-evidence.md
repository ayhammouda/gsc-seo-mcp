# WP-01 Capability-Kernel Evidence

Date: 2026-07-27
Branch: `codex/holistic-remediation-wp00`
Audited base: `b01d86d9820cd940f4077d32244c1685e6aeb572`
Release status: frozen; WP-01 is not production authorization

## Implemented Gate

| Requirement | Retained evidence |
| --- | --- |
| One active execution path | Manifest-generated MCP callbacks invoke the branded capability dispatcher; registration obtains capabilities from that dispatcher's bound registry/profile |
| Immutable profile and context | Strict construction, copied/frozen allowlist, per-call frozen context, and dispatcher/profile parity checks |
| Capability truth | Versioned Map-backed registry, profile visibility, exact lookup, Google method/scope metadata, and a disjoint unsupported ledger |
| Fail-closed construction | Runtime dependency matrix for registry, profile, context factory, static policy, budget, executor, error, and audit ports |
| Ordered enforcement | Input validation, resource selection, static policy, budget reservation, lazy execution, output validation/filtering, budget release, terminal audit |
| No mutation/runtime bypass | Sitemap submission is absent from schemas, service, Google client, registration, and packed declarations; the credential-bearing service constructor is module-private |
| Registration/dispatch parity | A synthetic registry proves the advertised and executable capability sets come from the same dispatcher binding |
| Bootstrap immutability | Post-construction mutation of the caller's runtime/credential configuration cannot affect the lazy credential path |
| Account result policy | Mixed account inventory is filtered according to manifest resource metadata and the exact property allowlist |
| Terminal integrity | Invocations that reach the dispatcher — including throwing accessors, containment denials, reservation failures, release failures, and audit failure — are projected through one terminal path. Arguments rejected by the MCP SDK against the advertised tool schema never enter the dispatcher and are returned as protocol-level `InvalidParams`. |

## Validation

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 19 files passed and 1 skipped; 125 tests passed and 1 skipped.
- Focused kernel, registration, OAuth, architecture, and packed-artifact regression slice: 70 tests passed.
- `git diff --check`: pass.
- `npm pack --dry-run --json`: pass, including packed-surface mutation and registration assertions.
- WP-00 contract fixture remains unchanged:
  `45e024a09a3bdb7fe049b9c9459de90fb5324f0237a6b52591528edbe3b2ff9e`.
- WP-01 manifest fixture:
  `c899073cd81f34a7877194eb08b60eb739671f729465374807cf800494793efe`.

Two independent codebase postflights challenged manifest binding, configuration immutability, metadata-driven filtering, dispatcher audit states, hostile invocation accessors, and compatibility-schema wording. All findings were remediated and both postflights returned PASS before external peer review.

## Explicit Deferrals

WP-01 installs interfaces and containment adapters; it does not claim closure of later packages. Strict resource/date/URL value objects and hierarchical budgets remain WP-02. Actor/tenant authorization remains WP-03. Credential lifecycle remains WP-04. Closed public errors remain WP-05. Google fidelity remains WP-06. retry/quota execution control remains WP-07. Durable protected audit/readiness remains WP-08. Governed mutation remains WP-09. Supply-chain and registry release work remain WP-10 through WP-12.

The requested security scan was intentionally skipped. The release freeze and unassigned product, security, and operations approval gates remain in force.

## Review Retention

The Claude CLI Fable/max per-task review is retained beside the approved remediation plan rather than written into this repository, so recording the verdict does not alter the tree that Claude reviewed.
