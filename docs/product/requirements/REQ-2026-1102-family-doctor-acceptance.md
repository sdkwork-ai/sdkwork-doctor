# Acceptance Record - Family Doctor Agent App

Status: partial (live deployment outstanding)
Date: 2026-11-02
Scope: 对话 / 医生 / 我的 three-tab family doctor application across four clients

## Delivered

| Area | Evidence |
| --- | --- |
| Shared domain contract | `@sdkwork/doctor-common-doctor`: `FamilyMember`, `HealthSummary`, `triageSymptoms` |
| Triage single source | `contracts/triage-rules.json` + parity contract test |
| Conversation seam | `@sdkwork/doctor-common-agent`: `AgentConversationPort` with an observable `mode` |
| Hosted transport | `createHostedCareAgent` against the pinned sdkwork-agents app API, including SSE and typed errors |
| PC client | `sdkwork-doctor-pc` with `chat` / `doctor` / `me` tabs, mode-aware me tab, `pnpm build` |
| H5 client | `sdkwork-doctor-h5` with the same tabs and route identity |
| Flutter client | `apps/sdkwork-doctor-flutter-mobile`: hosted + offline agents, generated catalog, 23 tests |
| Mini program | `apps/sdkwork-doctor-mini-program`: four pages, hosted + offline agent, generated catalog |
| Visit records | `@sdkwork/doctor-common-doctor` record contract + store; chat writes, records tab reads, device-local per client |
| Visual system | `specs/design-tokens.contract.json`: tech-blue, flat, borderless tokens bound by CSS, Flutter `ThemeData`, and WXSS |
| Care copy pipeline | `contracts/care-messages.json` -> `tools/generate-care-i18n.mjs` -> TS, Dart, and JS projections |
| Cross-runtime fingerprint | `contracts/care-fingerprint-vectors.json` reproduced by TS, Dart, and the mini program |
| Upstream contract pin | `specs/agents-app-api.contract.json` compared with the sdkwork-agents OpenAPI |
| Release manifest | 7 install packages across WEB, H5, MP_WEIXIN, APP_IOS, APP_ANDROID |
| Decisions | `ADR-20261102-agent-transport-binding.md`, `ADR-20261103-hosted-agent-wire-binding.md` |

## Contract evidence

Commands run from the repository root on 2026-11-02:

- `pnpm typecheck` �?16 workspace projects, no errors.
- `pnpm test` �?86 tests, 86 pass, 0 fail.
- `pnpm check:i18n` �?i18n standard check passed, locale gate wired.
- `pnpm check:specs` �?all canonical validators pass: baseline, workspace layout,
  gitignore, docs, agent/workflow, pnpm scripts, app manifest + deployment, source
  config, repository baseline content gate, apps index, i18n, component ports,
  frontend/permission composition, layering, workspace protocol, Vite aliases,
  verify-repo.
- `pnpm build` �?PC and H5 production bundles built.
- `pnpm check` �?typecheck + tests + i18n + specs, all green.

Flutter surface (`apps/sdkwork-doctor-flutter-mobile`):

- `flutter analyze` �?no issues.
- `flutter test` �?36 tests, all pass (triage fixtures, catalog drift, fingerprint
  vectors, hosted transport, visit-record store, and seven widget tests covering
  the four tabs, the emergency lead, and the recorded consultation).

What the 86 Node tests actually assert:

- The hosted path performs one session create plus one turn, sends the documented
  fields, reuses the session, parses both the non-streaming envelope and the SSE
  frames, and maps a `ProblemDetail` to `status`/`code`/`traceId`.
- A failed session create is retried on the next send instead of poisoning the
  port, in TypeScript and in the mini program.
- An emergency red flag is never softened: the leading sentence is the emergency
  instruction whether the user text or the hosted answer contained the flag, in
  TypeScript, Dart, and the mini program.
- The mode is observable and never silently substituted; UI packages contain no
  `fetch`, no `Authorization` header, and no base URL.
- The upstream sdkwork-agents OpenAPI still matches every pinned path, operation,
  required field, enum value, envelope field, and stream frame.
- One authored copy contract projects identically into PC/H5 TypeScript, Dart,
  and the mini program, including placeholder sets.
- Fingerprint vectors are byte-identical across TypeScript, Dart, and the mini
  program.
- Visit records carry exactly the contract fields in TypeScript, Dart, and the
  mini program; they are newest first, de-duplicated, capped, survive a restart
  through their storage adapter, and degrade to a session copy when storage throws.

## Not delivered (why)

1. **Live hosted conversation transcript.** The wire path is implemented and
   verified against an in-process conformance server, but no sdkwork-agents
   deployment or IAM access token exists in this workspace, so no real
   conversation was recorded. `specs/agent-integration.contract.json` marks this
   criterion `blocked`.
2. **Signed native binaries.** Flutter `build apk`/`ipa` and the WeChat package
   were not produced; the release manifest still marks `releaseBuildDeferred`.
