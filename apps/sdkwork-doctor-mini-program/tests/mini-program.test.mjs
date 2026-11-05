import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'src', 'app.json'), 'utf8'));

const CHAT = '\u5bf9\u8bdd';
const DOCTOR = '\u533b\u751f';
const RECORDS = '\u770b\u75c5\u8bb0\u5f55';
const ME = '\u6211\u7684';

test('the mini program declares exactly the four care tabs', () => {
  assert.deepEqual(app.tabBar.list.length, 4);
  assert.deepEqual(app.tabBar.list.map((tab) => tab.text), [CHAT, DOCTOR, RECORDS, ME]);
  assert.deepEqual(app.tabBar.list.map((tab) => tab.pagePath), [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/records/index',
    'pages/profile/index',
  ]);
  for (const tab of app.tabBar.list) assert.ok(app.pages.includes(tab.pagePath));
});

test('records is the third tab, with one card per visit session', () => {
  assert.deepEqual(app.pages, [
    'pages/conversation/index',
    'pages/doctor/index',
    'pages/records/index',
    'pages/record-detail/index',
    'pages/profile/index',
    'pages/patients/index',
    'pages/device/index',
  ]);
  assert.equal(app.tabBar.list.some((tab) => tab.pagePath === 'pages/records/index'), true);
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
  assert.match(source, /offlineAnswer/);
  assert.match(source, /composeHostedReply/);
  assert.match(source, /resolveReplyTriage/);
  const copy = fs.readFileSync(path.join(root, 'src', 'lib', 'triage-copy.js'), 'utf8');
  assert.match(copy, /platform\.care\.chat\.emergencyLead/);
  assert.match(copy, /emergency\.call/);
});

test('the records page lists sessions and the detail page keeps the clinical sections', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'records', 'index.js'), 'utf8');
  assert.match(page, /platform\.care\.records\.title/);
  assert.match(page, /platform\.care\.records\.empty/);
  assert.match(page, /platform\.care\.records\.sessionCount/);
  assert.match(page, /platform\.care\.record\.recordPending/);
  assert.match(page, /pages\/record-detail\/index/);

  const detail = fs.readFileSync(path.join(root, 'src', 'pages', 'record-detail', 'index.js'), 'utf8');
  assert.match(detail, /const TABS = \['medical', 'ai', 'doctor', 'playback'\]/);
  assert.match(detail, /platform\.care\.record\.tab\./);
  assert.match(detail, /platform\.care\.medical\.aiDiagnosis/);
  assert.match(detail, /platform\.care\.medical\.doctorDiagnosis/);
  assert.match(detail, /platform\.care\.record\.playback\.hint/);
});

test('profile opens the records tab with wx.switchTab', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'profile', 'index.js'), 'utf8');
  assert.match(page, /wx\.switchTab\(\{ url: '\/pages\/records\/index' \}\)/);
});
