import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const contract = JSON.parse(read('specs/app-composition.contract.json'));
const designTokens = JSON.parse(read('specs/design-tokens.contract.json'));
const blocksModulePath = path.join(
  repoRoot,
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-blocks/src/index.ts',
);
const blocks = await import(new URL('file:///' + blocksModulePath.replaceAll('\\', '/')).href);

const STRUCTURAL_FIELDS = ['id', 'kind', 'pageId', 'route', 'labelKey', 'icon', 'order', 'surfaces', 'optional'];

function structural(block) {
  return Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [field, block[field]]));
}

test('the composition contract declares exactly the four tabs', () => {
  assert.equal(contract.kind, 'sdkwork.doctor.app-composition');
  assert.deepEqual(contract.blocks.map((block) => block.id), ['chat', 'doctor', 'records', 'me']);
  const ids = contract.blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length, 'block ids must be unique');
  for (const block of contract.blocks) {
    assert.match(block.pageId, /^app\.doctor\.[a-z]+\.[a-z]+$/u, block.id);
    assert.match(block.route, /^\/doctor\/[a-z]+$/u, block.id);
    assert.match(block.labelKey, /^platform\.care\.[a-z.]+$/u, block.id);
    assert.ok(block.surfaces.length > 0, block.id);
    assert.equal(block.optional, false, block.id + ' tab is required');
  }
  assert.deepEqual(contract.blocks.map((block) => block.order), [...contract.blocks.map((block) => block.order)].sort((a, b) => a - b));
});

test('the workbench landing is a route, not a tab', () => {
  assert.equal(contract.landing.route, '/doctor');
  assert.ok(contract.landing.sections.length > 0);
  for (const block of contract.blocks) {
    assert.notEqual(block.route, contract.landing.route, 'no tab may own the landing route');
  }
  assert.equal(contract.surfaces.pc.landing, true);
  assert.equal(contract.surfaces.h5.landing, true);
  assert.equal(contract.surfaces.flutter.landing, false);
  assert.equal(contract.surfaces.mini_program.landing, false);
});

test('the TypeScript catalogue mirrors the contract exactly', () => {
  const fromCode = blocks.APP_BLOCKS.map(structural);
  const fromContract = contract.blocks.map((block) => structural(block));
  assert.deepEqual(fromCode, fromContract);
  assert.deepEqual(blocks.DOCTOR_PAGE_IDS, Object.fromEntries(contract.blocks.map((block) => [block.id, block.pageId])));
});

test('every surface resolves the same four blocks', () => {
  for (const surface of ['pc', 'h5', 'flutter', 'mini_program']) {
    assert.deepEqual(blocks.resolveAppBlocks(surface).map((block) => block.id), ['chat', 'doctor', 'records', 'me'], surface);
  }
});

test('required blocks cannot be hidden', () => {
  const hidden = blocks.resolveAppBlocks('pc', { hidden: ['chat', 'doctor'] });
  assert.deepEqual(hidden.map((block) => block.id), ['chat', 'doctor', 'records', 'me']);
});

test('order floats known ids first and ignores unknown ids', () => {
  const ordered = blocks.resolveAppBlocks('pc', { order: ['me', 'chat', 'does-not-exist'] });
  const ids = ordered.map((block) => block.id);
  assert.equal(ids[0], 'me');
  assert.equal(ids[1], 'chat');
  assert.equal(ordered.length, 4);
});

test('labels override the i18n key per deployment', () => {
  const labelled = blocks.resolveAppBlocks('pc', { labels: { doctor: 'tenant.care.clinicians', chat: '   ' } });
  const doctor = labelled.find((block) => block.id === 'doctor');
  const chat = labelled.find((block) => block.id === 'chat');
  assert.equal(doctor.label, 'tenant.care.clinicians');
  assert.equal(chat.label, 'platform.care.nav.chat', 'blank labels fall back to the contract key');
});

test('the landing route follows the surface presentation', () => {
  assert.equal(blocks.hasLanding('pc'), true);
  assert.equal(blocks.hasLanding('h5'), true);
  assert.equal(blocks.hasLanding('flutter'), false);
  assert.equal(blocks.hasLanding('mini_program'), false);
  assert.equal(blocks.resolveLandingRoute('pc'), '/doctor');
  assert.equal(blocks.resolveLandingRoute('h5'), '/doctor');
  assert.equal(blocks.resolveLandingRoute('flutter'), '/doctor/chat');
  assert.equal(blocks.resolveLandingRoute('mini_program'), '/doctor/chat');
});

test('the default theme equals the design-token contract', () => {
  assert.equal(blocks.DEFAULT_APP_THEME.primary, designTokens.colors.primary.toUpperCase());
  assert.equal(blocks.DEFAULT_APP_THEME.primaryStrong, designTokens.colors.primaryStrong.toUpperCase());
  assert.equal(blocks.DEFAULT_APP_THEME.nav, designTokens.colors.nav.toUpperCase());
  assert.equal(blocks.DEFAULT_APP_THEME.canvas, designTokens.colors.canvas.toUpperCase());
  assert.equal(blocks.DEFAULT_APP_THEME.surface, designTokens.colors.surface.toUpperCase());
  assert.equal(blocks.DEFAULT_APP_THEME.surfaceAlt, designTokens.colors.surfaceAlt.toUpperCase());
});

