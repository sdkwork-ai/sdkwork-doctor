# Application Guidelines - SDKWork Doctor PC

## SDKWORK Soul

Read `../../../sdkwork-specs/SOUL.md` before executing tasks in this application root.

## SDKWORK Standards

Canonical specs path from this root: `../../../sdkwork-specs/README.md`.

## Application Identity

The repository manifest `../../agent.app.config.json` owns application identity; this root owns the PC browser surface declared by `APP_PC_ARCHITECTURE_SPEC.md`.

## Local Dictionary Structure

- `specs/`: app-root component contract.
- `packages/`: core, commons, shell, and diagnostics packages.
- `config/browser/`: checked-in runtime-env examples per profile.
- `etc/`: deployment profile binding.
- `src/`: bootstrap and route composition only.

## Spec Resolution Order

1. This file. 2. `../../agent.app.config.json`. 3. `specs/component.spec.json` and package specs. 4. Global specs through `../../../sdkwork-specs/README.md`.

## Required Specs By Task Type

PC renderer changes load `APP_PC_ARCHITECTURE_SPEC.md` and `APP_PC_REACT_UI_SPEC.md`. Any TypeScript change loads `TYPESCRIPT_CODE_SPEC.md`; UI changes load `FRONTEND_CODE_SPEC.md`, `FRONTEND_SPEC.md`, and `UI_ARCHITECTURE_SPEC.md`. Runtime-env or base-URL changes load `APP_RUNTIME_ENV_SPEC.md` and `BROWSER_RUNTIME_ENV_SPEC.md`.

## Build, Test, and Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` from this root, or the root repository commands.

## Agent Execution Rules

Keep business behavior in capability packages. Do not construct SDK clients in UI packages. Do not deep-import another package's `src/`.

## Human Review Rules

Request review before changing route ownership, SDK boundaries, runtime-env shape, or deployment profile behavior.
