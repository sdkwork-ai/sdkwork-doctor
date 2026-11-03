// Localized first-pass triage copy for the mini program.
//
// `triage.js` owns the level vocabulary; the words live in the shared care
// catalog so the mini program, both browser roots, and Flutter say the same
// thing in both locales. Every escalation keeps its actions and the safety line,
// so a localized reply is never softer than the English one.
const { careText } = require('./i18n.js');

const ACTION_KEYS = Object.freeze({
  emergency: ['emergency.call', 'emergency.doNotDrive', 'emergency.stay'],
  urgent: ['urgent.contact', 'urgent.record', 'urgent.seek'],
  routine: ['routine.monitor', 'routine.book'],
  'self-care': ['self-care.describe'],
});

function triageActions(level) {
  const keys = ACTION_KEYS[level] || ACTION_KEYS['self-care'];
  return keys.map((key) => careText('platform.care.triage.action.' + key));
}

function safetyLine() {
  return careText('platform.care.chat.safetyLine');
}

function emergencyLead() {
  return careText('platform.care.chat.emergencyLead');
}

function noRedFlag() {
  return careText('platform.care.chat.noRedFlag');
}

function describePrompt() {
  return careText('platform.care.triage.reply.describePrompt');
}

function whoLabel(member) {
  const name = member && member.displayName ? String(member.displayName) : '';
  if (!name || name === 'Me') return careText('platform.care.triage.whoSelf');
  return name;
}

function emergencyLeadFor(who) {
  return careText('platform.care.triage.lead.emergencyFor', { who });
}

function urgentLeadFor(who) {
  return careText('platform.care.triage.lead.urgentFor', { who });
}

/** Offline answer: the level's own actions plus the safety line. */
function offlineAnswer(level, member) {
  if (level === 'emergency') {
    return emergencyLeadFor(whoLabel(member)) + ' ' + triageActions(level).join(' ') + ' ' + safetyLine();
  }
  if (level === 'routine') {
    return noRedFlag() + ' ' + triageActions(level).join(' ') + ' ' + safetyLine();
  }
  return describePrompt() + ' ' + safetyLine();
}

/** Hosted answer: escalation guidance leads, the agent's words are kept after it. */
function composeHostedReply(level, replyText, member) {
  const who = whoLabel(member);
  const body = replyText.indexOf(safetyLine()) >= 0 ? replyText : replyText + ' ' + safetyLine();
  if (level === 'emergency') return emergencyLead() + ' (' + who + ') ' + body;
  if (level === 'urgent') return urgentLeadFor(who) + ' ' + body;
  return body;
}

module.exports = {
  composeHostedReply,
  describePrompt,
  emergencyLead,
  offlineAnswer,
  safetyLine,
  triageActions,
  whoLabel,
};
