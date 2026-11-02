import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const patients = require(path.join(root, 'src', 'lib', 'patient-profiles.js'));

const schema = JSON.parse(fs.readFileSync(
  path.resolve(
    root,
    '..',
    'sdkwork-doctor-common',
    'packages',
    'sdkwork-doctor-common-doctor',
    'contracts',
    'patient-profile.schema.json',
  ),
  'utf8',
));

/** Stubbed WeChat storage: the only wx surface the patient store touches. */
const memory = new Map();
globalThis.wx = {
  getStorageSync: (key) => (memory.has(key) ? memory.get(key) : ''),
  setStorageSync: (key, value) => {
    memory.set(key, value);
  },
};

function clearStorage() {
  memory.clear();
}

function readDocument() {
  const raw = memory.get(patients.PATIENT_PROFILES_STORAGE_KEY);
  return raw === undefined ? null : JSON.parse(raw);
}

const base = {
  displayName: 'Xiaoman',
  relation: 'child',
  birthYear: 2019,
  sex: 'female',
  allergies: ['penicillin'],
};

function memoryStore(initial) {
  return patients.createMemoryPatientProfileStore(initial);
}

test('the patient module pins the shared storage key, limit, and document', () => {
  assert.equal(patients.PATIENT_PROFILES_STORAGE_KEY, schema.storageKey);
  assert.equal(patients.PATIENT_PROFILE_LIMIT, schema.limit);
  assert.equal(patients.PATIENT_PROFILE_VERSION, schema.documentVersion);
  const profile = patients.createPatientProfile(base);
  for (const field of schema.required) {
    assert.ok(field in profile, 'a created profile carries ' + field);
  }
  assert.equal(profile.displayName, 'Xiaoman');
  assert.equal(profile.relation, 'child');
  assert.equal(profile.birthYear, 2019);
  assert.equal(profile.birthDate, null);
  assert.deepEqual(profile.allergies, ['penicillin']);
});

test('validation rejects the facts the app cannot safely store', () => {
  assert.throws(() => patients.createPatientProfile({ ...base, displayName: '  ' }), /display name/u);
  assert.throws(
    () => patients.createPatientProfile({ ...base, displayName: 'x'.repeat(41) }),
    /too long/u,
  );
  assert.throws(() => patients.createPatientProfile({ ...base, relation: 'cousin' }), /relation/u);
  assert.throws(() => patients.createPatientProfile({ ...base, sex: 'unknown' }), /sex/u);
  assert.throws(() => patients.createPatientProfile({ ...base, birthYear: 1899 }), /birth year/u);
  assert.throws(
    () => patients.createPatientProfile({ ...base, birthYear: new Date().getFullYear() + 1 }),
    /birth year/u,
  );
  assert.throws(() => patients.createPatientProfile({ ...base, birthYear: 2019.5 }), /birth year/u);
});

test('list fields are trimmed, de-duplicated, and split from both comma widths', () => {
  assert.deepEqual(patients.normalizeProfileList([' peanut ', 'Peanut', '', 'dust']), ['peanut', 'dust']);
  assert.deepEqual(patients.splitProfileField('penicillin, aspirin，dust、latex'), [
    'penicillin',
    'aspirin',
    'dust',
    'latex',
  ]);
  assert.deepEqual(patients.splitProfileField(undefined), []);
  const profile = patients.createPatientProfile({
    ...base,
    allergies: [' Penicillin ', 'penicillin', ''],
  });
  assert.deepEqual(profile.allergies, ['Penicillin'], 'the first spelling wins');
});

test('completeness counts the six care facts', () => {
  assert.equal(patients.patientProfileCompleteness(patients.createPatientProfile({ ...base, allergies: [] })), 17);
  const full = patients.createPatientProfile({
    ...base,
    birthDate: '2019-06-02',
    bloodType: 'O+',
    allergies: ['penicillin'],
    chronicConditions: ['asthma'],
    medications: ['salbutamol'],
    notes: 'Wheezing after colds.',
  });
  assert.equal(patients.patientProfileCompleteness(full), 100);
});

test('a first launch seeds exactly one self profile', () => {
  clearStorage();
  const store = patients.createPatientProfileStore();
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, 'member-self');
  assert.equal(store.getActiveId(), 'member-self');
  assert.equal(store.getActive().displayName, 'Me');
  assert.equal(store.getActive().relation, 'self');
  assert.equal(store.getActive().birthYear, 1990);
  assert.equal(store.getActive().sex, 'unspecified');
});

