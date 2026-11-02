import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const catalog = require(path.join(root, 'src', 'lib', 'care-i18n.js'));
const zh = (key) => catalog.messages['zh-CN'][key];

/** Captures every wx host call the pages make instead of touching a device. */
const host = {
  clipboard: [],
  toasts: [],
  navigations: [],
  notifications: [],
};

globalThis.wx = {
  getStorageSync: () => '',
  setStorageSync: () => undefined,
  getSystemInfoSync: () => ({ platform: 'devtools', system: 'test' }),
  getStorageInfoSync: () => ({ keys: [] }),
  setNavigationBarTitle: () => undefined,
  setClipboardData: (options) => {
    host.clipboard.push(options.data);
    if (options.success) options.success();
  },
  showToast: (options) => {
    host.toasts.push(options.title);
  },
  showModal: (options) => {
    host.notifications.push(options.content);
    if (options.success) options.success({ confirm: true, cancel: false });
  },
  switchTab: (options) => {
    host.navigations.push(options.url);
  },
  navigateTo: (options) => {
    host.navigations.push(options.url);
  },
  navigateBack: (options) => {
    if (options && typeof options.fail === 'function') options.fail();
  },
  request: (options) => {
    if (options && typeof options.fail === 'function') options.fail({ errMsg: 'request:fail offline' });
  },
};

const { createPatientProfileStore } = require(path.join(root, 'src', 'lib', 'patient-profiles.js'));
const { createVisitRecordStore } = require(path.join(root, 'src', 'lib', 'visit-records.js'));
const { createDoctorSelectionStore, CATALOG_DOCTOR_ROSTER } = require(path.join(root, 'src', 'lib', 'doctors.js'));

const app = {
  globalData: {
    careAgentOptions: { agentsApiBaseUrl: '', getAccessToken: () => null, entrySurface: 'mini_program' },
    careDoctorDirectoryUrl: '',
    doctorRoster: CATALOG_DOCTOR_ROSTER,
    patients: createPatientProfileStore({ read: () => null, write: () => undefined }),
    records: createVisitRecordStore({ read: () => null, write: () => undefined }),
    doctors: createDoctorSelectionStore({ read: () => null, write: () => undefined }),
  },
};
globalThis.getApp = () => app;

function setPath(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!cursor[parts[index]] || typeof cursor[parts[index]] !== 'object') cursor[parts[index]] = {};
    cursor = cursor[parts[index]];
  }
  cursor[parts[parts.length - 1]] = value;
}

/** Instantiates one Page config with a data bag and a working setData. */
function loadPage(relativePath) {
  let config = null;
  globalThis.Page = (value) => {
    config = value;
  };
  const file = path.join(root, relativePath);
  delete require.cache[require.resolve(file)];
  require(file);
  assert.ok(config, relativePath + ' must call Page()');
  const instance = { data: JSON.parse(JSON.stringify(config.data || {})) };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  instance.setData = (patch) => {
    Object.keys(patch).forEach((key) => setPath(instance.data, key, patch[key]));
  };
  return instance;
}

