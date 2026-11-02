import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'src', 'app.json'), 'utf8'));

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const ME = '\u6211\u7684';

test('the mini program declares exactly the three care tabs', () => {
  assert.deepEqual(app.tabBar.list.length, 3);
  assert.deepEqual(app.tabBar.list.map((tab) => tab.text), [CHAT, DOCTOR, ME]);
  assert.deepEqual(app.tabBar.list.map((tab) => tab.pagePath), [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/profile/index',
  ]);
  for (const tab of app.tabBar.list) assert.ok(app.pages.includes(tab.pagePath));
});

test('records stays a page but is no longer a tab', () => {
  assert.deepEqual(app.pages, [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/profile/index',
    'pages/records/index',
  ]);
  assert.equal(app.tabBar.list.some((tab) => tab.pagePath === 'pages/records/index'), false);
});

test('every declared page ships wxml, wxss, js, and json', () => {
  for (const page of app.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(root, 'src', page + '.' + ext)), true, page + '.' + ext);
    }
  }
});

test('conversation page delegates to the shared care agent and the patient store', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'pages', 'conversation', 'index.js'), 'utf8');
  assert.match(source, /require\('\.\.\/\.\.\/lib\/agent\.js'\)/);
  assert.match(source, /createCareAgent\(/);
  assert.match(source, /platform\.care\.level\./);
  assert.match(source, /globalData\.patients/);
  assert.match(source, /getActive\(\)/);
});

test('the care agent keeps the emergency-first rule the page relies on', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'lib', 'agent.js'), 'utf8');
  assert.match(source, /EMERGENCY_LEAD/);
  assert.match(source, /Call local emergency services now\./);
  assert.match(source, /resolveReplyTriage/);
});

test('the records page keeps the catalog copy but adds doctor and human mode', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'records', 'index.js'), 'utf8');
  assert.match(page, /platform\.care\.records\.title/);
  assert.match(page, /platform\.care\.records\.empty/);
  assert.match(page, /platform\.care\.records\.back/);
  assert.match(page, /platform\.care\.records\.doctor/);
  assert.match(page, /platform\.care\.mode\.human/);
});

test('profile opens records with wx.navigateTo instead of a tab', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'profile', 'index.js'), 'utf8');
  assert.match(page, /wx\.navigateTo\(\{ url: '\/pages\/records\/index' \}\)/);
});
