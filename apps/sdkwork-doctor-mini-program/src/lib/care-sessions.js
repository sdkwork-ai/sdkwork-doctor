// One 看病记录 is one conversation session.
//
// Mirrors `apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-doctor/src/care-sessions.ts`
// so the mini program lists, opens, and replays the same visit sessions the
// browser and Flutter clients keep. The clinical artifact (summary, AI
// diagnosis, doctor diagnosis, confirmation) stays in the 病历 store.
const CARE_SESSIONS_STORAGE_KEY = 'sdkwork.doctor.care-sessions.v1';
const CARE_SESSION_LIMIT = 200;
const TITLE_LIMIT = 40;
const DEFAULT_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

let sessionCounter = 0;

function newCareSessionId(now) {
  sessionCounter += 1;
  return 'session-' + (now || Date.now()) + '-' + sessionCounter;
}

function memberText(member) {
  const relation = String((member && member.relation) || '').trim();
  return relation ? member.displayName + ' (' + relation + ')' : String(member.displayName || '');
}

function clampTitle(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  return value.length > TITLE_LIMIT ? value.slice(0, TITLE_LIMIT - 1) + '…' : value;
}

function firstPatientText(transcript) {
  for (const message of transcript || []) {
    if (message.role !== 'patient') continue;
    const title = clampTitle(message.text);
    if (title) return title;
  }
  return '';
}

function isMode(value) {
  return value === 'hosted' || value === 'offline';
}

function isStatus(value) {
  return value === 'active' || value === 'ended';
}

function isChannel(value) {
  return value === 'text' || value === 'voice' || value === 'video';
}

function isCallMode(value) {
  return value === 'voice' || value === 'video';
}

function isTriageLevel(value) {
  return value === 'emergency' || value === 'urgent' || value === 'routine' || value === 'self-care';
}

function createCareSession(input) {
  const startedAt = input.startedAt || new Date().toISOString();
  const label = memberText(input.member);
  return {
    id: input.id || newCareSessionId(Date.parse(startedAt) || Date.now()),
    memberId: input.member.id,
    memberLabel: label,
    mode: input.mode,
    title: clampTitle(input.title) || label,
    status: 'active',
    startedAt: startedAt,
    updatedAt: startedAt,
    transcript: [],
    calls: [],
  };
}

function appendCareSessionMessage(session, input) {
  const text = String(input.text || '').trim();
  const attachmentIds = Array.isArray(input.attachmentIds) ? input.attachmentIds.slice() : [];
  if (!text && attachmentIds.length === 0) {
    throw new Error('a care session message needs text or an attachment');
  }
  const at = input.at || new Date().toISOString();
  const message = {
    id: input.id || 'turn-' + Date.parse(at) + '-' + (session.transcript.length + 1),
    role: input.role,
    text: text,
    at: at,
    channel: input.channel || 'text',
  };
  if (isTriageLevel(input.level)) message.level = input.level;
  if (attachmentIds.length > 0) message.attachmentIds = attachmentIds;
  const transcript = session.transcript.concat([message]);
  const shouldTitle = input.role === 'patient' && !firstPatientText(session.transcript) && Boolean(text);
  return Object.assign({}, session, {
    title: shouldTitle ? clampTitle(text) : session.title,
    updatedAt: at,
    transcript: transcript,
  });
}

function startCareSessionCall(session, mode, at) {
  const startedAt = at || new Date().toISOString();
  if ((session.calls || []).some((call) => call.mode === mode && !call.endedAt)) return session;
  const call = {
    id: 'call-' + Date.parse(startedAt) + '-' + ((session.calls || []).length + 1),
    mode: mode,
    startedAt: startedAt,
  };
  return Object.assign({}, session, {
    updatedAt: startedAt,
    calls: (session.calls || []).concat([call]),
  });
}

function endCareSessionCall(session, callId, at) {
  const endedAt = at || new Date().toISOString();
  let changed = false;
  const calls = (session.calls || []).map((call) => {
    if (call.id !== callId || call.endedAt) return call;
    changed = true;
    return Object.assign({}, call, { endedAt: endedAt });
  });
  if (!changed) return session;
  return Object.assign({}, session, { updatedAt: endedAt, calls: calls });
}

function endCareSession(session, input) {
  const options = input || {};
  const endedAt = options.endedAt || new Date().toISOString();
  const calls = (session.calls || []).map((call) => (
    call.endedAt ? call : Object.assign({}, call, { endedAt: endedAt })
  ));
  const next = Object.assign({}, session, {
    status: 'ended',
    updatedAt: endedAt,
    endedAt: endedAt,
    calls: calls,
  });
  if (options.medicalRecordId) next.medicalRecordId = options.medicalRecordId;
  return next;
}

function saveCareSession(sessions, session, limit) {
  const cap = limit || CARE_SESSION_LIMIT;
  const next = [session].concat((sessions || []).filter((entry) => entry.id !== session.id));
  next.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return next.slice(0, cap);
}

