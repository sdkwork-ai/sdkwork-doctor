// 病历 (medical record) for the mini program: the conversation the patient
// ended, the agent's summary and tentative AI diagnosis, the doctor's own
// diagnosis, and the doctor's confirmation of the AI one. Shape is pinned by
// contracts/medical-record.schema.json and asserted by
// tests/medical-records.test.mjs.
//
// The AI and the doctor diagnosis are stored side by side and neither
// overwrites the other; `status` stays `awaiting_doctor` until a doctor acts.
const STORAGE_KEY = 'sdkwork.doctor.medical-records.v1';
const LIMIT = 100;
const LEVELS = ['emergency', 'urgent', 'routine', 'self-care'];
const MODES = ['hosted', 'offline'];
const STATUSES = ['awaiting_doctor', 'confirmed'];
const SOURCES = ['ai', 'doctor'];
const DECISIONS = ['confirmed', 'amended'];
const ROLES = ['patient', 'assistant'];
const KINDS = ['image', 'video', 'file'];

function newMedicalRecordId() {
  return 'case-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueText(values) {
  const seen = {};
  const result = [];
  (values || []).forEach((value) => {
    const trimmed = text(value);
    if (!trimmed || seen[trimmed]) return;
    seen[trimmed] = true;
    result.push(trimmed);
  });
  return result;
}

function isTriageLevel(value) {
  return LEVELS.indexOf(value) >= 0;
}

function medicalAttachmentKind(mimeType) {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized.indexOf('image/') === 0) return 'image';
  if (normalized.indexOf('video/') === 0) return 'video';
  return 'file';
}

function createMedicalAttachment(input) {
  const name = text(input && input.name);
  if (!name) throw new Error('an attachment needs a file name');
  const mimeType = text(input && input.mimeType) || 'application/octet-stream';
  const sizeBytes = typeof (input && input.sizeBytes) === 'number'
    ? Math.max(0, Math.floor(input.sizeBytes))
    : 0;
  const kind = input && KINDS.indexOf(input.kind) >= 0
    ? input.kind
    : medicalAttachmentKind(mimeType);
  const attachment = {
    id: text(input && input.id) ||
      'attachment-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    kind: kind,
    name: name,
    mimeType: mimeType,
    sizeBytes: sizeBytes,
    addedAt: text(input && input.addedAt) || new Date().toISOString(),
  };
  if (input && text(input.path)) attachment.path = text(input.path);
  if (input && text(input.dataUrl)) attachment.dataUrl = text(input.dataUrl);
  return attachment;
}

function createMedicalTranscriptEntry(input) {
  const role = input && input.role;
  if (ROLES.indexOf(role) < 0) throw new Error('a transcript entry needs a known role');
  const attachmentIds = uniqueText(input && input.attachmentIds);
  const value = typeof (input && input.text) === 'string' ? input.text.trim() : '';
  if (!value && attachmentIds.length === 0) {
    throw new Error('a transcript entry needs text or an attachment');
  }
  const entry = {
    id: text(input && input.id) ||
      'entry-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    role: role,
    text: value,
    at: text(input && input.at) || new Date().toISOString(),
  };
  if (input && isTriageLevel(input.level)) entry.level = input.level;
  if (attachmentIds.length > 0) entry.attachmentIds = attachmentIds;
  return entry;
}

function buildDiagnosis(source, input, author) {
  const impression = text(input && input.impression);
  if (!impression) throw new Error('a diagnosis needs an impression');
  if (!input || !isTriageLevel(input.level)) throw new Error('a diagnosis needs a known triage level');
  const doctorLabel = text(author && author.doctorLabel);
  if (source === 'doctor' && !doctorLabel) {
    throw new Error('a doctor diagnosis needs the attending doctor label');
  }
  const diagnosis = {
    id: text(author && author.id) ||
      'diagnosis-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    source: source,
    impression: impression,
    conditions: uniqueText(input.conditions),
    recommendations: uniqueText(input.recommendations),
    level: input.level,
    createdAt: text(author && author.createdAt) || new Date().toISOString(),
  };
  if (text(author && author.doctorId)) diagnosis.doctorId = text(author.doctorId);
  if (doctorLabel) diagnosis.doctorLabel = doctorLabel;
  if (text(author && author.basisDiagnosisId)) diagnosis.basisDiagnosisId = text(author.basisDiagnosisId);
  if (text(input.notes)) diagnosis.notes = text(input.notes);
  return diagnosis;
}

