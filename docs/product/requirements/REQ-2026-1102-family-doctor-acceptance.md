# Acceptance Record — Family Private-Doctor Agent App

Status: partially verified (live hosted deployment outstanding)
Date: 2026-11-03
Scope: 对话 / 医生 / 我的 three-tab family private-doctor application across four clients

## 1. Delivered Scope

| Capability | PC | H5 | Flutter | Mini program |
| --- | --- | --- | --- | --- |
| 对话 with the active patient's facts | yes | yes | yes | yes |
| 医生 directory with selection and primary doctor | yes | yes | yes | yes |
| Employing hospital (Appbase organization + med_hospital code) per doctor | yes | yes | yes | yes |
| Full-time / part-time engagement per practice site | yes | yes | yes | yes |
| Human consultation recorded against the patient | yes | yes | yes | yes |
| 我的 patient files (create / edit / delete / switch) | yes | yes | yes | yes |
| 记录 as a sub-screen of 我的 | yes | yes | yes | yes |
| Hosted conversation through sdkwork-agents | wired | wired | wired | wired |
| Managed-agent catalogue (`agents.list`) | yes | yes | yes | yes |
| Device environment check | yes | yes | yes | yes |
| Exactly three tabs | yes | yes | yes | yes |

## 2. Contract Evidence

- `specs/app-composition.contract.json` — exactly three blocks (`chat`, `doctor`,
  `me`); the workbench landing is a route at `/doctor`, not a tab.
- `specs/doctor-directory.contract.json` — the deployment doctor-directory
  document, accepted shapes, fallback roster, selection rules, and per-client
  ports.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/doctor-roster.json`
  — the authored fallback roster; every client ships the same three clinicians.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/patient-profile.schema.json`
  — one patient file, storage key `sdkwork.doctor.patient-profiles.v1`, limit 12.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/visit-record.schema.json`
  — visit records now carry `mode: human` plus optional `doctorId`/`doctorLabel`.
- `specs/agents-app-api.contract.json` — pinned operations: `agents.sessions.create`,
  `agents.turns.stream`, `agents.list`; the contract test compares every pinned
  assumption with the upstream sdkwork-agents OpenAPI when the sibling checkout
  is present.
- `specs/agent-integration.contract.json` — hosted/offline mode selection, per-client
  ports, and the observable-mode rule.
- `contracts/care-messages.json` — one authored copy source, projected into
  TypeScript (PC/H5), Dart, and mini program JavaScript.

## 3. Verification Commands

Run from the repository root unless noted.

```bash
pnpm typecheck                 # every workspace project
pnpm test                      # cross-client contract tests
pnpm check:specs               # canonical sdkwork-specs validators
pnpm build:pc && pnpm build:h5 # browser bundles
cd apps/sdkwork-doctor-flutter-mobile && flutter analyze && flutter test
pnpm --dir apps/sdkwork-doctor-mini-program test
```

Recorded results for this revision are appended by the implementing change; the
exact output of each command is the acceptance evidence, not a summary.

## 4. Contract Tests That Guard This Scope

| Test | Guards |
| --- | --- |
| `tests/app-composition.test.mjs` | exactly three tabs, landing route outside the tabs, catalogue/code parity |
| `tests/patient-files.test.mjs` | patient-file validation, seed-once, persistence, cap, completeness |
| `tests/doctor-directory.test.mjs` | roster contract, fallback parity, selection rules, channel preference |
| `tests/visit-records.test.mjs` | visit-record schema, human-consultation fields, store behaviour |
| `tests/cross-client-parity.test.mjs` | the same three tabs and the same doctor/patient capability on four clients |
| `tests/flutter-parity.test.mjs` | Flutter renders the generated catalog, not hard-coded copy |
| `tests/agents-upstream-contract.test.mjs` | pinned sdkwork-agents operations, enums, envelope, catalogue |
| `tests/care-i18n-consistency.test.mjs` | one authored copy source, every projection identical |
| `tests/design-tokens.test.mjs` | flat borderless tech-blue system on every client |
| `tests/package-boundaries.test.mjs` | UI packages never construct a transport or read a token |

## 5. Blocked

- **Live hosted conversation transcript** — blocked until an sdkwork-agents
  deployment and an IAM access token exist for a target deployment profile. All
  other hosted behaviour is verified against the pinned contract and a
  conformance server in `tests/hosted-agent-transport.test.mjs`, the Flutter
  `hosted_agent_test.dart`, and `tests/mini-program-agent.test.mjs`.
- **A live doctor directory** — blocked until an operator publishes a document
  conforming to `specs/doctor-directory.contract.json` and binds its URL in
  `runtime-env.json#careDoctorDirectoryUrl`. Until then every client shows the
  authored fallback roster with its source badge, never a fake "connected" state.

## 6. Known Limits

- Patient files and doctor selection are device-local; there is no cross-device
  sync in this release (PRD P2).
- The mini program copies the doctor channel target to the clipboard instead of
  opening it, because WeChat requires a web-view page for arbitrary external
  URLs and this release does not add one.
- Human consultation is a channel launch plus a visit record; an in-conversation
  clinician handoff is PRD P3.
- The browser surfaces remain bilingual; the Flutter and mini program surfaces
  consume the same generated catalog for every care string.