3. **Mini program streaming.** The mini program uses the non-streaming turn
   (`stream=false`); a chunked `wx.request` implementation is not wired.
4. **Localized offline advice.** The offline adapter's reply text (emergency,
   routine, self-care) is authored English in all clients; the generated catalog
   covers UI chrome only. Localizing it needs a copy port threaded through the four
   clients so one source still drives them.

## Exit criteria for a full acceptance

- Provision an agents deployment plus IAM credentials, bind the token through the
  existing session port, and record a real transcript in this file.
- Produce signed Flutter and WeChat artifacts and flip `releaseBuildDeferred`.
- Decide whether the mini program needs streaming, or record `stream=false` as the
  permanent contract for that surface.
- Move the offline agent's advice templates into the care copy contract.

## Addendum (rounds 13-20)

- `contracts/triage-fixtures.json` executed by three runtimes: TypeScript (Node 24
  type stripping), the mini program triage module, and Flutter.
- Flutter triage defect fixed: raw-string `\u` escapes never matched Chinese red
  flags; level-name casing normalized in the test.
- Mini program triage extracted to `src/lib/triage.js` so both WeChat and Node can load it.
- Care i18n became a real pipeline with a generated banner and a drift gate.
- PC and H5 rendered all three tabs through `platform.care.*` keys.

## Addendum (rounds 21-26)

- **Hosted transport implemented** in `@sdkwork/doctor-common-agent`: session
  create, non-streaming turn, SSE turn with deltas, envelope validation, problem
  mapping, member-aware system prompt, and the never-soften composition rule.
  Verified by `tests/hosted-agent-transport.test.mjs` (13 tests) against a
  conformance server that implements the envelope, headers, and problem body.
- **PC and H5 wired**: `agentsApiBaseUrl` is read from the runtime document, the
  core package builds the port from the session token, and both shells pass it to
  the chat and me tabs. `tests/care-agent-wiring.test.mjs` asserts the wiring and
  that UI packages never build a transport.
- **Flutter transport and catalog**: `lib/agent/care_agent.dart` (hosted +
  offline, streaming), `lib/i18n` generated catalog, all tabs localized,
  `test/hosted_agent_test.dart`, `test/care_i18n_test.dart`,
  `test/fingerprint_test.dart`.
- **Mini program transport and catalog**: `src/lib/agent.js` (hosted + offline),
  `src/lib/i18n.js`, all three pages localized, and the false "generated - do not
  edit" banners on authored files replaced with real authorship notes.
- **Upstream pin**: `specs/agents-app-api.contract.json` plus
  `tests/agents-upstream-contract.test.mjs` compare our assumptions with the
  sibling sdkwork-agents OpenAPI.
- **Docs corrected**: the PRD and technical architecture now describe the family
  doctor product rather than the original diagnostics console, and
  `ADR-20261103` records the wire-level binding.

Remaining English literals: none in the three tabs of any client. The only
untranslated strings are brand names, transport error details returned by the
server, and the generated system prompt sent to the agent.

## Addendum (rounds 27-30): visit records

- **Fourth tab on every client**: 对话 / 医生 / 记录 / 我的. PC and H5 route
  `/doctor/records`, Flutter adds a `RecordsTab`, and the mini program adds
  `pages/records/index` to `app.json` and its tab bar.
- **One record contract**: `contracts/visit-record.schema.json` pins the eight
  fields (`id`, `recordedAt`, `memberId`, `memberLabel`, `symptom`, `advice`,
  `level`, `mode`), the storage key `sdkwork.doctor.visit-records.v1`, and the
  200-record cap. TypeScript, Dart, and the mini program each assert their emitted
  object against that file.
- **One store implementation**: `@sdkwork/doctor-common-doctor` owns append,
  parse, serialize, and the store; PC/H5, Flutter, and the mini program only
  supply the storage adapter (`localStorage`, `shared_preferences`, `wx` storage).
  A blocked or corrupt store degrades to a session copy instead of throwing.
- **Recording rule**: the chat tab writes one record per completed exchange and
  writes nothing when the transport fails; the records tab subscribes to the store
  so the entry appears without a reload, and offers a confirmed clear action.
- **Evidence**: `tests/visit-records.test.mjs` and
  `tests/mini-program-records.test.mjs` (shape, ordering, de-duplication, cap,
  corrupt storage, persistence, notification), Flutter
  `test/visit_store_test.dart`, and two widget tests that send a symptom and read
  it back from the records tab. Verified on the Android emulator: a consultation
  recorded before `adb shell am force-stop` was still listed after relaunch.

Remaining English literals: none in the four tabs of any client. The only
untranslated strings are brand names, transport error details returned by the
server, the generated system prompt sent to the agent, and the offline agent's
advice text (see "Not delivered").

## Addendum (rounds 31-32): tech-blue, flat, borderless visual system

- **One token contract**: `specs/design-tokens.contract.json` fixes the palette
  (canvas `#F2F5FA`, surface `#FFFFFF`, tonal `#E6EDF8`, chrome navy `#061A3A`,
  primary `#0A5CFF`), the radius scale, elevation `0`, and border width `0`.
