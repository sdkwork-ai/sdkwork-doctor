import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const doctors = require(path.join(root, 'src', 'lib', 'doctors.js'));

const rosterContract = JSON.parse(fs.readFileSync(
  path.resolve(
    root,
    '..',
    'sdkwork-doctor-common',
    'packages',
    'sdkwork-doctor-common-doctor',
    'contracts',
    'doctor-roster.json',
  ),
  'utf8',
));

const clinicAffiliation = (doctor) => doctor.affiliations.filter((entry) => !entry.primary)[0];

function selectionStore() {
  let stored = null;
  const store = doctors.createDoctorSelectionStore({
    read: (key) => stored,
    write: (key, value) => {
      stored = value;
    },
  });
  return { store, stored: () => stored };
}

test('the fallback roster equals the authored contract after mapping', () => {
  assert.equal(doctors.DOCTOR_DIRECTORY_KIND, rosterContract.kind);
  assert.equal(doctors.CATALOG_DOCTOR_ROSTER.source, rosterContract.source);
  assert.deepEqual(
    JSON.parse(JSON.stringify(doctors.CATALOG_DOCTOR_ROSTER.doctors)),
    rosterContract.doctors,
  );
  for (const doctor of doctors.CATALOG_DOCTOR_ROSTER.doctors) {
    assert.equal(doctor.verified, false, 'the fallback roster is never directory-verified');
    assert.ok(doctor.affiliations.length > 0, doctor.id + ' keeps at least one affiliation');
  }
});

test('the catalog keeps the person and employment models apart', () => {
  const lin = doctors.CATALOG_DOCTOR_ROSTER.doctors[0];
  assert.deepEqual(Object.keys(lin).sort(), [
    'affiliations',
    'bio',
    'displayName',
    'id',
    'languages',
    'specialties',
    'verified',
    'yearsOfExperience',
  ]);
  const site = doctors.primaryAffiliation(lin);
  assert.equal(site.organizationId, 'org-sdkwork-care-network');
  assert.equal(site.hospitalCode, 'SDKWORK-CARE-001');
  assert.equal(site.hospitalName, 'SDKWork Care Network');
  assert.equal(site.department, 'Cardiology');
  assert.equal(site.title, 'Chief physician');
  assert.equal(site.employmentType, 'full_time');
  assert.equal(site.primary, true);
  assert.equal(site.since, '2011-07');
  assert.equal(clinicAffiliation(lin).employmentType, 'part_time');
  assert.equal(clinicAffiliation(lin).primary, false);
});

test('affiliation lookups and employment helpers answer from the roster', () => {
  const lin = doctors.CATALOG_DOCTOR_ROSTER.doctors[0];
  assert.equal(doctors.affiliationByOrganization(lin, 'org-sdkwork-community-clinic').hospitalName, 'SDKWork Community Clinic');
  assert.equal(doctors.affiliationByOrganization(lin, 'org-missing'), null);
  assert.equal(doctors.hasPartTimeEngagement(lin), true);
  assert.equal(doctors.hasPartTimeEngagement(doctors.CATALOG_DOCTOR_ROSTER.doctors[1]), false);
  assert.deepEqual(doctors.doctorEmploymentTypes(lin), ['full_time', 'part_time']);
  assert.deepEqual(doctors.doctorEmploymentTypes(doctors.CATALOG_DOCTOR_ROSTER.doctors[1]), ['full_time']);
  assert.equal(doctors.doctorEmploymentTypes({ affiliations: [] }).length, 0);
  assert.equal(doctors.primaryAffiliation({ affiliations: [] }), null);
});

test('the roster parser accepts a document, a bare array, and an agent-style envelope', () => {
  assert.equal(doctors.parseDoctorRoster(rosterContract).length, 3);
  assert.equal(doctors.parseDoctorRoster(rosterContract.doctors).length, 3);
  assert.equal(doctors.parseDoctorRoster({ data: { item: { doctors: rosterContract.doctors } } }).length, 3);
  assert.equal(doctors.parseDoctorRoster({ data: { items: rosterContract.doctors } }).length, 3);
  const parsed = doctors.parseDoctorRoster(rosterContract.doctors);
  assert.equal(parsed[0].affiliations.length, 2);
});

