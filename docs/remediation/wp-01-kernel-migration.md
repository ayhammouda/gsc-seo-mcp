# WP-01 Capability-Kernel Migration

Date: 2026-07-27
Profile: local stdio read-only containment
Release status: frozen; this migration is not production authorization

## Contract Transition

WP-01 is an internal pre-1.0 architecture transition. The public MCP surface remains the same four tools and retains the pinned WP-00 input/output schema fixture:

- `gsc_list_sites`
- `gsc_search_analytics`
- `gsc_list_sitemaps`
- `gsc_inspect_url`

The execution boundary changes:

| Before WP-01 | After WP-01 |
| --- | --- |
| Literal tool-name array | Names derived from the versioned capability manifest |
| Separate schema-contract map | Schema contracts derived from manifest entries |
| Four manual registration blocks | Registration loop over capabilities visible to the frozen profile |
| Exported handler-specific parsing and authorization | One dispatcher owns parsing, resource selection, policy, budget, execution, result validation, and terminal audit |
| Eager service object passed into handlers | Read-only executor receives a lazy service provider after policy and budget permit |
| Exported credential-bearing runtime and mutation method | Only a kernel-bound MCP runtime is exported; its private lazy service and compatibility executor expose the four approved reads |
| Mutable configuration bag read by downstream handlers | Bootstrap snapshots runtime and credential settings, then creates a frozen deployment profile and per-call frozen request context |

No compatibility adapter may expose a second execution path. The retained adapter converts the legacy read-only `GscService` into the dispatcher executor port; it does not own authorization, tool metadata, filtering, error projection, mutation, or derived workflows. For local type narrowing and defense in depth, it reparses inputs with the same manifest-owned Zod schema after the dispatcher has already validated and defaulted them; it defines no independent schema contract.

The credential-bearing raw runtime constructor is module-private. Its exported composition function snapshots the caller-supplied configuration and returns a fully kernel-bound MCP server rather than a reusable Google service.

## Manifest Truth

Each active entry declares:

- contract version and MCP presentation metadata;
- effect and autonomy class;
- supported deployment profile and mode;
- exact Google Discovery method identifier and required read-only scope;
- account, property, or property-target resource selection;
- input and output Zod schemas;
- budget profile, retry class, and approval class; and
- MCP annotations.

The unsupported ledger is disjoint from active registration. It records sitemap submission and both derived workflows with their target work packages. Unknown names and unsupported names fail before policy, budget, service-provider, credential, or Google access.

## Deployment Profile

Only `local-stdio` with `read_only` access is constructible in WP-01. Construction requires a non-empty exact property allowlist and a positive bounded deadline. The allowlist is copied and frozen. Operator, remote, full-admin, missing, and unknown states remain unavailable.

Each invocation receives a new frozen context containing:

- request identifier;
- fixed trusted local actor and tenant identifiers;
- `local-stdio`, `read_only`, and `stdio`;
- ISO start time; and
- total deadline.

Environment, CLI configuration, and the caller's mutable configuration object are not consulted after bootstrap.

## Compatibility Ports And Deferred Replacements

| WP-01 port | Containment implementation | Replacement owner |
| --- | --- | --- |
| Static policy | Fixed local identity, active read capability, exact property allowlist | WP-03 |
| Budget | Explicit pass-through reservation plus current deadline | WP-02 / WP-07 |
| Executor | Lazy four-method read-only `GscService` adapter | WP-04 / WP-06 / WP-07 |
| Error | Existing secret-redacted MCP error projection | WP-05 |
| Audit | Explicit ephemeral terminal-event adapter | WP-08 |

The compatibility names are intentional: their presence must not be cited as closure of later production gates.

## Rollback

Rollback is code-only while the release freeze is active. Reverting WP-01 returns the tree to WP-00 containment; it must not restore HTTP, operator mode, mutation discovery, derived tools, registry publishing, or an unbounded property surface. Any rollback after a later package depends on the kernel requires a new compatibility and security assessment.

## Evidence To Retain

- manifest/profile truth-table tests;
- pinned `tests/fixtures/contracts/wp-01-capability-manifest.json`;
- dispatcher stage-order and short-circuit tests;
- constructor dependency matrix;
- architecture-boundary test proving MCP registration has no direct service path;
- unchanged WP-00 schema fixture;
- full unit, in-memory MCP, stdio, packed-artifact, lint, and typecheck results;
- Claude CLI Fable/max peer-review verdict and disposition.