- **Four bindings, no fork**: PC and H5 declare CSS variables, Flutter builds one
  `ThemeData` in `lib/theme/doctor_theme.dart`, and the mini program keeps the
  same values in `app.wxss` plus its `app.json` chrome colours. Separation is
  tonal (navy chrome, white cards, tonal rows and inputs), never a 1px stroke and
  never a shadow.
- **Semantic colour survives**: the triage pill keeps the warm tone for emergency
  and urgent instead of inheriting the brand blue, and the flat record rows keep
  the chip compact via `align-self: start`.
- **Evidence**: `tests/design-tokens.test.mjs` (5 tests) fails on a drifted token,
  a non-zero CSS border, or any `box-shadow`. Verified visually on the Android
  emulator (four tabs) and in headless Chrome at 390×844 (H5) and 1440×900 (PC),
  where `document.documentElement.scrollWidth === innerWidth` confirmed the H5
  layout no longer overflows.
- **Two defects fixed on the way**: the H5 chat row overflowed horizontally
  because the global button rule forced `width: 100%`; the app bar title wrapped
  on narrow screens until the meta line was hidden below 480px.

## Addendum (rounds 33-34): building-block composition

- **One block catalogue**: `specs/app-composition.contract.json` declares five
  blocks (`home`, `chat`, `doctor`, `records`, `me`) with a stable id, a canonical
  page id (`app.doctor.<domain>.<capability>`), a route, an i18n label key, an
  icon, and the surfaces that render each one. `home` is browser-only; the four
  care tabs are required on every client.
- **One resolver**: `@sdkwork/doctor-common-blocks` filters by surface, hides only
  optional blocks, floats deployment-preferred ids first while ignoring unknown
  ids, relabels blocks with deployment keys, and resolves validated theme
  overrides. `tests/app-composition.test.mjs` checks the TypeScript catalogue
  against the JSON contract field by field, plus the resolution rules and the
  theme fallbacks.
- **Navigation is a projection**: the PC `AppShell` renders an 88px icon rail
  (logo, icon + label per block, active blue pill with a white edge bar, footer
  with locale and profile) and the H5 `MobileShell` renders the same resolved
  list as a tab bar. Neither keeps a second hard-coded list.
- **Home composes the same blocks**: `/doctor/home` is the browser landing. It
  shows status tiles (mode, consultations, members), a block grid built from the
  resolved list, and the last three consultations. Hiding a block removes it from
  the rail, the tab bar, and the home grid in one change.
- **Customization is runtime data**: `runtime-env.json#app.blocks` (`hidden`,
  `order`, `labels`) and `#theme` (six tokens) are validated at boot and applied
  as CSS variables before the first paint. Invalid values fall back one by one.
- **Reuse boundary per spec**: `COMPOSABLE_ARCHITECTURE_SPEC.md` section 4 requires
  cross-architecture reuse through tokens, i18n keys, page identity, and ports
  rather than UI/runtime imports �?which is exactly what the earlier
  `design-tokens.contract.json` plus this block catalogue provide. Mobile surfaces
  keep their native tab bars and satisfy the contract through the same block ids
  and label keys.
- **Evidence**: `pnpm test` 103 passed (12 new composition assertions), `pnpm
  build` both surfaces, `pnpm check:specs` all validators, Flutter 36 tests and
  `flutter analyze` clean, and visual checks of the PC rail/home at 1440×900 and
  the H5 home/tabs at 390×844.

## Addendum (rounds 35-36): mobile home chrome aligned with sdkwork-agents

- **Navbar**: the Flutter home now uses the same chrome as the sdkwork-agents
  surface �?light app bar, menu button on the left, centered page title (the
  active block label), and a single "+" action on the right. The translate icon
  moved into the drawer.
- **Drawer**: a left drawer repeats the block navigation (chat / doctor / records
  / me) with an active pill, shows the household member and the active
  conversation mode, and carries the locale switch and the device-privacy note.
  Labels come from the care catalog; the drawer no longer displays raw i18n keys.
- **"+" capability**: the right-hand action opens a sheet with two entries �?  "新建问诊" starts a fresh consultation (new agent instance, empty transcript,
  landing restored) and "看病记录" jumps to the records block. Visit records are
  never cleared by this action.
- **Chat-first landing**: the empty chat state mirrors the agents home: a single
  question ("今天哪里不舒服？"), one hint line, and four symptom suggestions that
  prefill the composer instead of sending immediately. The page header (member +
  mode) appears only after the first exchange.
- **Evidence**: Flutter `flutter analyze` clean and `flutter test` 50 passed (4
  new widget tests: navbar affordances, drawer contents, suggestion prefill,
  new-consultation reset with records preserved); repository `pnpm test` 103
  passed and `pnpm check:specs` green; verified on the Android emulator with
  screenshots of the zh home, drawer, and "+" sheet.
