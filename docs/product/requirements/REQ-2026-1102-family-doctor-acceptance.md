# Acceptance Record — Family Private-Doctor Agent App

Status: partially verified (live hosted deployment outstanding)
Date: 2026-11-03
Scope: 对话 / 医生 / 记录 / 我的 four-tab family private-doctor application across four clients

## 1. Delivered Scope

| Capability | PC | H5 | Flutter | Mini program |
| --- | --- | --- | --- | --- |
| 对话 with the active patient's facts | yes | yes | yes | yes |
| 医生 directory with selection and primary doctor | yes | yes | yes | yes |
| Employing hospital (Appbase organization + med_hospital code) per doctor | yes | yes | yes | yes |
| Full-time / part-time engagement per practice site | yes | yes | yes | yes |
| Human consultation recorded against the patient | yes | yes | yes | yes |
| 发起人工问诊 opens a conversation addressed to the doctor | yes | yes | yes | yes |
| The doctor replies inside the same conversation on this device | yes | yes | yes | yes |
| Conversation list with unread doctor-reply badges | yes | yes | yes | yes |
| 我的 patient files (create / edit / delete / switch) | yes | yes | yes | yes |
| 记录 as a sub-screen of 我的 | yes | yes | yes | yes |
| 看病记录 lists one card per visit session (active / ended / human) | yes | yes | yes | yes |
| A visit opens a standalone detail page (route / screen / page) | yes | yes | yes | yes |
| Detail tabs: 病历 / AI总结 / 医生人工确认 / 通话回放 | yes | yes | yes | yes |
| 通话回放 replays the visit timeline with device speech | yes | yes | yes | timeline only |
| Patient ends the conversation to generate one 病历 | yes | yes | yes | yes |
| AI diagnosis and doctor diagnosis kept as two records | yes | yes | yes | yes |
| Doctor confirms or amends the AI diagnosis | yes | yes | yes | yes |
| File / image / video attachments on a conversation | yes | yes | yes | yes |
| Hosted conversation through sdkwork-agents | wired | wired | wired | wired |
| Managed-agent catalogue (`agents.list`) | yes | yes | yes | yes |
| Device environment check | yes | yes | yes | yes |
| Exactly four tabs | yes | yes | yes | yes |

## 2. Contract Evidence

- `specs/app-composition.contract.json` — exactly four blocks (`chat`, `doctor`,
  `records`, `me`); the workbench landing is a route at `/doctor`, not a tab.
