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

test('the composition contract is well formed', () => {
  assert.equal(contract.kind, 'sdkwork.doctor.app-composition');
  assert.ok(contract.blocks.length >= 5);
  const ids = contract.blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length, 'block ids must be unique');
  for (const block of contract.blocks) {
    assert.match(block.pageId, /^app\.doctor\.[a-z]+\.[a-z]+$/u, block.id);
    assert.match(block.route, /^\/doctor\/[a-z]+$/u, block.id);
    assert.match(block.labelKey, /^platform\.care\.[a-z.]+$/u, block.id);
    assert.ok(block.surfaces.length > 0, block.id);
  }
  assert.deepEqual(contract.blocks.map((block) => block.order), [...contract.blocks.map((block) => block.order)].sort((a, b) => a - b));
});

test('the TypeScript catalogue mirrors the contract exactly', () => {
  const fromCode = blocks.APP_BLOCKS.map(structural);
  const fromContract = contract.blocks.map((block) => structural(block));
  assert.deepEqual(fromCode, fromContract);
  assert.deepEqual(blocks.DOCTOR_PAGE_IDS, Object.fromEntries(contract.blocks.map((block) => [block.id, block.pageId])));
});

test('every surface resolves the blocks declared for it', () => {
  const pc = blocks.resolveAppBlocks('pc');
  assert.deepEqual(pc.map((block) => block.id), ['home', 'chat', 'doctor', 'records', 'me']);

  const h5 = blocks.resolveAppBlocks('h5');
  assert.deepEqual(h5.map((block) => block.id), ['home', 'chat', 'doctor', 'records', 'me']);

  const flutter = blocks.resolveAppBlocks('flutter');
  assert.deepEqual(flutter.map((block) => block.id), ['chat', 'doctor', 'records', 'me']);

  const miniProgram = blocks.resolveAppBlocks('mini_program');
  assert.deepEqual(miniProgram.map((block) => block.id), ['chat', 'doctor', 'records', 'me']);
});

test('hidden removes only optional blocks', () => {
  const hidden = blocks.resolveAppBlocks('pc', { hidden: ['home', 'chat'] });
  assert.deepEqual(hidden.map((block) => block.id), ['chat', 'doctor', 'records', 'me']);
});

test('order floats known ids first and ignores unknown ids', () => {
  const ordered = blocks.resolveAppBlocks('pc', { order: ['me', 'records', 'does-not-exist'] });
  const ids = ordered.map((block) => block.id);
  assert.equal(ids[0], 'me');
  assert.equal(ids[1], 'records');
  assert.ok(ids.includes('home'));
  assert.equal(ordered.length, 5);
});

test('labels override the i18n key per deployment', () => {
  const labelled = blocks.resolveAppBlocks('pc', { labels: { records: 'tenant.care.trips', chat: '   ' } });
  const records = labelled.find((block) => block.id === 'records');
  const chat = labelled.find((block) => block.id === 'chat');
  assert.equal(records.label, 'tenant.care.trips');
  assert.equal(chat.label, 'platform.care.nav.chat', 'blank labels fall back to the contract key');
});

test('the home route follows the surface presentation', () => {
  assert.equal(blocks.hasHomeBlock('pc'), true);
  assert.equal(blocks.hasHomeBlock('h5'), true);
  assert.equal(blocks.hasHomeBlock('flutter'), false);
  assert.equal(blocks.hasHomeBlock('mini_program'), false);
  assert.equal(blocks.resolveHomeRoute('pc'), '/doctor/home');
  assert.equal(blocks.resolveHomeRoute('h5'), '/doctor/home');
  assert.equal(blocks.resolveHomeRoute('flutter'), '/doctor/chat');
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
    const environment = read(app + '/src/bootstrap/environment.ts');
    assert.match(environment, /appBlocks/u, app);
    assert.match(environment, /theme/u, app);
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
  const pcRoutes = read('apps/sdkwork-doctor-pc/packages/sdkwork-doctor-pc-shell/src/DoctorPcRoutes.tsx');
  const h5Routes = read('apps/sdkwork-doctor-h5/packages/sdkwork-doctor-h5-shell/src/DoctorH5Routes.tsx');
  for (const routes of [pcRoutes, h5Routes]) {
    assert.match(routes, /path="home"/u);
    assert.match(routes, /HomePage/u);
  }
});
