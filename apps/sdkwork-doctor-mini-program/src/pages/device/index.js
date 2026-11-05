// 设备环境 page, opened from 我的: the local runtime facts this surface can
// honestly report plus the privacy statement. No health data is read here.
const { careText, getLocale } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');

Page({
  data: {
    title: '',
    hint: '',
    modeLabel: '',
    status: '',
    platform: '',
    locale: '',
    rerunLabel: '',
    runningLabel: '',
    privacy: '',
    checking: false,
  },

  onLoad() {
    this.setData({
      title: careText('platform.care.me.device'),
      hint: careText('platform.care.me.deviceHint'),
      modeLabel: careText(
        createCareAgent(getApp().globalData.careAgentOptions).mode === 'hosted'
          ? 'platform.care.mode.hosted'
          : 'platform.care.mode.offline',
      ),
      rerunLabel: careText('platform.care.me.rerun'),
      runningLabel: careText('platform.care.me.running'),
      privacy: careText('platform.care.privacy.local'),
      locale: getLocale(),
    });
    try {
      if (typeof wx !== 'undefined' && typeof wx.setNavigationBarTitle === 'function') {
        wx.setNavigationBarTitle({ title: careText('platform.care.me.device') });
      }
    } catch (error) {
      // A host without a navigation bar keeps the static title.
    }
    this.runChecks();
  },

  runChecks() {
    let platform = '';
    let available = false;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
        const info = wx.getSystemInfoSync() || {};
        platform = String(info.platform || '');
        available = true;
      }
      if (available && typeof wx.getStorageInfoSync === 'function') {
        wx.getStorageInfoSync();
      }
    } catch (error) {
      available = false;
    }
    this.setData({
      checking: false,
      platform: platform,
      status: careText(available ? 'platform.care.available' : 'platform.care.value.unknown'),
    });
  },

  onRerunChecks() {
    this.setData({ checking: true });
    this.runChecks();
  },
});