- `specs/doctor-directory.contract.json` — the deployment doctor-directory
  document, accepted shapes, fallback roster, selection rules, and per-client
  ports.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/doctor-roster.json`
  — the authored fallback roster; every client ships the same three clinicians.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/patient-profile.schema.json`
  — one patient file, storage key `sdkwork.doctor.patient-profiles.v1`, limit 12.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/visit-record.schema.json`
  — visit records now carry `mode: human` plus optional `doctorId`/`doctorLabel`.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/medical-record.schema.json`
  — one 病历 per ended conversation: transcript, attachments, agent summary, the
  AI diagnosis, the doctor diagnosis, and the doctor confirmation; storage key
  `sdkwork.doctor.medical-records.v1`, limit 100.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/care-session.schema.json`
  — schemaVersion 2: a `human` session carries its `doctor` (id, name,
  department, site, engagement), the transcript, and the status; the per-session
  read marks live under `sdkwork.doctor.care-session-reads.v1` so opening a
  conversation never reorders the list. The same schema defines the playback
  timeline (`playback`): every message and every call segment becomes one item
  with an `offsetMs` from the session start.
- `docs/architecture/decisions/ADR-20261103-session-first-records-and-playback.md`
  — why 看病记录 is one card per session, why the four tabs are a standalone
  page, and why playback is a timeline plus the device voice rather than a
  claimed recording.
- Detail-page routes and entry points: `/doctor/records/:recordId` on PC/H5,
  `RecordDetailScreen` on Flutter, and `pages/record-detail/index` on the mini
  program; each opens the same four tabs and links the session to its 病历.
- `docs/architecture/decisions/ADR-20261103-in-conversation-human-consultation.md`
  — why 发起人工问诊 is a conversation, why the doctor replies on the same
  device, and how unread counts stay honest without a clinician messaging
  backend.
- Human-consultation stores per client: the shared TS `CareSessionStore`
  (`mode: 'human'`, `startHumanConsultation`, `replyAsDoctor`,
  `CareSessionReadStore`), the Flutter `CareHumanConsultationStore`, and the mini
  program `lib/human-consultations.js`.
- `docs/architecture/decisions/ADR-20261103-conversation-medical-record-and-doctor-confirmation.md`
  — why the AI diagnosis is a draft, why both diagnoses are kept, and why the
  reviewer is named locally rather than authenticated.
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
| `tests/app-composition.test.mjs` | exactly four tabs, landing route outside the tabs, catalogue/code parity |
| `tests/patient-files.test.mjs` | patient-file validation, seed-once, persistence, cap, completeness |
| `tests/doctor-directory.test.mjs` | roster contract, fallback parity, selection rules, channel preference |
| `tests/visit-records.test.mjs` | visit-record schema, human-consultation fields, store behaviour |
| `tests/medical-records.test.mjs` | 病历 shape, both diagnosis records, confirmation transitions, attachment metadata, store behaviour |
| `tests/care-sessions.test.mjs` | visit-session creation, human consultation, doctor replies, unread counts, read marks, reuse and stale rules, playback timeline |
| `apps/sdkwork-doctor-flutter-mobile/packages/sdkwork_doctor_flutter_mobile_care/test/care_human_consultations_test.dart` | the Flutter human store and controller unread behaviour |
| `apps/sdkwork-doctor-mini-program/tests/human-consultations.test.mjs` | the mini program human store and its persistence |
| `tests/cross-client-parity.test.mjs` | the same four tabs, the standalone visit detail route/page, and the same doctor/patient/病历 capability on four clients |
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
- **A human consultation is a conversation, not an external channel launch.** The
  family writes in the conversation home, the attending doctor replies from the
  same device (H5/PC: 记录 → the session's 医生回复 card; Flutter: the session
  row's 以医生身份回复 action; mini program: 医生回复 in the human view), and the
  conversation list badges the doctor replies the family has not opened. There is
  no remote clinician messaging service in this release: a doctor on another
  device cannot read or answer the conversation yet. A deployment-backed handoff
  keeps the same session and unread shape and replaces only the signal source.
- The doctor's reply is device-local like the rest of the conversation. The
  unread mark is per device (`care-session-reads.v1` in the browsers,
  `unreadCount` on the private human-consultation documents in Flutter and the
  mini program), so a second device starts with every doctor turn unread.
- The mini program does not open an external consultation channel; the channel
  target is display-only now, because the consultation itself happens in the
  conversation.
- 病历 and its attachments are device-local. The pinned agents API exposes no
  binary-upload operation, so an attachment's bytes are not sent to the agent;
  the hosted turn names the files and the record keeps them on the device.
- **通话回放 is a timeline, not a recording.** No client stores the original
  audio in this release. The browser surfaces and Flutter read the transcript
  with the device speech engine; the mini program host exposes no TTS, so it
  walks the same timeline visually and labels the limit. Call segments are shown
  with their mode and duration. Adding recorded audio later replaces the audio
  source behind the same tab and playback clock.
- The attending doctor is recorded by name on the device. There is no
  authenticated clinician identity in this release; when one exists it replaces
  the name field without changing the record shape.
- The browser surfaces remain bilingual; the Flutter and mini program surfaces
  consume the same generated catalog for every care string.

## 7. Verification Results — 2026-11-03

Exact commands and their output for this revision:

```text
pnpm check
  typecheck: 17 of 18 workspace projects, exit 0
  pnpm test:  ℹ pass 191   ℹ fail 0
  check:i18n: exit 0
  check:specs: workspace layout passed (1 repository root(s)); 0 violations
  exit 0

pnpm build
  build:pc: ✓ built in 1.51s
  build:h5: ✓ built in 2.15s
  exit 0

cd apps/sdkwork-doctor-flutter-mobile
flutter analyze: No issues found! (ran in 5.5s), exit 0
flutter test:    +136: All tests passed!, exit 0
flutter run -d emulator-5554 --debug --no-resident
  ✓ Built build\app\outputs\flutter-apk\app-debug.apk
  Installing ... 6.4s
  Syncing files to device sdk gphone64 x86 64 ... 137ms
  app launched as com.sdkwork.sdkwork_doctor_flutter_mobile (versionName 0.1.0)

pnpm --dir apps/sdkwork-doctor-mini-program test
  ℹ pass 61   ℹ fail 0, exit 0
```

The running Android emulator was used to verify the session list, the four
tabs (Medical record / AI summary / Doctor confirmation / Call playback), and
the playback controls against real device data. That check caught four missing
catalog keys (`record.transcript`, `record.attachments`, `records.messages`,
`records.calls`), which are now authored and guarded by
`tests/care-i18n-consistency.test.mjs`.

The session contract and the playback timeline are additionally guarded by
`tests/care-sessions.test.mjs`: ordering and offsets of messages and call
segments, the legacy-病历 synthesis, the named-session rule that stops a new
conversation inheriting the previous open visit, and the mini program port's
round-trip of the same shape.