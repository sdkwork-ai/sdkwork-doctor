# SDKWork Doctor PRD

Status: draft
Owner: sdkwork-platform
Application: doctor
Updated: 2026-11-02
Specs: REQUIREMENTS_SPEC.md, DOCUMENTATION_SPEC.md

## 1. Background And Problem

A family needs one place to ask health questions at any hour and to keep the
household's health facts in one record. Generic chat assistants answer plausibly
but forget who they are talking to: they do not know this child's penicillin
allergy, this parent's hypertension, or which medications are already in use, and
they never tell a family how urgently to act.

SDKWork Doctor is a family private-doctor agent application. It pairs an agent
conversation with the household health record, applies a deterministic
emergency-first triage before any conversational reply, and runs on the four
places a family actually uses: the PC browser, the mobile browser, the Flutter
mobile app, and the WeChat mini program.

## 2. Target Users

- **A parent or adult child** asking about a symptom at night and needing to know whether it is an emergency.
- **The household health owner** keeping allergies, chronic conditions, and medications current for each member.
- **A remote family member** receiving the same advice and the same record on a different device.

## 3. Goals And Non-Goals

Goals:

- Answer a symptom question with the member's known allergies, conditions, and medications in context.
- Escalate an emergency red flag before, and independently of, any conversational text.
- Keep one conversation mode that is explicit: hosted agent or offline triage, never an unstated substitute.
- Show the same three tabs (对话 / 医生 / 我的) on every client.
- Keep health facts on the device and in the request only; no client-side analytics.

Non-goals:

- Replacing emergency services, a diagnosis, or a prescription decision.
- Prescribing, changing doses, or interpreting lab results.
- Multi-tenant clinical records; this is a household record, not an EHR.
- Remote monitoring or wearable ingestion in this release.

## 4. Scope

In scope for this release:

- 对话: a conversation with the family doctor agent, a triage level per exchange, and an emergency lead that can never be softened.
- 医生: the household health record and the care rules for the selected member.
- 我的: family members, profile completeness, the active conversation mode, and the device environment check.
- Hosted conversation through the sdkwork-agents app API, with an offline triage adapter when no deployment or credential exists.
- Two locales (en-US, zh-CN) generated from one authored catalog into all four clients.

Out of scope for the first release:

- Authenticated hosted conversation in a real deployment (blocked on provisioning; see the acceptance record).
- Appointment booking, payments, and insurance.
- Clinician-facing consoles.

## 5. User Scenarios

1. At 02:00 a parent types "child has fever 39C since last night". The record
   shows no allergy, the triage returns routine or urgent, and the hosted agent
   answers with concrete next steps while the escalation rule stays visible.
2. An adult child types "chest pain for 10 minutes". The reply leads with
   "Call local emergency services now" even if the model answer is reassuring.
3. A family member opens the app on a new phone. The 我的 tab shows the same
   household record and states whether the conversation is hosted or offline.
4. An operator deploys without an agents service. The app runs the offline
   triage adapter and the 我的 tab says so; nothing pretends to be hosted.

## 6. Success Metrics

- Time from opening the app to a first triage level under 30 seconds.
- Zero replies where an emergency red flag is absent from the leading sentence.
- Zero clients that render a mode other than the transport actually in use.
- One authored copy contract, zero hand-edited per-client translations.

## 7. Phases

| Phase | Scope |
| --- | --- |
| P0 (delivered) | Three tabs on four clients, shared domain and triage contract, offline adapter, hosted wire transport, generated care catalog, contract tests. |
| P1 | Live hosted conversation against a deployed sdkwork-agents service plus IAM session; real transcript recorded in the acceptance record. |
| P2 | Multi-member switching, per-member conversation sessions, and household invitations. |
| P3 | Clinician handoff and visit summaries through the same agent port. |

## 8. Linked Requirements

- `docs/product/requirements/REQ-2026-1102-family-doctor-acceptance.md` — delivered scope, contract evidence, and what remains blocked.
- `specs/agents-app-api.contract.json` — pinned sdkwork-agents app API dependency.
- `specs/agent-integration.contract.json` — transport selection, per-client ports, acceptance status.
- `docs/architecture/decisions/ADR-20261103-hosted-agent-wire-binding.md` — why the binding is wire-level rather than SDK-level.

## 9. Open Questions

- Should the household record be encrypted at rest in the browser, or is the device the trust boundary?
- Should the agent receive the full record on every turn, or only the fields relevant to the symptom?
- Which locale should a hosted agent answer in when the family switches language mid-conversation?
- Is a shareable, redacted care summary needed before P2?
