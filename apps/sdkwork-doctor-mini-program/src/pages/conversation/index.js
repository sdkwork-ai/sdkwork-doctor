// Conversation tab: hosted agent when the host provisions an agents API URL and
// a token, offline triage otherwise. Copy comes from the generated care catalog.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');

function memberLabel(member) {
  return member.displayName === 'Me' ? 'Me (self)' : member.displayName + ' (' + member.relation + ')';
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
    error: '',
    draft: '',
    busy: false,
    messages: [],
  },

  onLoad() {
    const app = getApp();
    this.agent = createCareAgent(app.globalData.careAgentOptions);
    this.member = app.globalData.member;
    this.setData({
      title: careText('platform.care.chat.title'),
      subtitle: careText('platform.care.chat.subtitle', { member: memberLabel(this.member) }),
      empty: careText('platform.care.chat.empty'),
      modeLabel: careText(this.agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      placeholder: careText('platform.care.chat.placeholder'),
      send: careText('platform.care.chat.send'),
      sending: careText('platform.care.chat.sending'),
    });
  },

  onInput(event) {
    this.setData({ draft: event.detail.value });
  },

  onSend() {
    const text = (this.data.draft || '').trim();
    if (!text || this.data.busy) return;
    this.setData({ busy: true, error: '' });
    this.agent
      .send(text, this.member)
      .then(() => {
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
