import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturesPath = path.join(repoRoot, 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/triage-fixtures.json');
const mpTriage = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/triage.js'));

test('mini program triage executes every shared fixture to its expected level', () => {
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  assert.equal(fixtures.kind, 'sdkwork.doctor.triage-fixtures');
  assert.ok(fixtures.cases.length >= 8);
  for (const item of fixtures.cases) {
    assert.equal(mpTriage.triageLevel(item.input), item.level, JSON.stringify(item.input));
  }
});

test('emergency guidance never offers self-treatment', () => {
  const reply = mpTriage.triageReply('emergency');
  assert.match(reply, /emergency services/i);
  assert.doesNotMatch(reply, /take (medicine|ibuprofen|paracetamol)/i);
});
