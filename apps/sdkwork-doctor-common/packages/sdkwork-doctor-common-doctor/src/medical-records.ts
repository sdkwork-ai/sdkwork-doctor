/**
 * 病历 (medical record): the artifact the patient produces by ending a
 * conversation, and the place where a human doctor diagnoses.
 *
 * A record owns three independent things, and none of them overwrites another:
 *
 * 1. the transcript and the attachments of the ended conversation,
 * 2. the AI agent's summary and its tentative AI diagnosis,
 * 3. the attending doctor's diagnosis, plus the doctor's confirmation of the AI
 *    diagnosis (accepted as-is, or amended with the doctor's own conclusion).
 *
 * An AI diagnosis is never final: `status` stays `awaiting_doctor` until a
 * doctor confirms it. Shape is pinned by `contracts/medical-record.schema.json`
 * and asserted by the TypeScript, Dart, and mini program suites.
 */
import type { FamilyMember, TriageLevel } from './index';

/** Where the record came from: the hosted agent or the offline triage adapter. */
export type MedicalRecordMode = 'hosted' | 'offline';

/** `awaiting_doctor` until a doctor confirms the AI diagnosis; then `confirmed`. */
export type MedicalRecordStatus = 'awaiting_doctor' | 'confirmed';

/** Who wrote one diagnosis. The two sources are stored side by side. */
export type MedicalDiagnosisSource = 'ai' | 'doctor';

/** How the doctor closed the AI diagnosis: accepted verbatim, or amended. */
export type MedicalDiagnosisDecision = 'confirmed' | 'amended';

/** `patient` is the family member talking; `assistant` is the family doctor. */
export type MedicalTranscriptRole = 'patient' | 'assistant';

export type MedicalAttachmentKind = 'image' | 'video' | 'file';

/**
 * One uploaded attachment.
 *
 * The binary lives in the platform attachment store (IndexedDB in the browser,
 * the saved file on the native clients) under `id`; the record persists only
 * this metadata so the case list stays small. `dataUrl` and `path` are fallbacks
 * for hosts whose store could not be used.
 */
export interface MedicalAttachment {
  readonly id: string;
  readonly kind: MedicalAttachmentKind;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly addedAt: string;
  readonly path?: string;
  readonly dataUrl?: string;
}

/** One rendered line of the ended conversation. */
export interface MedicalTranscriptEntry {
  readonly id: string;
  readonly role: MedicalTranscriptRole;
  /** May be empty for an attachment-only turn. */
  readonly text: string;
  readonly at: string;
  readonly level?: TriageLevel;
  readonly attachmentIds?: readonly string[];
}

/** A diagnosis with its author, its content, and its time. */
export interface MedicalDiagnosis {
  readonly id: string;
  readonly source: MedicalDiagnosisSource;
  /** Present on a doctor diagnosis; absent on the AI diagnosis. */
  readonly doctorId?: string;
  readonly doctorLabel?: string;
  /** The one-sentence conclusion (诊断结论). */
  readonly impression: string;
  /** Directions considered (考虑方向), never asserted as fact. */
  readonly conditions: readonly string[];
  /** Next steps (诊疗建议). */
  readonly recommendations: readonly string[];
  /** Urgency carried into the diagnosis. */
  readonly level: TriageLevel;
  readonly notes?: string;
  readonly createdAt: string;
  /** For a doctor diagnosis that amended an AI one, the AI diagnosis id. */
  readonly basisDiagnosisId?: string;
}

/** The doctor's explicit decision on the AI diagnosis. */
export interface MedicalDiagnosisConfirmation {
  readonly diagnosisId: string;
  readonly decision: MedicalDiagnosisDecision;
  readonly doctorId?: string;
  readonly doctorLabel: string;
  readonly confirmedAt: string;
  /** Set when the doctor kept their own diagnosis alongside the AI one. */
  readonly doctorDiagnosisId?: string;
}

/** One ended conversation turned into a case record. */
export interface MedicalRecord {
  readonly id: string;
  /** Conversation session the record was generated from. */
  readonly sessionId: string;
  readonly memberId: string;
  readonly memberLabel: string;
  readonly mode: MedicalRecordMode;
  readonly startedAt: string;
  readonly endedAt: string;
  /** The agent's prose summary of the conversation. */
  readonly summary: string;
  readonly transcript: readonly MedicalTranscriptEntry[];
  readonly attachments: readonly MedicalAttachment[];
  /** The AI agent's tentative diagnosis; always present, never final. */
  readonly aiDiagnosis: MedicalDiagnosis;
  /** The attending doctor's diagnosis; independent of the AI one. */
  readonly doctorDiagnosis?: MedicalDiagnosis;
  /** The doctor's confirmation of the AI diagnosis. */
  readonly confirmation?: MedicalDiagnosisConfirmation;
  readonly status: MedicalRecordStatus;
}

