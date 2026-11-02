# Application Guidelines - SDKWork Doctor H5

## SDKWORK Soul

Read `../../../sdkwork-specs/SOUL.md` before executing tasks in this application root.

## SDKWORK Standards

Canonical specs path from this root: `../../../sdkwork-specs/README.md`.

## Application Identity

The repository manifest `../../agent.app.config.json` owns application identity; this root owns the H5 mobile browser surface declared by `APP_H5_ARCHITECTURE_SPEC.md`.

## Local Dictionary Structure

- `specs/`: app-root component contract.
- `packages/`: core, commons, shell, care, and diagnostics packages.
- `config/browser/`: runtime-env examples; `config/host/` is reserved for Capacitor profiles.
- `src/`: bootstrap and route composition only.

## Spec Resolution Order

1. This file. 2. `../../agent.app.config.json`. 3. `specs/component.spec.json` and package specs. 4. Global specs through `../../../sdkwork-specs/README.md`.

## Required Specs By Task Type

H5 renderer changes load `APP_H5_ARCHITECTURE_SPEC.md` and `APP_MOBILE_REACT_UI_SPEC.md`; client alignment changes also load `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`. Any TypeScript change loads `TYPESCRIPT_CODE_SPEC.md`.

## Build, Test, and Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` from this root, or the root repository commands.

## Agent Execution Rules

Native host code never owns business authentication or API calls. Do not construct SDK clients in UI packages.

## Human Review Rules

Request review before adding Capacitor platform profiles, changing safe-area handling, or changing route identity.
