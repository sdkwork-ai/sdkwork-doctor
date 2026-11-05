/**
 * One 看病记录 is one conversation session.
 *
 * A session is the unit the patient sees in the records tab: it exists from the
 * first turn (or the first call) until the patient ends it, and ending it
 * produces exactly one `MedicalRecord`. The session keeps what the transcript
 * needs for the list and for the 通话回放 tab — the ordered turns, the channel
 * each turn used (text / voice / video), the triage level of the patient's own
 * turns, and the call segments — while the clinical artifact (agent summary, AI
 * diagnosis, doctor diagnosis, confirmation) lives in the medical record.
 *
 * Shape is pinned by `contracts/care-session.schema.json` and mirrored by the
 * Dart and mini program ports.
 */

import type { TriageLevel } from './index';
import type { DoctorEmploymentType } from './doctors';
import type { MedicalRecord, MedicalTranscriptEntry } from './medical-records';

export const CARE_SESSION_LIMIT = 200;

export const CARE_SESSIONS_STORAGE_KEY = 'sdkwork.doctor.care-sessions.v1';

/** Per-session read marks, kept apart so reading a session never reorders the list. */
export const CARE_SESSION_READS_STORAGE_KEY = 'sdkwork.doctor.care-session-reads.v1';

/**
 * `human` marks a consultation the family holds with one of its own human
 * doctors: the transcript is written by the family and by the doctor on this
 * device, never by the agent.
 */
export type CareSessionMode = 'hosted' | 'offline' | 'human';

export type CareSessionChannel = 'text' | 'voice' | 'video';

export type CareSessionStatus = 'active' | 'ended';

export type CareSessionCallMode = 'voice' | 'video';

/**
 * The doctor a session is addressed to. Absent means the AI family doctor; a
 * human consultation carries the roster doctor and the site it was opened at so
 * the session list can print who the family is talking to without a roster
 * lookup, and so an unread reply keeps its author after the roster changes.
 */
export interface CareSessionDoctor {
  readonly id: string;
  readonly displayName: string;
  readonly department?: string;
  readonly hospitalName?: string;
  readonly organizationId?: string;
  readonly employmentType?: DoctorEmploymentType;
  readonly avatarUrl?: string;
}

/** One transcript turn of the session. */
export interface CareSessionMessage {
  readonly id: string;
  readonly role: 'patient' | 'assistant';
  readonly text: string;
  readonly at: string;
  /** How the turn was produced: typed text, spoken voice, or a video call. */
  readonly channel: CareSessionChannel;
  /** Deterministic triage of the patient's own turn. */
  readonly level?: TriageLevel;
  readonly attachmentIds?: readonly string[];
}

/** One voice or video call segment inside the session. */
export interface CareSessionCall {
  readonly id: string;
  readonly mode: CareSessionCallMode;
  readonly startedAt: string;
  readonly endedAt?: string;
}

/** The unit listed in 看病记录 and opened by the 4-tab detail page. */
export interface CareSession {
  readonly id: string;
  readonly memberId: string;
  readonly memberLabel: string;
  readonly mode: CareSessionMode;
  /** Present on a human consultation; absent on an AI family-doctor session. */
  readonly doctor?: CareSessionDoctor;
  readonly title: string;
  readonly status: CareSessionStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly endedAt?: string;
  /** The 病历 this session produced when the patient ended it. */
  readonly medicalRecordId?: string;
  readonly transcript: readonly CareSessionMessage[];
  readonly calls: readonly CareSessionCall[];
}

export interface CreateCareSessionInput {
  readonly member: { readonly id: string; readonly displayName: string; readonly relation?: string };
  readonly mode: CareSessionMode;
  readonly startedAt?: string;
  readonly id?: string;
  readonly title?: string;
}

export interface CreateCareSessionMessageInput {
  readonly id?: string;
  readonly role: 'patient' | 'assistant';
  readonly text: string;
  readonly at?: string;
  readonly channel?: CareSessionChannel;
  readonly level?: TriageLevel;
  readonly attachmentIds?: readonly string[];
}

