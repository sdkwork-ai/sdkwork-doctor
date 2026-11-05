# ADR-20261103 — Session-First Visit Records, The Four-Tab Detail, And Playback

Status: accepted
Date: 2026-11-03
Owner: sdkwork-platform
Applies to: `apps/sdkwork-doctor-*`, `contracts/care-session.schema.json`, `specs/app-composition.contract.json`

## Context

The first version of 看病记录 rendered every 病历 and every visit row inline,
expanded in place. It answered "what happened" but not "one visit at a time":

1. **A visit is one conversation.** The patient's mental model is a session they
   started, continued (text, voice, video, or a human doctor), and ended. A list
   of 病历 cards mixed with per-exchange visit rows did not match that model.
2. **The record needs room.** 病历, the AI summary, the doctor's confirmation,
   and the conversation's own replay each need a full page; an accordion inside a
   tab put four different reading tasks in one scroll.
3. **The doctor and the patient read different things.** A clinician opens the
   病历 and the confirmation; a patient opens the AI summary and wants to hear
   the conversation again. A tab is the honest way to separate those jobs.
4. **There is no recorded audio.** The conversation transports recognize speech
   to text and synthesize replies; no client stores the original audio. Claiming
   a recording would be false, and silently omitting playback would drop a
   requested feature.

## Decision

### 1. One card per visit session, including the open one

看病记录 lists `CareSession` records, newest first: the live AI session, a human
consultation, and every ended visit. The card states the patient, the start time,
the status (进行中 / 已结束 / 待医生确认 / 医生已确认), the message and call
counts, the triage level, and the AI impression when a 病历 exists. A 病历 that
predates the session store is synthesized into a session for reading, never lost.

The session is the unit the patient ends in 对话; ending it writes exactly one
`MedicalRecord` and links it through `medicalRecordId` (with `sessionId` as the
fallback join key). The visit-record store remains the per-exchange clinical log;
it no longer drives the records list.

### 2. A standalone detail page, one route per client

Opening a card leaves the list and opens a page of its own:

- PC/H5: the route `/doctor/records/:recordId`;
- Flutter: `RecordDetailScreen` pushed on the tab's navigator;
- mini program: `pages/record-detail/index?id=<session-id>`.

The route is linkable and refreshable, and the bottom tab bar keeps its four
destinations. No new tab is introduced.

### 3. Four tabs, each with one job

- **病历** — the visit facts, the chief complaint, the full transcript with the
  channel of each turn, the triage level of the patient's turns, and the
  attachments. This is the evidence a clinician reads.
- **AI总结** — the agent's summary and the tentative AI diagnosis, with the
  explicit draft warning. Nothing here is presented as final.
- **医生人工确认** — the confirmation state, the doctor's own diagnosis when one
  exists, and the review form that accepts, amends, or adds a diagnosis. The AI
  and doctor diagnoses stay side by side.
- **通话回放** — the visit timeline: every turn and every voice/video call
  segment, positioned from the session start.

### 4. Playback is a timeline plus the device voice, not a recording

`buildCarePlayback` turns the session into ordered items with an `offsetMs` from
the session start. The browser surfaces and Flutter read each message with the
device speech engine (`speechSynthesis` / `flutter_tts`); call segments are shown
with their mode and duration and are not re-spoken. The mini program host exposes
no text-to-speech, so it walks the same timeline visually and says so. Every
surface labels the feature as device-read playback and states that the original
audio is not stored on this device.

This keeps the feature honest and portable: adding recorded audio later replaces
the audio source behind the same timeline and tab without changing the page.

### 5. The list and the detail stay device-local

Sessions, 病历, attachments, and read marks remain device-local, like the rest of
the product. A doctor reviewing on another device is out of scope for this
release (PRD P2), and no surface pretends otherwise.

## Consequences

- Four clients carry the same session contract, the same four tabs, and the same
  playback semantics; `tests/care-sessions.test.mjs` and the per-client tests
  guard the shape and the navigation.
- The records tab no longer expands records in place, and the old inline
  `MedicalRecordsSection` is no longer the records page.
- A human consultation without a 病历 shows its transcript and the pending state
  on the AI/doctor tabs instead of a fabricated summary.
- The feature is reachable from 我的 and the "+" menu, which already switch to the
  records tab.

## Alternatives rejected

- **Keep the accordion and add tabs inside it.** Rejected: it nests two
  navigation models and makes the four reading tasks compete on one scroll.
- **A separate route per tab.** Rejected: deep links become brittle and each tab
  would have to reload the session; one page with local tab state is enough.
- **Store real audio and replay it.** Rejected for this release: it needs
  microphone recording, audio storage, and permissions on three platforms, and
  the upstream product has no recording contract. The timeline is the seam a
  later audio source can fill.
- **Synthesize a "recording" from the transcript without saying so.** Rejected:
  it would present generated speech as the original visit.
- **Drop active sessions from the list.** Rejected: a visit starts as a
  conversation; hiding it until it ends is exactly the confusion this change
  removes.