test('the roster parser drops malformed clinicians and unknown channels', () => {
  assert.deepEqual(doctors.parseDoctorRoster('{not json'), []);
  assert.deepEqual(doctors.parseDoctorRoster(''), []);
  const mixed = doctors.parseDoctorRoster({
    doctors: [
      rosterContract.doctors[0],
      { id: 'no-name' },
      { displayName: 'No id' },
      { ...rosterContract.doctors[0] },
      { ...rosterContract.doctors[0], id: 'no-affiliation', affiliations: [] },
      { ...rosterContract.doctors[0], id: 'bad-affiliation', affiliations: [{ department: 'Cardiology' }] },
      {
        ...rosterContract.doctors[1],
        id: 'unknown-channel',
        affiliations: [{
          ...rosterContract.doctors[1].affiliations[0],
          channels: [{ kind: 'telepathy', target: 'x' }],
        }],
      },
    ],
  });
  assert.equal(mixed.length, 2, 'duplicates, malformed people, and doctors without a site are dropped');
  assert.equal(mixed[1].id, 'unknown-channel');
  assert.equal(mixed[1].affiliations[0].channels.length, 0, 'an unknown channel kind is dropped, not the doctor');
});

test('a legacy flat doctor document migrates into one primary affiliation', () => {
  const legacy = doctors.parseDoctorRoster({
    doctors: [{
      id: 'doctor-legacy',
      displayName: 'Legacy Doctor',
      specialty: 'ignored',
      specialties: ['General'],
      languages: ['zh-CN'],
      yearsOfExperience: 12,
      bio: 'Legacy entry.',
      verified: true,
      hospital: 'Legacy Hospital',
      department: 'Internal medicine',
      title: 'Attending physician',
      acceptingNewPatients: false,
      availability: [{ weekday: 2, startTime: '09:00', endTime: '12:00' }],
      channels: [{ kind: 'phone', target: 'tel:+10000000000' }],
    }],
  });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].affiliations.length, 1);
  const site = legacy[0].affiliations[0];
  assert.equal(site.organizationId, 'org.legacy-directory');
  assert.equal(site.hospitalName, 'Legacy Hospital');
  assert.equal(site.department, 'Internal medicine');
  assert.equal(site.title, 'Attending physician');
  assert.equal(site.employmentType, 'full_time');
  assert.equal(site.primary, true);
  assert.equal(site.acceptingNewPatients, false);
  assert.equal(site.availability.length, 1);
  assert.equal(doctors.preferredDoctorChannel(site).kind, 'phone');
});

test('an affiliation array without a primary promotes the first site', () => {
  const [doctor] = doctors.parseDoctorRoster({
    doctors: [{
      id: 'doctor-two-sites',
      displayName: 'Two Sites',
      affiliations: [
        { organizationId: 'org-a', hospitalName: 'Site A', primary: false },
        { organizationId: 'org-b', hospitalName: 'Site B', primary: false },
      ],
    }],
  });
  assert.equal(doctor.affiliations.length, 2);
  assert.equal(doctor.affiliations[0].primary, true);
  assert.equal(doctor.affiliations[1].primary, false);
  assert.equal(doctors.primaryAffiliation(doctor).organizationId, 'org-a');
  assert.equal(doctor.affiliations[0].employmentType, 'full_time', 'an unknown engagement defaults to full-time');
});

