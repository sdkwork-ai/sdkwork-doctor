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
- Let the **patient end a conversation** so the agent writes one 病历 from the transcript, then keep the **AI diagnosis and the doctor diagnosis as two independent records** with an explicit doctor confirmation of the AI one.
- Let the patient attach **files, images, and videos** to the conversation; the attachments travel with the 病历.
- Let a family **choose its real human doctors** from a deployment-bound doctor directory, see each doctor's **employing hospital and engagement (full-time / part-time)**, name a primary doctor, and start a human consultation at a chosen site **inside the conversation home**, where the family and the doctor talk in one session.
- Show **one conversation list** on every client, with an unread badge for every doctor reply the family has not opened, a waiting-for-the-doctor state, and the doctor's own reply surface on the same device.
- Keep one conversation mode that is explicit: hosted agent, offline triage, or human consultation, never an unstated substitute.
- Show the **same four tabs (对话 / 医生 / 记录 / 我的)** on every client; 记录 lists **one card per visit session** and opens a standalone detail page with four tabs: 病历, AI总结, 医生人工确认, and 通话回放.
- Let a patient **replay a visit** on its timeline: the conversation turns and the voice/video call segments, read aloud by the device speech engine where the host provides one.
- Record every consultation on the device, including which human doctor a consultation was routed to.
- Reuse one building-block catalogue so a deployment can hide, reorder, relabel, or retheme without forking a client.
- Keep health facts on the device and in the request only; no client-side analytics.

Non-goals:

- Replacing emergency services, a diagnosis, or a prescription decision. The AI diagnosis is a draft the attending doctor must confirm or amend.
- Prescribing, changing doses, or interpreting lab results.
- Multi-tenant clinical records; this is a household record, not an EHR.
- Remote monitoring or wearable ingestion in this release.
- Owning a doctor or hospital backend. The directory is operator content.
- A clinician-facing console: the doctor review happens inside the family app on the doctor's device, with the attending doctor's name recorded locally rather than an authenticated clinician account.

## 4. Scope

In scope for this release:

- 对话: the sdkwork-agents family-doctor conversation, an active-patient switcher, a triage level per exchange, an emergency lead that can never be softened, **file / image / video attachments on a turn**, and the patient's **end-conversation** action above the transcript. A **conversation list** opens any session — the live AI conversation, a human consultation, or an ended session's 病历 — and marks the doctor replies the family has not read. On H5 and Flutter the same conversation also runs as a **voice/video call**: the call speaks the greeting, listens, reads the answer aloud, switches the camera on for video, and records every spoken turn exactly like a typed turn; hanging up returns to the text transcript with the calls' turns in place.
- 扫一扫: the Flutter "+" menu opens a full-screen QR scanner — camera preview, scan frame, torch toggle, a dedicated permission-denied state, and the decoded content with rescan.
- 病历: one record per ended conversation, holding the transcript and attachments, the agent summary, the **tentative AI diagnosis**, the **attending doctor's diagnosis**, and the doctor's **explicit confirmation or amendment** of the AI diagnosis. The AI and doctor diagnoses are stored side by side; neither overwrites the other.
- 医生: the human-doctor directory — real clinicians from the deployment directory (or the authored fallback roster), selection of one or more family doctors, a primary doctor, doctor detail for every practice site (employing organization, hospital and hospital code, department, title, **full-time / part-time / contract / visiting** engagement, focus, languages, experience, consulting hours, accepting status), and a **发起人工问诊** action that opens a human consultation in the conversation home and records itself against the active patient. The chosen site is snapshotted on the visit record; the conversation carries the doctor's identity.
- 医生's reply surface: the attending doctor takes the device and writes into the same human conversation from 记录 (or the conversation's row menu on Flutter). The reply is a normal doctor turn, the family sees it unread until they open the conversation, and an AI session never accepts a doctor reply.
- 我的: an account screen on the mobile surfaces — a full-bleed identity block (large avatar, name, patient facts, and status pills for profile completeness and the active conversation mode), then grouped capability rows that each open their module: 病人档案 (create, edit, delete, switch, completeness), 我的医生, 对话, **视频通话** (H5 and Flutter; the same AI conversation with the camera already on), 记录 (visit records + 病历), and the device environment. Groups sit on the canvas with gaps between them and no section headers, rows are single-line, and the privacy statement sits under the last group. The patient files and device environment have their own sub-screens so the hub stays scannable.
- 记录: **one card per visit session**, newest first — the live AI conversation, every human consultation, and every ended session's 病历 — showing the patient, start time, status (进行中 / 已结束 / 待医生确认 / 医生已确认), message and call counts, and triage level. Tapping a card opens a **standalone detail page** with four tabs: **病历** (facts, chief complaint, transcript with the channel of each turn, attachments), **AI总结** (agent summary and tentative AI diagnosis with the draft warning), **医生人工确认** (confirmation state, doctor diagnosis, and the accept / amend / add review form), and **通话回放** (the ordered visit timeline with the voice and video call segments, read aloud by the device speech engine where one exists). The list is clearable with one confirmed action; the detail page is linkable and refreshable, and the tab count stays four.
- 通话回放: the session timeline is the playback clock. Each message and each voice/video call segment is an ordered item positioned from the session start; the browser surfaces and Flutter speak the messages with the device speech engine, and the mini program walks the timeline visually because the host exposes no TTS. No surface claims to play original audio, which is not stored in this release.
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
3. The family opens 医生, sees the deployment directory, selects a cardiologist as the primary doctor, notices the same clinician also holds a part-time community-clinic session, picks the hospital site, and taps **发起人工问诊** with the reason "chest tightness after dinner". The app opens the conversation home on a human consultation addressed to that doctor, with the reason already sent. The consultation appears in 记录 against the selected patient with that doctor's name, hospital, and engagement; the doctor later writes the reply into the same conversation, and the conversation list shows the unread count until the family opens it.
4. A parent edits grandpa's file to add a new medication, then switches back to the child before asking the next question.
5. A family member opens the app on a new phone. 我的 shows the same patient files and doctors, and states whether the conversation is hosted or offline.
6. An operator deploys without a doctor directory. The doctor tab shows the authored fallback roster and says the directory is not configured; nothing pretends a live directory answered.
7. A parent finishes a night-time conversation about their child's fever and attaches a photo of the thermometer. The patient taps 结束对话并生成病历 above the transcript; the agent writes the 病历 and a tentative AI diagnosis. The family doctor opens 记录, taps the visit's card, and lands on the four-tab detail page: 病历 shows the photo and the transcript, AI总结 shows the draft, 医生人工确认 lets the doctor accept it or record their own diagnosis with 修正为我的诊断, and 通话回放 lets either of them hear the visit again. Both diagnosis records and the confirmation stay on the device.