/** Storage key shared by every browser surface and the native clients. */
export const MEDICAL_RECORDS_STORAGE_KEY = 'sdkwork.doctor.medical-records.v1';

/** Newest-first retention cap for device-local case records. */
export const MEDICAL_RECORD_LIMIT = 100;

const MODES: readonly MedicalRecordMode[] = Object.freeze(['hosted', 'offline']);
const STATUSES: readonly MedicalRecordStatus[] = Object.freeze(['awaiting_doctor', 'confirmed']);
const SOURCES: readonly MedicalDiagnosisSource[] = Object.freeze(['ai', 'doctor']);
const DECISIONS: readonly MedicalDiagnosisDecision[] = Object.freeze(['confirmed', 'amended']);
const ROLES: readonly MedicalTranscriptRole[] = Object.freeze(['patient', 'assistant']);
const KINDS: readonly MedicalAttachmentKind[] = Object.freeze(['image', 'video', 'file']);
const LEVELS: readonly TriageLevel[] = Object.freeze(['emergency', 'urgent', 'routine', 'self-care']);

export function isMedicalRecordMode(value: unknown): value is MedicalRecordMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export function isMedicalRecordStatus(value: unknown): value is MedicalRecordStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function isMedicalDiagnosisSource(value: unknown): value is MedicalDiagnosisSource {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export function isMedicalAttachmentKind(value: unknown): value is MedicalAttachmentKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function isMedicalTranscriptRole(value: unknown): value is MedicalTranscriptRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function isTriageLevel(value: unknown): value is TriageLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/** Best-effort id that works in browsers without `crypto.randomUUID`. */
export function newMedicalRecordId(): string {
  const candidate = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (candidate && typeof candidate.randomUUID === 'function') {
    return candidate.randomUUID();
  }
  return 'case-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Maps a MIME type onto the three attachment kinds the product renders. */
export function medicalAttachmentKind(mimeType: string): MedicalAttachmentKind {
  const normalized = String(mimeType).trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  return 'file';
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Builds one attachment row; the binary is written by the attachment store. */
export interface CreateMedicalAttachmentInput {
  readonly id?: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly kind?: MedicalAttachmentKind;
  readonly addedAt?: string;
  readonly path?: string;
  readonly dataUrl?: string;
}

export function createMedicalAttachment(input: CreateMedicalAttachmentInput): MedicalAttachment {
  const name = trimText(input.name);
  if (!name) throw new Error('an attachment needs a file name');
  const mimeType = trimText(input.mimeType) || 'application/octet-stream';
  const sizeBytes = typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes)
    ? Math.max(0, Math.floor(input.sizeBytes))
    : 0;
  const kind = input.kind && isMedicalAttachmentKind(input.kind)
    ? input.kind
    : medicalAttachmentKind(mimeType);
  const id = trimText(input.id) || 'attachment-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const path = trimText(input.path);
  const dataUrl = trimText(input.dataUrl);
  return Object.freeze({
    id,
    kind,
    name,
    mimeType,
    sizeBytes,
    addedAt: trimText(input.addedAt) || new Date().toISOString(),
    ...(path ? { path } : {}),
    ...(dataUrl ? { dataUrl } : {}),
  });
}

/** Builds one transcript line. Text may be empty when attachments carry it. */
export interface CreateMedicalTranscriptEntryInput {
  readonly id?: string;
  readonly role: MedicalTranscriptRole;
  readonly text: string;
  readonly at?: string;
  readonly level?: TriageLevel;
  readonly attachmentIds?: readonly string[];
}

export function createMedicalTranscriptEntry(input: CreateMedicalTranscriptEntryInput): MedicalTranscriptEntry {
  const role = input.role;
  if (!isMedicalTranscriptRole(role)) throw new Error('a transcript entry needs a known role');
  const attachmentIds = uniqueText(input.attachmentIds ?? []);
  const textValue = typeof input.text === 'string' ? input.text.trim() : '';
  if (!textValue && attachmentIds.length === 0) {
    throw new Error('a transcript entry needs text or an attachment');
  }
  const level = input.level && isTriageLevel(input.level) ? input.level : undefined;
  return Object.freeze({
    id: trimText(input.id) || 'entry-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    role,
    text: textValue,
    at: trimText(input.at) || new Date().toISOString(),
    ...(level ? { level } : {}),
    ...(attachmentIds.length > 0 ? { attachmentIds: Object.freeze(attachmentIds) } : {}),
  });
}

/** Content of one diagnosis; the id, source, and author are supplied by the caller. */
export interface CreateMedicalDiagnosisInput {
  readonly impression: string;
  readonly conditions?: readonly string[];
  readonly recommendations?: readonly string[];
  readonly level: TriageLevel;
  readonly notes?: string;
}

function buildDiagnosis(
  source: MedicalDiagnosisSource,
  input: CreateMedicalDiagnosisInput,
  author: { readonly doctorId?: string; readonly doctorLabel?: string; readonly basisDiagnosisId?: string; readonly createdAt: string; readonly id?: string },
): MedicalDiagnosis {
  const impression = trimText(input.impression);
  if (!impression) throw new Error('a diagnosis needs an impression');
  if (!isTriageLevel(input.level)) throw new Error('a diagnosis needs a known triage level');
  const doctorId = trimText(author.doctorId);
  const doctorLabel = trimText(author.doctorLabel);
  if (source === 'doctor' && !doctorLabel) {
    throw new Error('a doctor diagnosis needs the attending doctor label');
  }
  const notes = trimText(input.notes);
  const basisDiagnosisId = trimText(author.basisDiagnosisId);
  return Object.freeze({
    id: trimText(author.id) || 'diagnosis-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    source,
    ...(doctorId ? { doctorId } : {}),
    ...(doctorLabel ? { doctorLabel } : {}),
    ...(basisDiagnosisId ? { basisDiagnosisId } : {}),
    impression,
    conditions: Object.freeze(uniqueText(input.conditions ?? [])),
    recommendations: Object.freeze(uniqueText(input.recommendations ?? [])),
    level: input.level,
    ...(notes ? { notes } : {}),
    createdAt: author.createdAt,
  });
}

export interface CreateMedicalRecordInput {
  readonly member: FamilyMember;
  readonly mode: MedicalRecordMode;
  readonly sessionId?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly summary: string;
  readonly transcript: readonly MedicalTranscriptEntry[];
  readonly attachments?: readonly MedicalAttachment[];
  readonly diagnosis: CreateMedicalDiagnosisInput;
  readonly id?: string;
}

/**
 * Builds the record the patient asked for by ending the conversation. The AI
 * diagnosis starts unconfirmed, so a doctor still has to act on it.
 */
export function createMedicalRecord(input: CreateMedicalRecordInput): MedicalRecord {
  if (!isMedicalRecordMode(input.mode)) throw new Error('a medical record needs a known mode');
  const startedAt = trimText(input.startedAt);
  const endedAt = trimText(input.endedAt);
  if (!startedAt || !endedAt) throw new Error('a medical record needs the conversation start and end');
  const summary = trimText(input.summary);
  if (!summary) throw new Error('a medical record needs an agent summary');
  const transcript = Object.freeze([...input.transcript]);
  if (transcript.length === 0) throw new Error('a medical record needs at least one transcript entry');
  const attachments = Object.freeze([...input.attachments ?? []]);
  const id = trimText(input.id) || newMedicalRecordId();
  const aiDiagnosis = buildDiagnosis('ai', input.diagnosis, {
    createdAt: endedAt,
    id: 'ai-' + id,
  });
  return Object.freeze({
    id,
    sessionId: trimText(input.sessionId) || 'session-' + id,
    memberId: input.member.id,
    memberLabel: input.member.displayName + ' (' + input.member.relation + ')',
    mode: input.mode,
    startedAt,
    endedAt,
    summary,
    transcript,
    attachments,
    aiDiagnosis,
    status: 'awaiting_doctor',
  });
}

export interface DoctorDiagnosisInput extends CreateMedicalDiagnosisInput {
  readonly doctorId?: string;
  readonly doctorLabel: string;
  readonly createdAt?: string;
}

export interface ConfirmAiDiagnosisInput {
  readonly doctorId?: string;
  /** Free-text attending doctor name; no clinician account is required on-device. */
  readonly doctorLabel: string;
  readonly decision: MedicalDiagnosisDecision;
  readonly confirmedAt?: string;
  /** The doctor's own conclusion; required when `decision` is `amended`. */
  readonly doctorDiagnosis?: DoctorDiagnosisInput;
}

function doctorDiagnosisFor(
  record: MedicalRecord,
  input: DoctorDiagnosisInput,
  at: string,
): MedicalDiagnosis {
  const existing = record.doctorDiagnosis;
  return buildDiagnosis('doctor', input, {
    doctorId: input.doctorId ?? existing?.doctorId,
    doctorLabel: input.doctorLabel,
    basisDiagnosisId: record.aiDiagnosis.id,
    createdAt: at,
    id: existing?.id,
  });
}

/** Doctor diagnosis independently added while the AI one is still unreviewed. */
export function addDoctorDiagnosis(record: MedicalRecord, input: DoctorDiagnosisInput): MedicalRecord {
  const doctorLabel = trimText(input.doctorLabel);
  if (!doctorLabel) throw new Error('a doctor diagnosis needs the attending doctor label');
  const at = trimText(input.createdAt) || new Date().toISOString();
  const doctorDiagnosis = doctorDiagnosisFor(record, { ...input, doctorLabel }, at);
  const confirmation = record.confirmation
    ? Object.freeze({ ...record.confirmation, doctorDiagnosisId: doctorDiagnosis.id })
    : undefined;
  const next: MedicalRecord = {
    ...record,
    doctorDiagnosis,
    ...(confirmation ? { confirmation } : {}),
    status: confirmation ? 'confirmed' : 'awaiting_doctor',
  };
  return Object.freeze(next);
}

/** Status is derived from the doctor confirmation, never guessed. */
export function medicalRecordStatus(record: MedicalRecord): MedicalRecordStatus {
  return record.confirmation ? 'confirmed' : 'awaiting_doctor';
}

export function medicalRecordNeedsDoctorReview(record: MedicalRecord): boolean {
  return !record.confirmation;
}

/**
 * Records the doctor's explicit decision on the AI diagnosis. A `confirmed`
 * decision accepts the AI diagnosis unchanged; an `amended` decision requires
 * the doctor's own diagnosis, which is stored next to the AI one.
 */
export function confirmAiDiagnosis(record: MedicalRecord, input: ConfirmAiDiagnosisInput): MedicalRecord {
  const doctorLabel = trimText(input.doctorLabel);
  if (!doctorLabel) throw new Error('confirming an AI diagnosis needs the attending doctor label');
  if (!DECISIONS.includes(input.decision)) throw new Error('confirming an AI diagnosis needs a known decision');
  const at = trimText(input.confirmedAt) || new Date().toISOString();
  let doctorDiagnosis = record.doctorDiagnosis;
  if (input.doctorDiagnosis) {
    doctorDiagnosis = doctorDiagnosisFor(record, { ...input.doctorDiagnosis, doctorLabel }, at);
  } else if (input.decision === 'amended') {
    throw new Error('amending an AI diagnosis needs the doctor diagnosis');
  }
  const confirmation: MedicalDiagnosisConfirmation = Object.freeze({
    diagnosisId: record.aiDiagnosis.id,
    decision: input.decision,
    ...(trimText(input.doctorId) ? { doctorId: trimText(input.doctorId) } : {}),
    doctorLabel,
    confirmedAt: at,
    ...(doctorDiagnosis ? { doctorDiagnosisId: doctorDiagnosis.id } : {}),
  });
  const next: MedicalRecord = {
    ...record,
    ...(doctorDiagnosis ? { doctorDiagnosis } : {}),
    confirmation,
    status: 'confirmed',
  };
  return Object.freeze(next);
}

/** Newest first, de-duplicated by id, capped at [limit]. */
export function appendMedicalRecord(
  records: readonly MedicalRecord[],
  record: MedicalRecord,
  limit: number = MEDICAL_RECORD_LIMIT,
): MedicalRecord[] {
  const next = [record, ...records.filter((entry) => entry.id !== record.id)];
  return next.slice(0, Math.max(0, limit));
}

/** Replaces the record with the same id in place, or prepends a new one. */
export function saveMedicalRecord(
  records: readonly MedicalRecord[],
  record: MedicalRecord,
  limit: number = MEDICAL_RECORD_LIMIT,
): MedicalRecord[] {
  const index = records.findIndex((entry) => entry.id === record.id);
  if (index < 0) return appendMedicalRecord(records, record, limit);
  const next = [...records];
  next[index] = record;
  return next.slice(0, Math.max(0, limit));
}

function parseAttachment(value: unknown): MedicalAttachment | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = trimText(candidate.id);
  const name = trimText(candidate.name);
  if (!id || !name) return null;
  if (!isMedicalAttachmentKind(candidate.kind)) return null;
  const sizeBytes = typeof candidate.sizeBytes === 'number' && Number.isFinite(candidate.sizeBytes)
    ? Math.max(0, Math.floor(candidate.sizeBytes))
    : 0;
  const path = trimText(candidate.path);
  const dataUrl = trimText(candidate.dataUrl);
  return Object.freeze({
    id,
    kind: candidate.kind,
    name,
    mimeType: trimText(candidate.mimeType) || 'application/octet-stream',
    sizeBytes,
    addedAt: trimText(candidate.addedAt) || new Date(0).toISOString(),
    ...(path ? { path } : {}),
    ...(dataUrl ? { dataUrl } : {}),
  });
}

function parseTranscriptEntry(value: unknown): MedicalTranscriptEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = trimText(candidate.id);
  const at = trimText(candidate.at);
  if (!id || !at || !isMedicalTranscriptRole(candidate.role)) return null;
  const attachmentIds = Array.isArray(candidate.attachmentIds)
    ? uniqueText(candidate.attachmentIds.filter((entry): entry is string => typeof entry === 'string'))
    : [];
  const textValue = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  if (!textValue && attachmentIds.length === 0) return null;
  const level = candidate.level && isTriageLevel(candidate.level) ? candidate.level : undefined;
  return Object.freeze({
    id,
    role: candidate.role,
    text: textValue,
    at,
    ...(level ? { level } : {}),
    ...(attachmentIds.length > 0 ? { attachmentIds: Object.freeze(attachmentIds) } : {}),
  });
}

