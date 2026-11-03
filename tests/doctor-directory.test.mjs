import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const contractRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor';
const rosterContract = JSON.parse(
  fs.readFileSync(path.join(repoRoot, contractRoot, 'contracts/doctor-roster.json'), 'utf8'),
);
const domain = await import(
  new URL('file:///' + path.join(repoRoot, contractRoot, 'src/doctors.ts').replaceAll('\\', '/')).href
);

const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'visiting'];

test('the authored roster contract separates the person from the employment', () => {
  assert.equal(rosterContract.kind, 'sdkwork.doctor.doctor-roster');
  assert.equal(rosterContract.source, 'catalog');
  assert.deepEqual(rosterContract.employmentTypes, EMPLOYMENT);
  assert.equal(rosterContract.organizationModel.authority, 'SDKWork Appbase');
  assert.match(rosterContract.organizationModel.companyId, /Never the clinical employer/u);
  assert.ok(rosterContract.doctors.length >= 3);

  const ids = rosterContract.doctors.map((doctor) => doctor.id);
  assert.equal(new Set(ids).size, ids.length, 'doctor ids must be unique');

  for (const doctor of rosterContract.doctors) {
    assert.equal(doctor.verified, false, 'the fallback roster is never directory-verified');
    assert.ok(doctor.affiliations.length >= 1, doctor.id + ' needs at least one affiliation');
    const primaries = doctor.affiliations.filter((affiliation) => affiliation.primary);
    assert.equal(primaries.length, 1, doctor.id + ' must name exactly one primary affiliation');
    const organizations = doctor.affiliations.map((affiliation) => affiliation.organizationId);
    assert.equal(new Set(organizations).size, organizations.length, doctor.id + ' affiliations must be distinct organizations');
    for (const affiliation of doctor.affiliations) {
      assert.ok(affiliation.organizationId.trim().length > 0, doctor.id);
      assert.ok(affiliation.hospitalName.trim().length > 0, doctor.id);
      assert.ok(affiliation.hospitalCode.trim().length > 0, doctor.id);
      assert.ok(EMPLOYMENT.includes(affiliation.employmentType), doctor.id + ' has an unknown engagement type');
      assert.ok(affiliation.channels.length > 0, doctor.id + ' needs a channel per site');
      for (const channel of affiliation.channels) {
        assert.ok(['video', 'phone', 'messaging', 'clinic'].includes(channel.kind), doctor.id);
        assert.match(channel.target, /^[a-z]+:/u, doctor.id + ' channel target must be a link');
      }
      for (const slot of affiliation.availability) {
        assert.ok(Number.isInteger(slot.weekday) && slot.weekday >= 0 && slot.weekday <= 6, doctor.id);
        assert.match(slot.startTime, /^([01]\d|2[0-3]):[0-5]\d$/u, doctor.id);
        assert.match(slot.endTime, /^([01]\d|2[0-3]):[0-5]\d$/u, doctor.id);
        assert.ok(slot.startTime < slot.endTime, doctor.id);
      }
      assert.match(affiliation.since, /^\d{4}-(0[1-9]|1[0-2])$/u, doctor.id);
    }
  }

  const employsPartTime = rosterContract.doctors.some((doctor) =>
    doctor.affiliations.some((affiliation) => affiliation.employmentType === 'part_time'));
  assert.ok(employsPartTime, 'the fallback roster demonstrates a part-time engagement');
  const multiSite = rosterContract.doctors.some((doctor) => doctor.affiliations.length > 1);
  assert.ok(multiSite, 'the fallback roster demonstrates a multi-site clinician');
});

test('the TypeScript fallback roster equals the authored contract', () => {
  assert.equal(domain.CATALOG_DOCTOR_ROSTER.source, rosterContract.source);
  assert.deepEqual(
    domain.CATALOG_DOCTOR_ROSTER.doctors.map((doctor) => JSON.parse(JSON.stringify(doctor))),
    rosterContract.doctors,
  );
});

test('the roster parser accepts a document, a bare array, and an agent-style envelope', () => {
  const fromDocument = domain.parseDoctorRoster(rosterContract);
  assert.equal(fromDocument.length, rosterContract.doctors.length);
  const fromArray = domain.parseDoctorRoster(rosterContract.doctors);
  assert.equal(fromArray.length, rosterContract.doctors.length);
  const fromEnvelope = domain.parseDoctorRoster({ data: { item: { doctors: rosterContract.doctors } } });
  assert.equal(fromEnvelope.length, rosterContract.doctors.length);
  const fromItems = domain.parseDoctorRoster({ data: { items: rosterContract.doctors } });
  assert.equal(fromItems.length, rosterContract.doctors.length);
});