## 6. Success Metrics

- Time from opening the app to a first triage level under 30 seconds.
- Zero replies where an emergency red flag is absent from the leading sentence.
- Zero clients that render a mode other than the transport actually in use.
- Zero surfaces where the doctor tab shows a clinician without a source badge.
- Every consultation is retrievable from 记录 after an app restart, including the human doctor.
- Every visit is exactly one card in 记录, including the session that is still open.
- Opening a card reaches the four detail tabs in one tap on every client, and the page is addressable by its own route or page.
- Playback never presents generated speech as the original recording, and no surface claims audio it does not have.
- Zero 病历 where the AI diagnosis is rendered as final without a doctor confirmation.
- Every ended conversation produces exactly one 病历 carrying its transcript and every attachment uploaded during that session.
- Zero 病历 where the doctor's diagnosis overwrites the AI diagnosis: both remain readable with their own author and time.
- Every patient switch is visible on every client within one render.
- One authored copy contract, zero hand-edited per-client translations.

## 7. Phases

| Phase | Scope |
| --- | --- |
| P0 (delivered) | Three tabs on four clients, shared domain and triage contract, offline adapter, hosted wire transport, device-local visit records, generated care catalog, contract tests. |
| P0.1 (delivered) | Patient files (multiple patients, one active), the human-doctor directory with selection and consultation records, the sdkwork-agents agent catalogue, records moved under 我的. |
| P0.2 (delivered) | Conversation 病历: the patient ends a conversation, the agent summarizes it into a 病历 with a tentative AI diagnosis, the attending doctor confirms/amends it, and both diagnosis records plus every attachment stay readable on the device. |
| P1 | Live hosted conversation against a deployed sdkwork-agents service plus IAM session; real transcript recorded in the acceptance record. |
| P2 | Patient-file sync across devices and household invitations. |
| P3 (delivered for the on-device model) | In-conversation human consultation: 发起人工问诊 opens a session addressed to the chosen doctor, the doctor replies on the same device, and every session row carries the unread doctor replies. A deployment-backed clinician messaging service remains the next step (`docs/architecture/decisions/ADR-20261103-in-conversation-human-consultation.md`). |

## 8. Linked Requirements

- `docs/product/requirements/REQ-2026-1102-family-doctor-acceptance.md` — delivered scope, contract evidence, and what remains blocked.
- `specs/app-composition.contract.json` — the four-tab block catalogue.
- `specs/doctor-directory.contract.json` — the deployment doctor-directory document and the fallback roster.
- `specs/agents-app-api.contract.json` — pinned sdkwork-agents app API dependency (session, turn, agent catalogue).
- `specs/agent-integration.contract.json` — transport selection, per-client ports, the case-record summary turn, acceptance status.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/medical-record.schema.json` — the 病历 shape, storage key, and the two diagnosis records.
- `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/care-session.schema.json` — the conversation session shape, the `human` mode with its doctor attribution, and the per-session read marks behind unread badges.
- `docs/architecture/decisions/ADR-20261103-hosted-agent-wire-binding.md` — why the binding is wire-level rather than SDK-level.
- `docs/architecture/decisions/ADR-20261103-doctor-directory-and-agent-catalogue.md` — why the roster is deployment content and how the agent catalogue is used.
- `docs/architecture/decisions/ADR-20261103-in-conversation-human-consultation.md` — why a human consultation is a conversation, why the doctor replies on the same device, and how unread counts are kept honest.

## 9. Open Questions

- Should the household record be encrypted at rest in the browser, or is the device the trust boundary?
- Should the agent receive the full record on every turn, or only the fields relevant to the symptom?
- Which locale should a hosted agent answer in when the family switches language mid-conversation?
- When a clinician messaging service exists, should the same conversation carry the remote doctor's turns, or a second transport? The session shape and unread model are ready for either.
