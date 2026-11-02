# Repository Specs

This directory owns repository-wide, cross-module machine contracts. It does not hold global standards; those live in `../sdkwork-specs/`.

Current contracts:

- `agent.app.config.json` (repository root) — application identity, release metadata, and install package matrix.
- `etc/sdkwork.deployment.config.json` — deployment profile bindings for both browser surfaces.
- `apps/sdkwork-doctor-pc/specs/component.spec.json` and `apps/sdkwork-doctor-h5/specs/component.spec.json` — application-root component contracts.
- `apps/sdkwork-doctor-*/packages/*/specs/component.spec.json` — module-local component contracts.

Repository-wide contracts are added here only when they span both surfaces (for example a shared runtime topology manifest once API surfaces exist).
