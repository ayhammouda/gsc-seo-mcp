# WP-02 Strict-Resource And Deterministic-Budget Evidence

Date: 2026-07-27
Branch: `codex/holistic-remediation-wp00`
Audited base: `b01d86d9820cd940f4077d32244c1685e6aeb572`
Release status: frozen; WP-02 is not production authorization
CI status: functional matrix and CodeQL pass; dependency audit remains an explicit WP-10 release blocker

## Implemented Gate

| Requirement | Retained evidence |
| --- | --- |
| Strict semantic resources | Parser-created immutable Search Console property, HTTP target, sitemap target, calendar date/range, and RFC 5646 language values with runtime provenance checks |
| Stable Google identity and normalized policy identity | Exact configured `apiValue` is preserved separately from normalized `policyKey`; allowlist aliases that collapse to one policy identity are rejected |
| Exact URL containment | HTTP(S)-only parsing, IDNA/default-port normalization, credentials/fragment/control rejection, and origin plus decoded path-boundary containment |
| Strict public schemas | Unknown keys fail at every object layer; inclusive calendar ranges, collection counts, pagination windows, filter expressions, and language tags have exact limits |
| Unknown-field migration | Strict rejection is applied before release because the package is private/frozen and WP-08 telemetry does not yet exist; the migration ledger records the deliberate deviation and the conditions for any edge-only compatibility window |
| Bounded stdio ingress | The production transport rejects payloads above 262,144 bytes before UTF-8 decode or JSON parse, including split, multibyte, CRLF, unterminated, and packed-CLI cases |
| Strict dispatcher input | Raw invocation bytes, depth, nodes, dense arrays, finite numbers, plain data objects, and forbidden executable/serialization shapes are checked before Zod |
| Atomic local concurrency | One process-wide coordinator enforces fail-fast limits of two calls per actor, four per normalized property/account tenant, and eight per process across independently composed servers |
| Deadline and direct-operation accounting | Already-expired contexts stop before executor access; every direct capability consumes exactly one lease-scoped gateway operation |
| Bounded upstream and result handling | Top-level Google collections are capped before mapping; raw results are projected and budgeted before Zod/filter traversal, then revalidated and budgeted again after policy filtering |
| Immutable attempt timeout | Runtime configuration and the concrete Google client reject attempt timeouts above 30 seconds; the client snapshots the validated primitive exactly once |
| Manifest and budget truth | Every active capability has one frozen budget profile and the generated manifest, schemas, and budget table are pinned as current fixtures |
| Compatibility retained | Historical WP-00 schema and WP-01 manifest fixtures remain byte-for-byte pinned while the current contract is explicitly versioned for WP-02 |

## Validation

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 27 files passed and 1 skipped; 368 tests passed and 1 skipped.
- `npm run test:e2e`: 4 files and 11 tests passed.
- `npm run build`: pass as part of both full and end-to-end test gates.
- `git diff --check`: pass.
- `npm pack --dry-run --json --ignore-scripts`: pass against the built artifact.
- Retained CI evidence: the [Node 22/24 Linux/macOS matrix](https://github.com/ayhammouda/gsc-seo-mcp/actions/runs/30266046709) and [CodeQL analysis](https://github.com/ayhammouda/gsc-seo-mcp/actions/runs/30266046746) pass. The [dependency-audit workflow](https://github.com/ayhammouda/gsc-seo-mcp/actions/runs/30266046719) reports the known transitive advisories assigned to WP-10; that release blocker remains open and does not weaken the freeze.
- Historical WP-00 contract fixture:
  `45e024a09a3bdb7fe049b9c9459de90fb5324f0237a6b52591528edbe3b2ff9e`.
- Historical WP-01 manifest fixture:
  `c899073cd81f34a7877194eb08b60eb739671f729465374807cf800494793efe`.
- Current WP-02 contract fixture:
  `0f4275856c4b716e1004bbe3899413aa5de20de86c93ed8a60d57e862cc2b7cc`.
- Current WP-02 capability-manifest fixture:
  `cd60e0dce4ed8ca4ef9a477493007000535dd5b0cfde24f2c90a3309f09ec439`.
- Current WP-02 budget-profile fixture:
  `d6cc5e3744789eae0f95154c00863b6634242cb120899557728ab3dabe716d07`.

Three independent codebase postflights challenged resource parsing and schema parity, budget sequencing and shared accounting, and transport/gateway boundaries. Their findings drove encoded-control rejection, an RFC 5646 parser, exact/max-plus-one schema parity, fail-before-execution deadlines, raw-output preflight, process-wide concurrency accounting, non-executing strict-JSON inspection, fatal packed-CLI framing, and immutable timeout snapshots. A plan-coverage postflight additionally required an explicit unknown-field-rollout disposition and a keyword-position cross-field regression. Those gaps were closed before external peer review, and all technical postflights returned PASS.

## Explicit Deferrals

WP-02 implements deterministic local resource and execution boundaries only. Dynamic actor/tenant authorization remains WP-03. Credential lifecycle and actual authority remain WP-04. Closed public errors and the canonical two-channel MCP result envelope remain WP-05. Complete, lossless Google response and pagination semantics remain WP-06. Rate windows, Google quota accounting, retries, jitter, fairness, caching, circuit breaking, and multi-attempt/workflow accounting remain WP-07. Protected durable audit/readiness remains WP-08. Governed mutation remains WP-09. HTTP ingress budgets remain a construction gate for conditional WP-R1 because the current profile is stdio-only. Supply-chain, registry, and production-readiness work remains WP-10 through WP-12.

The requested security scan was intentionally skipped. The release freeze and unassigned product, security, and operations approval gates remain in force.

## Review Retention

The Claude CLI Fable/max per-task review is retained after review beside the approved remediation plan rather than written into this repository, so recording the verdict does not alter the tree that Claude reviewed.
