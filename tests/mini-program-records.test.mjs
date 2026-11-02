import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/visit-record.schema.json'),
  'utf8',
));
const records = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/visit-records.js'));

const MEMBER = Object.freeze({
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  allergies: [],
  chronicConditions: [],
  medications: [],
});

function record(overrides = {}) {
  return records.createVisitRecord({
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

test('the mini program record matches the shared schema', () => {
  assert.equal(records.VISIT_RECORDS_STORAGE_KEY, schema.storageKey);
  assert.equal(records.VISIT_RECORD_LIMIT, schema.limit);
  assert.deepEqual(Object.keys(record()).sort(), [...schema.required].sort());
  assert.equal(records.parseVisitRecords('{not json').length, 0);
  assert.equal(records.parseVisitRecords(JSON.stringify([{ ...record(), mode: 'pigeon' }])).length, 0);
});

test('records are newest first, de-duplicated by id, and capped', () => {
  const once = records.appendVisitRecord([record({ id: 'a' })], record({ id: 'b' }));
  assert.deepEqual(once.map((entry) => entry.id), ['b', 'a']);
  const replaced = records.appendVisitRecord(once, record({ id: 'a', symptom: 'updated' }));
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].symptom, 'updated');
  const many = Array.from({ length: 5 }, (_, index) => record({ id: 'id-' + String(index) }));
  assert.equal(records.appendVisitRecord(many, record({ id: 'new' }), 3).length, 3);
});

test('the store persists across instances through its storage adapter', () => {
  const memory = new Map();
  const storage = {
    read: (key) => (memory.has(key) ? memory.get(key) : null),
    write: (key, value) => { memory.set(key, value); },
  };

  const store = records.createVisitRecordStore(storage);
  assert.equal(store.list().length, 0);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  store.add(record());
  assert.equal(store.list().length, 1);
  assert.equal(notifications, 1);

  const reloaded = records.createVisitRecordStore(storage);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].id, 'visit-1');

  store.clear();
  assert.equal(store.list().length, 0);
  assert.equal(records.createVisitRecordStore(storage).list().length, 0);

  const beforeUnsubscribe = notifications;
  unsubscribe();
  store.add(record({ id: 'visit-2' }));
  assert.equal(notifications, beforeUnsubscribe);
});

test('a throwing storage adapter degrades to the session copy', () => {
  const store = records.createVisitRecordStore({
    read: () => { throw new Error('blocked'); },
    write: () => { throw new Error('blocked'); },
  });
  assert.equal(store.list().length, 0);
  store.add(record());
  assert.equal(store.list().length, 1);
});

test('the conversation page records every completed consultation', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/pages/conversation/index.js'),
    'utf8',
  );
  assert.match(source, /createVisitRecord/u);
  assert.match(source, /globalData\.records/u);
  assert.match(source, /store\.add\(/u);
});

test('the records tab is registered with the generator-backed catalog', () => {
  const app = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/app.json'), 'utf8'));
  assert.ok(app.pages.includes('pages/records/index'));
  const tab = app.tabBar.list.find((entry) => entry.pagePath === 'pages/records/index');
  assert.ok(tab, 'the records tab must exist');
  assert.equal(tab.text, '记录');
  const page = fs.readFileSync(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/pages/records/index.js'), 'utf8');
  assert.match(page, /platform\.care\.records\.title/u);
  assert.match(page, /platform\.care\.records\.empty/u);
});
