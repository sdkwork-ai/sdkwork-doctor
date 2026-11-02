import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');

test('H5 app root declares the standard root files', () => {
  for (const file of ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx']) {
    assert.equal(fs.existsSync(path.join(appRoot, file)), true, file + ' must exist');
  }
});

test('H5 packages follow the sdkwork-doctor-h5 prefix', () => {
  const names = fs.readdirSync(path.join(appRoot, 'packages'));
  assert.ok(names.length >= 4);
  for (const name of names) {
    assert.match(name, /^sdkwork-doctor-h5-(core|commons|shell|diagnostics)$/u);
  }
});

test('H5 runtime documents exist for every supported profile and environment', () => {
  for (const profile of ['standalone', 'cloud']) {
    for (const environment of ['development', 'test', 'staging', 'demo', 'production']) {
      const file = path.join(appRoot, 'config', 'browser', 'runtime-env.' + profile + '.' + environment + '.example.json');
      assert.equal(fs.existsSync(file), true, file + ' must exist');
      const document = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(document.profileId, profile + '.' + environment);
    }
  }
});
