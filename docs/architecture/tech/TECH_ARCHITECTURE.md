# SDKWork Doctor Technical Architecture

Status: draft
Owner: sdkwork-platform
Updated: 2026-11-02
Specs: ARCHITECTURE_DECISION_SPEC.md, APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md, APP_PC_ARCHITECTURE_SPEC.md, APP_H5_ARCHITECTURE_SPEC.md, APP_RUNTIME_ENV_SPEC.md, COMPONENT_SPEC.md

## 1. Architecture Overview

SDKWork Doctor is one family-doctor product with four clients that share one
domain vocabulary, one triage contract, one conversation port shape, and one
generated copy catalog.

```text
apps/sdkwork-doctor-pc      apps/sdkwork-doctor-h5
  pc-core / h5-core                (SDK ports, agent port, module registry, session)
  pc-commons / h5-commons          (presentation primitives)
  pc-shell / h5-shell              (layout, tab navigation, route composition)
  pc-care / h5-care                (chat, doctor, records, me tabs)
            \                    /
   apps/sdkwork-doctor-common/packages/
     sdkwork-doctor-common-doctor      (FamilyMember, HealthSummary, triage rules, visit records)
     sdkwork-doctor-common-agent       (AgentConversationPort, offline + hosted adapters)
     sdkwork-doctor-common-diagnostics (device environment checks)

apps/sdkwork-doctor-flutter-mobile   (lib/agent, lib/i18n, lib/records, four tabs)
apps/sdkwork-doctor-mini-program     (src/lib/agent.js, records, i18n, four pages)

apps/sdkwork-doctor-common/.../contracts/
  triage-rules.json, triage-fixtures.json, care-messages.json,
  care-fingerprint-vectors.json
```

The PC root is the desktop surface, H5 the mobile browser surface, Flutter the
native mobile surface, and the mini program the WeChat surface. All four expose
the same four tabs in the same order: 对话 / 医生 / 记录 / 我的.

## 2.1 Visit Records
`@sdkwork/doctor-common-doctor` owns the record shape
(`contracts/visit-record.schema.json`), the append/parse/serialize rules, and a
storage-port store. Each client supplies only the adapter:

| Client | Adapter | Key |
| --- | --- | --- |
| PC / H5 | `createDoctorPc/H5VisitRecordStore` over `localStorage` | `sdkwork.doctor.visit-records.v1` |
| Flutter | `SharedPreferencesVisitRecordStorage` | same key |
| Mini program | `wx.getStorageSync` / `wx.setStorageSync` | same key |

Rules that every adapter keeps: newest first, de-duplicated by id, capped at 200,
corrupt entries dropped instead of throwing, and a storage failure degrading to a
session copy. The chat tab writes one record per completed exchange (never for a
failed turn), and the records tab subscribes to the store so the new entry is
visible immediately.

## 2.2 Visual System

`specs/design-tokens.contract.json` pins one tech-blue, flat, borderless system:
canvas `#F2F5FA`, surface `#FFFFFF`, tonal layer `#E6EDF8`, chrome navy `#061A3A`,
primary `#0A5CFF`, radius 14/10, **elevation 0** and **border width 0**. Each
client binds those tokens in its own medium — CSS variables for PC/H5, a single
`ThemeData` for Flutter, WXSS for the mini program — and
`tests/design-tokens.test.mjs` fails when a surface drifts, when CSS draws a
non-zero border, or when a shadow appears.

Separation comes from tonal layers, never strokes: navy chrome above the canvas,
white cards on the canvas, and tonal rows/inputs inside cards. Emergency and
urgent keep the warm semantic tone so triage colour is never lost to the brand
blue.

## 2.3 App Composition And Blocks

`specs/app-composition.contract.json` is the building-block catalogue. Every
navigation unit — and the browser home landing — is a block with a stable id, a
canonical page id (`app.doctor.<domain>.<capability>`), a route, an i18n label
key, an icon, and the surfaces that render it. A client projects its navigation
from the resolved block list; it never hard-codes a second list.

`@sdkwork/doctor-common-blocks` owns the resolution rules:

