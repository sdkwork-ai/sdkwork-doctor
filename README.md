# SDKWork Doctor

repository-kind: application

SDKWork Doctor is a family private-doctor agent application. A household keeps one patient file per member, talks to the sdkwork-agents family doctor with the active patient's facts in context, chooses its **real human doctors** from a deployment-bound doctor directory, and keeps every consultation in a device-local visit log. It runs on the PC browser, the mobile browser, the Flutter mobile app, and the WeChat mini program, with exactly three tabs: 对话 / 医生 / 我的.

## Surfaces

| Surface | Root | Packages / modules |
| --- | --- | --- |
| PC browser | `apps/sdkwork-doctor-pc/` | `sdkwork-doctor-pc-core`, `-commons`, `-shell`, `-care`, `-diagnostics` |
| H5 mobile browser | `apps/sdkwork-doctor-h5/` | `sdkwork-doctor-h5-core`, `-commons`, `-shell`, `-care`, `-diagnostics` |
| Flutter mobile | `apps/sdkwork-doctor-flutter-mobile/` | `lib/agent`, `lib/patients`, `lib/doctors`, `lib/records`, `lib/ui` |
| WeChat mini program | `apps/sdkwork-doctor-mini-program/` | `src/lib`, `src/pages` |
| Shared contracts | `apps/sdkwork-doctor-common/packages/` | `@sdkwork/doctor-common-doctor`, `-agent`, `-blocks`, `-diagnostics` |

Each surface is a thin bootstrap (`src/` or `lib/`) over its package family. Business behavior lives in the capability packages; the shared packages own the domain vocabulary, the triage contract, the conversation port, and the doctor/patient file contracts.

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

Keys that change product behaviour:

- `agentsApiBaseUrl` — the sdkwork-agents gateway; with an IAM token it selects the hosted conversation, otherwise the offline triage adapter answers and says so.
- `careDoctorDirectoryUrl` — the operator's human-doctor directory document; empty selects the authored fallback roster.
- `app.blocks` / `theme` — hide, reorder, relabel, or retheme the three tabs and the palette.


## Family Doctor Capability

Three tabs on every client; the browser surfaces also keep a workbench landing at the surface root.

| Tab | PC / H5 | Flutter | Mini program |
| --- | --- | --- | --- |
| 对话 | `/doctor/chat` | chat destination | `pages/conversation` |
| 医生 | `/doctor/doctor` | doctor destination | `pages/doctor` |
| 我的 | `/doctor/me` | me destination | `pages/profile` |
| 记录 (sub-screen of 我的) | `/doctor/me/records` | pushed screen | `pages/records` (not a tab) |

The mobile 医生 tab follows the WeChat search pattern: the title stays in the navbar, a search icon on the right opens a dedicated search page with an auto-focused field and a cancel action, and the department category tabs scroll in the navbar under the title instead of taking a row inside the page. Tapping a search result returns to the tab with that doctor's card expanded, so selection and the consultation form stay in one place.

Shared contracts:

- `@sdkwork/doctor-common-doctor` owns patient files, family members, health summary, emergency-first triage, and the human-doctor roster/selection rules.
- `contracts/triage-rules.json` is the single red-flag vocabulary; a parity test fails when any client drifts.
- `contracts/doctor-roster.json` is the authored fallback roster; an operator binds a real directory through `runtime-env.json#careDoctorDirectoryUrl` (`specs/doctor-directory.contract.json`). A doctor is a person; each practice site is an affiliation that names the Appbase `organizationId`, the `med_hospital` code, the department/rank, and the engagement (`full_time` / `part_time` / `contract` / `visiting`). `sdkwork-company` is never the clinical employer. Each entry also names its portrait (`avatarUrl`); the contract package keeps the editable SVG and the canonical PNG, every client ships the same PNG bytes, and an operator directory may publish an absolute http(s) URL instead. Re-render the portraits with `node tools/render-doctor-avatars.mjs`.
- `@sdkwork/doctor-common-agent` owns `AgentConversationPort`, the offline care adapter, the hosted wire adapter, the managed-agent catalogue port, and `resolveCareAgentMode()` (hosted vs offline is explicit, never a silent fallback).

### Verified

- `pnpm check` (typecheck, contract tests, i18n gates, canonical specs validators) and `pnpm build` (PC + H5).
- `flutter analyze` clean and `flutter test` green.
- `pnpm --dir apps/sdkwork-doctor-mini-program test` green.
- `agent.app.config.json` covers WEB, H5, MP_WEIXIN, APP_IOS, APP_ANDROID with 7 install packages.

### Known limits

- The hosted `sdkwork-agents` conversation path is selected and specified but not verified against a live deployment: it needs a deployed agents API base URL plus an IAM access token. Until then the offline adapter runs and says so.
- The human-doctor directory is deployment content: without `careDoctorDirectoryUrl` every client shows the authored fallback roster badged as the fallback, not a live directory.
- Patient files and doctor selection are device-local; there is no cross-device sync in this release.
- The mini program copies a doctor's channel link to the clipboard because opening arbitrary external URLs needs a web-view page this release does not add.
## Documentation

- [Documentation index](docs/README.md)
- [Product PRD](docs/product/prd/PRD.md)
- [Technical architecture](docs/architecture/tech/TECH_ARCHITECTURE.md)
- [Applications index](apps/README.md)

## Status

- All four clients implement the same three tabs, patient files, the human-doctor directory, and device-local visit records; the browser surfaces build and typecheck, Flutter analyze/test and the mini program tests pass.
- The UI is bilingual (`en-US`, `zh-CN`) on the browser surfaces and consumes one generated catalog on every client: copy lives in `contracts/care-messages.json`, projected by `tools/generate-care-i18n.mjs` into TypeScript, Dart, and mini program JavaScript.
- Appbase IAM/login, generated app/backend SDK families, native host packages, and live packaging are not wired yet. Each seam is explicit in the component contracts and architecture document, so those integrations add code rather than reshape the layout. The packaging GitHub workflow is a thin caller of the shared package workflow.