test('add, select, update, remove, and persistence survive a reload', () => {
  clearStorage();
  const store = patients.createPatientProfileStore();
  const child = store.add(base);
  assert.equal(store.list().length, 2);
  assert.equal(store.getActiveId(), 'member-self', 'adding does not steal the active patient');

  const document = readDocument();
  assert.equal(document.version, 1);
  assert.equal(document.activeId, 'member-self');
  assert.equal(document.profiles.length, 2);

  store.select(child.id);
  assert.equal(store.getActive().id, child.id);

  const updated = store.update(child.id, { notes: 'Peanut allergy too.', allergies: ['penicillin', 'peanut'] });
  assert.deepEqual(updated.allergies, ['penicillin', 'peanut']);
  assert.equal(updated.notes, 'Peanut allergy too.');
  assert.equal(updated.id, child.id, 'update keeps the id');

  const reloaded = patients.createPatientProfileStore();
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.getActiveId(), child.id, 'the active patient survives a reload');
  assert.deepEqual(reloaded.getActive().allergies, ['penicillin', 'peanut']);

  reloaded.remove(child.id);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.getActiveId(), 'member-self', 'removing the active patient promotes the first remaining one');
});

test('deleting every profile stays deleted instead of re-seeding', () => {
  clearStorage();
  const store = patients.createPatientProfileStore();
  store.remove('member-self');
  assert.equal(store.list().length, 0);
  assert.equal(store.getActive(), null);
  assert.equal(store.getActiveId(), null);

  const reloaded = patients.createPatientProfileStore();
  assert.equal(reloaded.list().length, 0, 'an empty stored household is not re-seeded');
});

test('a stored empty household is left empty', () => {
  clearStorage();
  memory.set(patients.PATIENT_PROFILES_STORAGE_KEY, JSON.stringify({ version: 1, activeId: null, profiles: [] }));
  const store = patients.createPatientProfileStore();
  assert.equal(store.list().length, 0);
  assert.equal(store.getActive(), null);
});

test('the household is capped at the documented limit', () => {
  const store = memoryStore({ profiles: [], activeId: null });
  for (let index = 0; index < patients.PATIENT_PROFILE_LIMIT; index += 1) {
    store.add({ ...base, displayName: 'Patient ' + String(index) });
  }
  assert.equal(store.list().length, patients.PATIENT_PROFILE_LIMIT);
  assert.throws(() => store.add({ ...base, displayName: 'One too many' }), /limit/u);
});

test('corrupt persistence is dropped instead of taking the tab down', () => {
  assert.deepEqual(patients.parsePatientHousehold('{not json').profiles, []);
  assert.deepEqual(patients.parsePatientHousehold('').profiles, []);
  assert.deepEqual(patients.parsePatientHousehold(null).profiles, []);
  const mixed = JSON.stringify({
    version: 1,
    activeId: 'missing',
    profiles: [patients.createPatientProfile(base), { id: 'x' }, 42, null],
  });
  const parsed = patients.parsePatientHousehold(mixed);
  assert.equal(parsed.profiles.length, 1);
  assert.equal(parsed.activeId, parsed.profiles[0].id, 'an unknown active id falls back to the first profile');

  const corruptActive = patients.parsePatientHousehold({
    version: 1,
    activeId: 42,
    profiles: [patients.createPatientProfile(base)],
  });
  assert.equal(corruptActive.activeId, corruptActive.profiles[0].id);
});

test('a throwing storage adapter degrades to the session copy', () => {  const store = patients.createPatientProfileStore({
    read: () => {
      throw new Error('blocked');
    },
    write: () => {
      throw new Error('blocked');
    },
  });
  assert.equal(store.list().length, 1, 'the in-memory seed still answers');
  store.add(base);
  assert.equal(store.list().length, 2);
});

test('a shared-domain style adapter (read()/write(value)) also round-trips', () => {
  let stored = null;
  const adapter = {
    read: () => stored,
    write: (value) => {
      stored = value;
    },
  };
  const store = patients.createPatientProfileStore(adapter);
  assert.equal(store.list().length, 1);
  store.add(base);
  assert.equal(JSON.parse(stored).profiles.length, 2);
  assert.equal(patients.createPatientProfileStore(adapter).list().length, 2);
});

test('unknown actions are ignored instead of throwing', () => {
  const store = memoryStore();
  store.select('missing');
  assert.equal(store.getActiveId(), 'member-self');
  store.remove('missing');
  assert.equal(store.list().length, 1);
  assert.throws(() => store.update('missing', { notes: 'x' }), /unknown patient profile/u);
});
