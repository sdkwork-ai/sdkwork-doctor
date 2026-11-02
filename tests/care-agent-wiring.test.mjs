import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pcRoot = path.join(repoRoot, 'apps/sdkwork-doctor-pc');
const h5Root = path.join(repoRoot, 'apps/sdkwork-doctor-h5');

function url(absolutePath) {
  return new URL('file:///' + absolutePath.replaceAll('\\', '/')).href;
}

const pcEnvironment = await import(url(path.join(pcRoot, 'src/bootstrap/environment.ts')));
const h5Environment = await import(url(path.join(h5Root, 'src/bootstrap/environment.ts')));
const pcCoreAgent = await import(url(path.join(pcRoot, 'packages/sdkwork-doctor-pc-core/src/agent/index.ts')));
const h5CoreAgent = await import(url(path.join(h5Root, 'packages/sdkwork-doctor-h5-core/src/agent/index.ts')));

const AGENTS_URL = 'https://agents.example.com';

test('both browser runtimes read agentsApiBaseUrl from the runtime document', () => {
  for (const environment of [pcEnvironment, h5Environment]) {
    assert.equal(environment.resolveEnvironmentFromDocument({ agentsApiBaseUrl: AGENTS_URL }).agentsApiBaseUrl, AGENTS_URL);
    assert.equal(environment.resolveEnvironmentFromDocument(null).agentsApiBaseUrl, '');
  }
});

test('the core package selects hosted only when the document and a credential agree', async () => {
  const hosted = await pcCoreAgent.createDoctorPcCareAgent({ agentsApiBaseUrl: AGENTS_URL, accessToken: 'token' });
  assert.equal(hosted.mode, 'hosted');
  assert.equal(hosted.port.mode, 'hosted');

  const noToken = await pcCoreAgent.createDoctorPcCareAgent({ agentsApiBaseUrl: AGENTS_URL, accessToken: null });
  assert.equal(noToken.mode, 'offline');

  const noUrl = await pcCoreAgent.createDoctorPcCareAgent({ agentsApiBaseUrl: '', accessToken: 'token' });
  assert.equal(noUrl.mode, 'offline');

  const h5Hosted = await h5CoreAgent.createDoctorH5CareAgent({ agentsApiBaseUrl: AGENTS_URL, accessToken: 'token' });
  assert.equal(h5Hosted.mode, 'hosted');
});

test('the session token is the only credential source, never a VITE_ variable', () => {
  for (const file of [
    path.join(pcRoot, 'packages/sdkwork-doctor-pc-core/src/agent/index.ts'),
    path.join(h5Root, 'packages/sdkwork-doctor-h5-core/src/agent/index.ts'),
    path.join(pcRoot, 'src/bootstrap/runtime.ts'),
    path.join(h5Root, 'src/bootstrap/runtime.ts'),
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bVITE_[A-Z0-9_]+/u, file);
    assert.doesNotMatch(source, /\bimport\.meta\.env\b/u, file);
  }
});

test('both app shells pass the composed port into the tab pages', () => {
  const pairs = [
    [path.join(pcRoot, 'src/App.tsx'), path.join(pcRoot, 'packages/sdkwork-doctor-pc-shell/src/DoctorPcRoutes.tsx')],
    [path.join(h5Root, 'src/App.tsx'), path.join(h5Root, 'packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx')],
  ];
  for (const [appFile, routesFile] of pairs) {
    const app = fs.readFileSync(appFile, 'utf8');
    assert.match(app, /agent=\{runtime\.agent\}/u, appFile);
    assert.match(app, /records=\{runtime\.records\}/u, appFile);
    assert.match(app, /blocks=\{runtime\.blocks\}/u, appFile);
    const routes = fs.readFileSync(routesFile, 'utf8');
    assert.match(routes, /<ChatPage[^>]*agent=\{agent\}/u, routesFile);
    assert.match(routes, /<MePage[^>]*agent=\{agent\}/u, routesFile);
    assert.match(routes, /path="records"/u, routesFile);
  }
});

test('the records store is owned by core and consumed by the care tabs', () => {
  for (const [, routesFile] of [
    [path.join(pcRoot, 'src/App.tsx'), path.join(pcRoot, 'packages/sdkwork-doctor-pc-shell/src/DoctorPcRoutes.tsx')],
    [path.join(h5Root, 'src/App.tsx'), path.join(h5Root, 'packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx')],
  ]) {
    const routes = fs.readFileSync(routesFile, 'utf8');
    assert.match(routes, /<ChatPage[^>]*records=\{records\}/u, routesFile);
    assert.match(routes, /<RecordsPage[^>]*records=\{records\}/u, routesFile);
  }
  for (const careFile of [
    path.join(pcRoot, 'packages/sdkwork-doctor-pc-care/src/index.tsx'),
    path.join(h5Root, 'packages/sdkwork-doctor-h5-care/src/index.tsx'),
  ]) {
    const source = fs.readFileSync(careFile, 'utf8');
    assert.match(source, /export function RecordsPage/u, careFile);
    assert.match(source, /records\.add\(createVisitRecord/u, careFile);
    assert.match(source, /useSyncExternalStore/u, careFile);
    assert.doesNotMatch(source, /localStorage/u, careFile);
  }
  for (const storeFile of [
    path.join(pcRoot, 'packages/sdkwork-doctor-pc-core/src/records/index.ts'),
    path.join(h5Root, 'packages/sdkwork-doctor-h5-core/src/records/index.ts'),
  ]) {
    const source = fs.readFileSync(storeFile, 'utf8');
    assert.match(source, /VISIT_RECORDS_STORAGE_KEY/u, storeFile);
    assert.match(source, /createVisitRecordStore/u, storeFile);
  }
});

test('care pages report the mode that actually answered and never build a transport', () => {
  for (const careFile of [
    path.join(pcRoot, 'packages/sdkwork-doctor-pc-care/src/index.tsx'),
    path.join(h5Root, 'packages/sdkwork-doctor-h5-care/src/index.tsx'),
  ]) {
    const source = fs.readFileSync(careFile, 'utf8');
    assert.match(source, /agent\.mode === 'hosted'/u, careFile);
    assert.match(source, /platform\.care\.mode\.hosted/u, careFile);
    assert.match(source, /platform\.care\.mode\.offline/u, careFile);
    assert.doesNotMatch(source, /\bfetch\(/u, careFile);
    assert.doesNotMatch(source, /Authorization/u, careFile);
    assert.doesNotMatch(source, /agentsApiBaseUrl/u, careFile);
    assert.doesNotMatch(source, /createHostedCareAgent|createLocalCareAgent/u, careFile);
  }
});