test('a legacy flat doctor document is migrated into one primary affiliation', () => {
  const legacy = domain.parseDoctorRoster({
    doctors: [{
      id: 'doctor-legacy',
      displayName: 'Legacy Doctor',
      title: 'Attending physician',
      department: 'General practice',
      hospital: 'Legacy Hospital',
      specialties: ['Fever'],
      languages: ['zh-CN'],
      yearsOfExperience: 7,
      bio: 'Flat-shape document.',
      channels: [{ kind: 'phone', target: 'tel:+10000000000' }],
      availability: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
      acceptingNewPatients: true,
      verified: true,
    }],
  });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].affiliations.length, 1);
  const [affiliation] = legacy[0].affiliations;
  assert.equal(affiliation.organizationId, 'org.legacy-directory');
  assert.equal(affiliation.hospitalName, 'Legacy Hospital');
  assert.equal(affiliation.employmentType, 'full_time');
  assert.equal(affiliation.primary, true);
  assert.equal(domain.preferredDoctorChannel(affiliation)?.kind, 'phone');
});

test('the roster parser drops malformed clinicians instead of throwing', () => {
  assert.deepEqual(domain.parseDoctorRoster('{not json'), []);
  assert.deepEqual(domain.parseDoctorRoster(''), []);
  const mixed = domain.parseDoctorRoster({
    doctors: [
      rosterContract.doctors[0],
      { id: 'no-name' },
      { displayName: 'No id' },
      { ...rosterContract.doctors[0] },
      { ...rosterContract.doctors[1], affiliations: [] },
      {
        id: 'doctor-bad-channel',
        displayName: 'Bad Channel',
        affiliations: [{
          organizationId: 'org-x',
          hospitalName: 'X Hospital',
          employmentType: 'full_time',
          channels: [{ kind: 'telepathy', target: 'x' }],
        }],
      },
    ],
  });
  assert.deepEqual(mixed.map((doctor) => doctor.id), ['doctor-lin-qinghe', 'doctor-bad-channel']);
  assert.equal(mixed[1].affiliations[0].channels.length, 0, 'an unknown channel kind is dropped, not the doctor');
});

test('a doctor can be resolved to a primary affiliation and filtered by engagement', () => {
  const [lin, , he] = domain.CATALOG_DOCTOR_ROSTER.doctors;
  const primary = domain.primaryAffiliation(lin);
  assert.equal(primary?.organizationId, 'org-sdkwork-care-network');
  assert.equal(primary?.employmentType, 'full_time');
  assert.equal(lin.affiliations.length, 2);
  assert.equal(domain.hasPartTimeEngagement(lin), true);
  assert.deepEqual(domain.doctorEmploymentTypes(lin), ['full_time', 'part_time']);
  assert.equal(domain.affiliationByOrganization(lin, 'org-sdkwork-community-clinic')?.employmentType, 'part_time');
  assert.equal(domain.affiliationByOrganization(lin, 'org-missing'), null);
  assert.equal(domain.hasPartTimeEngagement(he), true);
  assert.equal(domain.primaryAffiliation({ ...he, affiliations: [] }), null);
});

test('the preferred channel is site-scoped and skips empty targets', () => {
  const [lin] = domain.CATALOG_DOCTOR_ROSTER.doctors;
  const fullTime = domain.affiliationByOrganization(lin, 'org-sdkwork-care-network');
  const partTime = domain.affiliationByOrganization(lin, 'org-sdkwork-community-clinic');
  assert.equal(domain.preferredDoctorChannel(fullTime)?.kind, 'video');
  assert.equal(domain.preferredDoctorChannel(partTime)?.kind, 'video');

  const phoneOnly = { ...fullTime, channels: [{ kind: 'phone', target: 'tel:+10000000000' }] };
  assert.equal(domain.preferredDoctorChannel(phoneOnly)?.kind, 'phone');
  const emptyTargets = { ...fullTime, channels: [{ kind: 'video', target: '  ' }, { kind: 'clinic', target: 'https://care.sdkwork.com/visit' }] };
  assert.equal(domain.preferredDoctorChannel(emptyTargets)?.kind, 'clinic');
  assert.equal(domain.preferredDoctorChannel({ ...fullTime, channels: [] }), null);
  assert.equal(domain.preferredDoctorChannel(null), null);
});

test('selection: the first doctor selected becomes primary', () => {
  const store = domain.createMemoryDoctorSelectionStore();
  assert.deepEqual(store.state(), { selectedIds: [], primaryId: null });

  store.select('a');
  assert.deepEqual(store.state(), { selectedIds: ['a'], primaryId: 'a' });
  store.select('b');
  assert.deepEqual(store.state(), { selectedIds: ['a', 'b'], primaryId: 'a' });

  store.setPrimary('b');
  assert.deepEqual(store.state(), { selectedIds: ['a', 'b'], primaryId: 'b' });

  store.deselect('b');
  assert.deepEqual(store.state(), { selectedIds: ['a'], primaryId: 'a' }, 'demoting the primary promotes the next selected doctor');
});

