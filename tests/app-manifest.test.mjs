import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'agent.app.config.json'), 'utf8'));

test('app manifest declares the application identity', () => {
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.kind, 'agent.app');
  assert.equal(manifest.app.key, 'sdkwork-doctor');
  assert.equal(manifest.app.appType, 'APP_REACT');
});

test('every supported deployment profile has an enabled package', () => {
  const packages = manifest.artifacts.installConfig.packages;
  for (const profile of manifest.runtime.supportedDeploymentProfiles) {
    assert.ok(
      packages.some((entry) => entry.deploymentProfile === profile && entry.enabled !== false),
      'no package covers deployment profile ' + profile,
    );
  }
});

test('package ids encode their deployment profile', () => {
  for (const entry of manifest.artifacts.installConfig.packages) {
    assert.ok(entry.id.split('-').includes(entry.deploymentProfile), entry.id + ' must include ' + entry.deploymentProfile);
  }
});

test('default package ids resolve to a declared package', () => {
  const ids = new Set(manifest.artifacts.installConfig.packages.map((entry) => entry.id));
  assert.ok(ids.has(manifest.artifacts.installConfig.defaultPackageId));
  assert.ok(ids.has(manifest.publish.defaultPackageId));
});

test('media roles carry the primary icon and a catalog screenshot', () => {
  const icon = manifest.media.icons.primary;
  assert.equal(icon.type, 'ICON');
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.ok(manifest.media.screenshots.length >= 1);
  assert.ok(manifest.media.previews.length >= 1);
});

test('release notes contain exactly one current entry covering the packages', () => {
  const current = manifest.release.notes.filter((note) => note.current === true);
  assert.equal(current.length, 1);
  const ids = new Set(manifest.artifacts.installConfig.packages.map((entry) => entry.id));
  for (const packageId of current[0].packageIds) {
    assert.ok(ids.has(packageId), 'release note references unknown package ' + packageId);
  }
});

test('deployment config file exists at the path the manifest declares', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, manifest.metadata.deploymentConfig)), true);
});
