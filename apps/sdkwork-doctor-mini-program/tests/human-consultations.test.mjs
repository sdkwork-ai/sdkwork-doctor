import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const {
  createHumanConsultationStore,
  previewText,
} = require(path.join(root, 'src', 'lib', 'human-consultations.js'));

function memoryAdapter() {
  let stored = '';
  return {
    read: () => stored,
    write: (value) => { stored = value; },
    dump: () => stored,
  };
}

const LIN = {
  id: 'doctor-lin-qinghe',
  displayName: 'Lin Qinghe',
  department: 'Cardiology',
  hospitalName: 'SDKWork Care Network',
  organizationId: 'org-sdkwork-care-network',
  employmentType: 'full_time',
};

test('a human consultation stores its doctor, member, and opening reason', () => {
  const store = createHumanConsultationStore(memoryAdapter());
  const session = store.start({
    doctor: LIN,
    memberLabel: '本人 · Me',
    reason: 'chest tightness after dinner',
  });
  assert.equal(session.doctor.id, LIN.id);
  assert.equal(session.doctor.displayName, 'Lin Qinghe');
  assert.equal(session.doctor.department, 'Cardiology');
  assert.equal(session.title, 'chest tightness after dinner');
  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0].isUser, true);
  assert.equal(session.unreadCount, 0);
  assert.equal(previewText(session.preview), 'chest tightness after dinner');
});

test('a second reason continues the open conversation with the same doctor', () => {
  const store = createHumanConsultationStore(memoryAdapter());
  const first = store.start({ doctor: LIN, memberLabel: 'Me', reason: 'chest tightness' });
  const second = store.start({ doctor: LIN, memberLabel: 'Me', reason: 'worse at night' });
  assert.equal(second.id, first.id);
  assert.equal(store.list().length, 1);
  assert.equal(store.messages(first.id).length, 2);
});

test('a doctor reply is unread until the family opens the conversation', () => {
  const store = createHumanConsultationStore(memoryAdapter());
  const session = store.start({ doctor: LIN, memberLabel: 'Me', reason: 'chest tightness' });
  store.appendDoctorReply(session.id, 'Come in tomorrow.');
  assert.equal(store.find(session.id).unreadCount, 1);
  assert.equal(store.unreadTotal(), 1);
  store.markRead(session.id);
  assert.equal(store.find(session.id).unreadCount, 0);
  assert.equal(store.unreadTotal(), 0);
  assert.equal(store.messages(session.id).filter((message) => !message.isUser).length, 1);
});

test('ending a consultation keeps the transcript and refuses new turns', () => {
  const store = createHumanConsultationStore(memoryAdapter());
  const session = store.start({ doctor: LIN, memberLabel: 'Me', reason: 'chest tightness' });
  store.end(session.id);
  assert.equal(store.find(session.id).status, 'ended');
  store.appendPatientMessage(session.id, 'Are you there?');
  assert.equal(store.messages(session.id).length, 1);
});

test('consultations persist across a store restart', () => {
  const adapter = memoryAdapter();
  const first = createHumanConsultationStore(adapter);
  const session = first.start({ doctor: LIN, memberLabel: 'Me', reason: 'chest tightness' });
  first.appendDoctorReply(session.id, 'Come in tomorrow.');

  const second = createHumanConsultationStore(adapter);
  const restored = second.list()[0];
  assert.equal(restored.id, session.id);
  assert.equal(restored.doctor.displayName, 'Lin Qinghe');
  assert.equal(restored.unreadCount, 1);
  assert.equal(second.messages(session.id).length, 2);

  const third = createHumanConsultationStore({ read: () => adapter.dump(), write: () => undefined });
  assert.equal(third.list().length, 1);
});
