// Visit records page: every consultation recorded on this device, newest first.
// It is no longer a tab; the Me tab opens it with wx.navigateTo, so it carries a
// back action. Human consultations show the doctor they were routed to.
const { careText } = require('../../lib/i18n.js');
const { isDoctorEmploymentType } = require('../../lib/doctors.js');

function formatTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso);
  const two = (part) => String(part).padStart(2, '0');
  return (
    value.getFullYear() + '-' + two(value.getMonth() + 1) + '-' + two(value.getDate()) +
    ' ' + two(value.getHours()) + ':' + two(value.getMinutes())
  );
}

function modeLabel(mode) {
  if (mode === 'human') return careText('platform.care.mode.human');
  return careText(mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline');
}

function employmentLabel(employmentType) {
  return isDoctorEmploymentType(employmentType)
    ? careText('platform.care.doctors.employment.' + employmentType)
    : '';
}

Page({
  data: {
    title: '',
    subtitle: '',
    countLabel: '',
    emptyLabel: '',
    clearLabel: '',
    backLabel: '',
    doctorTitle: '',
    hospitalTitle: '',
    employmentTitle: '',
    items: [],
  },

  onLoad() {
    this.setData({
      title: careText('platform.care.records.title'),
      subtitle: careText('platform.care.records.subtitle'),
      emptyLabel: careText('platform.care.records.empty'),
      clearLabel: careText('platform.care.records.clear'),
      backLabel: careText('platform.care.records.back'),
      doctorTitle: careText('platform.care.records.doctor'),
      hospitalTitle: careText('platform.care.records.hospital'),
      employmentTitle: careText('platform.care.records.employment'),
    });
    try {
      wx.setNavigationBarTitle({ title: careText('platform.care.records.title') });
    } catch (error) {
      // The static page title is the fallback.
    }
  },

  onShow() {
    this.render();
  },

  render() {
    const store = getApp().globalData.records;
    const records = store ? store.list() : [];
    this.setData({
      countLabel: careText('platform.care.records.count', { count: String(records.length) }),
      items: records.map((record) => ({
        id: record.id,
        symptom: record.symptom,
        advice: record.advice,
        level: careText('platform.care.level.' + record.level),
        warn: record.level === 'emergency',
        doctor: record.doctorLabel || '',
        hospital: record.doctorHospitalLabel || '',
        employment: employmentLabel(record.doctorEmploymentType),
        meta:
          record.memberLabel + ' · ' + formatTime(record.recordedAt) + ' · ' + modeLabel(record.mode),
      })),
    });
  },

  onBack() {
    try {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({ url: '/pages/profile/index' });
        },
      });
    } catch (error) {
      // The tab bar remains the way back on a host without a navigation stack.
    }
  },

  onClear() {
    const records = this.data.items || [];
    if (records.length === 0) return;
    wx.showModal({
      title: careText('platform.care.records.title'),
      content: careText('platform.care.records.clearConfirm'),
      confirmText: careText('platform.care.records.clear'),
      cancelText: careText('platform.care.records.cancel'),
      success: (result) => {
        if (!result.confirm) return;
        const store = getApp().globalData.records;
        if (store) store.clear();
        this.render();
      },
    });
  },
});