test('the preferred channel ranks video, messaging, phone, then clinic at one site', () => {
  const site = doctors.primaryAffiliation(doctors.CATALOG_DOCTOR_ROSTER.doctors[0]);
  assert.equal(doctors.preferredDoctorChannel(site).kind, 'video');

  const all = {
    channels: [
      { kind: 'clinic', target: 'https://care.sdkwork.com/visit' },
      { kind: 'phone', target: 'tel:+10000000000' },
      { kind: 'messaging', target: 'https://care.sdkwork.com/messages' },
      { kind: 'video', target: 'https://care.sdkwork.com/video' },
    ],
  };
  assert.equal(doctors.preferredDoctorChannel(all).kind, 'video');
  assert.equal(doctors.preferredDoctorChannel({ channels: all.channels.slice(0, 3) }).kind, 'messaging');
  assert.equal(doctors.preferredDoctorChannel({ channels: [{ kind: 'phone', target: 'tel:+1' }] }).kind, 'phone');
  assert.equal(
    doctors.preferredDoctorChannel({
      channels: [{ kind: 'video', target: '  ' }, { kind: 'clinic', target: 'https://care.sdkwork.com/visit' }],
    }).kind,
    'clinic',
  );
  assert.equal(doctors.preferredDoctorChannel({ channels: [] }), null);
  assert.equal(doctors.preferredDoctorChannel(null), null);
});

test('the first doctor selected becomes primary and demoting it promotes the next', () => {
  const { store, stored } = selectionStore();
  assert.deepEqual(store.state(), { selectedIds: [], primaryId: null });

  store.select('doctor-lin-qinghe');
  assert.deepEqual(store.state(), { selectedIds: ['doctor-lin-qinghe'], primaryId: 'doctor-lin-qinghe' });

  store.select('doctor-su-wanning');
  assert.deepEqual(store.state(), {
    selectedIds: ['doctor-lin-qinghe', 'doctor-su-wanning'],
    primaryId: 'doctor-lin-qinghe',
  });
  assert.equal(store.isSelected('doctor-lin-qinghe'), true);

  store.setPrimary('doctor-su-wanning');
  assert.equal(store.state().primaryId, 'doctor-su-wanning');

  store.deselect('doctor-su-wanning');
  assert.deepEqual(store.state(), {
    selectedIds: ['doctor-lin-qinghe'],
    primaryId: 'doctor-lin-qinghe',
  });

  const saved = JSON.parse(stored());
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.selectedIds, ['doctor-lin-qinghe']);
  assert.equal(saved.primaryId, 'doctor-lin-qinghe');

  store.clear();
  assert.deepEqual(store.state(), { selectedIds: [], primaryId: null });
});

test('selection is capped, pruned, and repaired after a reload', () => {
  const { store, stored } = selectionStore();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) store.select(id);
  assert.equal(store.state().selectedIds.length, doctors.DOCTOR_SELECTION_LIMIT);
  assert.equal(store.state().primaryId, 'a');

  store.prune(['b', 'd', 'gone']);
  assert.deepEqual(store.state().selectedIds, ['b', 'd']);
  assert.equal(store.state().primaryId, 'b', 'pruning the primary promotes the first survivor');

  const primary = JSON.parse(stored()).primaryId;
  assert.equal(primary, 'b');

  const reloaded = doctors.createDoctorSelectionStore({
    read: () => stored(),
    write: () => undefined,
  });
  assert.deepEqual(reloaded.state().selectedIds, ['b', 'd']);

  const repaired = doctors.parseDoctorSelection({ selectedIds: ['x', 'y'], primaryId: 'zzz' });
  assert.equal(repaired.primaryId, 'x');
  assert.deepEqual(doctors.parseDoctorSelection('{not json'), { selectedIds: [], primaryId: null });
  assert.deepEqual(doctors.parseDoctorSelection({ selectedIds: [' x ', 'x', 42], primaryId: 'x' }), {
    selectedIds: ['x'],
    primaryId: 'x',
  });
});

test('the in-memory selection store starts empty and honours the primary rule', () => {
  const store = doctors.createMemoryDoctorSelectionStore();
  assert.deepEqual(store.state(), { selectedIds: [], primaryId: null });
  store.select('a');
  store.select('b');
  assert.deepEqual(store.state(), { selectedIds: ['a', 'b'], primaryId: 'a' });
});

test('a shared-domain style selection adapter (read()/write(value)) also round-trips', () => {
  let stored = null;
  const adapter = {
    read: () => stored,
    write: (value) => {
      stored = value;
    },
  };
  const store = doctors.createDoctorSelectionStore(adapter);
  store.select('doctor-lin-qinghe');
  assert.equal(JSON.parse(stored).primaryId, 'doctor-lin-qinghe');
  assert.equal(
    doctors.createDoctorSelectionStore(adapter).state().primaryId,
    'doctor-lin-qinghe',
  );
});

