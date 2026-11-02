import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const ME = '\u6211\u7684';
const RULES = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-rules.json';

test('every client exposes the same three care tabs', () => {
  const pc = read('apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-shell/src/navigation.ts');
  const h5 = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/navigation.ts');
  const mp = JSON.parse(read('apps/sdkwork-doctor-mini-program/src/app.json'));
  const flutter = read('apps/sdkwork-doctor-flutter-mobile/lib/main.dart');

  for (const [label, text] of [['pc', pc], ['h5', h5]]) {
    for (const target of ['/doctor/chat', '/doctor/doctor', '/doctor/me']) {
      assert.match(text, new RegExp(target.replaceAll('/', '\\/'), 'u'), label + ' must route ' + target);
    }
  }
  assert.deepEqual(mp.pages, ['pages/conversation/index', 'pages/doctor/index', 'pages/profile/index']);
  assert.deepEqual(mp.tabBar.list.map((tab) => tab.text), [CHAT, DOCTOR, ME]);
  assert.equal(flutter.split('NavigationDestination(').length - 1, 3);
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
    miniProgram: read('apps/sdkwork-doctor-mini-program/src/pages/conversation/index.js'),
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