function event(dataset, value) {
  return { currentTarget: { dataset: dataset || {} }, detail: { value: value } };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('the conversation tab switches patients and disables sending without one', () => {
  const page = loadPage('src/pages/conversation/index.js');
  page.onLoad();
  assert.equal(page.data.hasPatient, true);
  assert.equal(page.data.patients.length, 1);
  assert.equal(page.data.patients[0].active, true);
  assert.match(page.data.subtitle, /Me/u);

  const child = app.globalData.patients.add({
    displayName: 'Xiaoman',
    relation: 'child',
    birthYear: 2019,
    sex: 'female',
  });
  page.onShow();
  assert.equal(page.data.patients.length, 2);
  page.onSelectPatient(event({ id: child.id }));
  assert.equal(app.globalData.patients.getActiveId(), child.id);
  assert.equal(page.data.patients[1].active, true);

  app.globalData.patients.remove(child.id);
  app.globalData.patients.remove('member-self');
  page.renderPatients();
  assert.equal(page.data.hasPatient, false, 'sending is disabled with no patient');
  page.onGoProfile();
  assert.ok(host.navigations.includes('/pages/profile/index'));
  page.onUnload();

  // Restore the seeded household so the remaining pages start from a family.
  app.globalData.patients.add({
    id: 'member-self',
    displayName: 'Me',
    relation: 'self',
    birthYear: 1990,
    sex: 'unspecified',
  });
});

test('the doctor tab selects doctors and records a human consultation', async () => {
  app.globalData.doctors.clear();
  const page = loadPage('src/pages/doctor/index.js');
  page.onLoad();
  await flush();
  assert.equal(page.data.doctors.length, 3);
  assert.equal(page.data.sourceLabel, zh('platform.care.doctors.source.catalog'));
  assert.equal(page.data.aiStatus, zh('platform.care.doctors.aiOffline'));

  page.onToggleDoctor(event({ id: 'doctor-lin-qinghe' }));
  assert.deepEqual(app.globalData.doctors.state(), {
    selectedIds: ['doctor-lin-qinghe'],
    primaryId: 'doctor-lin-qinghe',
  });
  assert.equal(page.data.mine.length, 1);
  assert.equal(page.data.mine[0].primary, true);

  const lin = page.data.doctors.filter((doctor) => doctor.id === 'doctor-lin-qinghe')[0];
  assert.equal(lin.rank, 'Chief physician');
  assert.equal(lin.department, 'Cardiology');
  assert.equal(lin.hospital, 'SDKWork Care Network');
  assert.equal(lin.employment, zh('platform.care.doctors.employment.full_time'));
  assert.equal(lin.otherAffiliations, zh('platform.care.doctors.otherAffiliations').replace('{{count}}', '1'));
  assert.equal(lin.accepting, true);

  page.onOpenConsult(event({ id: 'doctor-lin-qinghe' }));
  assert.equal(page.data.consultOpen, true);
  assert.equal(page.data.consultHasChannel, true);
  assert.equal(page.data.consultChannelLabel, zh('platform.care.doctors.channel.video'));
  assert.equal(page.data.consultAffiliationLabels.length, 2, 'both practice sites are offered');
  assert.equal(page.data.consultOrganization, 'org-sdkwork-care-network');
  assert.equal(page.data.consultHospitalCode, 'SDKWORK-CARE-001');
  assert.equal(page.data.consultEmployment, zh('platform.care.doctors.employment.full_time'));
  assert.equal(page.data.consultSince, zh('platform.care.doctors.since').replace('{{since}}', '2011-07'));

  page.onReasonInput(event({}, '  chest tightness after dinner  '));
  page.onSubmitConsult();

  const records = app.globalData.records.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].mode, 'human');
  assert.equal(records[0].level, 'routine', 'a human consultation is a routine routing record');
  assert.equal(records[0].symptom, 'chest tightness after dinner');
  assert.equal(records[0].doctorId, 'doctor-lin-qinghe');
  assert.equal(records[0].doctorLabel, 'Lin Qinghe · Cardiology');
  assert.equal(records[0].doctorOrganizationId, 'org-sdkwork-care-network');
  assert.equal(records[0].doctorHospitalLabel, 'SDKWork Care Network');
  assert.equal(records[0].doctorEmploymentType, 'full_time');
  assert.equal(records[0].advice, zh('platform.care.doctors.consultStarted').replace('{{doctor}}', 'Lin Qinghe'));
  assert.equal(host.clipboard[0], 'https://care.sdkwork.com/consult/doctor-lin-qinghe');
  assert.equal(host.toasts.length > 0, true);
  assert.equal(page.data.consultStatus, records[0].advice);

  page.onCancelConsult();
  assert.equal(page.data.consultOpen, false);
  page.onUnload();
});

test('the consult panel can route to the doctor secondary site', async () => {
  const page = loadPage('src/pages/doctor/index.js');
  page.onLoad();
  await flush();
  page.onOpenConsult(event({ id: 'doctor-lin-qinghe' }));
  page.onAffiliationChange(event({}, 1));
  assert.equal(page.data.consultAffiliationIndex, 1);
  assert.match(page.data.consultAffiliationLabel, /SDKWork Community Clinic/u);
  assert.equal(page.data.consultOrganization, 'org-sdkwork-community-clinic');
  assert.equal(page.data.consultHospitalCode, 'SDKWORK-CARE-002');
  assert.equal(page.data.consultEmployment, zh('platform.care.doctors.employment.part_time'));
  assert.equal(page.data.consultChannelLabel, zh('platform.care.doctors.channel.video'));

  page.onReasonInput(event({}, 'repeat prescription review'));
  page.onSubmitConsult();

  const newest = app.globalData.records.list()[0];
  assert.equal(newest.doctorLabel, 'Lin Qinghe · General practice');
  assert.equal(newest.doctorOrganizationId, 'org-sdkwork-community-clinic');
  assert.equal(newest.doctorHospitalLabel, 'SDKWork Community Clinic');
  assert.equal(newest.doctorEmploymentType, 'part_time');
  assert.equal(
    host.clipboard[host.clipboard.length - 1],
    'https://care.sdkwork.com/consult/doctor-lin-qinghe/clinic',
  );
});

