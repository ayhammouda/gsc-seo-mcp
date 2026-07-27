# WP-02 Resource And Budget Migration

Date: 2026-07-27
Profile: local stdio read-only containment
Release status: frozen; this migration is not production authorization

## Contract Transition

WP-02 is an intentional pre-1.0 contract tightening. The active tool set remains the four WP-00 reads, but malformed or ambiguous inputs that were previously normalized by JavaScript, accepted by permissive Zod objects, or left to Google now fail before policy, credentials, or network access.

The public changes are:

- URL-prefix Search Console properties must include the exact trailing slash used by the API.
- Domain properties must use the exact lower-case `sc-domain:` prefix and a valid DNS name.
- Property allowlists reject more than 1,000 entries and reject exact duplicates or different strings that collapse to one normalized policy identity.
- Property and URL identifiers are limited to 8,192 UTF-8 bytes.
- Inspected URLs must be explicit absolute HTTP(S) URLs without credentials, fragments, whitespace, controls, backslashes, encoded separators, or ambiguous dot segments.
- URL-prefix containment compares parsed origin and normalized path boundaries; domain containment compares exact DNS labels and subdomains.
- Calendar dates are validated component by component. Search Analytics ranges are ordered and limited to 90 inclusive days.
- Public input objects and nested filter objects reject unknown fields.
- Search Analytics accepts at most six unique supported dimensions, four filter groups, eight filters per group, 4,096 characters per expression, 1,000 rows per call, and a pagination window ending no later than row 25,000.
- URL Inspection language tags must be valid BCP-47 tags of at most 35 characters.

The current contract is pinned in `tests/fixtures/contracts/wp-02-tool-contracts.json`. It is captured from a live `tools/list` response over an in-memory MCP client, so the pinned evidence is the contract clients receive rather than a re-derivation of it. Re-deriving with `z.toJSONSchema` defaults would use the output projection and draft-2020-12, which disagrees with the SDK's draft-07 input projection about which defaulted fields are required. The historical WP-00 contract fixture remains byte-for-byte frozen and is no longer treated as the current schema.

### Unknown-field rollout disposition

The approved global plan proposed a read warning/telemetry window before strict unknown-field rejection. That rollout mechanism is intentionally not activated in WP-02: the package remains private and technically frozen before this contract can be released, and the durable telemetry plane does not exist until WP-08. Accepting and silently discarding unknown fields in the direct dispatcher during the freeze would preserve the ambiguity this boundary removes.

WP-02 therefore applies strict rejection before release and provides the migration ledger plus pinned old/current fixtures as the compatibility mechanism. If a distributed read-client cohort is identified before the freeze is lifted, a separately reviewed edge-only compatibility adapter and a real telemetry owner are required; the canonical dispatcher and schemas remain strict. This is a deliberate pre-release plan deviation, not evidence that a warning window was executed.

## Internal Resource Transition

Policy and budget code no longer reason about caller strings. Shared parsers create immutable branded values:

- `CalendarDate` and `CalendarDateRange`;
- `HttpTargetUrl`;
- `SearchConsoleProperty`; and
- the dormant property-bound sitemap target validator for WP-09.

Each property and target separates two identities:

- `apiValue` is the accepted exact string sent to Google when that object is authoritative.
- `policyKey` and parsed components are the normalized authorization, containment, collision, and concurrency identity.

The configured allowlist is authoritative. A caller may supply a normalization-equivalent alias, but static policy resolves it to the single configured property object. The executor sends the configured `apiValue` upstream, preventing a caller from selecting a different raw alias after authorization.

Runtime guards use parser provenance, not structural TypeScript shapes. Forged lookalike objects fail at dispatcher, policy, containment, and budget boundaries.

## Budget Transition

The local production composition root replaces the WP-01 pass-through reservation with the deterministic in-memory controller. Every call now performs:

1. strict raw JSON and 256 KiB invocation-byte inspection;
2. schema parsing and semantic resource selection;
3. normalized input-limit checks and fail-fast concurrency reservation;
4. rejection if the total deadline has already expired, followed by one lease-accounted direct Google service operation with a 30-second attempt timeout inside a 45-second request deadline;
5. a strict raw-output byte, item, depth, and node preflight before schema traversal;
6. output schema validation and allowlist filtering;
7. a final 1 MiB output, primary-item, depth, and node check; and
8. idempotent permit release and one terminal audit attempt.

The stdio transport independently limits each inbound newline-delimited JSON-RPC payload to 262,144 bytes before UTF-8 decoding or JSON parsing. It retains at most one possible terminal carriage return beyond that ceiling.

Oversized results fail closed. WP-02 does not silently truncate or claim completeness.

## Compatibility And Rollback

The manifest version is `2026-07-27.wp-02` and active contract version is `0.1.0-read-only.2`. Historical WP-00 and WP-01 fixtures remain pinned for audit history.

Rollback is code-only while the release freeze is active. A rollback must not restore anonymous HTTP, operator mode, mutation or derived-tool discovery, an unbounded property surface, permissive resource parsing, or the production pass-through budget.

## Deferred Controls

WP-02 implements deterministic local limits only. WP-07 still owns rate windows, Google quota accounting, retry classification, jitter, fairness, cache/deduplication, circuit breaking, and multi-attempt or compound-workflow accounting. WP-05 owns stable public error/result envelopes. WP-06 owns lossless Google response and completeness contracts. HTTP ingress limits remain a construction gate for conditional WP-R1 because no HTTP profile exists.
