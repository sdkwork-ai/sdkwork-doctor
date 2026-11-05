# ADR-20261103 — In-Conversation Human Consultation And Unread Session Badges

Status: accepted
Date: 2026-11-03
Owner: sdkwork-platform
Applies to: `apps/sdkwork-doctor-*`, `contracts/care-session.schema.json`, `specs/doctor-directory.contract.json`

## Context

发起人工问诊 used to start the doctor's preferred external channel — a new
browser tab on PC/H5, a copied link on the mini program — and write one visit
record. That left the product's central promise unfulfilled:

1. **The home is the conversation.** The family already talks to the AI family
   doctor in 对话; a human consultation that leaves the app has no transcript,
   no history, and no way to continue the conversation later.
2. **"Was the doctor's answer read?" had no answer.** A channel launch cannot
   carry an unread state, so a family could miss a reply with nothing on screen
   to say so.
3. **The product has no clinician messaging backend.** There is no doctor or
   hospital service in this workspace, `agent.app.config.json#backend` owns no
   clinician API, and the sdkwork-agents app API exposes only assistant sessions.
   A real remote chat cannot be fabricated.

At the same time, the product already models the attending doctor as a person
using the family's device: the 病历 review and the doctor's diagnosis happen
inside the family app on that device (ADR-20261103-conversation-medical-record-
and-doctor-confirmation). The human conversation can use the same honest model.

## Decision

### 1. A human consultation is a conversation session addressed to one doctor

`发起人工问诊` creates (or reuses a recent) `CareSession` with `mode: 'human'`
and a `doctor` attribution — roster id, display name, department, chosen site,
engagement — and appends the consultation reason as the patient's first turn.
The action then navigates to the conversation home with that session open:

- PC/H5: `/doctor/chat?session=<id>`;
- Flutter: the 对话 tab with the new session active;
- mini program: the conversation tab, told which session to open.

The visit record is still written, with the doctor and site snapshot, so 记录
stays the clinical log even after the roster changes.

### 2. The doctor replies on the same device, through an explicit surface

The clinician takes the device and writes the reply into the same conversation:

- H5/PC: the session's 记录 detail page carries a 医生回复 card;
- Flutter: the session row's long-press menu offers 以医生身份回复;
- mini program: the human conversation shows 医生回复.

The reply is an ordinary assistant turn, but it is produced by a person, and the
UI labels it with the doctor's name. An AI session rejects a doctor reply at the
domain boundary (`appendCareSessionDoctorReply` throws), so no surface can
impersonate a clinician in an AI conversation.

This is not a remote messaging service. It is honest about what exists and keeps
the same conversation shape a future service would fill.

### 3. Unread is a per-device read mark, and the badge is derived

A session row shows the number of assistant turns newer than the family's last
read mark of that session:

- browsers keep read marks in `sdkwork.doctor.care-session-reads.v1`, apart from
  the session document so opening a conversation never reorders the list;
- Flutter and the mini program keep the unread count on their private
  human-consultation documents, since those conversations own their transcript.

Opening a conversation marks it read. The row also states whether the last turn
is the patient's (`待医生回复`) or the doctor's (`医生已回复`) and whether the
consultation is still open. The list trigger and the drawer header show the
total unread count.

### 4. The stores are separate from the agents transport

A human consultation must never be sent to the agents API as if the assistant
were the clinician. The client keeps human consultations in its own store
(shared TS `CareSessionStore`, Flutter `CareHumanConsultationStore`, mini program
`human-consultations.js`) and merges the rows with the AI sessions for display.
The AI conversation continues to use `AgentConversationPort` unchanged.

## Consequences

- Every client has one conversation list. The AI family doctor, the live human
  consultation, and an ended session's 病历 are all reachable from it.
- The family sees a badge the moment the doctor answers, without leaving the
  conversation. The badge clears only when the conversation is opened.
- 记录 remains the clinical log: the human consultation appears there with the
  doctor, site, and engagement, and its detail page is the doctor's reply surface
  on the browsers.
- No new API surface, credential, or backend is introduced. When a clinician
  messaging service exists, it replaces the reply signal source, not the session
  shape or the list.
- The unread count is per device; cross-device sync is PRD P2.

## Alternatives rejected

- **Keep launching the external channel.** Rejected: it cannot produce a
  transcript, an unread badge, or a conversation the family can return to, and
  it contradicts "the home is the conversation".
- **Let the AI answer inside a human session.** Rejected: the session is
  attributed to a real clinician; an AI turn in it would be read as the doctor's
  opinion.
- **Add a clinician messaging API now.** Rejected: it needs an API authority,
  envelope, operation matrix, and a backend that does not exist, which this
  change is not authorised to introduce.
- **Store human turns in the agents transport.** Rejected: the transport has no
  human participant, so the doctor's reply would have to come from the assistant
  and the attribution would be a lie.