function parseDiagnosis(value: unknown, source: MedicalDiagnosisSource): MedicalDiagnosis | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = trimText(candidate.id);
  const impression = trimText(candidate.impression);
  const createdAt = trimText(candidate.createdAt);
  if (!id || !impression || !createdAt) return null;
  if (!isTriageLevel(candidate.level)) return null;
  if (candidate.source !== source) return null;
  const doctorId = trimText(candidate.doctorId);
  const doctorLabel = trimText(candidate.doctorLabel);
  if (source === 'doctor' && !doctorLabel) return null;
  const notes = trimText(candidate.notes);
  const basisDiagnosisId = trimText(candidate.basisDiagnosisId);
  const conditions = Array.isArray(candidate.conditions)
    ? uniqueText(candidate.conditions.filter((entry): entry is string => typeof entry === 'string'))
    : [];
  const recommendations = Array.isArray(candidate.recommendations)
    ? uniqueText(candidate.recommendations.filter((entry): entry is string => typeof entry === 'string'))
    : [];
  return Object.freeze({
    id,
    source,
    ...(doctorId ? { doctorId } : {}),
    ...(doctorLabel ? { doctorLabel } : {}),
    ...(basisDiagnosisId ? { basisDiagnosisId } : {}),
    impression,
    conditions: Object.freeze(conditions),
    recommendations: Object.freeze(recommendations),
    level: candidate.level,
    ...(notes ? { notes } : {}),
    createdAt,
  });
}

