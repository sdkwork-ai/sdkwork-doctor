import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const vectorsPath = path.join(
  repoRoot,
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/contracts/care-fingerprint-vectors.json',
);
const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

const ts = await import(new URL('file:///' + path.join(
  repoRoot,
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent/src/fingerprint.ts',
).replaceAll('\\', '/')).href);
const miniProgram = require(path.join(repoRoot, 'apps/sdkwork-doctor-mini-program/src/lib/fingerprint.js'));

test('the frozen vector contract is well formed', () => {
  assert.equal(vectors.kind, 'sdkwork.doctor.care-fingerprint-vectors');
  assert.equal(vectors.prefix, 'care.v1:');
  assert.ok(vectors.turns.length >= 4);
  assert.ok(vectors.sessions.length >= 1);
});

test('TypeScript reproduces every frozen turn and session vector', () => {
  for (const vector of vectors.turns) {
    assert.equal(
      ts.careTurnPayloadHash(vector.content, vector.contentType, vector.entrySurface),
      vector.turnPayloadHash,
      vector.content,
    );
  }
  for (const vector of vectors.sessions) {
    assert.equal(ts.careSessionPayloadHash(vector.title, vector.entrySurface), vector.sessionPayloadHash);
  }
});

test('the mini program reproduces every frozen turn and session vector', () => {
  for (const vector of vectors.turns) {
    assert.equal(
      miniProgram.careTurnPayloadHash(vector.content, vector.contentType, vector.entrySurface),
      vector.turnPayloadHash,
      vector.content,
    );
  }
  for (const vector of vectors.sessions) {
    assert.equal(miniProgram.careSessionPayloadHash(vector.title, vector.entrySurface), vector.sessionPayloadHash);
  }
});

test('TypeScript and the mini program agree on the same content', () => {
  for (const content of ['chest pain', 'mild headache', '孩子发烧39℃', '']) {
    assert.equal(
      ts.careTurnPayloadHash(content, 'text/plain', 'pc'),
      miniProgram.careTurnPayloadHash(content, 'text/plain', 'pc'),
    );
  }
});
