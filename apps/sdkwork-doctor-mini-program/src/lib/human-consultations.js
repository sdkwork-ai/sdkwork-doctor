// Human consultations held inside the conversation home.
//
// A human consultation is not an agents session: the family talks to one of its
// roster doctors, the doctor replies on this device, and unread replies are
// counted per conversation. Kept apart from `care-sessions.js` so a hosted
// deployment never receives a fake doctor turn.
const HUMAN_CONSULTATIONS_STORAGE_KEY = 'sdkwork.doctor.care.human-consultations.v1';
const HUMAN_CONSULTATION_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const TITLE_LIMIT = 40;

// Session preview prefixes let a row say "waiting for the doctor" without
// loading the transcript. They never reach the visible text.
const PATIENT_PREFIX = '\u0001p:';
const DOCTOR_PREFIX = '\u0001d:';

let counter = 0;

function newId(now) {
  counter += 1;
  return 'human-' + now + '-' + counter;
}

function clampTitle(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  return value.length > TITLE_LIMIT ? value.slice(0, TITLE_LIMIT - 1) + '…' : value;
}

function previewText(preview) {
  const value = String(preview || '');
  return value.startsWith(PATIENT_PREFIX) || value.startsWith(DOCTOR_PREFIX)
    ? value.slice(3)
    : value;
}

function normalizeDoctor(input) {
  const id = String((input && input.id) || '').trim();
  const displayName = String((input && input.displayName) || '').trim();
  if (!id || !displayName) throw new Error('a human consultation needs a doctor');
  return {
    kind: 'human',
    id: id,
    displayName: displayName,
    department: String((input && input.department) || '').trim(),
    hospitalName: String((input && input.hospitalName) || '').trim(),
    organizationId: String((input && input.organizationId) || '').trim(),
    employmentType: String((input && input.employmentType) || '').trim(),
  };
}

function parseSession(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const updatedAt = Date.parse(value.updatedAt || '');
  if (!id || Number.isNaN(updatedAt)) return null;
  const doctor = value.doctor && typeof value.doctor === 'object'
    ? {
      kind: 'human',
      id: String(value.doctor.id || ''),
      displayName: String(value.doctor.displayName || ''),
      department: String(value.doctor.department || ''),
      hospitalName: String(value.doctor.hospitalName || ''),
      organizationId: String(value.doctor.organizationId || ''),
      employmentType: String(value.doctor.employmentType || ''),
    }
    : null;
  if (!doctor || !doctor.id || !doctor.displayName) return null;
  const messages = [];
  (Array.isArray(value.messages) ? value.messages : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const messageId = String(entry.id || '');
    const text = String(entry.text || '');
    if (!messageId || !text) return;
    messages.push({
      id: messageId,
      isUser: entry.isUser === true,
      text: text,
      createdAt: String(entry.createdAt || ''),
    });
  });
  return {
    id: id,
    title: String(value.title || ''),
    updatedAt: new Date(updatedAt).toISOString(),
    doctor: doctor,
    memberLabel: String(value.memberLabel || ''),
    startedAt: String(value.startedAt || value.updatedAt || ''),
    status: value.status === 'ended' ? 'ended' : 'active',
    endedAt: value.endedAt ? String(value.endedAt) : '',
    unreadCount: Number.isFinite(Number(value.unreadCount)) ? Math.max(0, Number(value.unreadCount)) : 0,
    preview: String(value.preview || ''),
    messages: messages,
  };
}

function createWxHumanConsultationStorage() {
  return {
    read: () => {
      try {
        return wx.getStorageSync(HUMAN_CONSULTATIONS_STORAGE_KEY) || null;
      } catch (error) {
        return null;
      }
    },
    write: (value) => {
      try {
        wx.setStorageSync(HUMAN_CONSULTATIONS_STORAGE_KEY, value);
      } catch (error) {
        // A rejected write keeps the in-memory copy.
      }
    },
  };
}

/**
 * Creates the human-consultation store.
 *
 * The adapter defaults to `wx` storage; tests inject an in-memory one so no host
 * API is touched.
 */
