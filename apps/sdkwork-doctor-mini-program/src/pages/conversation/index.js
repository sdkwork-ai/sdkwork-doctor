// Conversation tab: hosted agent when the host provisions an agents API URL and
// a token, offline triage otherwise. The switcher at the top chooses which
// patient file the conversation is for; every exchange is recorded against the
// active patient. Copy comes from the generated care catalog.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');
const { createVisitRecord } = require('../../lib/visit-records.js');

function patientLabel(profile) {
  return careText('platform.care.profile.relation.' + profile.relation) + ' · ' + profile.displayName;
}

Page({
  data: {
    title: '',
    subtitle: '',
    empty: '',
    modeLabel: '',
    placeholder: '',
    send: '',
    sending: '',
    voiceLabel: '',
    attachLabel: '',
    error: '',
    draft: '',
    busy: false,
    messages: [],
    patientTitle: '',
    switchHint: '',
    noPatient: '',
    goProfile: '',
    hasPatient: false,
    patients: [],
  },

  onLoad() {
    const app = getApp();
    this.agent = createCareAgent(app.globalData.careAgentOptions);
    this.store = app.globalData.patients;
    this.member = null;
    this.setData({
      title: careText('platform.care.chat.title'),
      empty: careText('platform.care.chat.empty'),
      modeLabel: careText(this.agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      placeholder: careText('platform.care.chat.placeholder'),
      send: careText('platform.care.chat.send'),
      sending: careText('platform.care.chat.sending'),
      voiceLabel: careText('platform.care.chat.voice'),
      attachLabel: careText('platform.care.chat.attach'),
      patientTitle: careText('platform.care.chat.patient'),
      switchHint: careText('platform.care.chat.switchPatient'),
      noPatient: careText('platform.care.chat.noPatient'),
      goProfile: careText('platform.care.nav.me'),
    });
    this.renderPatients();
    if (this.store && typeof this.store.subscribe === 'function') {
      this.unsubscribe = this.store.subscribe(() => this.renderPatients());
    }
  },

  onShow() {
    this.renderPatients();
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  },

  renderPatients() {
    const active = this.store ? this.store.getActive() : null;
    const activeId = active ? active.id : null;
    const profiles = this.store ? this.store.list() : [];
    this.member = active;
    this.setData({
      hasPatient: Boolean(active),
      patients: profiles.map((profile) => ({
        id: profile.id,
        label: patientLabel(profile),
        active: profile.id === activeId,
      })),
      subtitle: active
        ? careText('platform.care.chat.subtitle', { member: patientLabel(active) })
        : '',
    });
  },

  onSelectPatient(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.store || !id) return;
    this.store.select(id);
    this.renderPatients();
  },

  onGoProfile() {
    try {
      wx.switchTab({ url: '/pages/profile/index' });
    } catch (error) {
      // Without a tab bar host the guidance text stays the fallback.
    }
  },

  onInput(event) {
    const detail = event && event.detail ? event.detail : {};
    this.setData({ draft: detail.value || '' });
  },

  onSend(event) {
    const detail = event && event.detail ? event.detail : {};
    const text = String(detail.text || this.data.draft || '').trim();
    const member = this.member;
    if (!member || !text || this.data.busy) return;
    this.setData({ busy: true, error: '' });
    this.agent
      .send(text, member)
      .then((reply) => {
        const store = getApp().globalData.records;
        if (store) {
          store.add(createVisitRecord({
            member: member,
            symptom: text,
            advice: reply.text,
            level: reply.level,
            mode: this.agent.mode,
          }));
        }
        const messages = this.agent.history().map((message, index) => ({
          id: 'm' + index,
          role: careText(message.role === 'user' ? 'platform.care.chat.you' : 'platform.care.chat.doctor'),
          text: message.text,
          level: careText('platform.care.level.' + message.level),
          warn: message.level === 'emergency',
        }));
        this.setData({ draft: '', messages: messages, busy: false });
      })
      .catch((error) => {
        this.setData({
          busy: false,
          error: careText('platform.care.chat.error', { message: (error && error.message) || String(error) }),
        });
      });
  },
});
