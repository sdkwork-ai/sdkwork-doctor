// Visit records tab: every consultation recorded on this device, newest first.
const { careText } = require('../../lib/i18n.js');

function formatTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso);
  const two = (part) => String(part).padStart(2, '0');
  return (
    value.getFullYear() + '-' + two(value.getMonth() + 1) + '-' + two(value.getDate()) +
    ' ' + two(value.getHours()) + ':' + two(value.getMinutes())
  );
}

Page({
  data: {
    title: '',
    subtitle: '',
    countLabel: '',
    emptyLabel: '',
    clearLabel: '',
    items: [],
  },

  onLoad() {
    this.setData({
      title: careText('platform.care.records.title'),
      subtitle: careText('platform.care.records.subtitle'),
      emptyLabel: careText('platform.care.records.empty'),
      clearLabel: careText('platform.care.records.clear'),
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
        meta:
          record.memberLabel + ' · ' + formatTime(record.recordedAt) + ' · ' +
          careText(record.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      })),
    });
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
