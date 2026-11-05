// 看病记录: one row per conversation session. Each row opens the dedicated
// 4-tab detail page (病历 / AI总结 / 医生人工确认 / 通话回放); the list never
// expands a full 病历 in place.
const { careText } = require('../../lib/i18n.js');
const {
  careSessionLevel,
  careSessionRecord,
  mergeCareSessions,
} = require('../../lib/care-sessions.js');

function formatTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso);
  const two = (part) => String(part).padStart(2, '0');
  return (
    value.getFullYear() + '-' + two(value.getMonth() + 1) + '-' + two(value.getDate()) +
    ' ' + two(value.getHours()) + ':' + two(value.getMinutes())
  );
}

function statusOf(session, record) {
  if (session.status === 'active') return { key: 'active', tone: 'skipped' };
  if (record && record.confirmation) return { key: 'confirmed', tone: 'ok' };
  if (record) return { key: 'awaiting_doctor', tone: 'warn' };
  return { key: 'ended', tone: 'ok' };
}

Page({
  data: {
    title: '',
    subtitle: '',
    empty: '',
    countLabel: '',
    clearLabel: '',
    clearConfirm: '',
    openLabel: '',
    sessions: [],
  },

  onLoad() {
    this.setData({
      title: careText('platform.care.records.title'),
      subtitle: careText('platform.care.records.subtitle'),
      empty: careText('platform.care.records.empty'),
      clearLabel: careText('platform.care.records.clearAll'),
      clearConfirm: careText('platform.care.records.clearAllConfirm'),
      openLabel: careText('platform.care.records.open'),
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
    const app = getApp();
    const store = app.globalData.careSessions;
    const medicalStore = app.globalData.medicalRecords;
    const sessions = store ? store.list() : [];
    const records = medicalStore ? medicalStore.list() : [];
    const merged = mergeCareSessions(sessions, records);
    this.setData({
      countLabel: careText('platform.care.records.sessionCount', { count: String(merged.length) }),
      sessions: merged.map((session) => {
        const record = careSessionRecord(session, records);
        const status = statusOf(session, record);
        const level = careSessionLevel(session);
        return {
          id: session.id,
          title: session.title,
          member: session.memberLabel,
          startedAt: formatTime(session.startedAt),
          statusLabel: careText('platform.care.records.status.' + status.key),
          statusTone: status.tone,
          preview: record ? record.aiDiagnosis.impression : careText('platform.care.record.recordPending'),
          messages: careText('platform.care.records.messageCount', { count: String(session.transcript.length) }),
          calls: session.calls && session.calls.length > 0
            ? careText('platform.care.records.callCount', { count: String(session.calls.length) })
            : '',
          level: level === 'self-care' ? '' : careText('platform.care.level.' + level),
          warn: level === 'emergency' || level === 'urgent',
        };
      }),
    });
  },

  onOpen(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!id) return;
    wx.navigateTo({ url: '/pages/record-detail/index?id=' + encodeURIComponent(id) });
  },

  onClear() {
    if (!this.data.sessions || this.data.sessions.length === 0) return;
    wx.showModal({
      title: this.data.title,
      content: this.data.clearConfirm,
      confirmText: this.data.clearLabel,
      cancelText: careText('platform.care.action.cancel'),
      success: (result) => {
        if (!result.confirm) return;
        const app = getApp();
        if (app.globalData.careSessions) app.globalData.careSessions.clear();
        if (app.globalData.medicalRecords) app.globalData.medicalRecords.clear();
        this.render();
      },
    });
  },
});
