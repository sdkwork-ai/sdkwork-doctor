import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const commonRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor';
const agentRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent';
const schema = JSON.parse(fs.readFileSync(
  path.join(repoRoot, commonRoot, 'contracts/medical-record.schema.json'),
  'utf8',
));
const domain = await import(new URL('file:///' + path.join(repoRoot, commonRoot, 'src/medical-records.ts').replaceAll('\\', '/')).href);
const attachmentsDomain = await import(new URL('file:///' + path.join(repoRoot, commonRoot, 'src/medical-attachments.ts').replaceAll('\\', '/')).href);
const summary = await import(new URL('file:///' + path.join(repoRoot, agentRoot, 'src/summary.ts').replaceAll('\\', '/')).href);
const mpDomain = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/medical-records.js'));
const mpSummary = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/summary.js'));

const MEMBER = Object.freeze({
  id: 'member-child',
  displayName: 'Xiaoman',
  relation: 'child',
  birthYear: 2019,
  sex: 'female',
  allergies: ['penicillin'],
  chronicConditions: [],
  medications: ['vitamin D'],
});

function transcript() {
  return [
    domain.createMedicalTranscriptEntry({
      id: 'entry-1',
      role: 'patient',
      text: 'Child has had a 39C fever since last night',
      at: '2026-11-03T11:01:00.000Z',
      level: 'urgent',
    }),
    domain.createMedicalTranscriptEntry({
      id: 'entry-2',
      role: 'assistant',
      text: 'Contact a clinician today.',
      at: '2026-11-03T11:02:00.000Z',
    }),
  ];
}

function attachment() {
  return domain.createMedicalAttachment({
    id: 'attachment-1',
    name: 'thermometer.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    addedAt: '2026-11-03T11:03:00.000Z',
  });
}

function record(overrides = {}) {
  return domain.createMedicalRecord({
    member: MEMBER,
    mode: 'offline',
    sessionId: 'session-1',
    startedAt: '2026-11-03T11:00:00.000Z',
    endedAt: '2026-11-03T11:18:00.000Z',
    summary: 'Two turns about a 39C fever since last night.',
    transcript: transcript(),
    attachments: [attachment()],
    diagnosis: {
      impression: 'Febrile child; a same-day clinician review is advised.',
      conditions: ['Respiratory infection'],
      recommendations: ['Contact a clinician today.'],
      level: 'urgent',
    },
    id: 'case-1',
    ...overrides,
  });
}

test('the schema pins the record, diagnosis, and attachment shape', () => {
  assert.equal(schema.kind, 'sdkwork.doctor.medical-record');
  assert.equal(schema.storageKey, domain.MEDICAL_RECORDS_STORAGE_KEY);
  assert.equal(schema.limit, domain.MEDICAL_RECORD_LIMIT);
  assert.deepEqual(Object.keys(record()).sort(), [...schema.record.required].sort());
  assert.deepEqual(
    Object.keys(record().aiDiagnosis).sort(),
    ['conditions', 'createdAt', 'id', 'impression', 'level', 'recommendations', 'source'].sort(),
  );
  assert.equal(record().status, 'awaiting_doctor');
  assert.equal(record().aiDiagnosis.source, 'ai');
  assert.equal(record().transcript.length, 2);
  assert.equal(record().attachments.length, 1);
});

test('creating a 病历 rejects a record without evidence', () => {
  assert.throws(() => record({ transcript: [] }), /transcript/u);
  assert.throws(() => record({ summary: '   ' }), /summary/u);
  assert.throws(() => record({ mode: 'pigeon' }), /mode/u);
  assert.throws(() => record({ diagnosis: { impression: '', level: 'urgent' } }), /impression/u);
  assert.throws(
    () => domain.createMedicalTranscriptEntry({ role: 'patient', text: '' }),
    /text or an attachment/u,
  );
});

