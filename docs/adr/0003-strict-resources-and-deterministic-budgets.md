# ADR 0003: Strict Resources and Deterministic Budgets

Date: 2026-07-27
Status: Accepted for WP-02 under the release freeze

## Context

WP-01 established one capability dispatcher, but its wire schemas still admitted semantically invalid properties, impossible calendar dates, lexical URL-prefix confusion, silently stripped unknown keys, and unbounded nested collections. Its budget port was an explicit pass-through seam: it did not constrain invocation bytes, result bytes/items, or local concurrency. The SDK stdio transport also accumulated an entire newline-delimited frame before parsing it.

These are one design problem rather than independent validation patches. Policy cannot authorize the intended Search Console resource, and the dispatcher cannot bound resource consumption, until caller strings are converted into immutable semantic facts and each capability carries enforceable limits.

## Decision

### Preserve API identity and normalize policy identity

Search Console properties and inspected URLs are parsed into branded immutable value objects.

- `apiValue` preserves the exact accepted string that may be sent to Google.
- `policyKey` and parsed scheme, IDNA hostname, port, and path components are used for authorization, containment, collision detection, and budget keys.
- Domain and URL-prefix properties are distinct variants.
- URL-prefix containment compares normalized origin and path segments; raw string-prefix checks are prohibited.
- Configured allowlists reject invalid values and distinct strings that collapse to the same normalized policy key.
- When a caller uses a permitted normalization alias, policy resolves it to the single configured property object. The configured `apiValue`, not a reconstructed or caller-substituted value, is authoritative upstream.

Calendar dates use explicit proleptic-Gregorian component validation and integer day ordinals. Runtime authorization and bounds do not use `Date.parse`.

### Keep wire schemas strict and serializable

Public MCP schemas remain ordinary JSON-compatible Zod schemas. Semantic refinements call the shared value-object parsers, but do not transform public strings into internal objects, so generated MCP JSON Schema remains stable and intelligible.

All public input objects, including nested filter objects, reject unknown fields. Search Analytics enforces collection, expression, date-span, row, and pagination-window ceilings. Hidden derived schemas receive the same calendar and cross-field hardening but remain unregistered.

The manifest co-locates each strict wire schema with semantic normalization and typed resource selection. The dispatcher performs:

```text
capability lookup
→ invocation byte assertion
→ strict wire parse and defaults
→ semantic normalization
→ typed resource selection
→ static policy and configured-resource resolution
→ deterministic budget reservation
→ total-deadline check and lease-accounted lazy execution
→ raw output byte/item/shape preflight
→ output validation and policy filtering
→ final output byte/item/shape assertion
→ release
→ one terminal audit
```

### Make deterministic budgets executable in WP-02

Each capability has a frozen validated budget definition. The local read-only profile enforces:

- 256 KiB stdio JSON-RPC payload and normalized invocation ceilings;
- four Search Analytics filter groups and eight filters per group;
- 4,096 characters per filter expression;
- 90 inclusive calendar days;
- 1,000 rows per direct Search Analytics call and a 25,000-row pagination window;
- 1 MiB structured output, explicit primary-item caps, and bounded output depth/node count;
- two concurrent calls per actor, four per normalized property, and eight per process;
- one Google gateway operation per current direct-read capability;
- a 30-second Google attempt timeout inside a 45-second total request deadline.

The local concurrency controller is in-memory, atomic, fail-fast, queue-free, and releases idempotently. Oversized results fail closed; WP-02 does not silently truncate because completeness and continuation contracts belong to WP-05/WP-06.

HTTP body and header limits are not implemented as dormant code because the released application has no MCP HTTP profile. They remain mandatory construction gates for WP-R1.

### Preserve later package boundaries

WP-02 does not claim the time-based or upstream-aware portions of F-05. WP-07 retains token-bucket rates, Google quota units, retries, jitter, fairness, cache/deduplication, circuit breaking, and multi-attempt/workflow accounting.

WP-03 owns dynamic actor/tenant policy. WP-05 owns closed public error/result envelopes. WP-06 owns complete Google response fidelity and continuation metadata. WP-08 owns durable protected audit. WP-09 owns sitemap-target exceptions and mutation activation.

## Consequences

### Positive

- Authorization uses exact semantic resources, not ambiguous strings.
- IDNA and default-port aliases cannot create duplicate grants.
- Invalid dates, hostile URL forms, unknown keys, and excess collections fail before policy, credentials, or Google access.
- Direct dispatcher calls and MCP calls share deterministic byte/item limits.
- Local concurrency exhaustion fails predictably and cannot leak permits.
- The raw stdio buffer is bounded before JSON parsing.

### Trade-offs

- This is an intentional pre-1.0 contract tightening. Clients relying on stripped unknown keys or malformed-but-normalized dates will fail.
- A configured normalized property alias becomes the sole upstream API identity; callers cannot select a different raw alias.
- Large valid Google results fail rather than truncate until canonical completeness metadata exists.
- In-memory counters are appropriate only for the single-process local profile and are not evidence for hosted fairness or distributed quota control.

## Verification

WP-02 requires retained property/date/URL corpora, strict-schema and direct/MCP parity tests, exact byte and item boundaries, concurrency saturation/recovery tests, bounded-stdio chunking tests, gateway cardinality guards, packed-artifact tests, a migration note, a threat-model delta, and a Claude CLI Fable/max review before the work package is accepted.
