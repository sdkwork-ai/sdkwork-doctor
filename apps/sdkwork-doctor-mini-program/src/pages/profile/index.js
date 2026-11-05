// 我的 tab: a native-style account screen. The identity block carries the active
// patient and the status pills; below it every capability is one row of a
// full-bleed grouped list that opens its own page or tab. Copy comes from the
// generated care catalog.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');
const { patientProfileCompleteness } = require('../../lib/patient-profiles.js');
const {
  CATALOG_DOCTOR_ROSTER,
  resolvePrimaryDoctor,
} = require('../../lib/doctors.js');

function initialOf(profile) {
  if (!profile) return '';
  return String(profile.displayName || '').trim().slice(0, 1).toUpperCase();
}

Page({
  data: {
    modeLabel: '',
    modeTone: '',
    initial: '',
    activeName: '',
    activeMeta: '',
    completeness: '',
    patientsTitle: '',
    patientsValue: '',
    doctorsTitle: '',
    doctorsValue: '',
    chatTitle: '',
    recordsTitle: '',
    recordsValue: '',
    deviceTitle: '',
    privacy: '',
  },

  onLoad() {
    const app = getApp();
    this.store = app.globalData.patients;
    const hosted = createCareAgent(app.globalData.careAgentOptions).mode === 'hosted';
    this.setData({
      modeLabel: careText(hosted ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      modeTone: hosted ? 'ok' : 'muted',
      patientsTitle: careText('platform.care.me.patients'),
      doctorsTitle: careText('platform.care.me.doctors'),
      chatTitle: careText('platform.care.chat.title'),
      recordsTitle: careText('platform.care.me.recordsAndMedical'),
      deviceTitle: careText('platform.care.me.device'),
      privacy: careText('platform.care.privacy.local'),
    });
    try {
      if (typeof wx !== 'undefined' && typeof wx.setNavigationBarTitle === 'function') {
        wx.setNavigationBarTitle({ title: careText('platform.care.me.title') });
      }
    } catch (error) {
      // A host without a navigation bar keeps the static title.
    }
    this.render();
  },

  onShow() {
    this.render();
  },

  render() {
    const app = getApp();
    const active = this.store ? this.store.getActive() : null;
    const profiles = this.store ? this.store.list() : [];
    const selection = app.globalData.doctors
      ? app.globalData.doctors.state()
      : { selectedIds: [], primaryId: null };
    const roster = app.globalData.doctorRoster || CATALOG_DOCTOR_ROSTER;
    const primary = resolvePrimaryDoctor(roster, selection);
    const sessions = app.globalData.careSessions ? app.globalData.careSessions.list() : [];
    this.setData({
      initial: active ? initialOf(active) : '',
      activeName: active ? active.displayName : careText('platform.care.profile.notCreated'),
      activeMeta: active
        ? careText('platform.care.profile.relation.' + active.relation)
          + ' · ' + active.birthYear
          + ' · ' + careText('platform.care.profile.sex.' + active.sex)
        : careText('platform.care.profile.subtitle'),
      completeness: active
        ? careText('platform.care.profile.completeness', {
          percent: String(patientProfileCompleteness(active)),
        })
        : '',
      patientsValue: careText('platform.care.me.patientsCount', {
        count: String(profiles.length),
      }),
      doctorsValue: primary ? primary.displayName : careText('platform.care.me.notChosen'),
      recordsValue: careText('platform.care.me.recordsCount', { count: String(sessions.length) }),
    });
  },

  onOpenPatients() {
    try {
      wx.navigateTo({ url: '/pages/patients/index' });
    } catch (error) {
      // The patient files stay reachable from the grouped cell on a host with a
      // working navigator.
    }
  },

  onOpenDoctors() {
    try {
      wx.switchTab({ url: '/pages/doctor/index' });
    } catch (error) {
      // The doctor tab remains reachable from the tab bar.
    }
  },

  onOpenChat() {
    try {
      wx.switchTab({ url: '/pages/conversation/index' });
    } catch (error) {
      // The conversation tab remains reachable from the tab bar.
    }
  },

  onOpenRecords() {
    try {
      wx.switchTab({ url: '/pages/records/index' });
    } catch (error) {
      // The records tab remains reachable from the tab bar.
    }
  },

  onOpenDevice() {
    try {
      wx.navigateTo({ url: '/pages/device/index' });
    } catch (error) {
      // The device page stays reachable from the grouped cell.
    }
  },
});
