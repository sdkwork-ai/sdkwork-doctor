import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const records = require(path.join(root, 'src', 'lib', 'visit-records.js'));
const patients = require(path.join(root, 'src', 'lib', 'patient-profiles.js'));

const schema = JSON.parse(fs.readFileSync(
  path.resolve(
    root,
    '..',
    'sdkwork-doctor-common',
    'packages',
    'sdkwork-doctor-common-doctor',
    'contracts',
    'visit-record.schema.json',
  ),
  'utf8',
));

const MEMBER = patients.createPatientProfile({
  displayName: 'Xiaoman',
  relation: 'child',
  birthYear: 2019,
  sex: 'female',
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

test('a plain record still emits exactly the required schema fields', () => {
  assert.equal(records.VISIT_RECORDS_STORAGE_KEY, schema.storageKey);
  assert.equal(records.VISIT_RECORD_LIMIT, schema.limit);
  assert.deepEqual(Object.keys(record()).sort(), [...schema.required].sort());
  assert.equal(record().memberLabel, 'Xiaoman (child)');
});

test('a human consultation keeps the doctor, site, and engagement and round-trips', () => {
  const value = record({
    mode: 'human',
    symptom: 'chest tightness after dinner',
    advice: 'Human consultation requested with Lin Qinghe.',
    level: 'routine',
    doctorId: 'doctor-lin-qinghe',
    doctorLabel: 'Lin Qinghe · Cardiology',
    doctorOrganizationId: 'org-sdkwork-care-network',
    doctorHospitalLabel: 'SDKWork Care Network',
    doctorEmploymentType: 'full_time',
  });
  assert.equal(value.mode, 'human');
  assert.equal(value.doctorId, 'doctor-lin-qinghe');
  assert.equal(value.doctorLabel, 'Lin Qinghe · Cardiology');
  assert.equal(value.doctorOrganizationId, 'org-sdkwork-care-network');
  assert.equal(value.doctorHospitalLabel, 'SDKWork Care Network');
  assert.equal(value.doctorEmploymentType, 'full_time');
  const optional = Object.keys(schema.fields).filter((field) => !schema.required.includes(field))
    .filter((field) => field.indexOf('doctor') === 0)
    .sort();
  assert.deepEqual(Object.keys(value).sort(), [...schema.required, ...optional].sort());

  const roundTrip = records.parseVisitRecords(JSON.stringify([value]));
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].mode, 'human');
  assert.equal(roundTrip[0].doctorId, 'doctor-lin-qinghe');
  assert.equal(roundTrip[0].doctorLabel, 'Lin Qinghe · Cardiology');
  assert.equal(roundTrip[0].doctorOrganizationId, 'org-sdkwork-care-network');
  assert.equal(roundTrip[0].doctorHospitalLabel, 'SDKWork Care Network');
  assert.equal(roundTrip[0].doctorEmploymentType, 'full_time');
});

test('a human record without a doctor omits every optional field', () => {
  const value = record({ mode: 'human' });
  for (const field of ['doctorId', 'doctorLabel', 'doctorOrganizationId', 'doctorHospitalLabel', 'doctorEmploymentType']) {
    assert.equal(field in value, false, field + ' stays optional');
  }
  assert.deepEqual(Object.keys(value).sort(), [...schema.required].sort());
});

test('parsing drops corrupt records, unknown modes, and blank doctor fields', () => {
  assert.deepEqual(records.parseVisitRecords('{not json'), []);
  assert.deepEqual(records.parseVisitRecords(''), []);
  assert.deepEqual(records.parseVisitRecords(null), []);
  const mixed = JSON.stringify([record(), { id: 'x' }, 42, null]);
  assert.equal(records.parseVisitRecords(mixed).length, 1);
  assert.equal(records.parseVisitRecords(JSON.stringify([{ ...record(), mode: 'pigeon' }])).length, 0);

  const blankDoctor = JSON.parse(JSON.stringify([{
    ...record({ mode: 'human' }),
    doctorId: '   ',
    doctorLabel: '  ',
    doctorOrganizationId: ' ',
    doctorHospitalLabel: '',
    doctorEmploymentType: '  ',
  }]));
  const parsed = records.parseVisitRecords(blankDoctor)[0];
  for (const field of ['doctorId', 'doctorLabel', 'doctorOrganizationId', 'doctorHospitalLabel', 'doctorEmploymentType']) {
    assert.equal(field in parsed, false, field + ' is omitted when blank');
  }
});

test('the store persists a human record through its adapter', () => {
  const memory = new Map();
  const storage = {
    read: (key) => (memory.has(key) ? memory.get(key) : null),
    write: (key, value) => {
      memory.set(key, value);
    },
  };
  const store = records.createVisitRecordStore(storage);
  store.add(record({
    id: 'human-1',
    mode: 'human',
    doctorId: 'doctor-he-zhiyuan',
    doctorLabel: 'He Zhiyuan · General practice',
    doctorOrganizationId: 'org-sdkwork-community-clinic',
    doctorHospitalLabel: 'SDKWork Community Clinic',
    doctorEmploymentType: 'part_time',
  }));

  const reloaded = records.createVisitRecordStore(storage);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].mode, 'human');
  assert.equal(reloaded.list()[0].doctorId, 'doctor-he-zhiyuan');
  assert.equal(reloaded.list()[0].doctorHospitalLabel, 'SDKWork Community Clinic');
  assert.equal(reloaded.list()[0].doctorEmploymentType, 'part_time');
});

test('records stay newest first, de-duplicated, and capped', () => {
  const once = records.appendVisitRecord([record({ id: 'a' })], record({ id: 'b' }));
  assert.deepEqual(once.map((entry) => entry.id), ['b', 'a']);
  const replaced = records.appendVisitRecord(once, record({ id: 'a', symptom: 'updated' }));
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0].symptom, 'updated');
  const many = Array.from({ length: 5 }, (_, index) => record({ id: 'id-' + String(index) }));
  assert.equal(records.appendVisitRecord(many, record({ id: 'new' }), 3).length, 3);
});
