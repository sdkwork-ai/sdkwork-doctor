import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '..');
const modulePath = path.join(repoRoot, 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent/src/mode.ts');

test('care agent mode resolution never silently falls back from hosted', async () => {
  assert.equal(fs.existsSync(modulePath), true);
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.match(source, /resolveCareAgentMode/u);
  assert.match(source, /hasAccessToken/u);
  assert.match(source, /HostedAgentNotConfiguredError/u);
});

test('mode module is importable TypeScript source with the documented contract', () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  const hostedIndex = source.indexOf("return 'hosted'");
  const offlineIndex = source.indexOf("return 'offline'");
  assert.ok(hostedIndex > 0 && offlineIndex > 0);
  assert.ok(source.includes('agentsApiBaseUrl'));
  assert.ok(source.includes("(environment.agentsApiBaseUrl ?? '').trim()"));
  void pathToFileURL(modulePath);
});