- filter by surface (`home` is a browser-only block);
- hide optional blocks, never required ones;
- float deployment-preferred ids to the front, ignore unknown ids;
- relabel a block with a deployment i18n key;
- resolve theme overrides against the design tokens, dropping invalid values one
  by one.

The PC rail (`AppShell`) and the H5 tab bar (`MobileShell`) are projections of
the same resolved list, and the browser `HomePage` renders the same blocks as a
grid plus status tiles and recent records. Adding, hiding, or reordering a block
therefore changes navigation and home together without editing a page.

Customization is runtime data, not code: `runtime-env.json#app.blocks` and
`#theme` are validated at boot and applied as CSS variables before the first
paint. The app root stays a thin composition root; blocks, tokens, and page
identities are the cross-client reuse surface (`COMPOSABLE_ARCHITECTURE_SPEC.md`
section 4).

On Flutter the same block ids render as a bottom tab bar, and the home surface
adopts the sdkwork-agents chrome: a light app bar with a menu button, a centered
page title, and one primary "+" action; a left drawer that repeats the block
navigation, locale, and active mode; and a chat-first landing with symptom
prompts that prefill the composer. The "+" sheet starts a new consultation
(new agent instance, empty transcript) while visit records stay untouched.

## 2. Technology Choices

- **React 19 + Vite 6 + TypeScript 5.8 (strict)** for PC and H5.
- **Flutter 3.47 / Dart 3** with Material 3 for the native mobile surface.
- **WeChat mini program** with authored CommonJS modules that stay loadable by Node contract tests.
- **pnpm workspace** at the repository root; no sibling workspace members and no `file:`/`link:` dependencies.
- **i18next + react-i18next** on the browser surfaces; a small generated catalog helper on Flutter and the mini program.
- **No i18n hand-editing**: `contracts/care-messages.json` is the authored source, `tools/generate-care-i18n.mjs` projects it into TypeScript, Dart, and JavaScript, and drift gates compare every projection with the source.
- **Node's built-in test runner** for cross-client contract tests; `flutter test` for the Dart surface.

## 3. System Boundaries And Modules

| Layer | Ownership | Must not own |
| --- | --- | --- |
| `src/` of each app root | runtime document load, runtime composition, route composition, session gate | pages, transports |
| `*-core` | SDK port registry, agent port construction, host adapter, session port | pages, product services |
| `*-commons` | domain-neutral primitives | business state, route ownership |
| `*-shell` | layout, tab navigation, route table | business logic, transport |
| `*-care` | the three product tabs | transport construction, credentials |
| `doctor-common-agent` | conversation port, offline adapter, hosted wire adapter, safety composition | React, DOM, storage |
| `doctor-common-doctor` | family domain types, triage decisions, visit-record rules | network, UI copy |
| `doctor-common-diagnostics` | device environment checks | health data |

Dependency direction is core/commons → shell → care, composed by each app root.
Feature packages never construct a transport, read an access token, or call
`fetch`. The core package owns the token seam (`DoctorSessionPort`) and the port
construction.

## 4. Conversation Transport

The single seam is `AgentConversationPort` (`mode`, `send`, `history`). Two
implementations exist:

- **Offline** (`createLocalCareAgent`): deterministic triage reply, used when no
  agents deployment or credential is configured.
- **Hosted** (`createHostedCareAgent`, Flutter `HostedCareAgent`, mini program
  `createHostedAgent`): speaks the pinned sdkwork-agents app API
  (`specs/agents-app-api.contract.json`).

Hosted flow per client:

1. Resolve `agentsApiBaseUrl` from the runtime document (browser), the build-time
   define (Flutter) or the WeChat ext config (mini program).
2. Resolve the mode from the URL plus the presence of an access token. A missing
   token means offline, and the client says so; it never reports hosted while the
   offline adapter answers.
3. Create one session (`agents.sessions.create`) and reuse it.
4. Send a turn (`agents.turns.stream`) with `content`, `contentType`, `turnMode`,
   `idempotencyKey`, `payloadHash`, `clientRequestId`, `requestedAt`, and a
   member-aware system prompt.
