import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturesPath = path.join(repoRoot, 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-fixtures.json');
const modulePath = path.join(repoRoot, 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/index.ts');
const { triageSymptoms } = await import(pathToUrl(modulePath));

function pathToUrl(absolutePath) {
  return new URL('file:///' + absolutePath.replaceAll('\\', '/')).href;
}

test('shared TypeScript triage executes every fixture to its expected level', () => {
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  assert.equal(fixtures.kind, 'sdkwork.doctor.triage-fixtures');
  for (const item of fixtures.cases) {
    const actual = triageSymptoms(item.input).level;
    assert.equal(actual, item.level, JSON.stringify(item.input));
  }
});
