# SDKWork Doctor

repository-kind: application

SDKWork Doctor is the diagnostics surface for SDKWork applications. It inspects a running client surface — runtime profile, browser capabilities, secure context, local persistence, locale metadata, clock, API base URLs, and runtime-document reachability — and reports actionable findings without sending diagnostic data anywhere.

## Surfaces

Adaptive Web: one product, two browser surfaces sharing one workspace and one diagnostics contract.

| Surface | Root | Packages |
| --- | --- | --- |
| PC browser | `apps/sdkwork-doctor-pc/` | `sdkwork-doctor-pc-core`, `-commons`, `-shell`, `-diagnostics` |
| H5 mobile browser | `apps/sdkwork-doctor-h5/` | `sdkwork-doctor-h5-core`, `-commons`, `-shell`, `-diagnostics` |
| Shared contract | `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-diagnostics/` | `@sdkwork/doctor-common-diagnostics` |

Each surface is a thin bootstrap (`src/`) over its package family. Business behavior lives in the diagnostics capability package; the shared contract package owns the check vocabulary and runner.

## Commands

Run from the repository root:

```bash
pnpm install
pnpm dev          # both surfaces, standalone.development
pnpm dev:cloud    # both surfaces, cloud.development
pnpm stop         # stop the recorded development session only
pnpm build        # PC and H5 browser builds
pnpm typecheck
pnpm test
pnpm check        # typecheck + tests + canonical specs validators
pnpm verify       # check + build
pnpm clean        # remove reproducible dist output
```

Requires the SDKWork standards repository as a sibling checkout at `../sdkwork-specs` (`AGENTS.md` records the resolution order).

## Configuration

Public runtime values are checked in per `<deployment-profile>.<environment>`:

- `apps/sdkwork-doctor-pc/config/browser/runtime-env.*.example.json`
- `apps/sdkwork-doctor-h5/config/browser/runtime-env.*.example.json`

The Vite development server serves `/runtime-env.json` from those files and the production build emits the same document, so a static artifact carries its deploy-time configuration. Deployment bindings live in `etc/sdkwork.deployment.config.json`.

## Documentation

- [Documentation index](docs/README.md)
- [Product PRD](docs/product/prd/PRD.md)
- [Technical architecture](docs/architecture/tech/TECH_ARCHITECTURE.md)
- [Applications index](apps/README.md)

## Status

The repository is initialized as a standards-compliant scaffold:

- Both browser surfaces build and typecheck; the diagnostics catalog is fully implemented locally.
- Appbase IAM/login, generated app/backend SDK families, native host packages, and the packaging workflow are not wired yet. Each seam is explicit in the component contracts and architecture document, so those integrations add code rather than reshape the layout.
