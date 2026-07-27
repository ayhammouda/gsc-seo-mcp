# WP-02 Deterministic Budget Contract

Date: 2026-07-27
Applies to: single-process local stdio read-only containment

## Fixed Limits

| Boundary | Limit | Enforcement point |
| --- | ---: | --- |
| Inbound stdio JSON-RPC payload | 262,144 bytes | Bounded transport, before UTF-8 decode and JSON parse |
| Dispatcher invocation JSON | 262,144 UTF-8 bytes | Raw budget assertion before the dispatcher's own Zod parse. On the MCP path the SDK validates the advertised tool schema first, so wire traffic reaching this assertion is already schema-valid; the bounded transport still caps the frame at the same ceiling before decode. |
| Property or URL identifier | 8,192 UTF-8 bytes | Shared branded parser and wire schema |
| Property allowlist | 1,000 unique normalized entries | Shared allowlist parser and profile schema |
| Search Analytics date span | 90 inclusive calendar days | Shared calendar range parser through strict schema |
| Search Analytics rows per call | 1,000 | Strict schema, normalized budget, gateway response guard |
| Search Analytics pagination window | 25,000 rows | Strict schema and normalized budget |
| Filter groups / filters per group | 4 / 8 | Strict schema and normalized budget |
| Filter expression | 4,096 characters | Strict schema |
| Output JSON | 1,048,576 UTF-8 bytes | Raw gateway-result preflight and final post-filter output budget |
| Output depth / nodes | 32 / 50,000 | Strict JSON walker before serialization |
| Primary output items | 1,000 for list/query tools; 1 for inspection | Per-capability frozen budget |
| Concurrent units per capability | 1 | Per-capability frozen budget |
| Concurrent calls per actor | 2 | Atomic in-memory reservation |
| Concurrent calls per normalized property/account tenant | 4 | Atomic in-memory reservation |
| Concurrent calls per process | 8 | Atomic in-memory reservation |
| Google operations per direct capability | 1 | Manifest/executor one-handler table |
| Google attempt timeout | 30,000 ms | Google request options |
| Total read deadline | 45,000 ms | Frozen profile/context and bounded executor signal |

The reviewed machine-readable table is pinned in `tests/fixtures/contracts/wp-02-budget-profiles.json`. Manifest construction fails if an active capability lacks an exact matching budget profile.

## Accounting Rules

- Raw input must be strict JSON: finite numbers, dense arrays, plain data objects, no symbols, accessors, cycles, functions, `bigint`, or `undefined`.
- Normalized input limits are checked again after schema defaults and semantic validation.
- All process, actor, and property capacity checks happen synchronously before any counter changes. Their coordinator is shared by every budget-port/server instance in the Node.js process.
- Capacity exhaustion fails immediately. There is no queue.
- Property concurrency uses the parser-created normalized `property.policyKey`; caller aliases cannot create separate buckets.
- Account-scoped inventory uses a tenant account bucket in addition to actor and process buckets.
- A lease releases at most once. Success, error, cancellation, output rejection, and error projection cannot underflow counters.
- Raw output is projected and checked as strict JSON before Zod or policy traversal. It is then validated, allowlist-filtered, revalidated, and checked again for strict JSON bytes, primary items, depth, and nodes.
- Google collection cardinality is checked before mapping top-level site, analytics-row, or sitemap arrays.
- Each reserved direct capability consumes exactly one lease-scoped Google gateway operation; max-plus-one and post-release consumption fail closed.

## Error And Audit Semantics

Internal budget failures carry stable `budget_*` codes. WP-05 will map those to the closed public taxonomy; until then the existing redacting error port is retained.

Terminal audit distinguishes raw input rejection, reservation error, concurrency denial, gateway denial, successful reservation/release, output rejection, and release failure. A successfully released permit does not erase a gateway or output rejection.

## Explicit Non-Claims

These limits are not distributed quotas, hosted fairness, Google quota accounting, retry budgets, or workflow budgets. They are suitable only for the current single-process local stdio profile. Passing this contract does not lift the release freeze or close the WP-07 portion of F-05.
