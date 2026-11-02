import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const contractRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor';
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, contractRoot, 'contracts/patient-profile.schema.json'), 'utf8'));
const domain = await import(
  new URL('file:///' + path.join(repoRoot, contractRoot, 'src/patient-profiles.ts').replaceAll('\\', '/')).href
);

const base = {
  displayName: 'Xiaoman',
  relation: 'child',
  birthYear: 2019,
  sex: 'female',
  allergies: ['penicillin'],
};

test('the patient schema pins the storage key, limit, and required fields', () => {
  assert.equal(schema.kind, 'sdkwork.doctor.patient-profile');
  assert.equal(schema.storageKey, domain.PATIENT_PROFILES_STORAGE_KEY);
  assert.equal(schema.limit, domain.PATIENT_PROFILE_LIMIT);
  assert.equal(schema.documentVersion, domain.PATIENT_PROFILE_VERSION);
  const profile = domain.createPatientProfile(base);
  for (const field of schema.required) {
    assert.ok(field in profile, 'a created profile carries ' + field);
  }
  assert.equal(profile.displayName, 'Xiaoman');
  assert.equal(profile.relation, 'child');
  assert.equal(profile.birthYear, 2019);
  assert.deepEqual(profile.allergies, ['penicillin']);
});

test('profile validation rejects the facts the app cannot safely store', () => {
  assert.throws(() => domain.createPatientProfile({ ...base, displayName: '  ' }), /display name/u);
  assert.throws(() => domain.createPatientProfile({ ...base, relation: 'cousin' }), /relation/u);
  assert.throws(() => domain.createPatientProfile({ ...base, sex: 'unknown' }), /sex/u);
  assert.throws(() => domain.createPatientProfile({ ...base, birthYear: 1899 }), /birth year/u);
  assert.throws(() => domain.createPatientProfile({ ...base, birthYear: new Date().getFullYear() + 1 }), /birth year/u);
  assert.throws(() => domain.createPatientProfile({ ...base, birthYear: 2019.5 }), /birth year/u);
});

test('list fields are trimmed and de-duplicated, and comma fields split both widths', () => {
  assert.deepEqual(domain.normalizeProfileList([' peanut ', 'Peanut', '', 'dust']), ['peanut', 'dust']);
  assert.deepEqual(domain.splitProfileField('penicillin, aspirin，dust、latex'), ['penicillin', 'aspirin', 'dust', 'latex']);
  assert.deepEqual(domain.splitProfileField(undefined), []);
});

test('completeness counts the six care facts', () => {
  assert.equal(domain.patientProfileCompleteness(domain.createPatientProfile({ ...base, allergies: [] })), 17);
  const full = domain.createPatientProfile({
    ...base,
    birthDate: '2019-06-02',
    bloodType: 'O+',
    allergies: ['penicillin'],
    chronicConditions: ['asthma'],
    medications: ['salbutamol'],
    notes: 'Wheezing after colds.',
  });
  assert.equal(domain.patientProfileCompleteness(full), 100);
});

test('a seeded device keeps exactly one self profile', () => {
  const store = domain.createMemoryPatientProfileStore();
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, 'member-self');
  assert.equal(store.activeId(), 'member-self');
  assert.equal(store.active()?.displayName, 'Me');
  assert.equal(domain.demoSelfMember.id, 'member-self');
});

test('the store adds, selects, updates, removes, and persists through its adapter', () => {
  let stored = null;
  const store = domain.createPatientProfileStore({ read: () => stored, write: (value) => { stored = value; } });
  assert.equal(store.list().length, 1, 'first run seeds the household');

  const child = store.add(base);
  assert.equal(store.list().length, 2);
  assert.equal(store.activeId(), 'member-self', 'adding does not steal the active patient');

  store.select(child.id);
  assert.equal(store.active()?.id, child.id);

  const updated = store.update(child.id, { notes: 'Peanut allergy too.', allergies: ['penicillin', 'peanut'] });
  assert.deepEqual(updated.allergies, ['penicillin', 'peanut']);
  assert.equal(updated.notes, 'Peanut allergy too.');
  assert.equal(updated.id, child.id, 'update keeps the id');
  assert.notEqual(updated.updatedAt, undefined);

  const reloaded = domain.createPatientProfileStore({ read: () => stored, write: () => undefined });
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.activeId(), child.id, 'the active patient survives a reload');
  assert.deepEqual(reloaded.active()?.allergies, ['penicillin', 'peanut']);

  reloaded.remove(child.id);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.activeId(), 'member-self', 'removing the active patient promotes the first remaining one');
});

test('deleting every profile stays deleted instead of re-seeding', () => {
  let stored = null;
  const store = domain.createPatientProfileStore({ read: () => stored, write: (value) => { stored = value; } });
  store.remove('member-self');
  assert.equal(store.list().length, 0);
  assert.equal(store.active(), null);
  const reloaded = domain.createPatientProfileStore({ read: () => stored, write: () => undefined });
  assert.equal(reloaded.list().length, 0, 'an empty stored household is not re-seeded');
});

test('the household is capped at the documented limit', () => {
  const store = domain.createMemoryPatientProfileStore({ profiles: [], activeId: null });
  for (let index = 0; index < domain.PATIENT_PROFILE_LIMIT; index += 1) {
    store.add({ ...base, displayName: 'Patient ' + String(index) });
  }
  assert.equal(store.list().length, domain.PATIENT_PROFILE_LIMIT);
  assert.throws(() => store.add({ ...base, displayName: 'One too many' }), /limit/u);
});

test('corrupt persistence is dropped instead of taking the tab down', () => {
  assert.deepEqual(domain.parsePatientHousehold('{not json').profiles, []);
  assert.deepEqual(domain.parsePatientHousehold('').profiles, []);
  const mixed = JSON.stringify({
    version: 1,
    activeId: 'missing',
    profiles: [domain.createPatientProfile(base), { id: 'x' }, 42, null],
  });
  const parsed = domain.parsePatientHousehold(mixed);
  assert.equal(parsed.profiles.length, 1);
  assert.equal(parsed.activeId, parsed.profiles[0].id, 'an unknown active id falls back to the first profile');
});

test('the store keeps a stable snapshot and degrades when storage throws', () => {
  const store = domain.createPatientProfileStore({
    read: () => { throw new Error('blocked'); },
    write: () => { throw new Error('blocked'); },
  });
  const before = store.list();
  assert.equal(store.list(), before, 'React useSyncExternalStore needs a stable snapshot');
  store.add(base);
  assert.notEqual(store.list(), before);
  assert.equal(store.list().length, 2);
});

test('unknown actions are ignored instead of throwing', () => {
  const store = domain.createMemoryPatientProfileStore();
  store.select('missing');
  assert.equal(store.activeId(), 'member-self');
  store.remove('missing');
  assert.equal(store.list().length, 1);
  assert.throws(() => store.update('missing', { notes: 'x' }), /unknown patient profile/u);
});
