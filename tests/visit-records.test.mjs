import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const contractRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor';
const schemaPath = path.join(repoRoot, contractRoot, 'contracts/visit-record.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const domain = await import(new URL('file:///' + path.join(repoRoot, contractRoot, 'src/visit-records.ts').replaceAll('\\', '/')).href);
const { demoSelfMember } = await import(new URL('file:///' + path.join(repoRoot, contractRoot, 'src/index.ts').replaceAll('\\', '/')).href);

const MEMBER = demoSelfMember;

function record(overrides = {}) {
  return domain.createVisitRecord({
    member: MEMBER,
    symptom: 'chest pain for 10 minutes',
    advice: 'Call local emergency services now.',
    level: 'emergency',
    mode: 'offline',
    id: 'visit-1',
    recordedAt: '2026-11-02T13:30:00.000Z',
    ...overrides,
  });
}

test('the shared schema pins every field the domain emits', () => {
  assert.equal(schema.kind, 'sdkwork.doctor.visit-record');
  assert.equal(schema.storageKey, domain.VISIT_RECORDS_STORAGE_KEY);
  assert.equal(schema.limit, domain.VISIT_RECORD_LIMIT);
  assert.deepEqual(Object.keys(record()).sort(), [...schema.required].sort());
  assert.deepEqual(Object.keys(schema.fields).sort(), [...schema.required].sort());
});

test('a record carries the member label, level, and transport mode', () => {
  const value = record();
  assert.equal(value.symptom, 'chest pain for 10 minutes');
  assert.equal(value.level, 'emergency');
  assert.equal(value.mode, 'offline');
  assert.equal(value.memberId, MEMBER.id);
  assert.equal(value.memberLabel, 'Me (self)');
  assert.ok(!Number.isNaN(Date.parse(value.recordedAt)));
});

test('creating a record rejects an empty symptom, empty advice, and unknown modes', () => {
  assert.throws(() => record({ symptom: '   ' }), /symptom/u);
  assert.throws(() => record({ advice: '   ' }), /advice/u);
  assert.throws(() => record({ mode: 'pigeon' }), /transport mode/u);
  assert.throws(() => record({ level: 'panic' }), /triage level/u);
});

test('records are newest first, de-duplicated by id, and capped', () => {
  const first = record({ id: 'a', symptom: 'first' });
  const second = record({ id: 'b', symptom: 'second' });
  const once = domain.appendVisitRecord([first], second);
  assert.deepEqual(once.map((entry) => entry.id), ['b', 'a']);

  const replaced = domain.appendVisitRecord(once, record({ id: 'a', symptom: 'updated' }));
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].id, 'a');
  assert.equal(replaced[0].symptom, 'updated');

  const many = Array.from({ length: 5 }, (_, index) => record({ id: 'id-' + String(index) }));
  assert.equal(domain.appendVisitRecord(many, record({ id: 'new' }), 3).length, 3);
});

test('parsing drops corrupt storage instead of throwing', () => {
  assert.deepEqual(domain.parseVisitRecords('{not json'), []);
  assert.deepEqual(domain.parseVisitRecords(''), []);
  assert.deepEqual(domain.parseVisitRecords(null), []);
  const mixed = JSON.stringify([record(), { id: 'x' }, 42, null]);
  assert.equal(domain.parseVisitRecords(mixed).length, 1);
  assert.equal(domain.parseVisitRecords(JSON.stringify([{ ...record(), mode: 'pigeon' }])).length, 0);
});

test('the store persists, notifies, and clears through its adapter', () => {
  let stored = null;
  const store = domain.createVisitRecordStore({
    read: () => stored,
    write: (value) => { stored = value; },
  });
  assert.equal(store.list().length, 0);

  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });

  store.add(record());
  assert.equal(store.list().length, 1);
  assert.notEqual(stored, null);
  assert.equal(notifications, 1);

  const reloaded = domain.createVisitRecordStore({ read: () => stored, write: () => undefined });
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].id, 'visit-1');

  store.clear();
  assert.equal(store.list().length, 0);
  assert.equal(notifications, 2);

  unsubscribe();
  store.add(record({ id: 'visit-2' }));
  assert.equal(notifications, 2);
});

test('a throwing storage adapter degrades to the session copy', () => {
  const store = domain.createVisitRecordStore({
    read: () => { throw new Error('blocked'); },
    write: () => { throw new Error('blocked'); },
  });
  assert.deepEqual(store.list(), []);
  store.add(record());
  assert.equal(store.list().length, 1);
});

test('list() keeps a stable snapshot until the next mutation', () => {
  const store = domain.createVisitRecordStore(null);
  const before = store.list();
  assert.equal(store.list(), before, 'React useSyncExternalStore needs a stable snapshot');
  store.add(record());
  assert.notEqual(store.list(), before);
});
