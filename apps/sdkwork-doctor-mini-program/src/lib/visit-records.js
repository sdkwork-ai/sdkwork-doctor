// Visit records for the mini program: one entry per consultation.
// Shape is pinned by contracts/visit-record.schema.json and asserted by
// tests/mini-program-records.test.mjs.
const STORAGE_KEY = 'sdkwork.doctor.visit-records.v1';
const LIMIT = 200;
const LEVELS = ['emergency', 'urgent', 'routine', 'self-care'];
const MODES = ['hosted', 'offline', 'human'];

function newVisitRecordId() {
  return 'visit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function createVisitRecord(input) {
  const symptom = String((input && input.symptom) || '').trim();
  const advice = String((input && input.advice) || '').trim();
  const level = input && input.level;
  const mode = input && input.mode;
  const member = (input && input.member) || {};
  const doctorId = String((input && input.doctorId) || '').trim();
  const doctorLabel = String((input && input.doctorLabel) || '').trim();
  const doctorOrganizationId = String((input && input.doctorOrganizationId) || '').trim();
  const doctorHospitalLabel = String((input && input.doctorHospitalLabel) || '').trim();
  const doctorEmploymentType = String((input && input.doctorEmploymentType) || '').trim();
  if (!symptom) throw new Error('a visit record needs symptom text');
  if (!advice) throw new Error('a visit record needs advice text');
  if (LEVELS.indexOf(level) < 0) throw new Error('a visit record needs a known triage level');
  if (MODES.indexOf(mode) < 0) throw new Error('a visit record needs a known transport mode');
  const record = {
    id: (input && input.id) || newVisitRecordId(),
    recordedAt: (input && input.recordedAt) || new Date().toISOString(),
    memberId: String(member.id || ''),
    memberLabel: member.displayName
      ? member.displayName + ' (' + member.relation + ')'
      : String(member.label || ''),
    symptom: symptom,
    advice: advice,
    level: level,
    mode: mode,
  };
  // Human consultations keep which doctor, at which site, under which
  // engagement they were routed to; every other record omits the optional
  // fields so its shape stays the required set.
  if (doctorId) record.doctorId = doctorId;
  if (doctorLabel) record.doctorLabel = doctorLabel;
  if (doctorOrganizationId) record.doctorOrganizationId = doctorOrganizationId;
  if (doctorHospitalLabel) record.doctorHospitalLabel = doctorHospitalLabel;
  if (doctorEmploymentType) record.doctorEmploymentType = doctorEmploymentType;
  return record;
}

function recordFromUnknown(value) {
  if (!value || typeof value !== 'object') return null;
  const fields = ['id', 'recordedAt', 'memberId', 'memberLabel', 'symptom', 'advice'];
  for (let index = 0; index < fields.length; index += 1) {
    if (typeof value[fields[index]] !== 'string') return null;
  }
  if (!value.id || !value.recordedAt || !value.symptom || !value.advice) return null;
  if (LEVELS.indexOf(value.level) < 0 || MODES.indexOf(value.mode) < 0) return null;
  const record = {
    id: value.id,
    recordedAt: value.recordedAt,
    memberId: value.memberId,
    memberLabel: value.memberLabel,
    symptom: value.symptom,
    advice: value.advice,
    level: value.level,
    mode: value.mode,
  };
  [
    'doctorId',
    'doctorLabel',
    'doctorOrganizationId',
    'doctorHospitalLabel',
    'doctorEmploymentType',
  ].forEach((field) => {
    const text = typeof value[field] === 'string' ? value[field].trim() : '';
    if (text) record[field] = text;
  });
  return record;
}

function parseVisitRecords(value) {
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

function appendVisitRecord(records, record, limit) {
  const cap = typeof limit === 'number' ? limit : LIMIT;
  return [record].concat(records.filter((entry) => entry.id !== record.id)).slice(0, cap);
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

/**
 * Observable record store. A storage failure degrades to an in-memory list for
 * the session instead of losing the consultation.
 */
function createVisitRecordStore(storage) {
  const adapter = storage || defaultStorage();
  let records = null;
  const listeners = [];

  function load() {
    if (records) return records;
    let parsed = [];
    try {
      parsed = parseVisitRecords(adapter.read(STORAGE_KEY));
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
      // ignore
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
      records = appendVisitRecord(load(), record);
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
  VISIT_RECORDS_STORAGE_KEY: STORAGE_KEY,
  VISIT_RECORD_LIMIT: LIMIT,
  createVisitRecord,
  createVisitRecordStore,
  appendVisitRecord,
  parseVisitRecords,
  newVisitRecordId,
};