test('a doctor accepts the AI diagnosis without inventing a doctor diagnosis', () => {
  const next = domain.confirmAiDiagnosis(record(), {
    doctorLabel: 'Lin Qinghe',
    decision: 'confirmed',
    confirmedAt: '2026-11-03T12:00:00.000Z',
  });
  assert.equal(next.status, 'confirmed');
  assert.equal(next.confirmation.decision, 'confirmed');
  assert.equal(next.confirmation.diagnosisId, next.aiDiagnosis.id);
  assert.equal(next.confirmation.doctorLabel, 'Lin Qinghe');
  assert.equal(next.doctorDiagnosis, undefined);
  assert.deepEqual(next.aiDiagnosis, record().aiDiagnosis, 'the AI diagnosis is preserved verbatim');
});

test('amending stores the doctor diagnosis beside the untouched AI one', () => {
  const original = record();
  const next = domain.confirmAiDiagnosis(original, {
    doctorLabel: 'Lin Qinghe',
    decision: 'amended',
    confirmedAt: '2026-11-03T12:00:00.000Z',
    doctorDiagnosis: {
      doctorLabel: 'Lin Qinghe',
      impression: 'Viral upper respiratory infection; review in 24 hours.',
      conditions: ['Viral URI'],
      recommendations: ['Hydration', 'Antipyretics per weight'],
      level: 'routine',
      notes: 'Penicillin allergy noted.',
    },
  });
  assert.equal(next.status, 'confirmed');
  assert.equal(next.confirmation.decision, 'amended');
  assert.equal(next.doctorDiagnosis.source, 'doctor');
  assert.equal(next.doctorDiagnosis.basisDiagnosisId, original.aiDiagnosis.id);
  assert.equal(next.confirmation.doctorDiagnosisId, next.doctorDiagnosis.id);
  assert.deepEqual(next.aiDiagnosis, original.aiDiagnosis);
  assert.throws(
    () => domain.confirmAiDiagnosis(original, { doctorLabel: 'Lin', decision: 'amended' }),
    /doctor diagnosis/u,
  );
  assert.throws(() => domain.confirmAiDiagnosis(original, { doctorLabel: ' ', decision: 'confirmed' }), /doctor label/u);
});

test('a doctor may record an independent diagnosis while the AI one is unreviewed', () => {
  const original = record();
  const next = domain.addDoctorDiagnosis(original, {
    doctorLabel: 'Su Wanning',
    impression: 'Likely viral illness.',
    level: 'routine',
    createdAt: '2026-11-03T12:10:00.000Z',
  });
  assert.equal(next.status, 'awaiting_doctor');
  assert.equal(next.doctorDiagnosis.doctorLabel, 'Su Wanning');
  assert.equal(next.confirmation, undefined);
  assert.equal(domain.medicalRecordNeedsDoctorReview(next), true);

  const confirmed = domain.confirmAiDiagnosis(next, { doctorLabel: 'Su Wanning', decision: 'confirmed' });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmation.doctorDiagnosisId, confirmed.doctorDiagnosis.id);
});

test('parsing keeps a good record and drops a corrupt one', () => {
  const accepted = domain.confirmAiDiagnosis(record(), { doctorLabel: 'Lin Qinghe', decision: 'confirmed' });
  const roundTrip = domain.parseMedicalRecords(JSON.stringify([accepted, { id: 'x' }, 7]));
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].status, 'confirmed');
  assert.equal(roundTrip[0].attachments[0].name, 'thermometer.jpg');
  assert.equal(domain.parseMedicalRecords('{not json').length, 0);
  assert.equal(domain.parseMedicalRecords(JSON.stringify([{ ...accepted, status: 'awaiting_doctor' }])).length, 0);
  assert.equal(domain.parseMedicalRecords(JSON.stringify([{ ...accepted, aiDiagnosis: { ...accepted.aiDiagnosis, source: 'doctor' } }])).length, 0);
});