export interface EnsureActiveCareSessionInput {
  readonly member: { readonly id: string; readonly displayName: string; readonly relation?: string };
  readonly mode: Exclude<CareSessionMode, 'human'>;
  /** Transport session id once the hosted transport has established one. */
  readonly sessionId?: string;
  readonly now?: string;
  /** An active session untouched for longer than this starts a new one. */
  readonly staleAfterMs?: number;
}

export interface EndCareSessionInput {
  readonly medicalRecordId?: string;
  readonly endedAt?: string;
}

export interface CreateHumanConsultationInput {
  readonly member: { readonly id: string; readonly displayName: string; readonly relation?: string };
  readonly doctor: CareSessionDoctor;
  /** The patient's opening reason, appended as the first patient turn. */
  readonly reason?: string;
  readonly startedAt?: string;
  readonly id?: string;
  readonly title?: string;
}

export interface StartHumanConsultationInput extends CreateHumanConsultationInput {
  /** An open consultation with the same doctor older than this starts a new one. */
  readonly staleAfterMs?: number;
}

export interface ReplyAsDoctorInput {
  readonly text: string;
  readonly at?: string;
}

export interface CareSessionStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

export interface CareSessionStore {
  readonly list: () => readonly CareSession[];
  readonly find: (id: string) => CareSession | null;
  /** The open AI visit for this patient; human consultations are excluded. */
  readonly findActive: (memberId: string) => CareSession | null;
  /** The open human consultation this patient holds with one doctor. */
  readonly findActiveByDoctor: (memberId: string, doctorId: string) => CareSession | null;
  /** Reuses the patient's open session or starts one; never throws. */
  readonly ensureActive: (input: EnsureActiveCareSessionInput) => CareSession;
  /**
   * Opens the family's human consultation with one doctor: reuses the open one
   * when it is recent, otherwise starts a session whose first turn is the
   * patient's reason. The caller navigates to the conversation afterwards.
   */
  readonly startHumanConsultation: (input: StartHumanConsultationInput) => CareSession;
  /** Appends the doctor's own reply on this device; the family sees it unread. */
  readonly replyAsDoctor: (sessionId: string, input: ReplyAsDoctorInput) => CareSession | null;
  readonly appendMessage: (sessionId: string, input: CreateCareSessionMessageInput) => CareSession | null;
  readonly startCall: (sessionId: string, mode: CareSessionCallMode) => CareSession | null;
  readonly endCall: (sessionId: string, callId: string, at?: string) => CareSession | null;
  readonly end: (sessionId: string, input: EndCareSessionInput) => CareSession | null;
  readonly remove: (id: string) => void;
  readonly clear: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const DEFAULT_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const TITLE_LIMIT = 40;

let sessionCounter = 0;

/** Stable local id for a session the transport has not named. */
export function newCareSessionId(now = Date.now()): string {
  sessionCounter += 1;
  return 'session-' + now + '-' + sessionCounter;
}

function memberText(member: { displayName: string; relation?: string }): string {
  const relation = (member.relation ?? '').trim();
  return relation ? member.displayName + ' (' + relation + ')' : member.displayName;
}

function clampTitle(text: string): string {
  const value = text.trim().replace(/\s+/gu, ' ');
  if (value.length === 0) return '';
  return value.length > TITLE_LIMIT ? value.slice(0, TITLE_LIMIT - 1) + '…' : value;
}

function firstPatientText(transcript: readonly CareSessionMessage[]): string {
  for (const message of transcript) {
    if (message.role !== 'patient') continue;
    const title = clampTitle(message.text);
    if (title.length > 0) return title;
  }
  return '';
}

function isTriageLevel(value: unknown): value is TriageLevel {
  return value === 'emergency' || value === 'urgent' || value === 'routine' || value === 'self-care';
}

function isMode(value: unknown): value is CareSessionMode {
  return value === 'hosted' || value === 'offline' || value === 'human';
}

function isEmploymentType(value: unknown): value is DoctorEmploymentType {
  return value === 'full_time' || value === 'part_time' || value === 'contract' || value === 'visiting';
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Trims and freezes the doctor attribution a session keeps. */
export function createCareSessionDoctor(input: CareSessionDoctor): CareSessionDoctor {
  const id = optionalText(input.id);
  const displayName = optionalText(input.displayName);
  const department = optionalText(input.department);
  const hospitalName = optionalText(input.hospitalName);
  const organizationId = optionalText(input.organizationId);
  const avatarUrl = optionalText(input.avatarUrl);
  if (!id) throw new Error('a care session doctor needs an id');
  if (!displayName) throw new Error('a care session doctor needs a display name');
  return Object.freeze({
    id,
    displayName,
    ...(department ? { department } : {}),
    ...(hospitalName ? { hospitalName } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(isEmploymentType(input.employmentType) ? { employmentType: input.employmentType } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  });
}

function parseDoctor(value: unknown): CareSessionDoctor | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = optionalText(record.id);
  const displayName = optionalText(record.displayName);
  if (!id || !displayName) return undefined;
  const department = optionalText(record.department);
  const hospitalName = optionalText(record.hospitalName);
  const organizationId = optionalText(record.organizationId);
  const avatarUrl = optionalText(record.avatarUrl);
  return Object.freeze({
    id,
    displayName,
    ...(department ? { department } : {}),
    ...(hospitalName ? { hospitalName } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(isEmploymentType(record.employmentType) ? { employmentType: record.employmentType } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  });
}

function isChannel(value: unknown): value is CareSessionChannel {
  return value === 'text' || value === 'voice' || value === 'video';
}

function isCallMode(value: unknown): value is CareSessionCallMode {
  return value === 'voice' || value === 'video';
}

/** Builds one session; the title falls back to the member label. */
export function createCareSession(input: CreateCareSessionInput): CareSession {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const label = memberText(input.member);
  const title = clampTitle(input.title ?? '') || label;
  return Object.freeze({
    id: input.id ?? newCareSessionId(Date.parse(startedAt) || Date.now()),
    memberId: input.member.id,
    memberLabel: label,
    mode: input.mode,
    title,
    status: 'active' as const,
    startedAt,
    updatedAt: startedAt,
    transcript: Object.freeze([]),
    calls: Object.freeze([]),
  });
}

/** Appends one turn and keeps the session ordered and titled. */
export function appendCareSessionMessage(
  session: CareSession,
  input: CreateCareSessionMessageInput,
): CareSession {
  const text = (input.text ?? '').trim();
  const attachmentIds = input.attachmentIds ? Object.freeze([...input.attachmentIds]) : undefined;
  if (text.length === 0 && (!attachmentIds || attachmentIds.length === 0)) {
    throw new Error('a care session message needs text or an attachment');
  }
  const at = input.at ?? new Date().toISOString();
  const message: CareSessionMessage = Object.freeze({
    id: input.id ?? 'turn-' + Date.parse(at) + '-' + (session.transcript.length + 1),
    role: input.role,
    text,
    at,
    channel: input.channel ?? 'text',
    ...(input.level ? { level: input.level } : {}),
    ...(attachmentIds ? { attachmentIds } : {}),
  });
  const transcript = Object.freeze([...session.transcript, message]);
  const shouldTitle = input.role === 'patient' && !firstPatientText(session.transcript) && text.length > 0;
  return Object.freeze({
    ...session,
    title: shouldTitle ? clampTitle(text) : session.title,
    updatedAt: at,
    transcript,
  });
}

/**
 * Opens a human consultation: a `human` session addressed to one roster doctor,
 * with the patient's reason as its first turn. The family continues the
 * conversation on the chat surface; the doctor replies on this device.
 */
export function createHumanConsultationSession(input: CreateHumanConsultationInput): CareSession {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const reason = (input.reason ?? '').trim();
  const doctor = createCareSessionDoctor(input.doctor);
  const label = memberText(input.member);
  const session: CareSession = Object.freeze({
    id: input.id ?? newCareSessionId(Date.parse(startedAt) || Date.now()),
    memberId: input.member.id,
    memberLabel: label,
    mode: 'human' as const,
    doctor,
    title: clampTitle(input.title ?? '') || clampTitle(reason) || doctor.displayName || label,
    status: 'active' as const,
    startedAt,
    updatedAt: startedAt,
    transcript: Object.freeze([]),
    calls: Object.freeze([]),
  });
  if (!reason) return session;
  return appendCareSessionMessage(session, {
    role: 'patient',
    text: reason,
    at: startedAt,
    channel: 'text',
  });
}

/**
 * Appends the doctor's own reply to a human consultation. The reply is an
 * ordinary assistant turn; the session's `doctor` attribution is what labels it
 * as the human doctor rather than the agent. Throws on an AI session so a caller
 * cannot impersonate a clinician there.
 */
export function appendCareSessionDoctorReply(
  session: CareSession,
  text: string,
  at = new Date().toISOString(),
): CareSession {
  const reply = (text ?? '').trim();
  if (!reply) throw new Error('a doctor reply needs text');
  if (session.mode !== 'human') throw new Error('only a human consultation accepts a doctor reply');
  return appendCareSessionMessage(session, { role: 'assistant', text: reply, at, channel: 'text' });
}

/** The last turn of a session, or null when it has none. */
export function careSessionLastMessage(session: CareSession): CareSessionMessage | null {
  const last = session.transcript[session.transcript.length - 1];
  return last ?? null;
}

/**
 * How many doctor/agent turns the family has not read yet.
 *
 * A turn counts when it is an assistant turn newer than the session's read mark.
 * Before the first read mark every assistant turn is unread, which is what a
 * freshly opened conversation from another device should show.
 */
export function careSessionUnreadCount(
  session: CareSession,
  lastReadAt: string | null | undefined,
): number {
  const since = lastReadAt ? Date.parse(lastReadAt) : Number.NaN;
  let count = 0;
  for (const message of session.transcript) {
    if (message.role !== 'assistant') continue;
    const at = Date.parse(message.at);
    if (Number.isNaN(since) || at > since) count += 1;
  }
  return count;
}

/** True when the latest turn is the patient's: the conversation waits for the doctor. */
export function careSessionAwaitingDoctorReply(session: CareSession): boolean {
  if (session.mode !== 'human' || session.status !== 'active') return false;
  return careSessionLastMessage(session)?.role === 'patient';
}

/** Opens one voice/video segment; a second open segment of the same mode reuses it. */
export function startCareSessionCall(
  session: CareSession,
  mode: CareSessionCallMode,
  at = new Date().toISOString(),
): CareSession {
  if (session.calls.some((call) => call.mode === mode && !call.endedAt)) {
    return session;
  }
  const call: CareSessionCall = Object.freeze({
    id: 'call-' + Date.parse(at) + '-' + (session.calls.length + 1),
    mode,
    startedAt: at,
  });
  return Object.freeze({
    ...session,
    updatedAt: at,
    calls: Object.freeze([...session.calls, call]),
  });
}

/** Closes the open segment; unknown or already closed ids are a no-op. */
export function endCareSessionCall(
  session: CareSession,
  callId: string,
  at = new Date().toISOString(),
): CareSession {
  let changed = false;
  const calls = Object.freeze(session.calls.map((call) => {
    if (call.id !== callId || call.endedAt) return call;
    changed = true;
    return Object.freeze({ ...call, endedAt: at });
  }));
  if (!changed) return session;
  return Object.freeze({ ...session, updatedAt: at, calls });
}

/** Ends the session: it stops being active and links the 病历 it produced. */
export function endCareSession(session: CareSession, input: EndCareSessionInput = {}): CareSession {
  const endedAt = input.endedAt ?? new Date().toISOString();
  const calls = Object.freeze(session.calls.map((call) => (
    call.endedAt ? call : Object.freeze({ ...call, endedAt })
  )));
  return Object.freeze({
    ...session,
    status: 'ended' as const,
    updatedAt: endedAt,
    endedAt,
    calls,
    ...(input.medicalRecordId ? { medicalRecordId: input.medicalRecordId } : {}),
  });
}

/** Appends or replaces a session, newest first, capped at the retention limit. */
export function saveCareSession(
  sessions: readonly CareSession[],
  session: CareSession,
  limit = CARE_SESSION_LIMIT,
): readonly CareSession[] {
  const next = [session, ...sessions.filter((entry) => entry.id !== session.id)];
  next.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return Object.freeze(next.slice(0, limit));
}

/** Highest triage level recorded on the patient's own turns. */
export function careSessionLevel(session: CareSession): TriageLevel {
  const rank: Readonly<Record<TriageLevel, number>> = {
    'self-care': 0,
    routine: 1,
    urgent: 2,
    emergency: 3,
  };
  let level: TriageLevel = 'self-care';
  for (const message of session.transcript) {
    if (!message.level) continue;
    if (rank[message.level] > rank[level]) level = message.level;
  }
  return level;
}

/** True when the session used a voice or video channel at least once. */
export function careSessionHasCall(session: CareSession): boolean {
  return session.calls.length > 0 || session.transcript.some((message) => message.channel !== 'text');
}

/** Duration of the visit, or of the active part so far. */
export function careSessionDurationMs(session: CareSession, now = new Date().toISOString()): number {
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt ?? now);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return end - start;
}

export interface CarePlaybackMessageItem {
  readonly kind: 'message';
  readonly id: string;
  readonly at: string;
  readonly offsetMs: number;
  readonly role: 'patient' | 'assistant';
  readonly text: string;
  readonly channel: CareSessionChannel;
  readonly level?: TriageLevel;
}

export interface CarePlaybackCallItem {
  readonly kind: 'call';
  readonly id: string;
  readonly at: string;
  readonly offsetMs: number;
  readonly mode: CareSessionCallMode;
  readonly durationMs: number;
  readonly open: boolean;
}

export type CarePlaybackItem = CarePlaybackMessageItem | CarePlaybackCallItem;

/**
 * Ordered playback timeline of one session: every turn plus a marker for every
 * call segment, positioned from the session start. `offsetMs` is the replay
 * clock position, not a wall-clock timestamp.
 */
export function buildCarePlayback(
  session: CareSession,
  now = new Date().toISOString(),
): readonly CarePlaybackItem[] {
  const start = Date.parse(session.startedAt);
  const offset = (at: string): number => {
    const value = Date.parse(at);
    return Number.isNaN(value) || Number.isNaN(start) ? 0 : Math.max(0, value - start);
  };
  const items: CarePlaybackItem[] = [
    ...session.transcript.map((message) => ({
      kind: 'message' as const,
      id: message.id,
      at: message.at,
      offsetMs: offset(message.at),
      role: message.role,
      text: message.text,
      channel: message.channel,
      ...(message.level ? { level: message.level } : {}),
    })),
    ...session.calls.map((call) => {
      const from = Date.parse(call.startedAt);
      const to = Date.parse(call.endedAt ?? now);
      const duration = Number.isNaN(from) || Number.isNaN(to) || to < from ? 0 : to - from;
      return {
        kind: 'call' as const,
        id: call.id,
        at: call.startedAt,
        offsetMs: offset(call.startedAt),
        mode: call.mode,
        durationMs: duration,
        open: !call.endedAt,
      };
    }),
  ];
  return Object.freeze(items.sort((left, right) => (
    left.offsetMs === right.offsetMs
      ? (left.kind === 'call' ? -1 : right.kind === 'call' ? 1 : 0)
      : left.offsetMs - right.offsetMs
  )));
}

/** Synthesizes a session for a 病历 written before the session store existed. */
export function buildCareSessionFromMedicalRecord(record: MedicalRecord): CareSession {
  const transcript: CareSessionMessage[] = record.transcript.map((entry: MedicalTranscriptEntry) => Object.freeze({
    id: entry.id,
    role: entry.role,
    text: entry.text,
    at: entry.at,
    channel: 'text' as const,
    ...(entry.level ? { level: entry.level } : {}),
    ...(entry.attachmentIds && entry.attachmentIds.length > 0
      ? { attachmentIds: Object.freeze([...entry.attachmentIds]) }
      : {}),
  }));
  const title = firstPatientText(transcript) || record.memberLabel;
  return Object.freeze({
    id: record.sessionId || record.id,
    memberId: record.memberId,
    memberLabel: record.memberLabel,
    mode: record.mode,
    title,
    status: 'ended' as const,
    startedAt: record.startedAt,
    updatedAt: record.endedAt,
    endedAt: record.endedAt,
    medicalRecordId: record.id,
    transcript: Object.freeze(transcript),
    calls: Object.freeze([]),
  });
}

/**
 * The records tab list: stored sessions plus a synthesized session for every
 * 病历 that predates the session store or arrived through another path.
 */
export function mergeCareSessions(
  sessions: readonly CareSession[],
  records: readonly MedicalRecord[],
): readonly CareSession[] {
  const byId = new Map<string, CareSession>();
  for (const session of sessions) byId.set(session.id, session);
  for (const record of records) {
    const linked = [...byId.values()].find((session) => (
      session.medicalRecordId === record.id || session.id === record.sessionId
    ));
    if (linked) {
      if (!linked.medicalRecordId && linked.id === record.sessionId) {
        byId.set(linked.id, Object.freeze({ ...linked, medicalRecordId: record.id }));
      }
      continue;
    }
    const synthesized = buildCareSessionFromMedicalRecord(record);
    if (!byId.has(synthesized.id)) byId.set(synthesized.id, synthesized);
  }
  const merged = [...byId.values()];
  merged.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return Object.freeze(merged);
}

/** Finds the 病历 a session produced, matching on the link or the session id. */
export function careSessionRecord(
  session: CareSession,
  records: readonly MedicalRecord[],
): MedicalRecord | null {
  if (session.medicalRecordId) {
    const linked = records.find((record) => record.id === session.medicalRecordId);
    if (linked) return linked;
  }
  return records.find((record) => record.sessionId === session.id) ?? null;
}

/** Parses one stored session; `null` means the entry is unusable. */
function parseCareSession(value: unknown): CareSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const memberId = typeof record.memberId === 'string' ? record.memberId.trim() : '';
  const memberLabel = typeof record.memberLabel === 'string' ? record.memberLabel.trim() : '';
  if (!memberId || !memberLabel) return null;
  const mode = record.mode;
  if (!isMode(mode)) return null;
  const status = record.status;
  if (status !== 'active' && status !== 'ended') return null;
  const startedAt = typeof record.startedAt === 'string' ? record.startedAt : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : startedAt;
  if (!startedAt || Number.isNaN(Date.parse(startedAt))) return null;
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  const transcript: CareSessionMessage[] = [];
  if (Array.isArray(record.transcript)) {
    for (const entry of record.transcript) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const messageId = typeof item.id === 'string' ? item.id : '';
      const text = typeof item.text === 'string' ? item.text : '';
      const at = typeof item.at === 'string' ? item.at : '';
      if (!messageId || !at || Number.isNaN(Date.parse(at))) continue;
      if (item.role !== 'patient' && item.role !== 'assistant') continue;
      if (text.trim().length === 0) {
        const ids = Array.isArray(item.attachmentIds) ? item.attachmentIds : [];
        if (ids.length === 0) continue;
      }
      if (!isChannel(item.channel)) continue;
      transcript.push(Object.freeze({
        id: messageId,
        role: item.role,
        text,
        at,
        channel: item.channel,
        ...(isTriageLevel(item.level) ? { level: item.level } : {}),
        ...(Array.isArray(item.attachmentIds)
          ? { attachmentIds: Object.freeze(item.attachmentIds.filter((entryId): entryId is string => typeof entryId === 'string')) }
          : {}),
      }));
    }
  }
  const calls: CareSessionCall[] = [];
  if (Array.isArray(record.calls)) {
    for (const entry of record.calls) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const callId = typeof item.id === 'string' ? item.id : '';
      const callStartedAt = typeof item.startedAt === 'string' ? item.startedAt : '';
      if (!callId || !callStartedAt || Number.isNaN(Date.parse(callStartedAt))) continue;
      if (!isCallMode(item.mode)) continue;
      calls.push(Object.freeze({
        id: callId,
        mode: item.mode,
        startedAt: callStartedAt,
        ...(typeof item.endedAt === 'string' && !Number.isNaN(Date.parse(item.endedAt))
          ? { endedAt: item.endedAt }
          : {}),
      }));
    }
  }
  const title = typeof record.title === 'string' && record.title.trim().length > 0
    ? clampTitle(record.title)
    : memberLabel;
  const doctor = mode === 'human' ? parseDoctor(record.doctor) : undefined;
  return Object.freeze({
    id,
    memberId,
    memberLabel,
    mode,
    ...(doctor ? { doctor } : {}),
    title,
    status,
    startedAt,
    updatedAt,
    ...(typeof record.endedAt === 'string' && !Number.isNaN(Date.parse(record.endedAt))
      ? { endedAt: record.endedAt }
      : {}),
    ...(typeof record.medicalRecordId === 'string' && record.medicalRecordId.length > 0
      ? { medicalRecordId: record.medicalRecordId }
      : {}),
    transcript: Object.freeze(transcript),
    calls: Object.freeze(calls),
  });
}

export function parseCareSessions(raw: string | null | undefined): CareSession[] {
  if (!raw) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(decoded)) return [];
  const sessions: CareSession[] = [];
  for (const entry of decoded) {
    const parsed = parseCareSession(entry);
    if (parsed) sessions.push(parsed);
  }
  sessions.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return sessions;
}

