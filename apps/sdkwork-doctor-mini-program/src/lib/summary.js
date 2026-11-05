// Conversation → 病历 summarization for the mini program.
//
// The patient ends the conversation; the agent writes the case summary and a
// tentative AI diagnosis. The diagnosis is always a draft for a human doctor,
// and the deterministic triage level of the patient's own turns is a floor, so
// a model answer can never lower an emergency.
const { triageLevel } = require('./triage.js');

const RANK = { 'self-care': 0, routine: 1, urgent: 2, emergency: 3 };
const LEVELS = ['emergency', 'urgent', 'routine', 'self-care'];

const SUMMARY_SYSTEM_PROMPT = [
  'You write the case record of a family-doctor conversation for the attending human doctor to review.',
  'Return exactly one JSON object and nothing else, with these keys:',
  '{"summary": string, "impression": string, "conditions": string[], "recommendations": string[], "level": "emergency" | "urgent" | "routine" | "self-care"}.',
  'The impression is a tentative diagnostic direction, never a certainty; the human doctor confirms or corrects it.',
  'Keep every string in the language the patient used.',
].join(' ');

const ACTION_KEYS = {
  emergency: ['emergency.call', 'emergency.doNotDrive', 'emergency.stay'],
  urgent: ['urgent.contact', 'urgent.record', 'urgent.seek'],
  routine: ['routine.monitor', 'routine.book'],
  'self-care': ['self-care.describe'],
};

const ACTION_FALLBACK = {
  emergency: [
    'Call local emergency services now.',
    'Do not drive yourself.',
    'Stay with the person until help arrives.',
  ],
  urgent: [
    'Contact a clinician today.',
    'Record temperature and fluid intake.',
    'Seek emergency care if breathing or consciousness changes.',
  ],
  routine: [
    'Monitor for 24-48 hours.',
    'Book a routine consultation if symptoms persist or worsen.',
  ],
  'self-care': ['Describe the symptom, its onset, and its severity.'],
};

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function translateText(translate, key, params) {
  if (!translate) return null;
  const value = translate(key, params);
  return typeof value === 'string' && value.trim() && value !== key ? value : null;
}

function transcriptLevel(transcript) {
  let level = 'self-care';
  (transcript || []).forEach((turn) => {
    if (!turn || turn.role !== 'user') return;
    const candidate = triageLevel(turn.text);
    if (RANK[candidate] > RANK[level]) level = candidate;
  });
  return level;
}

function triageActions(level, translate) {
  const keys = ACTION_KEYS[level] || ACTION_KEYS['self-care'];
  const resolved = keys
    .map((key) => translateText(translate, 'platform.care.triage.action.' + key))
    .filter((value) => value !== null);
  return resolved.length === keys.length ? resolved : ACTION_FALLBACK[level].slice();
}

function buildSummaryRequest(input) {
  const member = (input && input.member) || {};
  const allergies = member.allergies && member.allergies.length ? member.allergies.join(', ') : 'none recorded';
  const conditions = member.chronicConditions && member.chronicConditions.length
    ? member.chronicConditions.join(', ')
    : 'none recorded';
  const medications = member.medications && member.medications.length ? member.medications.join(', ') : 'none recorded';
  const attachments = (input.attachments || [])
    .map((attachment) => attachment.name + ' (' + attachment.kind + ')')
    .join(', ');
  return [
    'Patient: ' + member.displayName + ' (' + member.relation + ', born ' + member.birthYear + ').',
    'Known allergies: ' + allergies + '. Chronic conditions: ' + conditions + '. Current medications: ' + medications + '.',
    attachments ? 'Attachments: ' + attachments + '.' : 'Attachments: none.',
    'Conversation:',
  ].concat((input.transcript || []).map(
    (turn) => (turn.role === 'user' ? 'Patient: ' : 'Doctor: ') + turn.text,
  )).join('\n');
}

function jsonCandidate(raw) {
  let value = String(raw || '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(value);
  if (fenced) value = fenced[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return value.slice(start, end + 1);
}

function textArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = {};
  const result = [];
  value.forEach((entry) => {
    const trimmed = text(entry);
    if (!trimmed || seen[trimmed]) return;
    seen[trimmed] = true;
    result.push(trimmed);
  });
  return result;
}

function parseSummaryReply(raw, input) {
  const candidate = jsonCandidate(raw);
  if (!candidate) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const summary = text(parsed.summary);
  const impression = text(parsed.impression);
  if (!summary || !impression) return null;
  const floor = transcriptLevel(input && input.transcript);
  const modelLevel = LEVELS.indexOf(parsed.level) >= 0 ? parsed.level : 'routine';
  const level = RANK[modelLevel] >= RANK[floor] ? modelLevel : floor;
  const draft = {
    summary: summary,
    source: 'hosted',
    diagnosis: {
      impression: impression,
      conditions: textArray(parsed.conditions),
      recommendations: textArray(parsed.recommendations),
      level: level,
    },
  };
  if (text(parsed.notes)) draft.diagnosis.notes = text(parsed.notes);
  return draft;
}

function offlineSummary(input, translate) {
  const turns = (input && input.transcript) || [];
  const patientTurns = turns.filter((turn) => turn && turn.role === 'user' && text(turn.text));
  const level = transcriptLevel(turns);
  let complaint = patientTurns.length ? text(patientTurns[0].text) : '';
  if (complaint.length > 120) complaint = complaint.slice(0, 117) + '...';
  const none = translateText(translate, 'platform.care.value.none') || 'none recorded';
  const levelLabel = translateText(translate, 'platform.care.level.' + level) || level;
  const summary = translateText(translate, 'platform.care.medical.summaryOffline', {
    count: String(patientTurns.length),
    complaint: complaint || none,
    level: levelLabel,
  }) || (
    'The conversation had ' + patientTurns.length + ' patient messages. Main complaint: ' +
    (complaint || none) + '. Triage level: ' + levelLabel +
    '. This summary is generated on the device and must be reviewed by a doctor.'
  );
  const impression = translateText(translate, 'platform.care.medical.offlineImpression', {
    complaint: complaint || none,
  }) || (
    'Tentative direction from the conversation: ' + (complaint || 'no symptom text') +
    '. No definitive diagnosis was made offline; the attending doctor must confirm or amend it.'
  );
  const condition = translateText(translate, 'platform.care.medical.offlineCondition') ||
    'Needs clinician assessment with history and examination';
  return {
    summary: summary,
    source: 'offline',
    diagnosis: {
      impression: impression,
      conditions: [condition],
      recommendations: triageActions(level, translate),
      level: level,
    },
  };
}

module.exports = {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryRequest,
  offlineSummary,
  parseSummaryReply,
  transcriptLevel,
};