function careSessionLevel(session) {
  const rank = { 'self-care': 0, routine: 1, urgent: 2, emergency: 3 };
  let level = 'self-care';
  for (const message of session.transcript || []) {
    if (!message.level) continue;
    if (rank[message.level] > rank[level]) level = message.level;
  }
  return level;
}

function careSessionHasCall(session) {
  return (session.calls || []).length > 0
    || (session.transcript || []).some((message) => message.channel !== 'text');
}

function careSessionDurationMs(session, now) {
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt || now || new Date().toISOString());
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return end - start;
}

function buildCarePlayback(session, now) {
  const start = Date.parse(session.startedAt);
  const clock = now || new Date().toISOString();
  const offset = (at) => {
    const value = Date.parse(at);
    return Number.isNaN(value) || Number.isNaN(start) ? 0 : Math.max(0, value - start);
  };
  const items = [];
  for (const message of session.transcript || []) {
    items.push({
      kind: 'message',
      id: message.id,
      at: message.at,
      offsetMs: offset(message.at),
      role: message.role,
      text: message.text,
      channel: message.channel,
      level: message.level || '',
    });
  }
  for (const call of session.calls || []) {
    const from = Date.parse(call.startedAt);
    const to = Date.parse(call.endedAt || clock);
    items.push({
      kind: 'call',
      id: call.id,
      at: call.startedAt,
      offsetMs: offset(call.startedAt),
      mode: call.mode,
      durationMs: Number.isNaN(from) || Number.isNaN(to) || to < from ? 0 : to - from,
      open: !call.endedAt,
    });
  }
  items.sort((left, right) => (
    left.offsetMs === right.offsetMs
      ? (left.kind === 'call' ? -1 : right.kind === 'call' ? 1 : 0)
      : left.offsetMs - right.offsetMs
  ));
  return items;
}

function buildCareSessionFromMedicalRecord(record) {
  const transcript = (record.transcript || []).map((entry) => {
    const message = {
      id: entry.id,
      role: entry.role,
      text: entry.text,
      at: entry.at,
      channel: 'text',
    };
    if (entry.level) message.level = entry.level;
    if (entry.attachmentIds && entry.attachmentIds.length > 0) message.attachmentIds = entry.attachmentIds.slice();
    return message;
  });
  const session = {
    id: record.sessionId || record.id,
    memberId: record.memberId,
    memberLabel: record.memberLabel,
    mode: record.mode,
    title: firstPatientText(transcript) || record.memberLabel,
    status: 'ended',
    startedAt: record.startedAt,
    updatedAt: record.endedAt,
    endedAt: record.endedAt,
    medicalRecordId: record.id,
    transcript: transcript,
    calls: [],
  };
  return session;
}

function mergeCareSessions(sessions, records) {
  const byId = new Map();
  for (const session of sessions || []) byId.set(session.id, session);
  for (const record of records || []) {
    const linked = Array.from(byId.values()).find((session) => (
      session.medicalRecordId === record.id || session.id === record.sessionId
    ));
    if (linked) {
      if (!linked.medicalRecordId && linked.id === record.sessionId) {
        byId.set(linked.id, Object.assign({}, linked, { medicalRecordId: record.id }));
      }
      continue;
    }
    const synthesized = buildCareSessionFromMedicalRecord(record);
    if (!byId.has(synthesized.id)) byId.set(synthesized.id, synthesized);
  }
  const merged = Array.from(byId.values());
  merged.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return merged;
}

function careSessionRecord(session, records) {
  if (session.medicalRecordId) {
    const linked = (records || []).find((record) => record.id === session.medicalRecordId);
    if (linked) return linked;
  }
  return (records || []).find((record) => record.sessionId === session.id) || null;
}

