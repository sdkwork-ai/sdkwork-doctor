import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'src', 'app.json'), 'utf8'));

test('mini program declares the three care tabs', () => {
  assert.deepEqual(app.pages, ['pages/conversation/index', 'pages/doctor/index', 'pages/profile/index']);
  assert.equal(app.tabBar.list.length, 3);
  for (const tab of app.tabBar.list) assert.ok(app.pages.includes(tab.pagePath));
});

test('every declared page ships wxml, wxss, js, and json', () => {
  for (const page of app.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(root, 'src', page + '.' + ext)), true, page + '.' + ext);
    }
  }
});

test('conversation page keeps the emergency-first triage rule', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'pages', 'conversation', 'index.js'), 'utf8');
  assert.match(source, /EMERGENCY/);
  assert.match(source, /emergency/i);
});
