import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(repoRoot, relativePath));

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const RECORDS = '\u770b\u75c5\u8bb0\u5f55';
const ME = '\u6211\u7684';
const RULES = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-rules.json';
const COMPOSITION = 'specs/app-composition.contract.json';

function flutterSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.dart')) continue;
      // The generated care catalog mirrors every shared key, including labels
      // other surfaces render. It is copy data, not Flutter navigation.
      if (entry.name === 'care_messages.dart') continue;
      files.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile/lib'));
  return files.join('\n');
}

test('every client exposes the same four care blocks', () => {
  const contract = JSON.parse(read(COMPOSITION));
  const required = ['chat', 'doctor', 'records', 'me'];
  for (const id of required) {
    const block = contract.blocks.find((entry) => entry.id === id);
    assert.ok(block, 'the composition contract must declare the ' + id + ' block');
    for (const surface of ['pc', 'h5', 'flutter', 'mini_program']) {
      assert.ok(block.surfaces.includes(surface), id + ' must be available on ' + surface);
    }
  }

  const pcRoutes = read('apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-shell/src/DoctorPcRoutes.tsx');
  const h5Routes = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx');
  for (const routes of [pcRoutes, h5Routes]) {
    for (const id of required) {
      const segment = contract.blocks.find((entry) => entry.id === id).route.split('/').pop();
      assert.match(routes, new RegExp('path="' + segment + '"', 'u'), 'browser routes must implement ' + id);
    }
    assert.match(routes, /path="me\/records"/u, 'older records links still resolve');
    assert.match(routes, /path="records\/:recordId"/u, 'the visit detail page is a route of its own');
    assert.match(routes, /RecordDetailPage/u, 'the route renders the 4-tab detail page');
  }

  const mp = JSON.parse(read('apps/sdkwork-doctor-mini-program/src/app.json'));
  assert.deepEqual(mp.pages, [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/records/index',
    'pages/record-detail/index',
    'pages/profile/index',
    'pages/patients/index',
    'pages/device/index',
  ]);
  assert.deepEqual(mp.tabBar.list.map((tab) => tab.text), [CHAT, DOCTOR, RECORDS, ME]);
  assert.equal(mp.tabBar.list.length, required.length);

  const flutter = flutterSources();
  assert.equal(
    flutter.split('NavigationDestination(').length - 1,
    required.length,
    'Flutter must render every resolved navigation destination',
  );
  assert.match(flutter, /nav\.records/u, 'Flutter renders the records destination label');
});

test('every client ships the patient-file and human-doctor capability', () => {
  const shared = [
    'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/patient-profiles.ts',
    'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/doctors.ts',
    'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/patient-profile.schema.json',
    'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/doctor-roster.json',
    'specs/doctor-directory.contract.json',
  ];
  for (const file of shared) assert.ok(exists(file), file + ' must exist');

  for (const surface of ['pc', 'h5']) {
    const care = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-care/src/index.tsx');
    assert.match(care, /mode: 'human'/u, surface + ' must record human consultations');
    assert.match(care, /preferredDoctorChannel/u, surface);
    assert.match(care, /selection\.setPrimary\(/u, surface);
    assert.match(care, /platform\.care\.doctors\.source\.catalog/u, surface + ' must show the roster source');
    assert.match(care, /primaryAffiliation/u, surface + ' must render the doctor affiliation model');
    assert.match(care, /platform\.care\.doctors\.employment\./u, surface + ' must show full-time / part-time engagement');
    assert.match(care, /doctorOrganizationId/u, surface + ' must record the employing organization');
    assert.match(care, /doctorEmploymentType/u, surface + ' must record the engagement');
    const patients = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-care/src/patients.tsx');
    assert.match(patients, /patients\.add\(/u, surface);
    assert.match(patients, /patients\.remove\(/u, surface);
  }

  const flutterFiles = [
    'apps/sdkwork-doctor-flutter-mobile/lib/patients/patient_store.dart',
    'apps/sdkwork-doctor-flutter-mobile/lib/doctors/doctor_directory.dart',
    'apps/sdkwork-doctor-flutter-mobile/lib/doctors/doctor_selection.dart',
    'apps/sdkwork-doctor-flutter-mobile/lib/ui/doctor_tab.dart',
    'apps/sdkwork-doctor-flutter-mobile/lib/ui/me_tab.dart',
    'apps/sdkwork-doctor-flutter-mobile/lib/ui/records_screen.dart',
  ];
  for (const file of flutterFiles) assert.ok(exists(file), file + ' must exist');
  assert.match(read('apps/sdkwork-doctor-flutter-mobile/lib/patients/patient_store.dart'), /sdkwork\.doctor\.patient-profiles\.v1/u);
  assert.match(read('apps/sdkwork-doctor-flutter-mobile/lib/doctors/doctor_selection.dart'), /sdkwork\.doctor\.doctor-selection\.v1/u);
  assert.match(read('apps/sdkwork-doctor-flutter-mobile/lib/doctors/doctor_directory.dart'), /sdkwork\.doctor\.doctor-roster/u);
  assert.match(read('apps/sdkwork-doctor-flutter-mobile/lib/doctors/doctor_directory.dart'), /doctor-lin-qinghe/u);
  const flutter = flutterSources();
  assert.match(flutter, /employmentType/u, 'Flutter must model the employment type');
  assert.match(flutter, /part_time/u, 'Flutter must render a part-time engagement');
  assert.match(flutter, /doctorEmploymentType/u, 'Flutter must record the engagement on a consultation');
  assert.match(flutter, /platform\.care\.profile\.add/u, 'Flutter 我的 must offer patient creation');
  assert.match(flutter, /platform\.care\.doctors\.select/u, 'Flutter 医生 must offer doctor selection');
  assert.match(flutter, /human/u, 'Flutter must record the human consultation mode');

  for (const file of [
    'apps/sdkwork-doctor-mini-program/src/lib/patient-profiles.js',
    'apps/sdkwork-doctor-mini-program/src/lib/doctors.js',
  ]) {
    assert.ok(exists(file), file + ' must exist');
  }
  assert.match(read('apps/sdkwork-doctor-mini-program/src/lib/patient-profiles.js'), /sdkwork\.doctor\.patient-profiles\.v1/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/lib/doctors.js'), /sdkwork\.doctor\.doctor-selection\.v1/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/lib/doctors.js'), /doctor-lin-qinghe/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/lib/doctors.js'), /employmentType/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/lib/doctors.js'), /part_time/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/pages/doctor/index.js'), /platform\.care\.doctors\./u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/pages/doctor/index.js'), /platform\.care\.doctors\.employment/u);
  assert.match(read('apps/sdkwork-doctor-mini-program/src/pages/profile/index.js'), /platform\.care\.profile\./u);
});

