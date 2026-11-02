import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const RECORDS = '\u8bb0\u5f55';
const ME = '\u6211\u7684';
const RULES = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-rules.json';
const COMPOSITION = 'specs/app-composition.contract.json';

test('every client exposes the same care blocks', () => {
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
  }

  const mp = JSON.parse(read('apps/sdkwork-doctor-mini-program/src/app.json'));
  assert.deepEqual(mp.pages, [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/records/index',
    'pages/profile/index',
  ]);
  assert.deepEqual(mp.tabBar.list.map((tab) => tab.text), [CHAT, DOCTOR, RECORDS, ME]);
  assert.equal(mp.tabBar.list.length, required.length);

  const flutter = read('apps/sdkwork-doctor-flutter-mobile/lib/main.dart');
  assert.equal(flutter.split('NavigationDestination(').length - 1, required.length);
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
