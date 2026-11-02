// Doctor tab: the household health record rendered from the care catalog.
const { careText } = require('../../lib/i18n.js');

function list(values, none) {
  return values && values.length > 0 ? values.join(', ') : none;
}

Page({
  data: { title: '', subtitle: '', rows: [], hint: '', actions: '' },

  onLoad() {
    const member = getApp().globalData.member;
    const none = careText('platform.care.value.none');
    this.setData({
      title: careText('platform.care.doctor.title'),
      subtitle: careText('platform.care.doctor.subtitle'),
      actions: careText('platform.care.doctor.actions'),
      hint: careText('platform.care.doctor.actionsHint'),
      rows: [
        { label: careText('platform.care.fact.member'), value: member.displayName + ' (' + member.relation + ')' },
        { label: careText('platform.care.fact.born'), value: String(member.birthYear) },
        { label: careText('platform.care.fact.allergies'), value: list(member.allergies, none) },
        { label: careText('platform.care.fact.conditions'), value: list(member.chronicConditions, none) },
        { label: careText('platform.care.fact.medications'), value: list(member.medications, none) },
      ],
    });
  },
});