function createMedicalRecord(input) {
  if (!input || MODES.indexOf(input.mode) < 0) throw new Error('a medical record needs a known mode');
  const startedAt = text(input.startedAt);
  const endedAt = text(input.endedAt);
  if (!startedAt || !endedAt) throw new Error('a medical record needs the conversation start and end');
  const summary = text(input.summary);
  if (!summary) throw new Error('a medical record needs an agent summary');
  const transcript = (input.transcript || []).slice();
  if (transcript.length === 0) throw new Error('a medical record needs at least one transcript entry');
  const member = input.member || {};
  const id = text(input.id) || newMedicalRecordId();
  return {
    id: id,
    sessionId: text(input.sessionId) || 'session-' + id,
    memberId: String(member.id || ''),
    memberLabel: member.displayName
      ? member.displayName + ' (' + member.relation + ')'
      : String(member.label || ''),
    mode: input.mode,
    startedAt: startedAt,
    endedAt: endedAt,
    summary: summary,
    transcript: transcript,
    attachments: (input.attachments || []).slice(),
    aiDiagnosis: buildDiagnosis('ai', input.diagnosis, { createdAt: endedAt, id: 'ai-' + id }),
    status: 'awaiting_doctor',
  };
}

function doctorDiagnosisFor(record, input, at) {
  const existing = record.doctorDiagnosis;
  return buildDiagnosis('doctor', input, {
    doctorId: input.doctorId || (existing && existing.doctorId),
    doctorLabel: input.doctorLabel,
    basisDiagnosisId: record.aiDiagnosis.id,
    createdAt: at,
    id: existing && existing.id,
  });
}

function medicalRecordNeedsDoctorReview(record) {
  return !record || !record.confirmation;
}

function confirmAiDiagnosis(record, input) {
  const doctorLabel = text(input && input.doctorLabel);
  if (!doctorLabel) throw new Error('confirming an AI diagnosis needs the attending doctor label');
  if (!input || DECISIONS.indexOf(input.decision) < 0) {
    throw new Error('confirming an AI diagnosis needs a known decision');
  }
  const at = text(input.confirmedAt) || new Date().toISOString();
  let doctorDiagnosis = record.doctorDiagnosis;
  if (input.doctorDiagnosis) {
    doctorDiagnosis = doctorDiagnosisFor(record, {
      ...input.doctorDiagnosis,
      doctorLabel: doctorLabel,
    }, at);
  } else if (input.decision === 'amended') {
    throw new Error('amending an AI diagnosis needs the doctor diagnosis');
  }
  const confirmation = {
    diagnosisId: record.aiDiagnosis.id,
    decision: input.decision,
    doctorLabel: doctorLabel,
    confirmedAt: at,
  };
  if (text(input.doctorId)) confirmation.doctorId = text(input.doctorId);
  if (doctorDiagnosis) confirmation.doctorDiagnosisId = doctorDiagnosis.id;
  return {
    ...record,
    ...(doctorDiagnosis ? { doctorDiagnosis: doctorDiagnosis } : {}),
    confirmation: confirmation,
    status: 'confirmed',
  };
}

function addDoctorDiagnosis(record, input) {
  const doctorLabel = text(input && input.doctorLabel);
  if (!doctorLabel) throw new Error('a doctor diagnosis needs the attending doctor label');
  const at = text(input.createdAt) || new Date().toISOString();
  const doctorDiagnosis = doctorDiagnosisFor(record, { ...input, doctorLabel: doctorLabel }, at);
  const confirmation = record.confirmation
    ? { ...record.confirmation, doctorDiagnosisId: doctorDiagnosis.id }
    : undefined;
  return {
    ...record,
    doctorDiagnosis: doctorDiagnosis,
    ...(confirmation ? { confirmation: confirmation } : {}),
    status: confirmation ? 'confirmed' : 'awaiting_doctor',
  };
}