function parseCareSessions(raw) {
  if (!raw) return [];
  let decoded;
  try {
    decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    return [];
  }
  if (!Array.isArray(decoded)) return [];
  const sessions = [];
  for (const value of decoded) {
    if (!value || typeof value !== 'object') continue;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const memberId = typeof value.memberId === 'string' ? value.memberId.trim() : '';
    const memberLabel = typeof value.memberLabel === 'string' ? value.memberLabel.trim() : '';
    if (!id || !memberId || !memberLabel) continue;
    if (!isMode(value.mode) || !isStatus(value.status)) continue;
    const startedAt = typeof value.startedAt === 'string' ? value.startedAt : '';
    const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : startedAt;
    if (!startedAt || Number.isNaN(Date.parse(startedAt))) continue;
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) continue;
    const transcript = [];
    if (Array.isArray(value.transcript)) {
      for (const entry of value.transcript) {
        if (!entry || typeof entry !== 'object') continue;
        const messageId = typeof entry.id === 'string' ? entry.id : '';
        const at = typeof entry.at === 'string' ? entry.at : '';
        if (!messageId || !at || Number.isNaN(Date.parse(at))) continue;
        if (entry.role !== 'patient' && entry.role !== 'assistant') continue;
        if (!isChannel(entry.channel)) continue;
        const text = typeof entry.text === 'string' ? entry.text : '';
        const attachmentIds = Array.isArray(entry.attachmentIds)
          ? entry.attachmentIds.filter((item) => typeof item === 'string')
          : [];
        if (!text.trim() && attachmentIds.length === 0) continue;
        const message = { id: messageId, role: entry.role, text: text, at: at, channel: entry.channel };
        if (isTriageLevel(entry.level)) message.level = entry.level;
        if (attachmentIds.length > 0) message.attachmentIds = attachmentIds;
        transcript.push(message);
      }
    }
    const calls = [];
    if (Array.isArray(value.calls)) {
      for (const call of value.calls) {
        if (!call || typeof call !== 'object') continue;
        const callId = typeof call.id === 'string' ? call.id : '';
        const started = typeof call.startedAt === 'string' ? call.startedAt : '';
        if (!callId || !started || Number.isNaN(Date.parse(started))) continue;
        if (!isCallMode(call.mode)) continue;
        const parsed = { id: callId, mode: call.mode, startedAt: started };
        if (typeof call.endedAt === 'string' && !Number.isNaN(Date.parse(call.endedAt))) parsed.endedAt = call.endedAt;
        calls.push(parsed);
      }
    }
    const session = {
      id: id,
      memberId: memberId,
      memberLabel: memberLabel,
      mode: value.mode,
      title: typeof value.title === 'string' && value.title.trim() ? clampTitle(value.title) : memberLabel,
      status: value.status,
      startedAt: startedAt,
      updatedAt: updatedAt,
      transcript: transcript,
      calls: calls,
    };
    if (typeof value.endedAt === 'string' && !Number.isNaN(Date.parse(value.endedAt))) session.endedAt = value.endedAt;
    if (typeof value.medicalRecordId === 'string' && value.medicalRecordId) session.medicalRecordId = value.medicalRecordId;
    sessions.push(session);
  }
  sessions.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return sessions;
}

function serializeCareSessions(sessions) {
  return JSON.stringify(sessions || []);
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

/** Observable session store; a storage failure degrades to the session copy. */
function createCareSessionStore(storage) {
  const adapter = storage || defaultStorage();
  let sessions = null;
  const listeners = [];

  function load() {
    if (sessions) return sessions;
    let parsed = [];
    try {
      parsed = parseCareSessions(adapter.read(CARE_SESSIONS_STORAGE_KEY));
    } catch (error) {
      parsed = [];
    }
    sessions = parsed;
    return sessions;
  }

  function persist() {
    try {
      adapter.write(CARE_SESSIONS_STORAGE_KEY, serializeCareSessions(sessions || []));
    } catch (error) {
      // Keep the session copy.
    }
  }

  function notify() {
    listeners.slice().forEach((listener) => listener(load().slice()));
  }

  function commit(next) {
    sessions = saveCareSession(load(), next);
    persist();
    notify();
    return next;
  }

  function update(id, change) {
    const current = load().find((session) => session.id === id) || null;
    if (!current) return null;
    const next = change(current);
    if (next === current) return current;
    return commit(next);
  }

  return {
    list() {
      return load().slice();
    },
    find(id) {
      return load().find((session) => session.id === id) || null;
    },
    findActive(memberId) {
      return load().find((session) => session.status === 'active' && session.memberId === memberId) || null;
    },
    ensureActive(input) {
      const now = input.now || new Date().toISOString();
      // A named session is authoritative: a fresh conversation id must never
      // inherit the previous conversation's open session.
      if (input.sessionId) {
        const named = load().find((session) => session.id === input.sessionId);
        if (named && named.status === 'active') return named;
        if (!named) {
          return commit(createCareSession({
            member: input.member,
            mode: input.mode,
            startedAt: now,
            id: input.sessionId,
          }));
        }
      }
      const active = load().find((session) => session.status === 'active' && session.memberId === input.member.id);
      if (active) {
        const staleAfter = input.staleAfterMs || DEFAULT_STALE_AFTER_MS;
        if (Date.parse(now) - Date.parse(active.updatedAt) <= staleAfter) return active;
      }
      return commit(createCareSession({
        member: input.member,
        mode: input.mode,
        startedAt: now,
        id: input.sessionId || undefined,
      }));
    },
    appendMessage(id, input) {
      return update(id, (session) => appendCareSessionMessage(session, input));
    },
    startCall(id, mode) {
      return update(id, (session) => startCareSessionCall(session, mode));
    },
    endCall(id, callId, at) {
      return update(id, (session) => endCareSessionCall(session, callId, at));
    },
    end(id, input) {
      return update(id, (session) => endCareSession(session, input));
    },
    remove(id) {
      sessions = load().filter((session) => session.id !== id);
      persist();
      notify();
    },
    clear() {
      sessions = [];
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
  CARE_SESSION_LIMIT,
  CARE_SESSIONS_STORAGE_KEY,
  appendCareSessionMessage,
  buildCarePlayback,
  buildCareSessionFromMedicalRecord,
  careSessionDurationMs,
  careSessionHasCall,
  careSessionLevel,
  careSessionRecord,
  createCareSession,
  createCareSessionStore,
  endCareSession,
  endCareSessionCall,
  mergeCareSessions,
  newCareSessionId,
  parseCareSessions,
  saveCareSession,
  serializeCareSessions,
  startCareSessionCall,
};