test('resolve helpers keep selection order and fall back to a selected doctor', () => {
  const roster = doctors.CATALOG_DOCTOR_ROSTER;
  const first = roster.doctors[0].id;
  const second = roster.doctors[1].id;
  const selection = doctors.parseDoctorSelection({ selectedIds: [second, 'gone', first], primaryId: 'gone' });
  assert.deepEqual(
    doctors.resolveSelectedDoctors(roster, selection).map((doctor) => doctor.id),
    [second, first],
  );
  assert.equal(doctors.resolvePrimaryDoctor(roster, selection).id, second);
  assert.equal(
    doctors.resolvePrimaryDoctor(roster, { selectedIds: [], primaryId: null }),
    null,
  );
});

test('a doctor record label carries the name and the chosen site department', () => {
  const lin = doctors.CATALOG_DOCTOR_ROSTER.doctors[0];
  assert.equal(doctors.doctorRecordLabel(lin), 'Lin Qinghe · Cardiology');
  assert.equal(doctors.doctorRecordLabel(lin, clinicAffiliation(lin)), 'Lin Qinghe · General practice');
});

/** Stubs the only wx surface the directory port touches. */
function stubRequest(handler) {
  globalThis.wx = { request: handler };
}

test('no configured directory falls back to the authored roster without a request', async () => {
  let called = 0;
  stubRequest(() => {
    called += 1;
    return Promise.resolve({ statusCode: 200, data: rosterContract });
  });
  const port = doctors.createDoctorDirectoryPort({ directoryUrl: '' });
  assert.equal(port.configured, false);
  const roster = await port.load();
  assert.equal(roster.source, 'catalog');
  assert.deepEqual(roster.doctors, doctors.CATALOG_DOCTOR_ROSTER.doctors);
  assert.equal(called, 0);
});

test('a failed or malformed directory falls back to the authored roster', async () => {
  stubRequest((options) => {
    options.fail({ errMsg: 'request:fail offline' });
  });
  const offline = await doctors.createDoctorDirectoryPort({ directoryUrl: 'https://care.example.com/doctors' }).load();
  assert.equal(offline.source, 'catalog');

  stubRequest((options) => {
    options.success({ statusCode: 200, data: '{not json' });
  });
  const malformed = await doctors.createDoctorDirectoryPort({ directoryUrl: 'https://care.example.com/doctors' }).load();
  assert.equal(malformed.source, 'catalog');

  stubRequest((options) => {
    options.success({ statusCode: 500, data: { detail: 'boom' } });
  });
  const failed = await doctors.createDoctorDirectoryPort({ directoryUrl: 'https://care.example.com/doctors' }).load();
  assert.equal(failed.source, 'catalog');

  stubRequest(() => {
    throw new Error('wx.request exploded');
  });
  const thrown = await doctors.createDoctorDirectoryPort({ directoryUrl: 'https://care.example.com/doctors' }).load();
  assert.equal(thrown.source, 'catalog');
});

test('a reachable directory answers as source directory with its own roster', async () => {
  const calls = [];
  const directoryDoctor = {
    ...rosterContract.doctors[0],
    id: 'doctor-directory-only',
    displayName: 'Directory Doctor',
    verified: true,
  };
  stubRequest((options) => {
    calls.push(options);
    options.success({ statusCode: 200, data: { doctors: [directoryDoctor] } });
  });
  const port = doctors.createDoctorDirectoryPort({ directoryUrl: 'https://care.example.com/doctors' });
  assert.equal(port.configured, true);
  const roster = await port.load();
  assert.equal(roster.source, 'directory');
  assert.deepEqual(roster.doctors.map((doctor) => doctor.id), ['doctor-directory-only']);
  assert.equal(roster.doctors[0].verified, true, 'a directory vouches for its own clinicians');
  assert.equal(roster.doctors[0].affiliations.length, 2);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://care.example.com/doctors');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].header.Accept, 'application/json');
  assert.equal(typeof calls[0].timeout, 'number');
  assert.ok(calls[0].timeout > 0);
});
