import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const tokens = JSON.parse(read('specs/design-tokens.contract.json'));
const { colors } = tokens;

const CSS_SURFACES = [
  'apps/sdkwork-doctor-pc/src/index.css',
  'apps/sdkwork-doctor-h5/src/index.css',
];

function cssVariables(css) {
  const root = /:root\s*\{([\s\S]*?)\n\}/u.exec(css);
  assert.ok(root, 'CSS must declare a :root token block');
  const variables = new Map();
  for (const match of root[1].matchAll(/--doctor-([a-z-]+)\s*:\s*([^;]+);/gu)) {
    variables.set(match[1], match[2].trim().toLowerCase());
  }
  return variables;
}

function borderViolations(css) {
  const violations = [];
  for (const match of css.matchAll(/(?:^|[;{\s])border(?:-(?:top|right|bottom|left))?\s*:\s*([^;}]+)/gu)) {
    const value = match[1].trim().toLowerCase();
    if (value === '0' || value === 'none' || value === '0 none' || value === 'none 0') continue;
    violations.push(value);
  }
  return violations;
}

function shadowViolations(css) {
  return [...css.matchAll(/box-shadow\s*:\s*([^;}]+)/gu)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((value) => value !== 'none');
}

test('the design contract describes one tech-blue, flat, borderless system', () => {
  assert.equal(tokens.kind, 'sdkwork.doctor.design-tokens');
  assert.equal(tokens.style.name, 'tech-blue-flat');
  assert.equal(colors.primary, '#0A5CFF');
  assert.equal(colors.nav, '#061A3A');
  assert.equal(tokens.shape.borderWidth, 0);
  assert.equal(tokens.shape.elevation, 0);
  assert.ok(tokens.style.principles.some((line) => /no shadows/u.test(line)));
  assert.ok(tokens.style.principles.some((line) => /border/iu.test(line)));
});

test('both browser surfaces bind every token to the contract', () => {
  for (const file of CSS_SURFACES) {
    const variables = cssVariables(read(file));
    assert.equal(variables.get('bg'), colors.canvas.toLowerCase(), file + ' canvas');
    assert.equal(variables.get('surface'), colors.surface.toLowerCase(), file + ' surface');
    assert.equal(variables.get('surface-alt'), colors.surfaceAlt.toLowerCase(), file + ' surfaceAlt');
    assert.equal(variables.get('nav'), colors.nav.toLowerCase(), file + ' nav');
    assert.equal(variables.get('accent'), colors.primary.toLowerCase(), file + ' primary');
    assert.equal(variables.get('text'), colors.ink.toLowerCase(), file + ' ink');
    assert.equal(variables.get('muted'), colors.muted.toLowerCase(), file + ' muted');
    assert.equal(variables.get('error'), colors.danger.toLowerCase(), file + ' danger');
  }
});

test('both browser surfaces are flat and borderless', () => {
  for (const file of CSS_SURFACES) {
    const css = read(file);
    assert.deepEqual(shadowViolations(css), [], file + ' must not use box-shadow');
    assert.deepEqual(borderViolations(css), [], file + ' must not draw 1px borders');
  }
});

test('the Flutter theme uses the same tokens and zero elevation', () => {
  const theme = read('apps/sdkwork-doctor-flutter-mobile/lib/theme/doctor_theme.dart');
  assert.match(theme, /Color\(0xFF0A5CFF\)/u, 'tech blue primary');
  assert.match(theme, /Color\(0xFF061A3A\)/u, 'navy chrome');
  assert.match(theme, /Color\(0xFFF2F5FA\)/u, 'canvas');
  assert.match(theme, /Color\(0xFFE6EDF8\)/u, 'surface alt');
  assert.match(theme, /BorderSide\.none/u, 'borderless outlines');
  const elevations = theme.match(/elevation:\s*0/gu) ?? [];
  assert.ok(elevations.length >= 4, 'app bar, card, navigation bar, buttons and dialogs stay flat');
  assert.doesNotMatch(theme, /shadowColor|BoxShadow/u, 'no shadows');
});

test('the mini program uses the same tokens and hides its tab bar line', () => {
  const wxss = read('apps/sdkwork-doctor-mini-program/src/app.wxss');
  assert.match(wxss, /background:\s*#f2f5fa/u, 'canvas');
  assert.match(wxss, /background:\s*#e6edf8/u, 'surface alt rows');
  assert.match(wxss, /background:\s*#0a5cff/u, 'primary button');
  assert.match(wxss, /border:\s*0/u, 'borderless cards and inputs');
  assert.deepEqual(shadowViolations(wxss), []);
  assert.deepEqual(borderViolations(wxss), []);

  const app = JSON.parse(read('apps/sdkwork-doctor-mini-program/src/app.json'));
  assert.equal(app.window.navigationBarBackgroundColor, '#061A3A');
  assert.equal(app.window.backgroundColor, '#F2F5FA');
  assert.equal(app.tabBar.selectedColor, '#0A5CFF');
  assert.equal(app.tabBar.backgroundColor, '#FFFFFF');
  assert.equal(app.tabBar.borderStyle, 'white');
});