function appendMedicalRecord(records, record, limit) {
  const cap = typeof limit === 'number' ? limit : LIMIT;
  return [record].concat(records.filter((entry) => entry.id !== record.id)).slice(0, cap);
}

function saveMedicalRecord(records, record, limit) {
  const cap = typeof limit === 'number' ? limit : LIMIT;
  const index = records.findIndex((entry) => entry.id === record.id);
  if (index < 0) return appendMedicalRecord(records, record, cap);
  const next = records.slice();
  next[index] = record;
  return next.slice(0, cap);
}

function parseAttachment(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name || KINDS.indexOf(value.kind) < 0) return null;
  const sizeBytes = typeof value.sizeBytes === 'number' && isFinite(value.sizeBytes)
    ? Math.max(0, Math.floor(value.sizeBytes))
    : 0;
  const attachment = {
    id: id,
    kind: value.kind,
    name: name,
    mimeType: text(value.mimeType) || 'application/octet-stream',
    sizeBytes: sizeBytes,
    addedAt: text(value.addedAt) || new Date(0).toISOString(),
  };
  if (text(value.path)) attachment.path = text(value.path);
  if (text(value.dataUrl)) attachment.dataUrl = text(value.dataUrl);
  return attachment;
}

function parseTranscriptEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id);
  const at = text(value.at);
  if (!id || !at || ROLES.indexOf(value.role) < 0) return null;
  const attachmentIds = Array.isArray(value.attachmentIds) ? uniqueText(value.attachmentIds) : [];
  const entryText = typeof value.text === 'string' ? value.text.trim() : '';
  if (!entryText && attachmentIds.length === 0) return null;
  const entry = { id: id, role: value.role, text: entryText, at: at };
  if (isTriageLevel(value.level)) entry.level = value.level;
  if (attachmentIds.length > 0) entry.attachmentIds = attachmentIds;
  return entry;
}

function parseDiagnosis(value, source) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id);
  const impression = text(value.impression);
  const createdAt = text(value.createdAt);
  if (!id || !impression || !createdAt) return null;
  if (!isTriageLevel(value.level) || value.source !== source) return null;
  const doctorLabel = text(value.doctorLabel);
  if (source === 'doctor' && !doctorLabel) return null;
  const diagnosis = {
    id: id,
    source: source,
    impression: impression,
    conditions: uniqueText(value.conditions),
    recommendations: uniqueText(value.recommendations),
    level: value.level,
    createdAt: createdAt,
  };
  if (text(value.doctorId)) diagnosis.doctorId = text(value.doctorId);
  if (doctorLabel) diagnosis.doctorLabel = doctorLabel;
  if (text(value.basisDiagnosisId)) diagnosis.basisDiagnosisId = text(value.basisDiagnosisId);
  if (text(value.notes)) diagnosis.notes = text(value.notes);
  return diagnosis;
}

function parseConfirmation(value, aiDiagnosisId) {
  if (!value || typeof value !== 'object') return null;
  const diagnosisId = text(value.diagnosisId);
  const doctorLabel = text(value.doctorLabel);
  const confirmedAt = text(value.confirmedAt);
  if (!diagnosisId || diagnosisId !== aiDiagnosisId || !doctorLabel || !confirmedAt) return null;
  if (DECISIONS.indexOf(value.decision) < 0) return null;
  const confirmation = {
    diagnosisId: diagnosisId,
    decision: value.decision,
    doctorLabel: doctorLabel,
    confirmedAt: confirmedAt,
  };
  if (text(value.doctorId)) confirmation.doctorId = text(value.doctorId);
  if (text(value.doctorDiagnosisId)) confirmation.doctorDiagnosisId = text(value.doctorDiagnosisId);
  return confirmation;
}

