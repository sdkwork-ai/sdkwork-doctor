import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const appsRoot = path.join(repoRoot, 'apps');

function listPackageRoots() {
  const roots = [];
  for (const app of fs.readdirSync(appsRoot)) {
    const appDir = path.join(appsRoot, app);
    if (!fs.statSync(appDir).isDirectory()) continue;
    if (fs.existsSync(path.join(appDir, 'package.json'))) roots.push(appDir);
    const packagesDir = path.join(appDir, 'packages');
    if (!fs.existsSync(packagesDir)) continue;
    for (const entry of fs.readdirSync(packagesDir)) {
      const packageDir = path.join(packagesDir, entry);
      if (fs.existsSync(path.join(packageDir, 'package.json'))) roots.push(packageDir);
    }
  }
  return roots;
}

const packageRoots = listPackageRoots();

test('the workspace contains every authored package', () => {
  const names = packageRoots.map((root) => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name);
  for (const expected of [
    '@sdkwork/doctor-common-diagnostics',
    '@sdkwork/doctor-pc-core',
    '@sdkwork/doctor-pc-commons',
    '@sdkwork/doctor-pc-shell',
    '@sdkwork/doctor-pc-diagnostics',
    '@sdkwork/doctor-h5-core',
    '@sdkwork/doctor-h5-commons',
    '@sdkwork/doctor-h5-shell',
    '@sdkwork/doctor-h5-diagnostics',
  ]) {
    assert.ok(names.includes(expected), expected + ' must be a workspace package');
  }
});

test('every package export target exists', () => {
  for (const root of packageRoots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const [specifier, target] of Object.entries(manifest.exports ?? {})) {
      const targetPath = typeof target === 'string' ? target : target.import ?? target.default ?? target.types;
      assert.equal(
        fs.existsSync(path.join(root, targetPath)),
        true,
        manifest.name + ' export ' + specifier + ' points at missing ' + targetPath,
      );
    }
  }
});

test('every authored package owns a component spec', () => {
  for (const root of packageRoots) {
    assert.equal(fs.existsSync(path.join(root, 'specs', 'component.spec.json')), true, path.relative(repoRoot, root) + ' must own specs/component.spec.json');
  }
});

test('workspace dependencies resolve to a declared package name', () => {
  const names = new Set(packageRoots.map((root) => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name));
  for (const root of packageRoots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (typeof version !== 'string' || !version.startsWith('workspace:')) continue;
        assert.ok(names.has(name), manifest.name + ' declares workspace dependency ' + name + ' that is not a workspace package');
      }
    }
  }
});

test('feature packages do not import generated SDK transports directly', () => {
  const offenders = [];
  for (const root of packageRoots) {
    const srcDir = path.join(root, 'src');
    if (!fs.existsSync(srcDir)) continue;
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/u.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/generated-typescript|generated\/server-openapi/u.test(text)) offenders.push(path.relative(repoRoot, full));
      }
    };
    walk(srcDir);
  }
  assert.deepEqual(offenders, []);
});
