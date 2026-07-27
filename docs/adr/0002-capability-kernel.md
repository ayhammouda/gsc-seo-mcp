# ADR 0002: One Capability Manifest And Dispatcher

- Status: Accepted for implementation; not production authorization
- Date: 2026-07-27
- Audited baseline: `b01d86d9820cd940f4077d32244c1685e6aeb572`
- Decision scope: WP-01
- Deciders: product, security, and operations owners remain unassigned

## Context

WP-00 contained the released runtime, but tool names, schemas, registration metadata, authorization checks, output filtering, and service dispatch still live in parallel handler-specific paths. That shape makes later identity, resource, budget, credential, error, and audit controls vulnerable to inconsistent adoption or direct-call bypasses.

The approved remediation design calls for a policy-enforced modular monolith. WP-01 establishes its non-bypassable capability-kernel seam without claiming that the later policy, budget, credential, error, or durable-audit work is complete.

## Decision

Use one frozen, versioned capability manifest as the source of truth for every active tool's name, presentation metadata, Zod contracts, effect, autonomy class, Google method, required scopes, resource selector, budget profile, retry class, approval class, and supported profile/mode.

Every MCP registration callback is generated from the registry bound to that dispatcher and delegates to the same dispatcher. Registration cannot accept a separate manifest or profile. The dispatcher owns the ordered path:

1. create a fresh immutable request context;
2. look up the exact capability name;
3. parse the input and apply schema defaults;
4. select the account, property, or property-target resource;
5. obtain a typed static-policy decision;
6. reserve the declared execution budget;
7. call the typed compatibility executor;
8. filter and validate the result at the boundary;
9. settle the budget reservation; and
10. attempt one terminal audit event before returning a redacted MCP result.

The dispatcher cannot be constructed without an explicit manifest, deployment profile, context, policy, budget, executor, error, and audit port. Runtime checks enforce this boundary even for untyped JavaScript callers.

WP-01 enables only a deeply frozen `local-stdio` / `read_only` deployment profile. Its identity is the trusted local parent process in a local tenant. Operator and remote profiles remain named domain states but fail construction. The active manifest contains only the four WP-00 direct-read capabilities. Sitemap submission, both compound-derived tools, and unsupported Google administration capabilities live in a disjoint unsupported-capabilities ledger and cannot be registered or dispatched.

The current exact-string allowlist, request timeout, service implementation, redacted MCP error, and ephemeral audit behavior are injected as explicitly named containment compatibility ports. They preserve WP-00 behavior while leaving their stronger replacements visible as WP-02, WP-03, WP-05, WP-07, and WP-08 obligations.

The credential-bearing raw runtime constructor is module-private. Its exported composition function returns a kernel-bound MCP server, and the containment Google service/client contracts expose no mutation method.

## Options Considered

### Keep Handler-Per-Tool Controls

| Dimension | Assessment |
| --- | --- |
| Initial complexity | Low |
| Bypass resistance | Low |
| Contract consistency | Low |
| Later-wave integration | High duplication |

This avoids a refactor now, but every later control must be remembered in every handler and direct-call surface. It does not meet the sole-execution-path requirement.

### Framework Middleware Around Existing Handlers

| Dimension | Assessment |
| --- | --- |
| Initial complexity | Medium |
| Transport reuse | Medium |
| Direct-call protection | Low |
| Domain typing | Medium |

MCP middleware could protect transport calls, but exported handlers and future internal workflows could still bypass it. Framework metadata would also remain separate from policy and Google capability truth.

### Typed Manifest And Capability Dispatcher

| Dimension | Assessment |
| --- | --- |
| Initial complexity | Medium |
| Bypass resistance | High |
| Contract consistency | High |
| Later-wave integration | High |

This creates one narrow policy and execution seam without introducing a service boundary or distributed control plane.

## Consequences

- Adding or changing an MCP tool requires one manifest entry and an executor implementation covered by generated truth-table tests.
- MCP registration no longer owns authorization, filtering, timeout, or error behavior.
- Static policy denial occurs before budget reservation, service-provider access, credentials, or Google calls.
- Deep imports of the legacy Google client still confer no MCP authority; only active manifest entries can reach it through the dispatcher.
- The compatibility policy and budget ports are deliberately narrow. They must be replaced, not silently expanded, by later work packages.
- The ephemeral audit adapter proves call ordering but does not satisfy the protected durable audit gate.
- The release freeze and all WP-00 containment controls remain in force.

## Verification

- Generate a profile/tool truth table from the manifest.
- Prove every active tool follows the same ordered dispatcher trace.
- Table-test missing and malformed mandatory dependencies.
- Prove invalid input, unknown and unsupported names, policy denial, and budget denial never obtain the lazy service.
- Prove mixed site inventory is filtered before output validation and return.
- Preserve the pinned WP-00 public schema fixture and packed stdio behavior.