test('theme overrides are validated one by one', () => {
  const custom = blocks.resolveAppTheme({ primary: '#123456', nav: 'not-a-colour', unknown: '#fff' });
  assert.equal(custom.primary, '#123456');
  assert.equal(custom.nav, blocks.DEFAULT_APP_THEME.nav, 'an invalid value falls back to the default');
  assert.equal('unknown' in custom, false);

  assert.deepEqual(blocks.resolveAppTheme(undefined), blocks.DEFAULT_APP_THEME);

  const variables = blocks.themeCssVariables(custom);
  assert.equal(variables['--doctor-accent'], '#123456');
  assert.equal(variables['--doctor-nav'], blocks.DEFAULT_APP_THEME.nav);
});

test('theme application writes the documented CSS variables', () => {
  const writes = new Map();
  blocks.applyThemeToStyle({ setProperty: (name, value) => writes.set(name, value) }, blocks.DEFAULT_APP_THEME);
  assert.equal(writes.get('--doctor-accent'), blocks.DEFAULT_APP_THEME.primary);
  assert.equal(writes.get('--doctor-bg'), blocks.DEFAULT_APP_THEME.canvas);
  assert.equal(writes.get('--doctor-surface-alt'), blocks.DEFAULT_APP_THEME.surfaceAlt);
});

test('both browser bootstraps resolve blocks and apply the theme', () => {
  for (const app of ['apps/sdkwork-doctor-pc', 'apps/sdkwork-doctor-h5']) {
    const runtime = read(app + '/src/bootstrap/runtime.ts');
    assert.match(runtime, /resolveAppBlocks\(/u, app);
    assert.match(runtime, /applyThemeToStyle\(/u, app);
    assert.match(runtime, /blocks,/u, app);
    assert.match(runtime, /doctorDirectory/u, app);
    assert.match(runtime, /patients/u, app);
    const environment = read(app + '/src/bootstrap/environment.ts');
    assert.match(environment, /appBlocks/u, app);
    assert.match(environment, /theme/u, app);
    assert.match(environment, /careDoctorDirectoryUrl/u, app);
  }
});

test('the shells project their navigation from the resolved blocks', () => {
  const pcShell = read('apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-shell/src/AppShell.tsx');
  const h5Shell = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/MobileShell.tsx');
  for (const shell of [pcShell, h5Shell]) {
    assert.match(shell, /ResolvedAppBlock/u);
    assert.match(shell, /blocks\.map\(/u);
    assert.match(shell, /block\.route/u);
    assert.match(shell, /block\.label/u);
  }
});

test('both browser route tables implement the four tabs', () => {
  for (const routes of [
    read('apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-shell/src/DoctorPcRoutes.tsx'),
    read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx'),
  ]) {
    assert.match(routes, /path="chat"/u);
    assert.match(routes, /path="doctor"/u);
    assert.match(routes, /path="me"/u);
    assert.match(routes, /path="records"/u, 'records is a tab route');
    assert.match(routes, /path="me\/records"/u, 'older records links still resolve');
    assert.match(routes, /<Route index element=\{<HomePage/u, 'the landing is the index route');
  }
});

test('the H5 我的 hub links every capability cell into its module', () => {
  const routes = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx');
  assert.match(routes, /path="me\/patients"/u, 'patient files are a 我的 sub-screen');
  assert.match(routes, /path="me\/device"/u, 'the device environment is a 我的 sub-screen');
  assert.match(routes, /path="call"/u, 'the video call is a full-screen route');
  assert.match(routes, /<CareCallPage[\s\S]*patients=\{patients\}/u, 'the call shares the runtime stores');
  const care = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/src/me.tsx');
  for (const target of ['/doctor/me/patients', '/doctor/me/device', '/doctor/doctor', '/doctor/chat', '/doctor/records']) {
    assert.match(care, new RegExp('to="' + target + '"', 'u'), 'the hub must link to ' + target);
  }
  assert.match(care, /to="\/doctor\/call\?video=1"/u, 'the hub starts the video call with the camera on');
  assert.match(care, /className="doctor-cell"/u, 'each capability is a grouped cell');
  assert.match(care, /doctor-me-identity/u, 'the avatar identity block is part of the hub');
});

test('the call is a chromeless full-screen mode of the shared session', () => {
  const shell = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/MobileShell.tsx');
  assert.match(shell, /CHROMELESS_PATHS/u, 'the shell owns the list of full-screen routes');
  assert.match(shell, /'\/doctor\/call'/u, 'the call route hides the app bar and tab bar');
  const call = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-care/src/call.tsx');
  assert.match(call, /createVisitRecord\(/u, 'a spoken turn is recorded like a typed turn');
  assert.match(call, /agent\.send\(/u, 'the call goes through the same conversation transport');
  assert.match(call, /navigate\('\/doctor\/chat'/u, 'hanging up returns to the text transcript');
  assert.match(call, /createBrowserSpeechRecognizer/u, 'the call degrades when speech is unavailable');
});
