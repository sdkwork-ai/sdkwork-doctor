import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

import './support/ts-resolve.mjs';

const require = createRequire(import.meta.url);

const repoRoot = path.resolve(import.meta.dirname, '..');
const commonRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor';
const domain = await import(new URL(
  'file:///' + path.join(repoRoot, commonRoot, 'src/care-sessions.ts').replaceAll('\\', '/'),
).href);

const MEMBER = Object.freeze({ id: 'member-child', displayName: 'Xiaoman', relation: 'child' });
const DOCTOR = Object.freeze({
  id: 'doctor-lin-qinghe',
  displayName: 'Lin Qinghe',
  department: 'Cardiology',
  hospitalName: 'SDKWork Care Network',
  organizationId: 'org-sdkwork-care',
  employmentType: 'full_time',
  avatarUrl: '/avatars/doctor-lin-qinghe.png',
});
const OTHER_DOCTOR = Object.freeze({
  id: 'doctor-su-wanning',
  displayName: 'Su Wanning',
  department: 'Pediatrics',
});

function humanSession(overrides = {}) {
  return domain.createHumanConsultationSession({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'Chest tightness after dinner',
    startedAt: '2026-11-03T12:00:00.000Z',
    ...overrides,
  });
}

test('a human consultation is a human session addressed to one doctor', () => {
  const session = humanSession();
  assert.equal(session.mode, 'human');
  assert.equal(session.status, 'active');
  assert.equal(session.doctor.id, DOCTOR.id);
  assert.equal(session.doctor.displayName, DOCTOR.displayName);
  assert.equal(session.doctor.department, 'Cardiology');
  assert.equal(session.memberLabel, 'Xiaoman (child)');
  assert.equal(session.title, 'Chest tightness after dinner');
  assert.equal(session.transcript.length, 1);
  assert.equal(session.transcript[0].role, 'patient');
  assert.equal(session.transcript[0].channel, 'text');
  assert.equal(session.transcript[0].text, 'Chest tightness after dinner');
});

test('a doctor reply is an assistant turn; an AI session rejects it', () => {
  const session = humanSession();
  const replied = domain.appendCareSessionDoctorReply(
    session,
    'Come to the clinic tomorrow morning for an ECG.',
    '2026-11-03T12:10:00.000Z',
  );
  assert.equal(replied.transcript.length, 2);
  assert.equal(replied.transcript[1].role, 'assistant');
  assert.equal(replied.updatedAt, '2026-11-03T12:10:00.000Z');
  assert.equal(replied.doctor.id, DOCTOR.id);

  const ai = domain.createCareSession({
    member: MEMBER,
    mode: 'offline',
    startedAt: '2026-11-03T12:00:00.000Z',
  });
  assert.throws(
    () => domain.appendCareSessionDoctorReply(ai, 'A human reply on an AI session'),
    /human consultation/u,
  );
  assert.throws(() => domain.appendCareSessionDoctorReply(session, '   '), /needs text/u);
});

test('unread replies are counted from the read mark', () => {
  const session = domain.appendCareSessionDoctorReply(
    humanSession(),
    'Come to the clinic tomorrow morning.',
    '2026-11-03T12:10:00.000Z',
  );
  assert.equal(domain.careSessionUnreadCount(session, null), 1);
  assert.equal(domain.careSessionUnreadCount(session, '2026-11-03T12:05:00.000Z'), 1);
  assert.equal(domain.careSessionUnreadCount(session, '2026-11-03T12:10:00.000Z'), 0);
  assert.equal(domain.careSessionUnreadCount(session, '2026-11-03T12:11:00.000Z'), 0);
});

test('a human session waits for the doctor only while its last turn is the patient\'s', () => {
  const waiting = humanSession();
  assert.equal(domain.careSessionAwaitingDoctorReply(waiting), true);
  const replied = domain.appendCareSessionDoctorReply(waiting, 'Noted.', '2026-11-03T12:10:00.000Z');
  assert.equal(domain.careSessionAwaitingDoctorReply(replied), false);
  const ended = domain.endCareSession(replied, { endedAt: '2026-11-03T12:20:00.000Z' });
  assert.equal(domain.careSessionAwaitingDoctorReply(ended), false);
});

test('starting a human consultation reuses the open conversation with the same doctor', () => {
  const store = domain.createMemoryCareSessionStore();
  const first = store.startHumanConsultation({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'Chest tightness',
    startedAt: '2026-11-03T12:00:00.000Z',
  });
  const second = store.startHumanConsultation({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'It is worse after climbing stairs',
    startedAt: '2026-11-03T12:05:00.000Z',
  });
  assert.equal(second.id, first.id, 'a second reason joins the open conversation');
  assert.equal(second.transcript.length, 2);
  assert.equal(store.list().length, 1);

  const other = store.startHumanConsultation({
    member: MEMBER,
    doctor: OTHER_DOCTOR,
    reason: 'Child has a fever',
    startedAt: '2026-11-03T12:06:00.000Z',
  });
  assert.notEqual(other.id, first.id);
  assert.equal(store.list().length, 2);
  assert.equal(store.findActiveByDoctor(MEMBER.id, OTHER_DOCTOR.id)?.id, other.id);
});