test('the shared triage rule contract is the single source of the red-flag vocabulary', () => {
  const rules = JSON.parse(read(RULES));
  assert.equal(rules.kind, 'sdkwork.doctor.triage-rules');
  assert.deepEqual(rules.levels, ['emergency', 'urgent', 'routine', 'self-care']);
  const names = rules.redFlags.map((flag) => flag.name);
  assert.equal(new Set(names).size, names.length, 'red-flag names must be unique');
  assert.ok(rules.redFlags.length >= 6);
});

test('red-flag tokens match across the four triage implementations', () => {
  const rules = JSON.parse(read(RULES));
  const sources = {
    shared: read('apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/index.ts'),
    flutter: read('apps/sdkwork-doctor-flutter-mobile/lib/triage.dart'),
    miniProgram: read('apps/sdkwork-doctor-mini-program/src/lib/triage.js'),
  };
  for (const flag of rules.redFlags) {
    const literal = flag.pattern;
    const escaped = [...literal].map((char) => char.charCodeAt(0) > 127 ? '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0') : char).join('');
    for (const [name, source] of Object.entries(sources)) {
      const haystack = source.toLowerCase();
      assert.ok(
        haystack.includes(literal.toLowerCase()) || haystack.includes(escaped.toLowerCase()),
        name + ' must keep red-flag token ' + flag.name,
      );
    }
  }
});

test('every mobile client ships the 我的 hub and its sub-screens', () => {
  const h5Me = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/src/me.tsx');
  for (const marker of ['doctor-me-identity', 'doctor-me-group', 'doctor-cell', 'PatientFilesPage', 'DevicePage']) {
    assert.ok(h5Me.includes(marker), 'the H5 我的 hub must keep ' + marker);
  }
  assert.ok(exists('apps/sdkwork-doctor-flutter-mobile/lib/ui/patient_files_screen.dart'));
  assert.ok(exists('apps/sdkwork-doctor-flutter-mobile/lib/ui/device_screen.dart'));
  assert.match(
    read('apps/sdkwork-doctor-flutter-mobile/lib/ui/me_tab.dart'),
    /CareGroup/u,
    'Flutter 我的 groups its capability cells',
  );
  for (const page of ['pages/patients/index', 'pages/device/index']) {
    assert.ok(exists('apps/sdkwork-doctor-mini-program/src/' + page + '.js'), page + ' must exist');
    assert.ok(exists('apps/sdkwork-doctor-mini-program/src/' + page + '.wxml'), page + ' must render');
  }
  assert.match(
    read('apps/sdkwork-doctor-mini-program/src/pages/profile/index.wxml'),
    /class="cell"/u,
    'the mini program 我的 renders grouped cells',
  );
});

test('every client ships a tab-level care package or page with specs', () => {
  for (const relativePath of [
    'apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-care/specs/component.spec.json',
    'apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/specs/component.spec.json',
    'apps/sdkwork-doctor-flutter-mobile/specs/component.spec.json',
    'apps/sdkwork-doctor-mini-program/specs/component.spec.json',
  ]) {
    const spec = JSON.parse(read(relativePath));
    assert.equal(spec.kind, 'sdkwork.component.spec');
    assert.ok(spec.component.root.startsWith('apps/'), relativePath + ' root must be repo-relative');
  }
});
