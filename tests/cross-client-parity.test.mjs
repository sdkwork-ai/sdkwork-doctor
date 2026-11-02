import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const ME = '\u6211\u7684';

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

test('red-flag tokens match across the four triage implementations', () => {
  const sources = {
    shared: read('apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/index.ts'),
    flutter: read('apps/sdkwork-doctor-flutter-mobile/lib/triage.dart'),
    miniProgram: read('apps/sdkwork-doctor-mini-program/src/pages/conversation/index.js'),
  };
  const tokens = ['chest pain', '\\u80f8\\u75db', 'cannot breathe', '\\u547c\\u5438\\u56f0\\u96be', 'unconscious', '\\u660f\\u8ff7'];
  for (const token of tokens) {
    for (const [name, source] of Object.entries(sources)) {
      const needle = token.startsWith('\\u') ? String.fromCharCode(parseInt(token.slice(2), 16)) : token;
      const haystack = source.toLowerCase();
      assert.ok(
        haystack.includes(needle.toLowerCase()) || haystack.includes(token.toLowerCase()),
        name + ' must keep red-flag token ' + token,
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