test('the doctor consult form refuses an empty reason', () => {
  const page = loadPage('src/pages/doctor/index.js');
  page.onLoad();
  page.onOpenConsult(event({ id: 'doctor-he-zhiyuan' }));
  page.onSubmitConsult();
  assert.equal(page.data.consultError, zh('platform.care.doctors.consultReasonRequired'));
  assert.equal(app.globalData.records.list().filter((entry) => entry.mode === 'human').length, 2);
});

test('a doctor without a channel shows the no-channel copy and cannot submit', async () => {
  const page = loadPage('src/pages/doctor/index.js');
  page.onLoad();
  await flush();
  const base = CATALOG_DOCTOR_ROSTER.doctors[0];
  page.roster = {
    source: 'directory',
    doctors: [{
      ...base,
      id: 'doctor-nochannel',
      verified: true,
      affiliations: [{ ...base.affiliations[0], channels: [] }],
    }],
  };
  page.render();
  page.onOpenConsult(event({ id: 'doctor-nochannel' }));
  assert.equal(page.data.consultHasChannel, false);
  assert.equal(page.data.consultChannelLabel, '');
  assert.equal(page.data.consultReady, false);
  const before = app.globalData.records.list().length;
  page.onSubmitConsult();
  assert.equal(app.globalData.records.list().length, before, 'no record without a channel');
  assert.equal(host.toasts[host.toasts.length - 1], zh('platform.care.doctors.noChannel'));
});

test('the me tab creates, edits, and deletes patient files and opens records', () => {
  app.globalData.patients.add({
    displayName: 'Xiaoman',
    relation: 'child',
    birthYear: 2019,
    sex: 'female',
  });
  const page = loadPage('src/pages/profile/index.js');
  page.onLoad();
  page.onShow();
  assert.equal(page.data.patients.length, 2);
  assert.equal(page.data.patients[0].active, true);
  assert.match(page.data.patients[1].completeness, /17%/u);
  assert.ok(page.data.deviceStatus.length > 0);
  assert.equal(page.data.doctorName, 'Lin Qinghe · Cardiology');

  page.onOpenRecords();
  assert.ok(host.navigations.includes('/pages/records/index'));

  page.onAddPatient();
  assert.equal(page.data.formOpen, true);
  page.onFieldInput(event({ field: 'displayName' }, 'Grandma'));
  page.onRelationChange(event({}, 3));
  page.onSavePatient();
  assert.equal(page.data.formOpen, false);
  assert.equal(app.globalData.patients.list().length, 3);
  const grandma = app.globalData.patients.list()[2];
  assert.equal(grandma.relation, 'parent');

  page.onEditPatient(event({ id: grandma.id }));
  page.onFieldInput(event({ field: 'notes' }, 'Lives with us.'));
  page.onSavePatient();
  assert.equal(app.globalData.patients.list()[2].notes, 'Lives with us.');

  page.onDeletePatient(event({ id: grandma.id }));
  assert.equal(app.globalData.patients.list().length, 2);
});

test('every handler a template binds exists on its Page config', () => {
  for (const page of ['conversation', 'doctor', 'profile', 'records']) {
    const instance = loadPage('src/pages/' + page + '/index.js');
    const wxml = fs.readFileSync(path.join(root, 'src/pages', page, 'index.wxml'), 'utf8');
    const handlers = [...wxml.matchAll(/\b(?:bind|catch)[a-z]+="([A-Za-z_$][\w$]*)"/gu)].map((match) => match[1]);
    assert.ok(handlers.length > 0, page + ' must bind handlers');
    for (const handler of new Set(handlers)) {
      assert.equal(typeof instance[handler], 'function', page + ' binds missing handler ' + handler);
    }
  }
});

test('the records page shows the doctor, site, engagement, human mode, and goes back', () => {
  const page = loadPage('src/pages/records/index.js');
  page.onLoad();
  page.onShow();
  const human = page.data.items.filter((item) => item.doctor)[0];
  assert.ok(human, 'the human consultation is in the list');
  assert.equal(human.doctor, 'Lin Qinghe · General practice', 'the newest consult used the secondary site');
  assert.equal(human.hospital, 'SDKWork Community Clinic');
  assert.equal(human.employment, zh('platform.care.doctors.employment.part_time'));
  assert.match(human.meta, new RegExp(zh('platform.care.mode.human'), 'u'));
  page.onBack();
  assert.ok(host.navigations.includes('/pages/profile/index'));
});