function createHumanConsultationStore(adapter) {
  const storage = adapter || createWxHumanConsultationStorage();
  let sessions = null;
  const listeners = [];

  function load() {
    if (sessions) return sessions;
    sessions = [];
    let raw = null;
    try {
      raw = storage.read();
    } catch (error) {
      raw = null;
    }
    if (!raw) return sessions;
    let decoded = null;
    try {
      decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      decoded = null;
    }
    const rows = decoded && Array.isArray(decoded.sessions) ? decoded.sessions : [];
    rows.forEach((entry) => {
      const parsed = parseSession(entry);
      if (parsed) sessions.push(parsed);
    });
    sessions.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return sessions;
  }

  function persist() {
    try {
      storage.write(JSON.stringify({ sessions: load() }));
    } catch (error) {
      // Keep the in-memory copy.
    }
  }

  function notify() {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        // A listener failure never breaks the store.
      }
    });
  }

  function commit(next) {
    sessions = [next].concat(load().filter((entry) => entry.id !== next.id));
    sessions.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    persist();
    notify();
    return next;
  }

  function update(id, change) {
    const current = load().filter((entry) => entry.id === id)[0] || null;
    if (!current) return null;
    const next = change(current);
    if (next === current) return current;
    return commit(next);
  }

  function findActiveByDoctor(doctorId) {
    return load().filter((entry) => (
      entry.status === 'active' && entry.doctor.id === doctorId
    ))[0] || null;
  }

  function start(input) {
    const doctor = normalizeDoctor(input.doctor);
    const memberLabel = String(input.memberLabel || '').trim();
    const reason = String(input.reason || '').trim();
    const now = input.now ? new Date(input.now) : new Date();
    const nowIso = now.toISOString();
    const existing = findActiveByDoctor(doctor.id);
    if (existing && now.getTime() - Date.parse(existing.updatedAt) <= HUMAN_CONSULTATION_STALE_AFTER_MS) {
      if (reason) {
        return update(existing.id, (session) => appendPatientMessage(session, reason, nowIso));
      }
      return existing;
    }
    const id = newId(now.getTime());
    const title = clampTitle(reason);
    const session = {
      id: id,
      title: title || memberLabel || doctor.displayName,
      updatedAt: nowIso,
      doctor: doctor,
      memberLabel: memberLabel,
      startedAt: nowIso,
      status: 'active',
      endedAt: '',
      unreadCount: 0,
      preview: reason ? PATIENT_PREFIX + reason : '',
      messages: reason
        ? [{ id: id + '-turn-1', isUser: true, text: reason, createdAt: nowIso }]
        : [],
    };
    return commit(session);
  }

  function appendPatientMessage(session, text, at) {
    const value = String(text || '').trim();
    if (!value || session.status !== 'active') return session;
    const now = at || new Date().toISOString();
    return Object.assign({}, session, {
      updatedAt: now,
      preview: PATIENT_PREFIX + value,
      messages: session.messages.concat([{
        id: session.id + '-turn-' + (session.messages.length + 1),
        isUser: true,
        text: value,
        createdAt: now,
      }]),
    });
  }

  function appendDoctorReply(session, text, at) {
    const value = String(text || '').trim();
    if (!value || session.status !== 'active') return session;
    const now = at || new Date().toISOString();
    return Object.assign({}, session, {
      updatedAt: now,
      preview: DOCTOR_PREFIX + value,
      unreadCount: session.unreadCount + 1,
      messages: session.messages.concat([{
        id: session.id + '-turn-' + (session.messages.length + 1),
        isUser: false,
        text: value,
        createdAt: now,
      }]),
    });
  }

  return Object.freeze({
    list: () => load().slice(),
    find: (id) => load().filter((entry) => entry.id === id)[0] || null,
    findActiveByDoctor: findActiveByDoctor,
    messages: (id) => {
      const session = load().filter((entry) => entry.id === id)[0];
      return session ? session.messages.slice() : [];
    },
    unreadTotal: () => load().reduce((total, entry) => total + entry.unreadCount, 0),
    start: start,
    appendPatientMessage: (id, text) => update(id, (session) => appendPatientMessage(session, text)),
    appendDoctorReply: (id, text) => update(id, (session) => appendDoctorReply(session, text)),
    markRead: (id) => update(id, (session) => (
      session.unreadCount === 0 ? session : Object.assign({}, session, { unreadCount: 0 })
    )),
    end: (id) => update(id, (session) => (
      session.status === 'ended'
        ? session
        : Object.assign({}, session, {
          status: 'ended',
          updatedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        })
    )),
    remove: (id) => {
      const next = load().filter((entry) => entry.id !== id);
      if (next.length === load().length) return;
      sessions = next;
      persist();
      notify();
    },
    clear: () => {
      sessions = [];
      persist();
      notify();
    },
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  });
}

function createMemoryHumanConsultationStore(initial) {
  let stored = initial ? JSON.stringify({ sessions: initial }) : '';
  return createHumanConsultationStore({
    read: () => stored,
    write: (value) => { stored = value; },
  });
}

module.exports = {
  HUMAN_CONSULTATIONS_STORAGE_KEY: HUMAN_CONSULTATIONS_STORAGE_KEY,
  createHumanConsultationStore: createHumanConsultationStore,
  createMemoryHumanConsultationStore: createMemoryHumanConsultationStore,
  createWxHumanConsultationStorage: createWxHumanConsultationStorage,
  previewText: previewText,
};
