# Developer Guide

## Setup

Requirements: Node.js 22+, pnpm 10, and the SDKWork standards repository checked out as a sibling at `../sdkwork-specs`.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts both surfaces against `standalone.development`:

- PC: <http://127.0.0.1:3911/>
- H5: <http://127.0.0.1:3912/>

`pnpm dev:cloud` starts the same renderers against `cloud.development` using the checked-in cloud runtime document. `pnpm stop` reclaims only the processes this repository recorded in `.sdkwork/local/dev/session.json`.

## Repository Map

- `apps/sdkwork-doctor-pc/` and `apps/sdkwork-doctor-h5/`: application roots (thin `src/`, package families under `packages/`).
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics/`: shared check vocabulary, catalog, and runner.
- `agent.app.config.json`: identity, release metadata, install package matrix.
- `etc/sdkwork.deployment.config.json`: deployment profile bindings.
- `config/browser/runtime-env.<profile>.<environment>.example.json`: public runtime documents per surface.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm check        # typecheck + contract tests + canonical specs validators
pnpm verify       # check + PC/H5 builds
```

`pnpm check:specs` runs the validators listed in `scripts/verify-specs.mjs`; add a validator there before claiming a new standard is enforced.

## Adding A Check

1. Add the check under `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics/src/checks/`.
2. Register it in `checks/index.ts`; the default catalog order is the run order and the UI order.
3. Keep it free of UI and module-level browser state: receive facts through `DoctorRuntimeContext` or read them inside the check with a guarded `typeof window` test.
4. Add a contract test when the check encodes a contract rather than a heuristic.

## Pending Integrations

- Appbase IAM: replace the pass-through `AuthGate` with the standard session wrapper and bind the session port in `*-core`.
- Generated SDKs: add the app SDK family under `sdks/`, construct it in `*-core`, and declare `contracts.sdkDependencies` plus the port in the core component spec.
- Native hosts: add `sdkwork-doctor-pc-tauri` (or `-electron`/`-capacitor`) and/or `sdkwork-doctor-h5-capacitor`; never put business logic in a host package.
