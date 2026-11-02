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


## Family Doctor Capability

The product is now a family private-doctor agent application with three tabs on every client:

| Tab | PC / H5 | Flutter | Mini program |
| --- | --- | --- | --- |
| Chat | `/doctor/chat` | `ChatTab` | `pages/conversation` |
| Doctor | `/doctor/doctor` | `DoctorTab` | `pages/doctor` |
| Me | `/doctor/me` | `MeTab` | `pages/profile` |

Shared contracts:

- `@sdkwork/doctor-common-doctor` owns family members, health summary, and emergency-first triage.
- `contracts/triage-rules.json` is the single red-flag vocabulary; a parity test fails when any client drifts.
- `@sdkwork/doctor-common-agent` owns `AgentConversationPort`, the offline care adapter, and `resolveCareAgentMode()` (hosted vs offline is explicit, never a silent fallback).

### Verified

- `pnpm verify` (typecheck, 24 contract tests, canonical validators, PC/H5 builds).
- `flutter analyze` clean and `flutter test` 3/3.
- `agent.app.config.json` covers WEB, H5, MP_WEIXIN, APP_IOS, APP_ANDROID with 7 install packages.

### Known limits

- The hosted `sdkwork-agents` conversation path is selected and specified but not constructed: it needs a deployed agents API base URL plus an IAM access token. Until then only the offline adapter runs.
- Care page body copy is still English literals; only tab labels are localized.
- Mini program and Flutter mirror triage rules instead of binding the hosted transport.
## Documentation

- [Documentation index](docs/README.md)
- [Product PRD](docs/product/prd/PRD.md)
- [Technical architecture](docs/architecture/tech/TECH_ARCHITECTURE.md)
- [Applications index](apps/README.md)

## Status

The repository is initialized as a standards-compliant scaffold:

- Both browser surfaces build and typecheck; the diagnostics catalog is fully implemented locally.
- The UI is bilingual (`en-US`, `zh-CN`): copy lives in package-owned `src/i18n/<locale>/platform/diagnostics/` fragments, the shell resolves the locale once, and the switch persists in local storage.
- Appbase IAM/login, generated app/backend SDK families, native host packages, and live packaging are not wired yet. Each seam is explicit in the component contracts and architecture document, so those integrations add code rather than reshape the layout. The packaging GitHub workflow is a thin caller of the shared package workflow.
