# WP-00 Audited Baseline And Pinned Evidence

Captured on 2026-07-27 before the containment profile is independently approved.

## Repository Baseline

- Repository: `https://github.com/ayhammouda/gsc-seo-mcp.git`
- Audited branch: `main`
- Audited SHA: `b01d86d9820cd940f4077d32244c1685e6aeb572`
- Audited commit date: `2026-07-13T01:02:40+01:00`
- Local `main...origin/main` at capture: `0 0` using the existing local tracking ref; no fetch was performed
- Implementation branch: `codex/holistic-remediation-wp00`

Pinned baseline file digests:

| Baseline file | SHA-256 |
| --- | --- |
| `package-lock.json` | `1dc61b977d30ad57a1d68b8ba0cd9da9d3fef0260533742ff2f07a859441a56a` |
| `package.json` | `95fedc79cf048f58cf55f40b73563e518c18f0805e0dc8ee10c120225e6613bf` |
| `src/schemas.ts` | `852ca2e9cec20fa4e84116d8e905c2eaacc95b4adbdaf71af7407a22b79ad986` |
| `src/mcp-server.ts` | `4ec6db0968931787c34c512848c0284a1c0b892618f31450f813bff54239feac` |
| `server.json` | `6d308fdfb45741f9b96dc4bad22719e4441873e1033b60e35f163289b42d3a5b` |

## Pinned WP-00 Fixtures

- Contract fixture: `tests/fixtures/contracts/wp-00-tool-contracts.json`
  - SHA-256: `45e024a09a3bdb7fe049b9c9459de90fb5324f0237a6b52591528edbe3b2ff9e`
  - Generated from the four public Zod input/output contracts.
  - `tests/schema-contract.test.ts` fails if a public contract drifts from it.
- Google Discovery reviewed manifest/extract: `tests/fixtures/google/searchconsole-v1.discovery-baseline.json`
  - Full offline snapshot: `tests/fixtures/google/searchconsole-v1.discovery.json`
  - Full snapshot file SHA-256: `8c20bdfa5bc8f6cf19cf11c553073eea08e3e68328589587e921f2beb30d079f`
  - Official source canonical JSON SHA-256 (`jq -S -c .`): `ed0a3006f11107f7115a22679c272c999621387d16657ed099b18c45f1f8fecc`
  - Official revision: `20260725`
  - The fixture records the four enabled read methods, the disabled sitemap mutation, and both Google OAuth scopes.
  - `tests/baseline-fixtures.test.ts` validates its reviewed shape and scope split without requiring network access.
- Performance baseline: `tests/fixtures/performance/wp-00-baseline.json`
  - Frozen WP-00 completion measurements from the machine and commands recorded in that file; later work packages do not refresh them.
  - Later budget work must replace observations with reviewed thresholds; these numbers do not authorize a release.

## Ownership And Release Status

ADR 0001 records the containment decision and release freeze. Named product, security, and operations approvers remain unassigned, so production and publication remain blocked even if WP-00 tests and peer review pass.
