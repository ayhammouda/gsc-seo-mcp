# Test Strategy

Canonical map of what we test, where it lives, and what still needs manual validation.

## Test Shape

```text
      / live Google E2E \     opt-in only, protected credentials
     / real MCP E2E    \     stdio client transport and packed CLI boundary
    / integration      \     package contents, workflow invariants, tool call counts
   / service/schema    \     Google mapping, config, OAuth, security, schemas
```

Keep most coverage at the service/schema layer. Add real subprocess tests only for behavior that can break across the process boundary, such as stdio framing, stdout hygiene, and CLI packaging.

## Tool Coverage

Every public MCP tool must:

- have one active entry in the frozen capability manifest
- appear in the manifest-derived `GSC_TOOL_NAMES`
- be registered from `gscCapabilityRegistry.listForProfile(...)`
- have manifest-derived Zod input and output schemas in `GSC_TOOL_SCHEMA_CONTRACTS`
- traverse the capability dispatcher before the lazy service provider
- appear in the real stdio `tools/list` smoke test

Current tools:

| Tool | Primary coverage |
| --- | --- |
| `gsc_list_sites` | `tests/tools.test.ts`, `tests/stdio-smoke.test.ts` |
| `gsc_search_analytics` | `tests/google-client.test.ts`, `tests/schemas.test.ts` |
| `gsc_list_sitemaps` | `tests/google-client.test.ts`, `tests/schema-contract.test.ts` |
| `gsc_inspect_url` | `tests/google-client.test.ts`, `tests/schemas.test.ts` |

Containment coverage must additionally prove:

- server startup fails without a non-empty exact property allowlist
- site inventory is filtered and property-bearing calls deny non-allowlisted properties before Google calls
- only `read_only` mode is accepted; operator, full-admin, unknown, and legacy write-enable configurations fail
- Search Analytics rejects more than 1,000 rows or more than 90 calendar days inclusively
- impossible calendar dates, cross-property URL targets, ambiguous URL encodings, unknown keys, normalized allowlist collisions, and missing URL-prefix trailing slashes fail before policy
- direct dispatcher input plus raw and post-filter output obey exact byte, item, depth, and node ceilings without invoking getters or serialization hooks
- all local server instances share fail-fast actor/property/process concurrency ceilings and recover after idempotent release
- inbound stdio framing enforces the exact 262,144-byte payload boundary before UTF-8 decoding and JSON parsing
- Google response arrays reject max-plus-one cardinality before mapping
- write and derived-analysis tools are not registered
- unsupported names and disallowed properties never obtain the credential-bearing service
- missing or malformed dispatcher ports fail at construction
- the packed runtime exports no raw credential-bearing service or sitemap mutation method
- CLI help and the packed artifact do not expose an HTTP command

## Definition Of Done For Tool Changes

- Add happy-path and error-path coverage for new behavior.
- Update the capability manifest and pinned contract fixtures for any tool metadata, input, or output change.
- Keep the generated manifest/profile truth-table and dispatcher stage-order tests passing.
- Keep `tests/stdio-smoke.test.ts` passing against the compiled CLI.
- Keep `tests/e2e/mcp-tools.e2e.test.ts` passing for every public tool.
- Keep model-visible text payloads concise; large data belongs in `structuredContent`, not duplicated in text `content`.
- Update README, `server.json`, `glama.json`, and this file if the public tool surface changes.

## Automated E2E Coverage

- `tests/e2e/mcp-tools.e2e.test.ts` calls every public tool through an SDK `Client` and `InMemoryTransport`, validates structured output, and asserts exact fake Google service call counts.
- `tests/e2e/stdio-client.e2e.test.ts` connects to `node dist/cli.js stdio` with SDK `StdioClientTransport` and verifies `tools/list` without stderr noise.
- `tests/e2e/payload-budget.test.ts` prevents full structured payload duplication in model-visible text and verifies tool error redaction.
- `tests/e2e/deterministic-budgets.e2e.test.ts` proves production composition enforces output-item and actor-concurrency ceilings through a real MCP client.
- Package and CLI tests verify that HTTP is absent from help, commands, and the npm artifact.

Run:

```bash
npm run test:e2e
```

## Boundary Corpora

These are unit-layer corpora, not E2E. They run under `test:unit`.

- `tests/resources/` retains the WP-02 semantic-resource boundary corpus.
- `tests/kernel/` retains the dispatcher stage-order, deterministic-budget, adapter, and profile/manifest corpora.
- `tests/transport.test.ts` retains the byte-framing boundary corpus.

Run:

```bash
npm run test:unit
```

`test:unit` selects by exclusion (`--exclude "tests/e2e/**" --exclude "tests/live/**"`) rather than by an include glob. Vitest CLI positional arguments are substring filters applied after `include` globbing, so a path-filtered command silently drops any test directory it does not name. `tests/ci-workflows.test.ts` asks Vitest which files each CI command actually collects and fails if any non-live test file is unreachable.

## Live Google E2E

Live tests are opt-in and must not run on ordinary pull requests.

```bash
GSC_LIVE_E2E=true \
GSC_SEO_MCP_TOKEN_STORE_PATH=/path/to/tokens.json \
GSC_SEO_MCP_ALLOWED_PROPERTIES='["https://example.com/"]' \
GSC_TEST_SITE_URL=https://example.com/ \
npm run test:live
```

Use read-only credentials. The contained runtime has no live write-test path.

## Known Gaps

- Live Google API behavior is not exercised in default CI. Use `npm run test:live` and `.github/INTEGRATION-TEST.md` with a real OAuth client before releases.
- MCP HTTP is intentionally absent until an authenticated transport profile and its threat controls are implemented.
- WP-02 has deterministic single-process limits only. Rate windows, Google quota accounting, retry/fairness behavior, and compound-workflow budgets remain WP-07 coverage.
- Passing this strategy does not lift the technical release freeze; WP-10 completion, the intervening work packages, and their reviews remain required.
