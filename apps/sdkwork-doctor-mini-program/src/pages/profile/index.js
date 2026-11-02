// Me tab: family member, conversation mode, and the device privacy statement.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');

Page({
  data: { title: '', subtitle: '', memberLabel: '', completeness: '', activeLabel: '', modeTitle: '', modeLabel: '', privacy: '' },

  onLoad() {
    const app = getApp();
    const member = app.globalData.member;
    const agent = createCareAgent(app.globalData.careAgentOptions);
    const complete = (member.allergies && member.allergies.length > 0) ||
      (member.chronicConditions && member.chronicConditions.length > 0);
    this.setData({
      title: careText('platform.care.me.title'),
      subtitle: careText('platform.care.me.subtitle'),
      memberLabel: member.displayName + ' (' + member.relation + ')',
      completeness:
        careText('platform.care.me.completeness') +
        ': ' +
        careText(complete ? 'platform.care.me.completenessInProgress' : 'platform.care.me.completenessNeedsReview'),
      activeLabel: careText('platform.care.active'),
      modeTitle: careText('platform.care.me.mode'),
      modeLabel: careText(agent.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
      privacy: careText('platform.care.me.deviceHint'),
    });
  },
});
