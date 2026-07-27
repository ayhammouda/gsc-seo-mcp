# WP-01 Capability-Kernel Threat-Model Delta

Date: 2026-07-27
Applies to: local stdio read-only containment only

## Boundary Added

The capability dispatcher becomes the only MCP execution boundary between manifest-driven tool registration and the existing `GscService`. A fresh frozen request context carries the fixed local caller, tenant, deployment profile, mode, transport, start time, request identifier, and deadline. The service is supplied lazily to the executor and must not be obtained before static policy and budget decisions permit execution.

## Threats Reduced

| Threat | WP-01 control | Required evidence |
| --- | --- | --- |
| A tool bypasses authorization through a bespoke handler | All active manifest-generated registration callbacks delegate to one branded dispatcher | Four-tool ordered trace and architecture-boundary tests |
| Discovery and direct-call authorization disagree | Registration reads only the registry/profile binding captured by the branded dispatcher; no second manifest or profile input exists | Synthetic-registry registration/dispatch parity test and generated profile/tool truth table |
| Prototype-key or name-confusion dispatch | Exact `Map` lookup; active and unsupported names are disjoint | Unknown, `__proto__`, case, and whitespace tests |
| Policy denial still initializes credentials or Google services | Static policy precedes budget and lazy executor/service access | Zero provider and service calls on every denial path |
| A package consumer bypasses policy through a credential-bearing runtime export | The raw runtime constructor is private and the exported composition function returns a branded kernel-bound MCP server | Module-export and packed declaration tests |
| Account inventory leaks disallowed properties | Manifest-declared account filtering occurs at the dispatcher result boundary | Mixed-inventory filtering test |
| Invalid upstream output crosses MCP | Manifest output schema validates the minimized result | Invalid-output rejection test |
| Runtime configuration mutates authorization or credential state after bootstrap | Runtime and credential configuration, profile, allowlist, manifest definitions, and request context are copied and frozen at construction | Post-construction configuration-mutation test |
| Malformed invocation accessors escape projection or terminal audit | Invocation shape and property access are performed inside the guarded dispatch path | Throwing-getter and malformed-invocation tests |
| Budget reservation or release failure is hidden in terminal telemetry | Reservation, release, and release-error states are explicit; release failure becomes the terminal failure | Malformed-lease and release-failure audit tests |
| A missing future control silently becomes optional | Dispatcher construction validates every mandatory port at runtime | Omitted and malformed dependency matrix |

## Explicit Residuals

- The local caller and tenant are fixed compatibility identities. Actor/tenant policy and profile-specific tool ceilings remain WP-03.
- Property and target selection still uses the WP-00 exact-string and schema behavior. Typed normalized property, URL, calendar, and cross-field invariants remain WP-02.
- The containment budget reservation is an explicit compatibility adapter, not hierarchical rate, concurrency, quota, ingress, or output enforcement. Those controls remain WP-02 and WP-07.
- The error adapter preserves the existing secret-redacted MCP result. A closed error taxonomy, recursive redaction, stable codes, and equivalent diagnostic/public projections remain WP-05.
- The audit adapter proves terminal-event ordering but is not durable, integrity-protected, or operationally monitored. WP-08 remains a production gate.
- Credential scope and role facts are not yet a second authorization stage. Credential brokerage and authority verification remain WP-04.
- Approval, mutation intent, reconciliation, and write readiness remain absent. Operator mode and mutation discovery stay disabled until WP-08/WP-09 gates pass.
- HTTP and remote identity remain absent. The conditional remote profile remains WP-R1.
- The release freeze, private package posture, and source-only installation policy remain unchanged.

## Security Review Scope

WP-01 peer review must assess the kernel ordering, construction boundary, manifest truth, lazy service access, and WP-00 regression evidence. It must not treat the compatibility ports as closure of their later work packages. The user-requested security scan remains deferred.