test('the store saves a doctor review in place and notifies', () => {
  let stored = null;
  const store = domain.createMedicalRecordStore({ read: () => stored, write: (value) => { stored = value; } });
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  store.add(record());
  assert.equal(store.list().length, 1);
  const next = domain.confirmAiDiagnosis(store.list()[0], { doctorLabel: 'Lin', decision: 'confirmed' });
  store.save(next);
  assert.equal(store.list().length, 1, 'a review replaces the record');
  assert.equal(store.list()[0].status, 'confirmed');
  assert.equal(notifications, 2);
  const reloaded = domain.createMedicalRecordStore({ read: () => stored, write: () => undefined });
  assert.equal(reloaded.list()[0].status, 'confirmed');
});

test('attachment metadata classifies the three kinds and rejects a nameless file', () => {
  assert.equal(domain.medicalAttachmentKind('image/png'), 'image');
  assert.equal(domain.medicalAttachmentKind('video/mp4'), 'video');
  assert.equal(domain.medicalAttachmentKind('application/pdf'), 'file');
  assert.equal(attachment().sizeBytes, 2048);
  assert.throws(() => domain.createMedicalAttachment({ name: '  ' }), /file name/u);
  const store = attachmentsDomain.createMemoryMedicalAttachmentStore();
  return store.put({ file: new Blob(['abc'], { type: 'text/plain' }), name: 'note.txt' })
    .then(async (created) => {
      assert.equal(created.kind, 'file');
      const blob = await store.read(created);
      assert.equal(await blob.text(), 'abc');
      await store.remove(created.id);
      assert.equal(await store.read(created), null);
    });
});

test('the offline summary states that a doctor must assess the patient', async () => {
  const draft = await summary.offlineCareSummary({
    member: MEMBER,
    transcript: [
      { role: 'user', text: 'Child has had a high fever since last night' },
      { role: 'assistant', text: 'Contact a clinician today.' },
    ],
  });
  assert.equal(draft.source, 'offline');
  assert.match(draft.summary, /must be reviewed by a doctor/iu);
  assert.match(draft.diagnosis.impression, /No definitive diagnosis was made offline/iu);
  assert.equal(draft.diagnosis.level, 'urgent');
  assert.ok(draft.diagnosis.recommendations.length > 0);
});

test('the hosted summary parser clamps a model answer to the triage floor', () => {
  const input = {
    member: MEMBER,
    transcript: [{ role: 'user', text: 'chest pain for 10 minutes' }],
  };
  const lowered = summary.parseCareSummaryReply(JSON.stringify({
    summary: 'Chest pain discussed.',
    impression: 'Muscular pain.',
    conditions: ['Muscle strain'],
    recommendations: ['Rest'],
    level: 'routine',
  }), input);
  assert.equal(lowered.diagnosis.level, 'emergency', 'the deterministic floor wins');
  const raised = summary.parseCareSummaryReply(JSON.stringify({
    summary: 'Mild headache discussed.',
    impression: 'Tension headache.',
    conditions: ['Tension headache'],
    recommendations: ['Hydration'],
    level: 'urgent',
  }), { member: MEMBER, transcript: [{ role: 'user', text: 'mild headache' }] });
  assert.equal(raised.diagnosis.level, 'urgent');
  assert.equal(summary.parseCareSummaryReply('not json', input), null);
  assert.equal(summary.parseCareSummaryReply('```json\n{"summary":"x"}\n```', input), null);
});

