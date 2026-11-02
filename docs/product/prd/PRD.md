# SDKWork Doctor PRD

Status: draft
Owner: sdkwork-platform
Application: doctor
Updated: 2026-11-03
Specs: REQUIREMENTS_SPEC.md, DOCUMENTATION_SPEC.md

## 1. Background And Problem

A family needs one place to ask health questions at any hour, to keep the
household's health facts in one record, and to reach a real human doctor when
the question needs a person. Generic chat assistants answer plausibly but forget
who they are talking to: they do not know this child's penicillin allergy, this
parent's hypertension, or which medications are already in use, and they never
tell a family how urgently to act or who to call.

SDKWork Doctor is a family private-doctor agent application. It pairs an agent
conversation with one patient file per household member, keeps a visit log of
every consultation, applies a deterministic emergency-first triage before any
conversational reply, and connects the family to its chosen human doctors. It
runs on the four places a family actually uses: the PC browser, the mobile
browser, the Flutter mobile app, and the WeChat mini program.

## 2. Target Users

- **A parent or adult child** asking about a symptom at night and needing to know whether it is an emergency.
- **The household health owner** keeping allergies, chronic conditions, and medications current for each patient.
- **A family that wants a person**: choosing the household's doctors and starting a real human consultation when the agent is not enough.
- **A remote family member** receiving the same advice, the same patient file, and the same doctors on a different device.

## 3. Goals And Non-Goals

Goals:

- Answer a symptom question with the **active patient's** allergies, conditions, and medications in context.
- Keep **several patient files** in one household and switch the active patient without losing the conversation history.
- Escalate an emergency red flag before, and independently of, any conversational text.
- Let a family **choose its real human doctors** from a deployment-bound doctor directory, see each doctor's **employing hospital and engagement (full-time / part-time)**, name a primary doctor, and start a human consultation at a chosen site through that site's configured channel.
- Keep one conversation mode that is explicit: hosted agent or offline triage, never an unstated substitute.
- Show the **same three tabs (对话 / 医生 / 我的)** on every client, with the visit records reachable from 我的.
- Record every consultation on the device, including which human doctor a consultation was routed to.
- Reuse one building-block catalogue so a deployment can hide, reorder, relabel, or retheme without forking a client.
- Keep health facts on the device and in the request only; no client-side analytics.

Non-goals:

- Replacing emergency services, a diagnosis, or a prescription decision.
- Prescribing, changing doses, or interpreting lab results.
- Multi-tenant clinical records; this is a household record, not an EHR.
- Remote monitoring or wearable ingestion in this release.
- Owning a doctor or hospital backend. The directory is operator content.

## 4. Scope

In scope for this release:

- 对话: the sdkwork-agents family-doctor conversation, an active-patient switcher, a triage level per exchange, and an emergency lead that can never be softened.
- 医生: the human-doctor directory — real clinicians from the deployment directory (or the authored fallback roster), selection of one or more family doctors, a primary doctor, doctor detail for every practice site (employing organization, hospital and hospital code, department, title, **full-time / part-time / contract / visiting** engagement, focus, languages, experience, consulting hours, accepting status), and a human consultation at a chosen site that records itself against the active patient.
- 我的: patient files (create, edit, delete, switch, completeness), my doctors, the visit-records entry, the active conversation mode, and the device environment check.
- 记录: a sub-screen of 我的 listing every consultation on this device, newest first, with symptom, advice, level, patient, doctor, time, and transport mode; clearable with one confirmed action.
- The browser workbench landing at the surface root: mode at a glance, one entry per tab, and the last three consultations.
- Hosted conversation plus the managed-agent catalogue through the sdkwork-agents app API, with an offline triage adapter when no deployment or credential exists.
- Two locales (en-US, zh-CN) generated from one authored catalog into all four clients.

Out of scope for the first release:

- Authenticated hosted conversation in a real deployment (blocked on provisioning; see the acceptance record).
- Appointment booking, payments, and insurance.
- Clinician-facing consoles.
- A first-party doctor/hospital service; the directory contract is the seam.

## 5. User Scenarios

1. At 02:00 a parent switches the active patient to their child, types "fever 39C since last night". The child's file shows the penicillin allergy, the triage returns routine or urgent, and the hosted agent answers with concrete next steps while the escalation rule stays visible.
2. An adult child types "chest pain for 10 minutes". The reply leads with "Call local emergency services now" even if the model answer is reassuring.
3. The family opens 医生, sees the deployment directory, selects a cardiologist as the primary doctor, notices the same clinician also holds a part-time community-clinic session, picks the hospital site, and starts a video consultation with the reason "chest tightness after dinner". The consultation appears in 记录 against the selected patient with that doctor's name, hospital, and engagement.
4. A parent edits grandpa's file to add a new medication, then switches back to the child before asking the next question.
5. A family member opens the app on a new phone. 我的 shows the same patient files and doctors, and states whether the conversation is hosted or offline.
6. An operator deploys without a doctor directory. The doctor tab shows the authored fallback roster and says the directory is not configured; nothing pretends a live directory answered.

## 6. Success Metrics

- Time from opening the app to a first triage level under 30 seconds.
- Zero replies where an emergency red flag is absent from the leading sentence.
- Zero clients that render a mode other than the transport actually in use.
- Zero surfaces where the doctor tab shows a clinician without a source badge.
- Every consultation is retrievable from 记录 after an app restart, including the human doctor.
- Every patient switch is visible on every client within one render.
- One authored copy contract, zero hand-edited per-client translations.

## 7. Phases

| Phase | Scope |
| --- | --- |
| P0 (delivered) | Three tabs on four clients, shared domain and triage contract, offline adapter, hosted wire transport, device-local visit records, generated care catalog, contract tests. |
| P0.1 (delivered) | Patient files (multiple patients, one active), the human-doctor directory with selection and consultation records, the sdkwork-agents agent catalogue, records moved under 我的. |
| P1 | Live hosted conversation against a deployed sdkwork-agents service plus IAM session; real transcript recorded in the acceptance record. |
| P2 | Patient-file sync across devices and household invitations. |
| P3 | Clinician handoff inside the conversation through the same agent port. |

## 8. Linked Requirements

- `docs/product/requirements/REQ-2026-1102-family-doctor-acceptance.md` — delivered scope, contract evidence, and what remains blocked.
- `specs/app-composition.contract.json` — the three-tab block catalogue.
- `specs/doctor-directory.contract.json` — the deployment doctor-directory document and the fallback roster.
- `specs/agents-app-api.contract.json` — pinned sdkwork-agents app API dependency (session, turn, agent catalogue).
- `specs/agent-integration.contract.json` — transport selection, per-client ports, acceptance status.
- `docs/architecture/decisions/ADR-20261103-hosted-agent-wire-binding.md` — why the binding is wire-level rather than SDK-level.
- `docs/architecture/decisions/ADR-20261103-doctor-directory-and-agent-catalogue.md` — why the roster is deployment content and how the agent catalogue is used.

## 9. Open Questions

- Should the household record be encrypted at rest in the browser, or is the device the trust boundary?
- Should the agent receive the full record on every turn, or only the fields relevant to the symptom?
- Which locale should a hosted agent answer in when the family switches language mid-conversation?
- Should a consultation request also open an in-conversation handoff (P3), or stay a channel launch plus a visit record?
