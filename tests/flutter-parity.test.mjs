import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const flutterRoot = path.join(repoRoot, 'apps/sdkwork-doctor-flutter-mobile');
const miniProgramRoot = path.join(repoRoot, 'apps/sdkwork-doctor-mini-program');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('the Flutter tabs render from the generated care catalog', () => {
  const main = read(path.join(flutterRoot, 'lib/main.dart'));
  for (const key of [
    'platform.care.nav.chat',
    'platform.care.doctor.title',
    'platform.care.me.title',
    'platform.care.chat.send',
    'platform.care.chat.error',
    'platform.care.mode.hosted',
    'platform.care.mode.offline',
    'platform.care.me.completeness',
  ]) {
    assert.ok(main.includes(key), 'Flutter main.dart must render ' + key);
  }
  assert.doesNotMatch(main, /'对话'|'医生'|'我的'/u, 'Flutter tab copy must not be hard-coded');
});

test('the mini program pages render from the generated care catalog', () => {
  for (const page of ['conversation', 'doctor', 'profile']) {
    const source = read(path.join(miniProgramRoot, 'src/pages', page, 'index.js'));
    assert.match(source, /require\('\.\.\/\.\.\/lib\/i18n\.js'\)/u, page);
    assert.match(source, /careText\(/u, page);
  }
  for (const page of ['conversation', 'doctor', 'profile']) {
    const wxml = read(path.join(miniProgramRoot, 'src/pages', page, 'index.wxml'));
    assert.doesNotMatch(wxml, />Family doctor chat<|>Health record<|>Send<|>Me</u, page + ' hard-codes English copy');
    assert.match(wxml, /\{\{/u, page + ' must bind localized data');
  }
});

test('Flutter and the mini program speak the same agents contract', () => {
  const dart = read(path.join(flutterRoot, 'lib/agent/care_agent.dart'));
  const mp = read(path.join(miniProgramRoot, 'src/lib/agent.js'));
  for (const source of [dart, mp]) {
    assert.match(source, /agent\.family-doctor/u);
    assert.match(source, /\/app\/v3\/api/u);
    assert.match(source, /'assistant'/u);
    assert.match(source, /'interactive'/u);
    assert.match(source, /assistant_output/u);
    assert.match(source, /careTurnPayloadHash/u);
  }
  const dartFingerprint = read(path.join(flutterRoot, 'lib/agent/fingerprint.dart'));
  const mpFingerprint = read(path.join(miniProgramRoot, 'src/lib/fingerprint.js'));
  for (const source of [dartFingerprint, mpFingerprint]) {
    assert.match(source, /care\.v1:/u);
    assert.match(source, /care\.turn\.v1/u);
  }
});

test('neither native client carries a hard-coded access token', () => {
  const dart = read(path.join(flutterRoot, 'lib/agent/care_agent.dart'));
  const mp = read(path.join(miniProgramRoot, 'src/lib/agent.js'));
  for (const source of [dart, mp]) {
    assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{10,}/u);
    assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9._-]{20,}/u);
  }
  const mpConfig = read(path.join(miniProgramRoot, 'src/lib/runtime-config.js'));
  assert.match(mpConfig, /getExtConfigSync/u, 'the mini program host injects the base URL at runtime');
});
