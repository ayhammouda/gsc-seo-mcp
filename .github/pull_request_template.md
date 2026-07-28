## Summary

- 

## Why

- 

## Validation

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run pack:dry-run`

## MCP and security impact

- [ ] Tool input/output schemas are unchanged or the contract changes are documented and tested.
- [ ] No stdout logging was added to stdio server code.
- [ ] Google API calls remain bounded by per-request timeouts and `AbortSignal`.
- [ ] No credentials, tokens, secrets, private Search Console data, or generated `dist/` files are included.
- [ ] `README.md`, `server.json`, `glama.json`, and tests are updated if public metadata changed.

## Checklist

- [ ] The change is focused and linked to an issue when appropriate.
- [ ] New behavior includes tests.
- [ ] Documentation is updated.
- [ ] The release freeze and read-only containment boundaries remain intact.
