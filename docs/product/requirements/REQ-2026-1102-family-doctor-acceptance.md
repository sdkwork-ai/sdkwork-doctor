# Acceptance Record - Family Doctor Agent App

Status: partial (external dependency outstanding)
Date: 2026-11-02
Scope: 对话 / 医生 / 我的 three-tab family doctor application across four clients

## Delivered

| Area | Evidence |
| --- | --- |
| Shared domain contract | `@sdkwork/doctor-common-doctor`: `FamilyMember`, `HealthSummary`, `triageSymptoms` |
| Triage single source | `contracts/triage-rules.json` + parity contract test |
| Conversation seam | `@sdkwork/doctor-common-agent`: `AgentConversationPort`, offline adapter, explicit `resolveCareAgentMode` |
| PC client | `sdkwork-doctor-pc` with `chat` / `doctor` / `me` tabs; `pnpm typecheck`, `pnpm build` |
| H5 client | `sdkwork-doctor-h5` with the same tabs and route identity |
| Flutter client | `apps/sdkwork-doctor-flutter-mobile`; `flutter analyze` clean, `flutter test` 3/3 |
| Mini program | `apps/sdkwork-doctor-mini-program`; three pages + tabBar; 3 contract tests |
| Release manifest | 7 install packages across WEB, H5, MP_WEIXIN, APP_IOS, APP_ANDROID |
| Design decision | `docs/architecture/decisions/ADR-20261102-agent-transport-binding.md` |

## Contract evidence

- `pnpm typecheck`: 16 workspace projects pass.
- `pnpm test`: 24 tests, including four-client tab parity, red-flag vocabulary parity, binary/dependency boundaries, and agent mode selection.
- `pnpm check:specs`: all canonical validators pass (baseline, docs, agent/workflow, pnpm scripts, app manifest + deployment, source config, i18n + locale gate, apps index, component ports, composition, layering, workspace protocol, Vite aliases, verify-repo).
- `flutter analyze`: no issues; `flutter test`: 3/3.

## Not delivered (why)

1. **Hosted agent conversation end to end.** ADR-20261102 selects `@sdkwork/agents-app-sdk`; construction requires an agents API base URL plus an IAM/appbase access token (and a deployed agents service). Neither exists in this workspace run, so the hosted path is specified, mode-selected, and compile-ready but not exercised. The offline adapter is the only runtime-verified path.
2. **Care page body i18n.** Tab labels are localized; page titles, buttons, and table labels are still English literals.
3. **Executable triage equivalence across clients.** Parity is enforced on vocabulary and tab identity, not on running the same input through four runtimes (Flutter/MP execution would need their own harnesses).
4. **Mini program and Flutter agent transport.** Both mirror triage locally; neither has a hosted client binding yet.

## Exit criteria for a full acceptance

- Provision an agents deployment and IAM credentials, then bind the hosted adapter in `*-core` and record a real conversation transcript.
- Extend i18n fragments to cover every care page string.
- Add per-runtime triage equivalence fixtures consumed by TS, Dart, and mini program tests.

## Addendum (rounds 13-20)

Delivered after the first acceptance record:

- `contracts/triage-fixtures.json` executed by three runtimes: TypeScript (Node 24 type stripping), the mini program triage module, and Flutter. 9 fixtures per runtime.
- Flutter triage defect fixed: raw-string `\u` escapes never matched Chinese red flags; level-name casing normalized in the test.
- Mini program triage extracted to `src/lib/triage.js` so it is loadable by both WeChat and Node tests.
- Care i18n became a real pipeline: hand-authored `contracts/care-messages.json` -> `tools/generate-care-i18n.mjs` -> generated `src/i18n/<locale>/platform/care/care.ts` projections with a generated banner. A drift gate compares generated keys/values and placeholder sets with the source contract.
- PC and H5 now render all three tabs through `platform.care.*` keys (chat, doctor, me).

Still outstanding:

- Hosted `sdkwork-agents` conversation (needs `agentsApiBaseUrl` plus an IAM access token; contract in `specs/agent-integration.contract.json`).
- Flutter and mini program UI copy is not driven by the i18n pipeline.
- "Profile completeness" copy and the two static care-action bullets on the me/doctor tabs remain English literals.