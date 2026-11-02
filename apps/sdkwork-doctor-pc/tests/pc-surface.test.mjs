import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');

test('PC app root declares the standard root files', () => {
  for (const file of ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx']) {
    assert.equal(fs.existsSync(path.join(appRoot, file)), true, file + ' must exist');
  }
});

test('PC packages follow the sdkwork-doctor-pc prefix', () => {
  const packagesDir = path.join(appRoot, 'packages');
  const names = fs.readdirSync(packagesDir);
  assert.ok(names.length >= 4, 'expected core, commons, shell, and diagnostics packages');
  for (const name of names) {
    assert.match(name, /^sdkwork-doctor-pc-(core|commons|shell|diagnostics|care)$/u);
  }
});

test('PC runtime documents exist for every supported profile and environment', () => {
  for (const profile of ['standalone', 'cloud']) {
    for (const environment of ['development', 'test', 'staging', 'demo', 'production']) {
      const file = path.join(appRoot, 'config', 'browser', 'runtime-env.' + profile + '.' + environment + '.example.json');
      assert.equal(fs.existsSync(file), true, file + ' must exist');
      const document = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(document.profileId, profile + '.' + environment);
      assert.equal(document.browserOriginMode, 'same-origin');
    }
  }
});

test('PC app does not deep-import package src paths', () => {
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/u.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/from '.*packages\/[^']+\/src\//u.test(text)) offenders.push(path.relative(appRoot, full));
    }
  };
  walk(path.join(appRoot, 'packages'));
  assert.deepEqual(offenders, []);
});
