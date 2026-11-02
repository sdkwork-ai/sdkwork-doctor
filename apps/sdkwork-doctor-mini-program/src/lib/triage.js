// Authored source: emergency-first triage mirror of
// @sdkwork/doctor-common-doctor, kept loadable by both WeChat (CommonJS) and
// Node contract tests. The red-flag vocabulary is pinned to
// contracts/triage-rules.json by tests/triage-fixtures.test.mjs.
const EMERGENCY = [
  /chest pain|\u80f8\u75db/i,
  /cannot breathe|\u547c\u5438\u56f0\u96be/i,
  /unconscious|\u660f\u8ff7/i,
  /severe bleeding/i,
  /slurred speech|face droop/i,
];

function triageLevel(text) {
  const value = String(text || '').trim();
  if (!value) return 'self-care';
  return EMERGENCY.some((pattern) => pattern.test(value)) ? 'emergency' : 'routine';
}

function triageReply(level) {
  if (level === 'emergency') {
    return 'Emergency red flag. Call local emergency services now. Do not drive yourself.';
  }
  if (level === 'self-care') return 'Describe the symptom, onset, and severity.';
  return 'No red flag found. Monitor for 24-48 hours and book a routine visit if symptoms persist.';
}

module.exports = { triageLevel, triageReply };