5. Unwrap the SDKWork envelope (`code: 0`, `traceId`, `data.item`), read the
   `assistant_output` items, and map problems to typed errors.
6. Compose the visible answer: the triage lead goes first, the hosted text after
   it, so a red flag is never buried. A red flag inside the hosted answer can
   only raise the level.

The idempotency fingerprint is a frozen four-salt FNV-1a 128-bit digest
(`contracts/care-fingerprint-vectors.json`) reproduced byte-for-byte by
TypeScript, Dart, and the mini program.

## 5. Directory And Package Layout

```text
apps/
  sdkwork-doctor-common/packages/sdkwork-doctor-common-{doctor,agent,diagnostics}/
  sdkwork-doctor-pc/
    src/{main.tsx,App.tsx,bootstrap/}
    packages/{sdkwork-doctor-pc-core,-commons,-shell,-care,-diagnostics}/
    config/browser/runtime-env.<deployment-profile>.<environment>.example.json
  sdkwork-doctor-h5/            ... same shape with h5 names ...
  sdkwork-doctor-flutter-mobile/{lib/{agent,i18n,records},test}/
  sdkwork-doctor-mini-program/{src/{lib,pages},tests}/
etc/sdkwork.deployment.config.json
specs/{agents-app-api,agent-integration}.contract.json
contracts/ (inside sdkwork-doctor-common-doctor)
```

Every authored package owns `specs/component.spec.json`; every client root owns
`.sdkwork/`, `specs/`, tests, and its runtime configuration.

## 6. API, SDK, And Data Ownership

- Doctor owns no HTTP API authority. `agent.app.config.json#backend.apiSurfaces` is empty.
- Doctor consumes one external API family: the sdkwork-agents app API. The
  dependency is pinned in `specs/agents-app-api.contract.json` and compared with
  the upstream OpenAPI by `tests/agents-upstream-contract.test.mjs`.
- No generated transport package is imported. The hosted adapter is a core-owned
  port implementation; when a scoped composed facade is generated it replaces the
  adapter without changing the port (ADR-20261103).
- No server-side persistence. The household record lives in the app, the
  conversation lives in the agents service, and the device checks run locally.

## 7. Security, Privacy, And Observability

- The access token is read only by the core package or the client's runtime
  config module; it is never a `VITE_*` build value, never logged, and never
  rendered.
- Health facts travel only in the turn's system prompt; the client stores nothing
  beyond the in-memory conversation history.
- Visit records stay on the device in the platform's local storage. They never
  leave the client, and the records tab offers a confirmed clear action.
- Device diagnostics report environment facts, never health data.
- The session gate is a pass-through until appbase IAM lands; the token seam is
  already in place.
- Observability is the mode indicator plus typed transport errors carrying
  `status`, `code`, and `traceId`.

## 8. Architecture Decision Index

- `ADR-20261102-agent-transport-binding.md` — the port seam and the explicit
  hosted/offline rule (superseded only on the SDK packaging choice).
- `ADR-20261103-hosted-agent-wire-binding.md` — wire-level binding to the pinned
  sdkwork-agents app API, with the upstream contract test as the guard.

Inherited from standards: Adaptive Web PC+H5 pairing
(`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`), framework-neutral shared contracts
(`COMPOSABLE_ARCHITECTURE_SPEC.md`, `COMPONENT_SPEC.md`), and the runtime-env
document instead of inlined base URLs (`APP_RUNTIME_ENV_SPEC.md`).

## 9. Verification

```bash
pnpm typecheck      # 16 workspace projects
pnpm test           # cross-client contract tests
pnpm check:i18n     # i18n + locale gate
pnpm check:specs    # canonical validators
pnpm build          # PC and H5 browser bundles
pnpm check          # typecheck + test + i18n + specs
pnpm verify         # check + both builds

# Flutter surface
cd apps/sdkwork-doctor-flutter-mobile && flutter analyze && flutter test
```

Contract tests cover: the hosted wire path against a conformance server, upstream
API drift, four-client tab identity, triage parity across runtimes, fingerprint
vectors, generated catalog drift, transport mode selection, and the rule that UI
packages never build a transport.