test('the mini program emits the same record shape and the same summary contract', () => {
  assert.equal(mpDomain.MEDICAL_RECORDS_STORAGE_KEY, schema.storageKey);
  assert.equal(mpDomain.MEDICAL_RECORD_LIMIT, schema.limit);
  const tsRecord = record();
  const mpRecord = mpDomain.createMedicalRecord({
    member: MEMBER,
    mode: 'offline',
    sessionId: 'session-1',
    startedAt: '2026-11-03T11:00:00.000Z',
    endedAt: '2026-11-03T11:18:00.000Z',
    summary: tsRecord.summary,
    transcript: [
      {
        id: 'entry-1',
        role: 'patient',
        text: 'Child has had a 39C fever since last night',
        at: '2026-11-03T11:01:00.000Z',
        level: 'urgent',
      },
      {
        id: 'entry-2',
        role: 'assistant',
        text: 'Contact a clinician today.',
        at: '2026-11-03T11:02:00.000Z',
      },
    ],
    attachments: [{
      id: 'attachment-1',
      kind: 'image',
      name: 'thermometer.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      addedAt: '2026-11-03T11:03:00.000Z',
    }],
    diagnosis: {
      impression: tsRecord.aiDiagnosis.impression,
      conditions: ['Respiratory infection'],
      recommendations: ['Contact a clinician today.'],
      level: 'urgent',
    },
    id: 'case-1',
  });
  assert.deepEqual(Object.keys(mpRecord).sort(), Object.keys(tsRecord).sort());
  assert.deepEqual(Object.keys(mpRecord.aiDiagnosis).sort(), Object.keys(tsRecord.aiDiagnosis).sort());
  const confirmed = mpDomain.confirmAiDiagnosis(mpRecord, {
    doctorLabel: 'Lin Qinghe',
    decision: 'confirmed',
    confirmedAt: '2026-11-03T12:00:00.000Z',
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmation.diagnosisId, confirmed.aiDiagnosis.id);
  assert.equal(mpDomain.parseMedicalRecords(JSON.stringify([confirmed])).length, 1);
  assert.equal(mpDomain.parseMedicalRecords('{not json').length, 0);

  const draft = mpSummary.offlineSummary({
    member: MEMBER,
    transcript: [{ role: 'user', text: 'chest pain for 10 minutes' }],
  });
  assert.equal(draft.source, 'offline');
  assert.equal(draft.diagnosis.level, 'emergency');
  assert.match(draft.summary, /must be reviewed by a doctor/iu);
});

test('every client carries the end-conversation action and the two-diagnosis record', () => {
  const pcCare = fs.readFileSync(path.join(repoRoot, 'apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-care/src/index.tsx'), 'utf8');
  const h5Care = fs.readFileSync(path.join(repoRoot, 'apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/src/index.tsx'), 'utf8');
  for (const source of [pcCare, h5Care]) {
    assert.match(source, /platform\.care\.medical\.endAction/u);
    assert.match(source, /medical\.summarize|agent\s*\.summarize|summarize\(/u);
    assert.match(source, /MedicalRecordsSection/u);
    assert.match(source, /createMedicalRecord/u);
  }
  for (const file of [
    'apps/sdkwork-doctor-mini-program/src/lib/medical-records.js',
    'apps/sdkwork-doctor-mini-program/src/lib/summary.js',
    'apps/sdkwork-doctor-mini-program/src/lib/attachments.js',
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, file)), file + ' must exist');
  }
  const mpConversation = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/pages/conversation/index.js'),
    'utf8',
  );
  assert.match(mpConversation, /createMedicalRecord/u);
  assert.match(mpConversation, /platform\.care\.medical\.endAction/u);
  assert.match(mpConversation, /chooseAttachments/u);

  const flutterStore = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile/lib/records/medical_record_store.dart'),
    'utf8',
  );
  assert.match(flutterStore, /sdkwork\.doctor\.medical-records\.v1/u);
  assert.match(flutterStore, /confirmAiDiagnosis/u);
  assert.match(flutterStore, /addDoctorDiagnosis/u);
  const flutterChat = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile/lib/ui/chat_tab.dart'),
    'utf8',
  );
  assert.match(flutterChat, /platform\.care\.medical\.endAction/u);
  assert.match(flutterChat, /summarizeCareConversation/u);
  const flutterRecords = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile/lib/ui/records_screen.dart'),
    'utf8',
  );
  assert.match(flutterRecords, /platform\.care\.records\.title/u);
  const flutterDetail = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile/lib/ui/record_detail_screen.dart'),
    'utf8',
  );
  assert.match(flutterDetail, /platform\.care\.medical\.aiDiagnosis/u);
  assert.match(flutterDetail, /platform\.care\.medical\.doctorDiagnosis/u);
  assert.match(flutterDetail, /platform\.care\.record\.tab\.playback/u);
});