function parseConfirmation(value: unknown, aiDiagnosisId: string): MedicalDiagnosisConfirmation | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const diagnosisId = trimText(candidate.diagnosisId);
  const doctorLabel = trimText(candidate.doctorLabel);
  const confirmedAt = trimText(candidate.confirmedAt);
  if (!diagnosisId || diagnosisId !== aiDiagnosisId) return null;
  if (!doctorLabel || !confirmedAt) return null;
  if (!DECISIONS.includes(candidate.decision as MedicalDiagnosisDecision)) return null;
  const doctorId = trimText(candidate.doctorId);
  const doctorDiagnosisId = trimText(candidate.doctorDiagnosisId);
  return Object.freeze({
    diagnosisId,
    decision: candidate.decision as MedicalDiagnosisDecision,
    ...(doctorId ? { doctorId } : {}),
    doctorLabel,
    confirmedAt,
    ...(doctorDiagnosisId ? { doctorDiagnosisId } : {}),
  });
}

function recordFromUnknown(value: unknown): MedicalRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = trimText(candidate.id);
  const sessionId = trimText(candidate.sessionId);
  const memberId = trimText(candidate.memberId);
  const memberLabel = trimText(candidate.memberLabel);
  const startedAt = trimText(candidate.startedAt);
  const endedAt = trimText(candidate.endedAt);
  const summary = trimText(candidate.summary);
  if (!id || !sessionId || !memberId || !memberLabel || !startedAt || !endedAt || !summary) return null;
  if (!isMedicalRecordMode(candidate.mode)) return null;
  if (!Array.isArray(candidate.transcript) || candidate.transcript.length === 0) return null;
  const transcript = candidate.transcript.map(parseTranscriptEntry);
  if (transcript.some((entry): entry is null => entry === null)) return null;
  const attachments = Array.isArray(candidate.attachments)
    ? candidate.attachments.map(parseAttachment)
    : [];
  if (attachments.some((entry) => entry === null)) return null;
  const aiDiagnosis = parseDiagnosis(candidate.aiDiagnosis, 'ai');
  if (!aiDiagnosis) return null;
  const doctorDiagnosis = candidate.doctorDiagnosis === undefined
    ? undefined
    : parseDiagnosis(candidate.doctorDiagnosis, 'doctor');
  if (candidate.doctorDiagnosis !== undefined && !doctorDiagnosis) return null;
  const confirmation = candidate.confirmation === undefined
    ? undefined
    : parseConfirmation(candidate.confirmation, aiDiagnosis.id);
  if (candidate.confirmation !== undefined && !confirmation) return null;
  const derivedStatus: MedicalRecordStatus = confirmation ? 'confirmed' : 'awaiting_doctor';
  if (candidate.status !== undefined && candidate.status !== derivedStatus) return null;
  return Object.freeze({
    id,
    sessionId,
    memberId,
    memberLabel,
    mode: candidate.mode,
    startedAt,
    endedAt,
    summary,
    transcript: Object.freeze(transcript as MedicalTranscriptEntry[]),
    attachments: Object.freeze(attachments as MedicalAttachment[]),
    aiDiagnosis,
    ...(doctorDiagnosis ? { doctorDiagnosis } : {}),
    ...(confirmation ? { confirmation } : {}),
    status: derivedStatus,
  });
}