function recordFromUnknown(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id);
  const sessionId = text(value.sessionId);
  const memberId = text(value.memberId);
  const memberLabel = text(value.memberLabel);
  const startedAt = text(value.startedAt);
  const endedAt = text(value.endedAt);
  const summary = text(value.summary);
  if (!id || !sessionId || !memberId || !memberLabel || !startedAt || !endedAt || !summary) return null;
  if (MODES.indexOf(value.mode) < 0) return null;
  if (!Array.isArray(value.transcript) || value.transcript.length === 0) return null;
  const transcript = value.transcript.map(parseTranscriptEntry);
  if (transcript.some((entry) => entry === null)) return null;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(parseAttachment)
    : [];
  if (attachments.some((entry) => entry === null)) return null;
  const aiDiagnosis = parseDiagnosis(value.aiDiagnosis, 'ai');
  if (!aiDiagnosis) return null;
  const doctorDiagnosis = value.doctorDiagnosis === undefined
    ? undefined
    : parseDiagnosis(value.doctorDiagnosis, 'doctor');
  if (value.doctorDiagnosis !== undefined && !doctorDiagnosis) return null;
  const confirmation = value.confirmation === undefined
    ? undefined
    : parseConfirmation(value.confirmation, aiDiagnosis.id);
  if (value.confirmation !== undefined && !confirmation) return null;
  const status = confirmation ? 'confirmed' : 'awaiting_doctor';
  if (value.status !== undefined && STATUSES.indexOf(value.status) < 0) return null;
  return {
    id: id,
    sessionId: sessionId,
    memberId: memberId,
    memberLabel: memberLabel,
    mode: value.mode,
    startedAt: startedAt,
    endedAt: endedAt,
    summary: summary,
    transcript: transcript,
    attachments: attachments,
    aiDiagnosis: aiDiagnosis,
    ...(doctorDiagnosis ? { doctorDiagnosis: doctorDiagnosis } : {}),
    ...(confirmation ? { confirmation: confirmation } : {}),
    status: status,
  };
}

function parseMedicalRecords(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(recordFromUnknown).filter((entry) => entry !== null);
}

function defaultStorage() {
  return {
    read(key) {
      try {
        return wx.getStorageSync(key) || null;
      } catch (error) {
        return null;
      }
    },
    write(key, value) {
      try {
        wx.setStorageSync(key, value);
      } catch (error) {
        // Quota or private mode: keep the session copy.
      }
    },
  };
}

/** Observable 病历 store. A storage failure degrades to the session copy. */
function createMedicalRecordStore(storage) {
  const adapter = storage || defaultStorage();
  let records = null;
  const listeners = [];

  function load() {
    if (records) return records;
    let parsed = [];
    try {
      parsed = parseMedicalRecords(adapter.read(STORAGE_KEY));
    } catch (error) {
      parsed = [];
    }
    records = parsed;
    return records;
  }

  function persist() {
    try {
      adapter.write(STORAGE_KEY, JSON.stringify(records || []));
    } catch (error) {
      // Keep the session copy.
    }
  }

  function notify() {
    listeners.slice().forEach((listener) => listener(records));
  }

  return {
    list() {
      return load().slice();
    },
    add(record) {
      records = appendMedicalRecord(load(), record);
      persist();
      notify();
    },
    save(record) {
      records = saveMedicalRecord(load(), record);
      persist();
      notify();
    },
    clear() {
      records = [];
      persist();
      notify();
    },
    subscribe(listener) {
      listeners.push(listener);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}

module.exports = {
  MEDICAL_RECORDS_STORAGE_KEY: STORAGE_KEY,
  MEDICAL_RECORD_LIMIT: LIMIT,
  addDoctorDiagnosis,
  appendMedicalRecord,
  confirmAiDiagnosis,
  createMedicalAttachment,
  createMedicalRecord,
  createMedicalRecordStore,
  createMedicalTranscriptEntry,
  medicalAttachmentKind,
  medicalRecordNeedsDoctorReview,
  newMedicalRecordId,
  parseMedicalRecords,
  saveMedicalRecord,
};
