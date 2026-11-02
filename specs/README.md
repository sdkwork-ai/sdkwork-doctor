# Repository Specs

This directory owns repository-wide, cross-module machine contracts. It does not hold global standards; those live in `../sdkwork-specs/`.

Current contracts:

- `agent.app.config.json` (repository root) — application identity, release metadata, and install package matrix.
- `etc/sdkwork.deployment.config.json` — deployment profile bindings for both browser surfaces.
- `agents-app-api.contract.json` — the pinned slice of the sdkwork-agents app API this application consumes; compared with the upstream OpenAPI by `tests/agents-upstream-contract.test.mjs`.
- `agent-integration.contract.json` — transport selection, per-client ports, and acceptance status for the hosted conversation.
- `apps/sdkwork-doctor-pc/specs/component.spec.json` and `apps/sdkwork-doctor-h5/specs/component.spec.json` — application-root component contracts.
- `apps/sdkwork-doctor-*/packages/*/specs/component.spec.json` — module-local component contracts.

Repository-wide contracts are added here only when they span multiple clients (for example the shared agents wire contract and the transport acceptance record).
