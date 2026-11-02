# Repository Specs

This directory owns repository-wide, cross-module machine contracts. It does not hold global standards; those live in `../sdkwork-specs/`.

Current contracts:

- `agent.app.config.json` (repository root) — application identity, release metadata, and install package matrix.
- `etc/sdkwork.deployment.config.json` — deployment profile bindings for both browser surfaces.
- `agents-app-api.contract.json` — the pinned slice of the sdkwork-agents app API this application consumes; compared with the upstream OpenAPI by `tests/agents-upstream-contract.test.mjs`.
- `agent-integration.contract.json` — transport selection, per-client ports, and acceptance status for the hosted conversation.
- `app-composition.contract.json` — the building-block catalogue: the three tabs (chat / doctor / me), canonical page ids, routes, i18n keys, surfaces, the landing route, and the customization rules.
- `doctor-directory.contract.json` — the deployment human-doctor directory document (`runtime-env.json#careDoctorDirectoryUrl`), the doctor/affiliation employment model (Appbase organization + `med_hospital` code, full-time/part-time/contract/visiting), the authored fallback roster, and the per-client selection rules.
- `design-tokens.contract.json` — the tech-blue, flat, borderless palette, radius, and elevation that every client binds.
- `apps/sdkwork-doctor-pc/specs/component.spec.json` and `apps/sdkwork-doctor-h5/specs/component.spec.json` — application-root component contracts.
- `apps/sdkwork-doctor-*/packages/*/specs/component.spec.json` — module-local component contracts.

Repository-wide contracts are added here only when they span multiple clients (for example the shared agents wire contract and the transport acceptance record).
