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
const { createMedicalRecordStore } = require(path.join(root, 'src', 'lib', 'medical-records.js'));
const { createCareSessionStore } = require(path.join(root, 'src', 'lib', 'care-sessions.js'));
const { createHumanConsultationStore } = require(path.join(root, 'src', 'lib', 'human-consultations.js'));
const { createDoctorSelectionStore, CATALOG_DOCTOR_ROSTER } = require(path.join(root, 'src', 'lib', 'doctors.js'));

const app = {
  globalData: {
    careAgentOptions: { agentsApiBaseUrl: '', getAccessToken: () => null, entrySurface: 'mini_program' },
    careDoctorDirectoryUrl: '',
    doctorRoster: CATALOG_DOCTOR_ROSTER,
    patients: createPatientProfileStore({ read: () => null, write: () => undefined }),
    records: createVisitRecordStore({ read: () => null, write: () => undefined }),
    medicalRecords: createMedicalRecordStore({ read: () => null, write: () => undefined }),
    careSessions: createCareSessionStore({ read: () => null, write: () => undefined }),
    humanConsultations: createHumanConsultationStore({ read: () => null, write: () => undefined }),
    doctors: createDoctorSelectionStore({ read: () => null, write: () => undefined }),
    openHumanConsultationId: '',
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

test('the conversation composer sends the drafted symptom and records it', async () => {
  const page = loadPage('src/pages/conversation/index.js');
  page.onLoad();
  const before = app.globalData.records.list().length;

  page.onInput({ detail: { value: '  fever since last night  ' } });
  assert.equal(page.data.draft, '  fever since last night  ');

  // The shared composer emits the trimmed text, so the page never re-reads it.
  page.onSend({ detail: { text: 'fever since last night' } });
  await flush();

  const records = app.globalData.records.list();
  assert.equal(records.length, before + 1);
  assert.equal(records[0].symptom, 'fever since last night');
  assert.equal(page.data.draft, '');
  assert.equal(page.data.busy, false);
  page.onUnload();
});

test('the conversation home opens a human consultation and counts unread replies', () => {
  const previous = app.globalData.humanConsultations;
  app.globalData.humanConsultations = createHumanConsultationStore({
    read: () => null,
    write: () => undefined,
  });
  const session = app.globalData.humanConsultations.start({
    doctor: {
      id: 'doctor-su-wanning',
      displayName: 'Su Wanning',
      department: 'Pediatrics',
      hospitalName: 'SDKWork Care Network',
    },
    memberLabel: '本人 · Me',
    reason: 'child has a fever',
  });
  app.globalData.openHumanConsultationId = session.id;

  const page = loadPage('src/pages/conversation/index.js');
  page.onLoad();
  page.onShow();
  assert.equal(page.data.title, 'Su Wanning');
  assert.equal(page.data.humanBadge, zh('platform.care.chat.humanBadge'));
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.humanSessions.length, 1);
  assert.equal(page.data.unreadTotal, 0);

  page.onInput(event({}, 'since last night'));
  page.onSend(event({}, 'since last night'));
  assert.equal(app.globalData.humanConsultations.messages(session.id).length, 2);
  assert.equal(page.data.messages.length, 2);

  // The doctor replies on this device; the row is unread while the AI
  // conversation is the one on screen.
  app.globalData.humanConsultations.appendDoctorReply(session.id, 'Come in tomorrow.');
  page.onSelectAi();
  page.onShow();
  assert.equal(page.data.unreadTotal, 1);
  page.onSelectHuman(event({ id: session.id }));
  assert.equal(page.data.unreadTotal, 0);
  assert.equal(page.data.messages.length, 3);

  page.onOpenSessions();
  assert.equal(page.data.sheetOpen, true);
  page.onCloseSessions();
  assert.equal(page.data.sheetOpen, false);

  page.onOpenDoctorReply();
  assert.equal(page.data.doctorReplyOpen, true);
  page.onReplyInput(event({}, 'Bring the medication list.'));
  page.onSubmitDoctorReply();
  assert.equal(page.data.doctorReplyOpen, false);
  assert.equal(app.globalData.humanConsultations.messages(session.id).length, 4);

  page.onEndHuman();
  assert.equal(app.globalData.humanConsultations.find(session.id).status, 'ended');
  assert.equal(page.data.humanActive, false);
  app.globalData.humanConsultations = previous;
});

test('the doctor tab selects doctors and records a human consultation', async () => {
  app.globalData.doctors.clear();
  app.globalData.humanConsultations = createHumanConsultationStore({
    read: () => null,
    write: () => undefined,
  });
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
  const before = records.length - 1;
  assert.equal(records.length, before + 1);
  assert.equal(records[0].mode, 'human');
  assert.equal(records[0].level, 'routine', 'a human consultation is a routine routing record');
  assert.equal(records[0].symptom, 'chest tightness after dinner');
  assert.equal(records[0].doctorId, 'doctor-lin-qinghe');
  assert.equal(records[0].doctorLabel, 'Lin Qinghe · Cardiology');
  assert.equal(records[0].doctorOrganizationId, 'org-sdkwork-care-network');
  assert.equal(records[0].doctorHospitalLabel, 'SDKWork Care Network');
  assert.equal(records[0].doctorEmploymentType, 'full_time');
  assert.equal(records[0].advice, zh('platform.care.doctors.consultStarted').replace('{{doctor}}', 'Lin Qinghe'));
  const human = app.globalData.humanConsultations.list();
  assert.equal(human.length, 1, 'the consultation opens one human conversation');
  assert.equal(human[0].doctor.id, 'doctor-lin-qinghe');
  assert.equal(human[0].doctor.displayName, 'Lin Qinghe');
  assert.equal(human[0].doctor.department, 'Cardiology');
  assert.equal(human[0].title, 'chest tightness after dinner');
  assert.equal(human[0].messages.length, 1, 'the reason is the first patient turn');
  assert.equal(
    app.globalData.openHumanConsultationId,
    human[0].id,
    'the conversation tab is told which session to open',
  );
  assert.equal(
    host.navigations[host.navigations.length - 1],
    '/pages/conversation/index',
    'the consultation lands on the conversation home',
  );
  assert.equal(host.toasts.length > 0, true);
  assert.equal(page.data.consultStatus, records[0].advice);

  page.onCancelConsult();
  assert.equal(page.data.consultOpen, false);
  page.onUnload();
});

test('the consult panel can route to the doctor secondary site', async () => {
  app.globalData.humanConsultations = createHumanConsultationStore({
    read: () => null,
    write: () => undefined,
  });
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
  const human = app.globalData.humanConsultations.list()[0];
  assert.equal(human.doctor.hospitalName, 'SDKWork Community Clinic');
  assert.equal(human.doctor.department, 'General practice');
});

test('the doctor consult form refuses an empty reason', () => {
  const page = loadPage('src/pages/doctor/index.js');
  page.onLoad();
  page.onOpenConsult(event({ id: 'doctor-he-zhiyuan' }));
  page.onSubmitConsult();
  assert.equal(page.data.consultError, zh('platform.care.doctors.consultReasonRequired'));
  assert.equal(app.globalData.records.list().filter((entry) => entry.mode === 'human').length, 2);
});

test('a doctor without a channel still receives the consultation in the conversation', async () => {
  app.globalData.humanConsultations = createHumanConsultationStore({
    read: () => null,
    write: () => undefined,
  });
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
  assert.equal(page.data.consultReady, true, 'the conversation needs no external channel');

  page.onReasonInput(event({}, 'blood pressure review'));
  const before = app.globalData.records.list().length;
  page.onSubmitConsult();
  assert.equal(app.globalData.records.list().length, before + 1);
  const human = app.globalData.humanConsultations.list()[0];
  assert.equal(human.doctor.id, 'doctor-nochannel');
  assert.equal(human.title, 'blood pressure review');
});

test('the me tab opens the patient files, doctors, chat, records, and device modules', () => {
  app.globalData.patients = createPatientProfileStore({ read: () => null, write: () => undefined });
  app.globalData.patients.add({
    displayName: 'Xiaoman',
    relation: 'child',
    birthYear: 2019,
    sex: 'female',
  });
  const page = loadPage('src/pages/profile/index.js');
  app.globalData.doctors.clear();
  page.onLoad();
  page.onShow();
  assert.equal(page.data.activeName, 'Me');
  assert.equal(page.data.patientsValue.replace(/[^\d]/gu, ''), '2');
  assert.match(page.data.completeness, /17%/u);
  assert.equal(page.data.doctorsValue, zh('platform.care.me.notChosen'));
  assert.equal(page.data.privacy, zh('platform.care.privacy.local'));
  assert.ok(page.data.modeTone === 'ok' || page.data.modeTone === 'muted');

  app.globalData.doctors.toggle('doctor-lin-qinghe');
  page.onShow();
  assert.match(page.data.doctorsValue, /Lin Qinghe/u);

  for (const pair of [
    ['onOpenPatients', '/pages/patients/index'],
    ['onOpenDoctors', '/pages/doctor/index'],
    ['onOpenChat', '/pages/conversation/index'],
    ['onOpenRecords', '/pages/records/index'],
    ['onOpenDevice', '/pages/device/index'],
  ]) {
    page[pair[0]]();
    assert.ok(host.navigations.includes(pair[1]), pair[0] + ' opens ' + pair[1]);
  }
});

test('the patient files page creates, edits, switches, and deletes a member', () => {
  app.globalData.patients = createPatientProfileStore({ read: () => null, write: () => undefined });
  const page = loadPage('src/pages/patients/index.js');
  page.onLoad();
  page.onShow();
  assert.equal(page.data.patients.length, 1);
  assert.equal(page.data.patients[0].active, true);

  page.onAddPatient();
  assert.equal(page.data.formOpen, true);
  page.onFieldInput(event({ field: 'displayName' }, 'Grandma'));
  page.onRelationChange(event({}, 3));
  page.onSavePatient();
  assert.equal(page.data.formOpen, false);
  assert.equal(app.globalData.patients.list().length, 2);
  const grandma = app.globalData.patients.list()[1];
  assert.equal(grandma.relation, 'parent');

  page.onSelectPatient(event({ id: grandma.id }));
  assert.equal(app.globalData.patients.getActive().id, grandma.id);

  page.onEditPatient(event({ id: grandma.id }));
  page.onFieldInput(event({ field: 'notes' }, 'Lives with us.'));
  page.onSavePatient();
  assert.equal(app.globalData.patients.list()[1].notes, 'Lives with us.');

  page.onDeletePatient(event({ id: grandma.id }));
  assert.equal(app.globalData.patients.list().length, 1);
});

test('the device page reports the runtime facts and re-runs the checks', () => {
  const page = loadPage('src/pages/device/index.js');
  page.onLoad();
  assert.equal(page.data.platform, 'devtools');
  assert.ok(page.data.status.length > 0);
  page.onRerunChecks();
  assert.equal(page.data.checking, false);
});

test('every handler a template binds exists on its Page config', () => {
  for (const page of ['conversation', 'doctor', 'records', 'record-detail', 'profile', 'patients', 'device']) {
    const instance = loadPage('src/pages/' + page + '/index.js');
    const wxml = fs.readFileSync(path.join(root, 'src/pages', page, 'index.wxml'), 'utf8');
    const handlers = [...wxml.matchAll(/\b(?:bind|catch)[a-z]+="([A-Za-z_$][\w$]*)"/gu)].map((match) => match[1]);
    assert.ok(handlers.length > 0, page + ' must bind handlers');
    for (const handler of new Set(handlers)) {
      assert.equal(typeof instance[handler], 'function', page + ' binds missing handler ' + handler);
    }
  }
});

test('the records page lists one card per visit session and opens the detail page', () => {
  app.globalData.careSessions = createCareSessionStore({ read: () => null, write: () => undefined });
  const session = app.globalData.careSessions.ensureActive({
    member: app.globalData.patients.getActive(),
    mode: 'offline',
    now: '2026-11-02T13:30:00.000Z',
  });
  app.globalData.careSessions.appendMessage(session.id, {
    role: 'patient',
    text: 'dizzy for two days',
    at: '2026-11-02T13:30:00.000Z',
    level: 'routine',
  });

  const page = loadPage('src/pages/records/index.js');
  page.onLoad();
  page.onShow();
  assert.equal(page.data.sessions.length, 1);
  assert.equal(page.data.sessions[0].title, 'dizzy for two days');
  assert.equal(page.data.sessions[0].statusLabel, zh('platform.care.records.status.active'));
  assert.equal(page.data.empty, zh('platform.care.records.empty'));

  page.onOpen(event({ id: session.id }));
  assert.match(host.navigations[host.navigations.length - 1], /pages\/record-detail\/index\?id=/u);
});

test('ending a conversation generates a 病历 the doctor confirms', async () => {
  const page = loadPage('src/pages/conversation/index.js');
  page.onLoad();
  page.onInput({ detail: { value: 'fever since last night' } });
  page.onSend({ detail: { text: 'fever since last night' } });
  await flush();
  page.onEndConversation();
  await flush();
  await flush();

  const generated = app.globalData.medicalRecords.list();
  assert.equal(generated.length, 1);
  assert.equal(generated[0].status, 'awaiting_doctor');
  assert.ok(generated[0].aiDiagnosis.impression);
  assert.equal(generated[0].doctorDiagnosis, undefined);
  assert.equal(generated[0].memberLabel, 'Me (self)');
  page.onUnload();

  const sessions = app.globalData.careSessions.list().filter((session) => session.status === 'ended');
  assert.equal(sessions.length, 1, 'the ended visit is one session');
  assert.equal(sessions[0].medicalRecordId, generated[0].id);

  const detail = loadPage('src/pages/record-detail/index.js');
  detail.onLoad({ id: sessions[0].id });
  detail.onShow();
  assert.equal(detail.data.session.title, 'fever since last night');
  assert.equal(detail.data.record.statusWarn, true);
  expectTabs(detail);
  detail.onTab(event({ tab: 'doctor' }));
  detail.onReviewInput(event({ field: 'doctorLabel' }, 'Lin Qinghe'));
  detail.onReviewMode(event({ mode: 'confirmed' }));
  detail.onSaveReview();
  await flush();

  const saved = app.globalData.medicalRecords.list()[0];
  assert.equal(saved.status, 'confirmed');
  assert.equal(saved.confirmation.decision, 'confirmed');
  assert.equal(saved.confirmation.doctorLabel, 'Lin Qinghe');
  assert.ok(saved.aiDiagnosis.impression, 'the AI diagnosis is kept');
  assert.equal(saved.doctorDiagnosis, undefined);
  assert.equal(detail.data.record.statusWarn, false);
  assert.ok(detail.data.record.confirmationLabel);
});

function expectTabs(detail) {
  const labels = detail.data.tabs.map((tab) => tab.label);
  for (const key of ['medical', 'ai', 'doctor', 'playback']) {
    assert.ok(labels.includes(zh('platform.care.record.tab.' + key)), key + ' tab is rendered');
  }
}
