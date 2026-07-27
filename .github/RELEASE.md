# Release Process

## Technical Release Freeze

Publishing is technically blocked through WP-10 and until the freeze is explicitly lifted:

- `package.json` is marked `private`;
- `server.json` has neither a package nor a remote install descriptor;
- the tag-triggered release workflow has read-only permissions, no publishing credentials or commands, and an intentional failing freeze job after build/test/pack evidence is produced.

Git and GitHub Actions cannot prevent an authorized maintainer from creating or pushing a tag with this workflow alone. Tags are therefore prohibited by policy while the freeze is active. If one is pushed, the workflow must fail and must not publish to npm, the MCP Registry, or GitHub Releases.

Passing WP-00 containment or WP-01 kernel checks is not release authorization.

## Package Identity Blocker

The unscoped npm name `gsc-seo-mcp` belongs to an unrelated publisher. Do not install it, execute it with `npx`, configure trusted publishing for it, or advertise it in MCP Registry metadata.

WP-10/WP-11 must:

1. select and reserve a collision-free package identity owned by this project;
2. verify the npm owner, repository, workflow, and intended public access;
3. update `package.json`, the lockfile, runtime/version tests, documentation, and `server.json` atomically;
4. restore an exact stdio package argument and the reviewed profile-aware environment metadata;
5. validate the metadata with a checksum-pinned MCP publisher;
6. replace the freeze workflow with the reviewed digest-continuous release workflow.

## Allowed Freeze Evidence

The following commands validate a local source checkout or local tarball only:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:dry-run
```

Manual MCP QA is documented in [`.github/INTEGRATION-TEST.md`](INTEGRATION-TEST.md). A local tarball may be packed and installed into a temporary environment for verification, but it must not be published or represented as the unrelated registry package.

## Exit Criteria

The freeze may be lifted only after:

- all applicable remediation work packages and independent reviews pass;
- package identity and MCP Registry metadata are verified;
- release Actions and publisher binaries are digest/checksum pinned;
- the tested tarball digest is proven identical to the published digest;
- provenance, SBOM, rollback, and incident-owner evidence is complete;
- named product, security, and operations owners approve the selected profile.

When those conditions are met, this document and the release workflow must be replaced together. Do not reuse pre-freeze package names, commands, or publisher setup by assumption.
