# WP-02 Resource And Budget Threat-Model Delta

Date: 2026-07-27
Applies to: local stdio read-only containment only

## Boundaries Added

Caller-controlled property, URL, date, language, collection, and pagination fields now cross a single semantic resource boundary before policy. Parser-created immutable objects carry normalized authorization facts while preserving the configured Google API identity.

The dispatcher also gains mandatory raw-input, normalized-reservation, lease-scoped gateway-operation, raw-output-preflight, and post-filter-output budget stages. The local composition root installs a bounded stdio transport and an atomic in-memory concurrency controller.

## Threats Reduced

| Threat | WP-02 control | Required evidence |
| --- | --- | --- |
| String-prefix containment authorizes a sibling path or deceptive hostname | Parsed origin, DNS-label, and normalized path-boundary containment | URL/property corpus and target-containment tests |
| IDNA, host case, default port, trailing dot, or percent encoding creates duplicate grants or quota buckets | Normalized policy keys plus allowlist collision rejection | Alias collision and normalized-concurrency tests |
| Caller alias changes the property identifier sent to Google after policy | Policy resolves to the configured branded property and executor substitutes its exact `apiValue` | End-to-end configured-identity test |
| A structurally forged object bypasses normalization | WeakSet parser provenance and runtime guards at policy, containment, dispatcher, and budget boundaries | Forgery tests |
| Impossible dates or timezone parsing alter an authorized range | Proleptic-Gregorian component validation and integer day ordinals; no `Date.parse` for business dates | Month/year/leap boundary corpus |
| Unknown fields or excess nested filters smuggle unsupported semantics or work | Strict public/nested objects and collection ceilings | Unknown-key and exact max/max-plus-one tests |
| Large stdio input is buffered and parsed without a bound | Fixed 262,145-byte lookahead buffer with a 262,144-byte payload ceiling before decode/parse | Split, multibyte, CRLF, exact, plus-one, and unterminated-frame tests |
| Direct dispatcher invocation bypasses MCP ingress sizing | Raw strict-JSON and UTF-8 byte assertion before schema parsing | Direct exact byte, non-JSON, depth, and node tests |
| Concurrent calls exhaust the local process or escape through property aliases | Atomic fail-fast process/actor/normalized-property counters with idempotent release | Saturation, isolation, alias, recovery, and MCP integration tests |
| Large upstream collections amplify work during mapping | Gateway top-level cardinality checks before mapping plus post-filter byte/item/depth/node checks | Getter-sentinel gateway tests and output boundary tests |
| Raw upstream output consumes unbounded work during schema traversal | Strict raw-output projection and byte/item/depth/node preflight precedes Zod and filtering | Raw-output short-circuit and getter/`toJSON` non-execution tests |
| Output filtering increases or fails to bound a result | Output is schema-validated, filtered, revalidated, then budget-checked before result construction | Dispatcher sequencing and exact output-limit tests |
| Several server instances multiply the advertised process ceiling | One module-level coordinator is shared by every local in-memory budget port | Cross-port saturation and recovery test |
| Work starts after its total deadline or exceeds the attempt ceiling | Expired contexts reject before executor/gateway accounting; production gateway validates the 30-second maximum | Expired/no-executor and timeout-construction tests |

## Residual Risks And Deferred Owners

- The actor and tenant remain fixed local compatibility identities. Dynamic subject/tool/property policy remains WP-03.
- Stored OAuth security, authority preflight, refresh persistence, and credential brokerage remain WP-04.
- Public error text is redacted but not yet a closed stable taxonomy. Combined MCP response sizing and canonical two-channel equality remain WP-05.
- Google response fidelity, `int64`, completeness, pagination metadata, and Discovery drift remain WP-06.
- The 45-second context rejects already-expired execution and bounds the direct executor signal, but central attempt orchestration, rate windows, Google quota accounting, retries, fairness, and cancellation classification remain WP-07.
- Terminal audit remains ephemeral and operational readiness is absent. WP-08 remains a production gate.
- Sitemap mutation remains unregistered. The sitemap-target validator is dormant until WP-09 approval, intent, and reconciliation controls exist.
- Compound analytics (`gsc_find_declining_pages`, `gsc_find_keyword_opportunities`) is in the unsupported ledger, but its implementation is dormant rather than removed: `src/insights.ts` and the six unreferenced schemas in `src/schemas.ts` (`findDecliningPagesInputSchema`, `findKeywordOpportunitiesInputSchema`, `decliningPageSchema`, `keywordOpportunitySchema`, `decliningPagesOutputSchema`, `keywordOpportunitiesOutputSchema`) still compile into the published `dist/`. Nothing imports them at runtime, no manifest entry reaches them, and the package exposes `bin` only with no `main`/`exports`, so no caller can invoke them. They are retained for WP-07 workflow-budget restoration and must be either registered under WP-07 budgets or deleted before the freeze lifts.
- HTTP is absent. Hosted body/header limits, OIDC identity, distributed quotas, and tenant isolation remain conditional WP-R1 gates.
- Dependency, release, and registry findings remain WP-10 through WP-12.

The release freeze remains in force. The user-requested security scan remains deferred.
