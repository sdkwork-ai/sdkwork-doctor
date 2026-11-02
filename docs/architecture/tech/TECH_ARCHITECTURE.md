# SDKWork Doctor Technical Architecture

Status: draft
Owner: sdkwork-platform
Updated: 2026-11-02
Specs: ARCHITECTURE_DECISION_SPEC.md, APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md, APP_PC_ARCHITECTURE_SPEC.md, APP_H5_ARCHITECTURE_SPEC.md, APP_RUNTIME_ENV_SPEC.md, COMPONENT_SPEC.md

## 1. Architecture Overview

SDKWork Doctor is one Adaptive Web product with two browser surfaces (PC and H5) and no server component in this release. The two surfaces share one framework-neutral diagnostics contract; each surface supplies its own shell, presentation primitives, and runtime bootstrap.

```text
apps/sdkwork-doctor-pc    apps/sdkwork-doctor-h5
  pc-core / h5-core              (SDK ports, module registry, host adapter, session port)
  pc-commons / h5-commons        (presentation primitives)
  pc-shell / h5-shell            (layout, navigation, route composition)
  pc-diagnostics / h5-diagnostics (pages, service, report state)
            \                 /
   apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics
        (check vocabulary, default catalog, registry, runner)
```

The PC root is the desktop fallback surface; the H5 root is the mobile fallback surface. A client that matches neither architecture falls back to the static web surface, which is not part of this repository.

## 2. Technology Choices

- **React 19 + Vite 6 + TypeScript 5.8 (strict)** for both browser surfaces.
- **pnpm workspace** at the repository root; no nested workspace files.
- **Framework-neutral diagnostics package** with no runtime dependencies, so the same catalog can run in a future Tauri, Electron, Capacitor, or Flutter bridge without importing React.
- **Plain CSS with custom properties** for the scaffold; Tailwind adoption would follow `TAILWIND_CSS_INTEGRATION_SPEC.md` and is not enabled yet.
- **i18next + react-i18next** with one app-shell provider. Copy is owned by package-local `src/i18n/<locale>/platform/diagnostics/` fragments; the zh-CN fragment is typed against the en-US keys, so locale parity is a compile error rather than a runtime gap.
- **Node's built-in test runner** for contract tests; no test framework dependency in the scaffold.

## 3. System Boundaries And Modules

| Layer | Ownership | Must not own |
| --- | --- | --- |
| `src/` of each app root | bootstrap, runtime document load, route composition, session gate seam | business checks, pages |
| `*-core` | SDK port registry, module registry, host adapter contract, session port | pages, product services |
| `*-commons` | domain-neutral primitives and formatting | business state, route ownership |
| `*-shell` | layout, navigation, route table | business logic, SDK construction |
| `*-diagnostics` | check presentation, report state, service wrapper | check definitions that other surfaces need |
| `doctor-common-diagnostics` | check vocabulary, catalog, runner | DOM-specific presentation, React |

Dependency direction is core/commons → shell → diagnostics, with each app root composing them. Feature packages never construct SDK clients; the core package owns ports and will own generated SDK construction when an API exists.

## 4. Directory And Package Layout

```text
apps/
  sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics/
  sdkwork-doctor-pc/
    src/{main.tsx,App.tsx,AuthGate.tsx,bootstrap/}
    packages/{sdkwork-doctor-pc-core,-commons,-shell,-diagnostics}/
    config/browser/runtime-env.<deployment-profile>.<environment>.example.json
    etc/sdkwork.deployment.config.json
    specs/component.spec.json
  sdkwork-doctor-h5/
    ... same shape with h5 package names ...
etc/sdkwork.deployment.config.json
specs/README.md
```

Every authored package owns `specs/component.spec.json`; every application root owns `.sdkwork/`, `specs/`, `tests/`, and its runtime-env documents.

## 5. API, SDK, And Data Ownership

- Doctor owns no HTTP API authority. `agent.app.config.json#backend.apiSurfaces` is empty.
- No generated SDK family is declared yet. `*-core` exposes an empty but explicit SDK port registry; adding a client means adding a port and a `contracts.sdkDependencies` entry in the core component spec.
- No persistence. Checks run against browser APIs and the same-origin runtime document; nothing is stored server-side. The only browser write is a probe key that is removed immediately.

## 6. Security, Privacy, And Observability

- Checks run locally; the only network request is a `no-store` fetch of `/runtime-env.json` on the page's own origin.
- No credential, token, or user identifier is read or displayed. The runtime-env document is public by design.
- The session gate is an explicit pass-through in the scaffold; when appbase IAM lands it becomes the standard `SdkworkSessionAuthBrowserRoot` wrapper (`IAM_LOGIN_INTEGRATION_SPEC.md`).
- Observability is the report itself: per-check status, duration, and details. A future version may add structured log export, but never secret values.

## 7. Deployment And Runtime Topology

- Runtime target: `browser` for both surfaces. Deployment profiles: `standalone` and `cloud`.
- Each `<deployment-profile>.<environment>` pair has one checked-in runtime-env example. Vite serves `/runtime-env.json` in development and emits the same document into the build, so a static artifact carries its deploy-time configuration (`APP_RUNTIME_ENV_SPEC.md`, `BROWSER_RUNTIME_ENV_SPEC.md`).
- Build output follows `dist/<deployment-profile>/<dev|test|staging|demo|prod>/` through `tools/browser-dist-layout.mjs`.
- No application API, gateway, database, or container process is defined yet; `agent.app.config.json` install packages are placeholders marked `releaseBuildDeferred` until the packaging workflow is added.

## 8. Architecture Decision Index

No ADR is recorded yet. The following decisions are inherited from standards rather than locally chosen:

- Adaptive Web PC+H5 pair: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`.
- Shared, framework-neutral check contract: `COMPOSABLE_ARCHITECTURE_SPEC.md` and `COMPONENT_SPEC.md`.
- Runtime-env document instead of build-time inlined base URLs: `APP_RUNTIME_ENV_SPEC.md` section 2.

Record an ADR under `docs/architecture/decisions/` before changing any of them.

## 9. Verification

```bash
pnpm typecheck
pnpm test
pnpm check        # typecheck + contract tests + canonical specs validators
pnpm verify       # check + PC/H5 browser builds
```

Canonical validators invoked by `pnpm check:specs`: repository baseline, workspace layout, gitignore, repository docs, agent workflow, pnpm scripts, app manifest, apps directory index, component port bindings, workspace member protocol, and Vite workspace aliases.
