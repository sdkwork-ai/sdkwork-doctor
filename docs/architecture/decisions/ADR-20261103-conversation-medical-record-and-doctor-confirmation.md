# ADR-20261103 — Conversation Medical Records, Two Diagnosis Records, And Doctor Confirmation

Status: accepted
Date: 2026-11-03
Owner: sdkwork-platform
Applies to: `apps/sdkwork-doctor-*`, `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/medical-record.schema.json`, `specs/agent-integration.contract.json`

## Context

The family private-doctor app already keeps a conversation per household and a
device-local visit record per exchange. What it could not do is the thing a
doctor actually needs: take a finished conversation, turn it into a written
病历, record a diagnosis, and have a human clinician take responsibility for the
AI's opinion.

Three constraints shape the decision:

1. **No clinician identity exists.** `agent.app.config.json#backend` owns no
   clinician or clinic API, the sdkwork-agents app API has no clinician
   resource, and a clinician-facing console is explicitly out of scope in the
   PRD. The doctor in this product is the family's chosen human doctor, using the
   same device-local record the family uses.
2. **The AI must not be the final word.** The PRD forbids replacing a diagnosis.
   An AI diagnosis that a doctor has not seen can be mistaken for one.
3. **The transcript is the evidence.** A record is only useful to a doctor if it
   carries what was actually said, and the files the patient uploaded, not just
   a prose summary.

## Decision

### 1. Ending the conversation produces exactly one 病历

The patient operates the end action above the transcript (the action belongs to
the patient, not to the agent or the doctor). One ended session yields one
`MedicalRecord`:

- the session id, patient, transport mode, start and end time;
- every transcript line, with the triage level of the patient's own turns;
- every attachment uploaded during the session;
- the agent's prose `summary`;
- an `aiDiagnosis`;
- optionally a `doctorDiagnosis` and a `confirmation`.

The record is stored at `sdkwork.doctor.medical-records.v1` with the shape in
`contracts/medical-record.schema.json`; the TypeScript, Dart, and mini program
implementations are asserted against that file.

### 2. The AI and doctor diagnoses are two independent records

`aiDiagnosis` and `doctorDiagnosis` are separate objects with their own id,
author, impression, considered directions, recommendations, urgency, and
timestamp. A doctor diagnosis carries `doctorLabel` and, when it amends the AI
one, `basisDiagnosisId`. Saving a doctor diagnosis never deletes or rewrites the
AI diagnosis; confirming the AI diagnosis never invents a doctor diagnosis
unless the doctor supplied one.

### 3. An AI diagnosis is a draft until a doctor confirms it

`status` is derived, not guessed:

- `awaiting_doctor` while `confirmation` is absent;
- `confirmed` once a doctor records a confirmation.

The doctor has three explicit paths, all of which keep the AI diagnosis
readable:

- **accept** — `confirmAiDiagnosis({decision: 'confirmed'})`;
- **amend** — `confirmAiDiagnosis({decision: 'amended', doctorDiagnosis})`,
  which stores the doctor's own conclusion next to the AI one;
- **independent** — `addDoctorDiagnosis`, which records the doctor's diagnosis
  while the AI one is still awaiting review.

### 4. The reviewer is named locally, not authenticated

The review form asks for the attending doctor's name (prefilled from the
family's primary doctor where the surface has a roster) and states that the
decision is stored on this device. This is honest about what exists: there is no
clinician account to verify. When a clinician identity service is added, it
replaces the name field and the confirmation is signed by that identity; the
record shape does not change.

### 5. Attachments are device-local, and the agents turn names them

Images, videos, and documents are stored in an attachment store (IndexedDB in
the browser, the saved file on the native clients) and the record keeps only
metadata. The hosted turn includes the attachment names and kinds in its text;
the pinned agents API exposes no binary-upload operation, so the client does not
pretend to upload the bytes. The record's attachments remain readable offline.

### 6. The agent writes the summary on the same session

`AgentConversationPort.summarize` sends one non-stream turn on the conversation's
own session with a case-record system prompt and parses one JSON object
(`summary`, `impression`, `conditions`, `recommendations`, `level`). The
deterministic triage level of the patient's own turns is a **floor**: the model
may raise an urgency, never lower it. The draft text never leaks into the
visible conversation.

With no deployment, the offline summary states plainly that a doctor must assess
the patient and reuses the shared triage actions; it never invents a diagnosis.

## Consequences

- Every client carries the same medical-record contract and the same two-record
  diagnosis model; `tests/medical-records.test.mjs` guards the TypeScript and
  mini program shapes, and `tests/cross-client-parity.test.mjs` guards presence
  on all four clients.
- The records tab is now session-first and the 病历 is read on a standalone
  four-tab detail page in every client (superseded by
  `ADR-20261103-session-first-records-and-playback.md`); the tab count stays four
  and the detail page is a sub-route or pushed screen, not a fifth tab.
- Records and attachments are device-local. Sync is PRD P2; a doctor reviewing
  on another device is out of scope for this release.
- A record with an unconfirmed AI diagnosis is visibly flagged everywhere it is
  listed, so the confirmation cannot be forgotten silently.

## Alternatives rejected

- **A separate clinician console.** Rejected for this release: it needs an
  authenticated clinician identity and a server that does not exist, and the PRD
  lists it as out of scope.
- **One diagnosis field overwritten by the doctor.** Rejected: it destroys the
  evidence of what the AI proposed and makes an audit of the confirmation
  impossible.
- **Binary upload through the agents API.** Rejected: the pinned upstream
  contract has no upload operation; inventing one would cross the API_SPEC
  boundary this change is not authorised to cross.
- **Letting the model decide urgency alone.** Rejected: the deterministic triage
  floor is the existing safety contract and applies to the summary as well.
