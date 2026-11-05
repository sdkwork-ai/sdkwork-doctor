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
- `app.blocks` / `theme` — hide, reorder, relabel, or retheme the four tabs and the palette.


## Family Doctor Capability

Four tabs on every client; the browser surfaces also keep a workbench landing at the surface root.

| Tab | PC / H5 | Flutter | Mini program |
| --- | --- | --- | --- |
| 对话 | `/doctor/chat` | chat destination | `pages/conversation` |
| 医生 | `/doctor/doctor` | doctor destination | `pages/doctor` |
| 记录 | `/doctor/records` | records destination | `pages/records` |
| 我的 | `/doctor/me` | me destination | `pages/profile` |
| 病人档案 (sub-screen of 我的) | H5 `/doctor/me/patients`; PC keeps its inline card | pushed screen | `pages/patients` |
| 设备环境 (sub-screen of 我的) | H5 `/doctor/me/device`; PC keeps its inline card | pushed screen | `pages/device` |

The mobile 我的 tab is an account screen in the native idiom: a full-bleed identity block (large avatar, name, patient facts, status pills for profile completeness and the active conversation mode), then grouped capability rows — 病人档案, 我的医生, 对话, 视频通话, 记录 (visit records and 病历), and 设备环境 — each row a single line that opens its module. Groups sit on the canvas with gaps between them and no section headers, and rows are separated by a tonal inset, so the page reads like a system settings list. The patient files and the device environment keep their own screens on the mobile surfaces; PC keeps its workbench cards.

The 对话 also runs as a voice/video call on H5 and Flutter: 我的 and the 对话 header open the full-screen call mode of the same session, spoken turns go through the same agent exchange and land in 看病记录, and hanging up returns to the text transcript with those turns in place. The call degrades honestly — no speech recognition shows the text fallback, a denied camera keeps voice mode with a notice, and a failed turn reopens the microphone instead of stranding the call.

**发起人工问诊 is a conversation, not a channel launch.** The doctor's detail page opens a human consultation addressed to that clinician and lands on the conversation home, with the reason already sent. The attending doctor answers from the same device — H5/PC through the session's 医生回复 card in 记录, Flutter through the session row's 以医生身份回复 action, the mini program through 医生回复 in the human conversation — and every conversation row carries an unread badge for the doctor replies the family has not opened, plus a 待医生回复 / 医生已回复 state. A human consultation never uses the AI's transcript, and an AI session never accepts a doctor reply.

The mobile 医生 tab follows the WeChat search pattern: the title stays in the navbar, a search icon on the right opens a dedicated search page with an auto-focused field and a cancel action, and the department category tabs scroll in the navbar under the title instead of taking a row inside the page. A directory card — and a search result — opens the doctor's detail page rather than expanding inside the list: the detail page owns the portrait and credentials, focus areas, each practice site and its consulting hours, the consultation channels, the selection state, and the consultation form.

Shared contracts:

- `@sdkwork/doctor-common-doctor` owns patient files, family members, health summary, emergency-first triage, and the human-doctor roster/selection rules.
- `contracts/triage-rules.json` is the single red-flag vocabulary; a parity test fails when any client drifts.
- `contracts/doctor-roster.json` is the authored fallback roster; an operator binds a real directory through `runtime-env.json#careDoctorDirectoryUrl` (`specs/doctor-directory.contract.json`). A doctor is a person; each practice site is an affiliation that names the Appbase `organizationId`, the `med_hospital` code, the department/rank, and the engagement (`full_time` / `part_time` / `contract` / `visiting`). `sdkwork-company` is never the clinical employer. Each entry also names its portrait (`avatarUrl`); the contract package keeps the editable SVG and the canonical PNG, every client ships the same PNG bytes, and an operator directory may publish an absolute http(s) URL instead. Re-render the portraits with `node tools/render-doctor-avatars.mjs`; the mini program's 我的 row icons are rendered from their authored SVGs with `node tools/render-care-icons.mjs`.
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