test('a stale human consultation starts a new one', () => {
  const store = domain.createMemoryCareSessionStore();
  const first = store.startHumanConsultation({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'Chest tightness',
    startedAt: '2026-11-02T12:00:00.000Z',
  });
  const second = store.startHumanConsultation({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'Chest tightness again',
    startedAt: '2026-11-03T12:00:00.000Z',
  });
  assert.notEqual(second.id, first.id);
  assert.equal(store.list().length, 2);
});

test('the AI visit finder never returns a human consultation', () => {
  const store = domain.createMemoryCareSessionStore();
  const human = store.startHumanConsultation({
    member: MEMBER,
    doctor: DOCTOR,
    reason: 'Chest tightness',
    startedAt: '2026-11-03T12:00:00.000Z',
  });
  assert.equal(store.findActive(MEMBER.id), null);
  assert.equal(store.findActiveByDoctor(MEMBER.id, DOCTOR.id)?.id, human.id);
  const ai = store.ensureActive({
    member: MEMBER,
    mode: 'offline',
    now: '2026-11-03T12:01:00.000Z',
  });
  assert.notEqual(ai.id, human.id);
  assert.equal(ai.mode, 'offline');
  assert.equal(store.findActive(MEMBER.id)?.id, ai.id);
});

test('doctor attribution and the human mode survive a storage round-trip', () => {
  const session = domain.appendCareSessionDoctorReply(
    humanSession(),
    'Come in tomorrow.',
    '2026-11-03T12:10:00.000Z',
  );
  const parsed = domain.parseCareSessions(domain.serializeCareSessions([session]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].mode, 'human');
  assert.deepEqual(parsed[0].doctor, {
    id: DOCTOR.id,
    displayName: DOCTOR.displayName,
    department: 'Cardiology',
    hospitalName: 'SDKWork Care Network',
    organizationId: 'org-sdkwork-care',
    employmentType: 'full_time',
    avatarUrl: '/avatars/doctor-lin-qinghe.png',
  });
  assert.equal(parsed[0].transcript[1].role, 'assistant');
});

test('a human session without a doctor is not invented from storage', () => {
  const raw = JSON.stringify([{
    id: 'session-x',
    memberId: MEMBER.id,
    memberLabel: 'Xiaoman (child)',
    mode: 'human',
    title: 'Chest tightness',
    status: 'active',
    startedAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    transcript: [],
    calls: [],
  }]);
  const parsed = domain.parseCareSessions(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].doctor, undefined);
});

test('read marks persist per session and ignore malformed entries', () => {
  let stored = '';
  const reads = domain.createCareSessionReadStore({
    read: () => stored,
    write: (value) => { stored = value; },
  });
  assert.equal(reads.lastReadAt('session-a'), null);
  reads.markRead('session-a', '2026-11-03T12:10:00.000Z');
  reads.markRead('session-b', '2026-11-03T12:11:00.000Z');
  assert.equal(reads.lastReadAt('session-a'), '2026-11-03T12:10:00.000Z');
  assert.deepEqual(
    domain.parseCareSessionReads(stored),
    { 'session-a': '2026-11-03T12:10:00.000Z', 'session-b': '2026-11-03T12:11:00.000Z' },
  );
  reads.forget('session-a');
  assert.deepEqual(domain.parseCareSessionReads(stored), { 'session-b': '2026-11-03T12:11:00.000Z' });
  assert.deepEqual(
    domain.parseCareSessionReads('{"bad":"not-a-date","ok":"2026-11-03T12:10:00.000Z"}'),
    { ok: '2026-11-03T12:10:00.000Z' },
  );

  let notified = 0;
  const unsubscribe = reads.subscribe(() => { notified += 1; });
  reads.markRead('session-c', '2026-11-03T12:12:00.000Z');
  assert.equal(notified, 1);
  unsubscribe();
});