test('selection: the cap holds and unknown ids are pruned', () => {
  const store = domain.createMemoryDoctorSelectionStore();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) store.select(id);
  assert.equal(store.state().selectedIds.length, domain.DOCTOR_SELECTION_LIMIT);

  store.prune(['a', 'c', 'zzz']);
  assert.deepEqual(store.state().selectedIds, ['a', 'c']);
  assert.equal(store.state().primaryId, 'a');

  store.clear();
  assert.deepEqual(store.state(), { selectedIds: [], primaryId: null });
  assert.equal(store.isSelected('a'), false);
});

test('selection persists and repairs a primary that is not selected', () => {
  let stored = null;
  const store = domain.createDoctorSelectionStore({ read: () => stored, write: (value) => { stored = value; } });
  store.select('doctor-lin-qinghe');
  store.select('doctor-su-wanning');

  const reloaded = domain.createDoctorSelectionStore({ read: () => stored, write: () => undefined });
  assert.deepEqual(reloaded.state().selectedIds, ['doctor-lin-qinghe', 'doctor-su-wanning']);
  assert.equal(reloaded.state().primaryId, 'doctor-lin-qinghe');

  const repaired = domain.parseDoctorSelection({ selectedIds: ['a', 'b'], primaryId: 'zzz' });
  assert.equal(repaired.primaryId, 'a');
  assert.deepEqual(domain.parseDoctorSelection('{not json'), { selectedIds: [], primaryId: null });
});

test('resolving doctors preserves selection order and the primary', () => {
  const roster = domain.CATALOG_DOCTOR_ROSTER;
  const first = roster.doctors[0].id;
  const second = roster.doctors[1].id;
  const selection = domain.parseDoctorSelection({ selectedIds: [second, 'gone', first], primaryId: second });

  assert.deepEqual(domain.resolveSelectedDoctors(roster, selection).map((doctor) => doctor.id), [second, first]);
  assert.equal(domain.resolvePrimaryDoctor(roster, selection)?.id, second);
  assert.equal(domain.resolvePrimaryDoctor(roster, domain.parseDoctorSelection({ selectedIds: [], primaryId: null })), null);
});


const PORTRAIT_CLIENTS = [
  'apps/sdkwork-doctor-pc/public/avatars',
  'apps/sdkwork-doctor-h5/public/avatars',
  'apps/sdkwork-doctor-mini-program/src/assets/avatars',
  'apps/sdkwork-doctor-flutter-mobile/assets/avatars',
];

test('every authored doctor ships the portrait its roster names', () => {
  for (const doctor of rosterContract.doctors) {
    assert.match(doctor.avatarUrl, /^avatars\/[a-z0-9-]+\.png$/u, doctor.id);
    const canonical = path.join(repoRoot, contractRoot, 'assets', doctor.avatarUrl);
    assert.ok(fs.existsSync(canonical), doctor.id + ' portrait must exist in the contract package');
    const bytes = fs.readFileSync(canonical);
    assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', doctor.id + ' portrait must be a PNG');
    for (const directory of PORTRAIT_CLIENTS) {
      const copy = path.join(repoRoot, directory, path.basename(doctor.avatarUrl));
      assert.ok(fs.existsSync(copy), doctor.id + ' portrait missing from ' + directory);
      assert.deepEqual(fs.readFileSync(copy), bytes, doctor.id + ' portraits must be byte-identical across clients');
    }
  }
});

test('a portrait reference cannot use a foreign scheme or escape the bundle', () => {
  const base = rosterContract.doctors[0];
  const [remote] = domain.parseDoctorRoster([{ ...base, avatarUrl: 'https://care.sdkwork.com/avatars/doctor-a.png' }]);
  assert.equal(remote.avatarUrl, 'https://care.sdkwork.com/avatars/doctor-a.png', 'a directory may publish an absolute URL');

  for (const rejected of ['javascript:alert(1)', 'data:image/svg+xml;base64,AA==', '../../etc/passwd', '/absolute.png', '  ']) {
    const [doctor] = domain.parseDoctorRoster([{ ...base, avatarUrl: rejected }]);
    assert.equal(doctor.avatarUrl, '', JSON.stringify(rejected) + ' must be dropped');
  }

  assert.equal(domain.doctorAvatarHref('avatars/doctor-lin-qinghe.png'), '/avatars/doctor-lin-qinghe.png');
  assert.equal(domain.doctorAvatarHref('https://care.example.com/a.png'), 'https://care.example.com/a.png');
  assert.equal(domain.doctorAvatarHref(''), '');
  assert.equal(domain.isRemoteDoctorAvatar('https://care.example.com/a.png'), true);
  assert.equal(domain.isRemoteDoctorAvatar('avatars/doctor-lin-qinghe.png'), false);
  assert.equal(domain.doctorInitial('Lin Qinghe'), 'L');
  assert.equal(domain.doctorInitial('  '), '');
});