/**
 * Parses persisted records defensively: a corrupt entry is dropped instead of
 * taking the records screen down. Accepts the serialized JSON string or a value.
 */
export function parseMedicalRecords(value: unknown): MedicalRecord[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return [];
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(recordFromUnknown).filter((entry): entry is MedicalRecord => entry !== null);
}

export function serializeMedicalRecords(records: readonly MedicalRecord[]): string {
  return JSON.stringify(records);
}

/** Storage port the browser, Flutter, and mini program adapters implement. */
export interface MedicalRecordStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

export interface MedicalRecordStore {
  readonly list: () => readonly MedicalRecord[];
  readonly add: (record: MedicalRecord) => void;
  /** Replace an existing record (doctor review) or add a new one. */
  readonly save: (record: MedicalRecord) => void;
  readonly clear: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Synchronous record store over an injected adapter. A storage failure degrades
 * to an in-memory list for the session instead of losing the case record.
 */
export function createMedicalRecordStore(adapter: MedicalRecordStorageAdapter | null): MedicalRecordStore {
  let records: readonly MedicalRecord[] | null = null;
  const listeners = new Set<() => void>();

  function load(): readonly MedicalRecord[] {
    if (records) return records;
    let parsed: MedicalRecord[] = [];
    if (adapter) {
      try {
        parsed = parseMedicalRecords(adapter.read());
      } catch {
        parsed = [];
      }
    }
    records = Object.freeze(parsed);
    return records;
  }

  function persist(): void {
    if (!adapter || !records) return;
    try {
      adapter.write(serializeMedicalRecords(records));
    } catch {
      // Quota or private mode: keep the session copy.
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return Object.freeze({
    list: () => load(),
    add: (record: MedicalRecord) => {
      records = Object.freeze(appendMedicalRecord(load(), record));
      persist();
      notify();
    },
    save: (record: MedicalRecord) => {
      records = Object.freeze(saveMedicalRecord(load(), record));
      persist();
      notify();
    },
    clear: () => {
      records = Object.freeze([]);
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
export function createMemoryMedicalRecordStore(initial: readonly MedicalRecord[] = []): MedicalRecordStore {
  return createMedicalRecordStore({ read: () => serializeMedicalRecords(initial), write: () => undefined });
}