test('the playback timeline orders messages and call segments from the session start', () => {
  const session = domain.appendCareSessionMessage(
    domain.createCareSession({
      member: MEMBER,
      mode: 'offline',
      startedAt: '2026-11-03T12:00:00.000Z',
      id: 'session-playback',
    }),
    {
      role: 'patient',
      text: 'Child has had a fever since last night',
      at: '2026-11-03T12:00:10.000Z',
      channel: 'voice',
      level: 'urgent',
    },
  );
  const withReply = domain.appendCareSessionMessage(session, {
    role: 'assistant',
    text: 'Contact a clinician today.',
    at: '2026-11-03T12:00:20.000Z',
  });
  const withCall = domain.endCareSessionCall(
    domain.startCareSessionCall(withReply, 'voice', '2026-11-03T12:00:30.000Z'),
    'call-' + Date.parse('2026-11-03T12:00:30.000Z') + '-1',
    '2026-11-03T12:02:30.000Z',
  );
  const ended = domain.appendCareSessionMessage(withCall, {
    role: 'patient',
    text: 'Thank you',
    at: '2026-11-03T12:03:00.000Z',
    channel: 'text',
  });
  const timeline = domain.buildCarePlayback(ended);
  assert.deepEqual(timeline.map((item) => item.kind), ['message', 'message', 'call', 'message']);
  assert.deepEqual(timeline.map((item) => item.offsetMs), [10000, 20000, 30000, 180000]);
  assert.equal(timeline[0].channel, 'voice');
  assert.equal(timeline[0].level, 'urgent');
  assert.equal(timeline[2].mode, 'voice');
  assert.equal(timeline[2].durationMs, 120000);
  assert.equal(timeline[2].open, false);
});

test('a 病历 that predates the session store is synthesized, never dropped', () => {
  const record = {
    id: 'case-legacy',
    sessionId: 'session-legacy',
    memberId: MEMBER.id,
    memberLabel: 'Xiaoman (child)',
    mode: 'offline',
    startedAt: '2026-11-03T11:00:00.000Z',
    endedAt: '2026-11-03T11:18:00.000Z',
    summary: 'Fever discussed.',
    transcript: [{
      id: 'entry-1',
      role: 'patient',
      text: 'Fever since last night',
      at: '2026-11-03T11:01:00.000Z',
      level: 'urgent',
    }],
    attachments: [],
    aiDiagnosis: { id: 'ai-1', source: 'ai', impression: 'Febrile', conditions: [], recommendations: [], level: 'urgent', createdAt: '2026-11-03T11:18:00.000Z' },
    status: 'awaiting_doctor',
  };
  const synthesized = domain.buildCareSessionFromMedicalRecord(record);
  assert.equal(synthesized.id, 'session-legacy');
  assert.equal(synthesized.medicalRecordId, 'case-legacy');
  assert.equal(synthesized.status, 'ended');
  assert.equal(synthesized.transcript[0].channel, 'text');

  const merged = domain.mergeCareSessions([], [record]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Fever since last night');
  assert.equal(domain.careSessionRecord(merged[0], [record])?.id, 'case-legacy');

  const linked = domain.mergeCareSessions([
    domain.createCareSession({
      member: MEMBER,
      mode: 'offline',
      startedAt: '2026-11-03T11:00:00.000Z',
      id: 'session-legacy',
    }),
  ], [record]);
  assert.equal(linked.length, 1, 'the session and its 病历 stay one row');
  assert.equal(linked[0].medicalRecordId, 'case-legacy');
});

test('a named session id starts a new visit instead of inheriting the open one', () => {
  const store = domain.createMemoryCareSessionStore();
  const first = store.ensureActive({
    member: MEMBER,
    mode: 'offline',
    sessionId: 'conversation-a',
    now: '2026-11-03T12:00:00.000Z',
  });
  const second = store.ensureActive({
    member: MEMBER,
    mode: 'offline',
    sessionId: 'conversation-b',
    now: '2026-11-03T12:01:00.000Z',
  });
  assert.notEqual(second.id, first.id);
  assert.equal(store.list().length, 2);
  assert.equal(store.findActive(MEMBER.id)?.id, second.id);
});

test('the mini program port replays and merges the same session shape', () => {
  const mp = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/care-sessions.js'));
  assert.equal(mp.CARE_SESSIONS_STORAGE_KEY, domain.CARE_SESSIONS_STORAGE_KEY);
  assert.equal(mp.CARE_SESSION_LIMIT, domain.CARE_SESSION_LIMIT);
  const session = mp.appendCareSessionMessage(
    mp.createCareSession({
      member: MEMBER,
      mode: 'offline',
      startedAt: '2026-11-03T12:00:00.000Z',
      id: 'session-mp',
    }),
    {
      role: 'patient',
      text: 'Fever since last night',
      at: '2026-11-03T12:00:30.000Z',
      channel: 'voice',
      level: 'urgent',
    },
  );
  const timeline = mp.buildCarePlayback(session);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].offsetMs, 30000);
  assert.equal(timeline[0].channel, 'voice');
  const roundTrip = mp.parseCareSessions(mp.serializeCareSessions([session]));
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].transcript[0].level, 'urgent');
});