export function serializeCareSessions(sessions: readonly CareSession[]): string {
  return JSON.stringify(sessions);
}

/** Synchronous session store; a storage failure degrades to the session list. */
export function createCareSessionStore(adapter: CareSessionStorageAdapter | null): CareSessionStore {
  let sessions: readonly CareSession[] | null = null;
  const listeners = new Set<() => void>();

  function load(): readonly CareSession[] {
    if (sessions) return sessions;
    let parsed: CareSession[] = [];
    if (adapter) {
      try {
        parsed = parseCareSessions(adapter.read());
      } catch {
        parsed = [];
      }
    }
    sessions = Object.freeze(parsed);
    return sessions;
  }

  function persist(): void {
    if (!adapter || !sessions) return;
    try {
      adapter.write(serializeCareSessions(sessions));
    } catch {
      // Quota or private mode: keep the session copy.
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function commit(next: CareSession): CareSession {
    sessions = saveCareSession(load(), next);
    persist();
    notify();
    return next;
  }

  function update(id: string, change: (session: CareSession) => CareSession): CareSession | null {
    const current = load().find((session) => session.id === id) ?? null;
    if (!current) return null;
    const next = change(current);
    if (next === current) return current;
    return commit(next);
  }

  return Object.freeze({
    list: () => load(),
    find: (id: string) => load().find((session) => session.id === id) ?? null,
    findActive: (memberId: string) => load().find((session) => (
      session.status === 'active' && session.memberId === memberId && session.mode !== 'human'
    )) ?? null,
    findActiveByDoctor: (memberId: string, doctorId: string) => load().find((session) => (
      session.status === 'active'
      && session.mode === 'human'
      && session.memberId === memberId
      && session.doctor?.id === doctorId
    )) ?? null,
    ensureActive: (input: EnsureActiveCareSessionInput) => {
      const now = input.now ?? new Date().toISOString();
      // A named session is authoritative: a fresh conversation id must never
      // inherit the previous conversation's open session.
      if (input.sessionId) {
        const named = load().find((session) => session.id === input.sessionId);
        if (named && named.status === 'active' && named.mode !== 'human') return named;
        if (!named) {
          return commit(createCareSession({
            member: input.member,
            mode: input.mode,
            startedAt: now,
            id: input.sessionId,
          }));
        }
      }
      const active = load().find((session) => (
        session.status === 'active' && session.memberId === input.member.id && session.mode !== 'human'
      ));
      if (active) {
        const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
        if (Date.parse(now) - Date.parse(active.updatedAt) <= staleAfter) return active;
      }
      const created = createCareSession({
        member: input.member,
        mode: input.mode,
        startedAt: now,
      });
      return commit(created);
    },
    startHumanConsultation: (input: StartHumanConsultationInput) => {
      const now = input.startedAt ?? new Date().toISOString();
      const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
      const existing = load().find((session) => (
        session.status === 'active'
        && session.mode === 'human'
        && session.memberId === input.member.id
        && session.doctor?.id === input.doctor.id
      ));
      if (existing && Date.parse(now) - Date.parse(existing.updatedAt) <= staleAfter) {
        const reason = (input.reason ?? '').trim();
        if (!reason) return existing;
        return update(existing.id, (session) => appendCareSessionMessage(session, {
          role: 'patient',
          text: reason,
          at: now,
          channel: 'text',
        })) ?? existing;
      }
      return commit(createHumanConsultationSession({ ...input, startedAt: now }));
    },
    replyAsDoctor: (sessionId: string, input: ReplyAsDoctorInput) => update(
      sessionId,
      (session) => appendCareSessionDoctorReply(session, input.text, input.at),
    ),
    appendMessage: (sessionId: string, input: CreateCareSessionMessageInput) => update(
      sessionId,
      (session) => appendCareSessionMessage(session, input),
    ),
    startCall: (sessionId: string, mode: CareSessionCallMode) => update(
      sessionId,
      (session) => startCareSessionCall(session, mode),
    ),
    endCall: (sessionId: string, callId: string, at?: string) => update(
      sessionId,
      (session) => endCareSessionCall(session, callId, at),
    ),
    end: (sessionId: string, input: EndCareSessionInput) => update(
      sessionId,
      (session) => endCareSession(session, input),
    ),
    remove: (id: string) => {
      sessions = Object.freeze(load().filter((session) => session.id !== id));
      persist();
      notify();
    },
    clear: () => {
      sessions = Object.freeze([]);
      persist();
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}

/** In-memory store for tests and hosts without storage. */
export function createMemoryCareSessionStore(initial: readonly CareSession[] = []): CareSessionStore {
  return createCareSessionStore({ read: () => serializeCareSessions(initial), write: () => undefined });
}

export interface CareSessionReadStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

/**
 * Read marks of the conversation list, one ISO timestamp per session id.
 *
 * Kept outside `CareSession` on purpose: reading a conversation must not bump
 * `updatedAt` and reorder the list, and a read mark is a per-device fact rather
 * than part of the clinical session shape.
 */
export interface CareSessionReadStore {
  readonly lastReadAt: (sessionId: string) => string | null;
  /** The whole read-mark map, stable between writes (safe as a React snapshot). */
  readonly snapshot: () => Readonly<Record<string, string>>;
  /** Records that the family has seen everything up to `at`; never throws. */
  readonly markRead: (sessionId: string, at?: string) => void;
  /** Forgets one session's mark, used when the session is deleted. */
  readonly forget: (sessionId: string) => void;
  readonly clear: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function parseCareSessionReads(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return {};
  const reads: Record<string, string> = {};
  for (const [id, value] of Object.entries(decoded as Record<string, unknown>)) {
    const key = id.trim();
    if (!key) continue;
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) continue;
    reads[key] = value;
  }
  return reads;
}

export function serializeCareSessionReads(reads: Readonly<Record<string, string>>): string {
  return JSON.stringify(reads);
}

export function createCareSessionReadStore(
  adapter: CareSessionReadStorageAdapter | null,
): CareSessionReadStore {
  let reads: Record<string, string> | null = null;
  const listeners = new Set<() => void>();

  function load(): Record<string, string> {
    if (reads) return reads;
    let parsed: Record<string, string> = {};
    if (adapter) {
      try {
        parsed = parseCareSessionReads(adapter.read());
      } catch {
        parsed = {};
      }
    }
    reads = parsed;
    return reads;
  }

  function persist(): void {
    if (!adapter || !reads) return;
    try {
      adapter.write(serializeCareSessionReads(reads));
    } catch {
      // Quota or private mode: keep the in-memory marks.
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return Object.freeze({
    lastReadAt: (sessionId: string) => load()[sessionId] ?? null,
    snapshot: () => load(),
    markRead: (sessionId: string, at?: string) => {
      const id = sessionId.trim();
      if (!id) return;
      const current = load();
      const value = at ?? new Date().toISOString();
      if (Number.isNaN(Date.parse(value))) return;
      if (current[id] === value) return;
      reads = { ...current, [id]: value };
      persist();
      notify();
    },
    forget: (sessionId: string) => {
      const current = load();
      if (!(sessionId in current)) return;
      const next = { ...current };
      delete next[sessionId];
      reads = next;
      persist();
      notify();
    },
    clear: () => {
      reads = {};
      persist();
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}

/** In-memory read store for tests and hosts without storage. */
export function createMemoryCareSessionReadStore(
  initial: Readonly<Record<string, string>> = {},
): CareSessionReadStore {
  return createCareSessionReadStore({
    read: () => serializeCareSessionReads(initial),
    write: () => undefined,
  });
}
