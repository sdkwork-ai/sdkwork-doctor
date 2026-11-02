/**
 * Visit records: one entry per consultation.
 *
 * The record is the product's memory of "what did the doctor say last time".
 * Shape is pinned by `contracts/visit-record.schema.json` and asserted by the
 * TypeScript, Dart, and mini program suites, so all four clients read and write
 * the same JSON.
 */
import type { FamilyMember, TriageLevel } from './index';
import type { DoctorEmploymentType } from './doctors';

/** `mode` of the transport that produced the advice. */
export type VisitRecordMode = 'hosted' | 'offline' | 'human';

export interface VisitRecord {
  readonly id: string;
  /** ISO-8601 timestamp of the exchange. */
  readonly recordedAt: string;
  readonly memberId: string;
  readonly memberLabel: string;
  readonly symptom: string;
  readonly advice: string;
  readonly level: TriageLevel;
  readonly mode: VisitRecordMode;
  /** Human doctor the consultation was routed to, when the family asked a person. */
  readonly doctorId?: string;
  readonly doctorLabel?: string;
  /** Employing organization of the doctor at consultation time. */
  readonly doctorOrganizationId?: string;
  /** Hospital / site the consultation was routed to, as displayed at the time. */
  readonly doctorHospitalLabel?: string;
  /** Engagement type of the consulted doctor at that site. */
  readonly doctorEmploymentType?: DoctorEmploymentType;
}

/** Storage key shared by every browser surface. */
export const VISIT_RECORDS_STORAGE_KEY = 'sdkwork.doctor.visit-records.v1';

/** Newest-first retention cap; older consultations are dropped from the device. */
export const VISIT_RECORD_LIMIT = 200;

const LEVELS: readonly TriageLevel[] = Object.freeze(['emergency', 'urgent', 'routine', 'self-care']);
const MODES: readonly VisitRecordMode[] = Object.freeze(['hosted', 'offline', 'human']);

export function isTriageLevel(value: unknown): value is TriageLevel {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function isVisitRecordMode(value: unknown): value is VisitRecordMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

/** Best-effort id that works in browsers without `crypto.randomUUID`. */
export function newVisitRecordId(): string {
  const candidate = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (candidate && typeof candidate.randomUUID === 'function') {
    return candidate.randomUUID();
  }
  return 'visit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export interface CreateVisitRecordInput {
  readonly member: FamilyMember;
  readonly symptom: string;
  readonly advice: string;
  readonly level: TriageLevel;
  readonly mode: VisitRecordMode;
  readonly doctorId?: string;
  readonly doctorLabel?: string;
  readonly doctorOrganizationId?: string;
  readonly doctorHospitalLabel?: string;
  readonly doctorEmploymentType?: DoctorEmploymentType;
  readonly id?: string;
  readonly recordedAt?: string;
}

function optionalTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Builds one record from an exchange. The advice keeps the full visible answer
 * so the record is useful without the original conversation.
 */
export function createVisitRecord(input: CreateVisitRecordInput): VisitRecord {
  const symptom = input.symptom.trim();
  const advice = input.advice.trim();
  if (!symptom) throw new Error('a visit record needs symptom text');
  if (!advice) throw new Error('a visit record needs advice text');
  if (!isTriageLevel(input.level)) throw new Error('a visit record needs a known triage level');
  if (!isVisitRecordMode(input.mode)) throw new Error('a visit record needs a known transport mode');
  const doctorId = optionalTrim(input.doctorId);
  const doctorLabel = optionalTrim(input.doctorLabel);
  const doctorOrganizationId = optionalTrim(input.doctorOrganizationId);
  const doctorHospitalLabel = optionalTrim(input.doctorHospitalLabel);
  const doctorEmploymentType = typeof input.doctorEmploymentType === 'string' ? input.doctorEmploymentType : '';
  return Object.freeze({
    id: input.id ?? newVisitRecordId(),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    memberId: input.member.id,
    memberLabel: input.member.displayName + ' (' + input.member.relation + ')',
    symptom,
    advice,
    level: input.level,
    mode: input.mode,
    ...(doctorId ? { doctorId } : {}),
    ...(doctorLabel ? { doctorLabel } : {}),
    ...(doctorOrganizationId ? { doctorOrganizationId } : {}),
    ...(doctorHospitalLabel ? { doctorHospitalLabel } : {}),
    ...(doctorEmploymentType ? { doctorEmploymentType: doctorEmploymentType as DoctorEmploymentType } : {}),
  });
}

/** Newest first, de-duplicated by id, capped at [limit]. */
export function appendVisitRecord(
  records: readonly VisitRecord[],
  record: VisitRecord,
  limit: number = VISIT_RECORD_LIMIT,
): VisitRecord[] {
  const next = [record, ...records.filter((entry) => entry.id !== record.id)];
  return next.slice(0, Math.max(0, limit));
}

function recordFromUnknown(value: unknown): VisitRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = candidate.id;
  const recordedAt = candidate.recordedAt;
  const memberId = candidate.memberId;
  const memberLabel = candidate.memberLabel;
  const symptom = candidate.symptom;
  const advice = candidate.advice;
  const level = candidate.level;
  const mode = candidate.mode;
  if (
    typeof id !== 'string' || !id ||
    typeof recordedAt !== 'string' || !recordedAt ||
    typeof memberId !== 'string' ||
    typeof memberLabel !== 'string' ||
    typeof symptom !== 'string' || !symptom ||
    typeof advice !== 'string' || !advice ||
    !isTriageLevel(level) ||
    !isVisitRecordMode(mode)
  ) {
    return null;
  }
  const optional: Record<string, string> = {};
  for (const field of ['doctorId', 'doctorLabel', 'doctorOrganizationId', 'doctorHospitalLabel', 'doctorEmploymentType'] as const) {
    const value = optionalTrim(candidate[field]);
    if (value) optional[field] = value;
  }
  return Object.freeze({
    id,
    recordedAt,
    memberId,
    memberLabel,
    symptom,
    advice,
    level,
    mode,
    ...optional,
  });
}

/**
 * Parses persisted records defensively: a corrupt entry is dropped instead of
 * taking the records tab down. Accepts the serialized JSON string or a value.
 */
export function parseVisitRecords(value: unknown): VisitRecord[] {
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
  return parsed.map(recordFromUnknown).filter((entry): entry is VisitRecord => entry !== null);
}

export function serializeVisitRecords(records: readonly VisitRecord[]): string {
  return JSON.stringify(records);
}

/** Storage port the browser, Flutter, and mini program adapters implement. */
export interface VisitRecordStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

export interface VisitRecordStore {
  readonly list: () => readonly VisitRecord[];
  readonly add: (record: VisitRecord) => void;
  readonly clear: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Synchronous record store over an injected adapter. A storage failure degrades
 * to an in-memory list for the session instead of losing the consultation.
 *
 * `list()` returns the same frozen array reference until the next mutation, so
 * React's `useSyncExternalStore` can subscribe without a snapshot loop.
 */
export function createVisitRecordStore(adapter: VisitRecordStorageAdapter | null): VisitRecordStore {
  let records: readonly VisitRecord[] | null = null;
  const listeners = new Set<() => void>();

  function load(): readonly VisitRecord[] {
    if (records) return records;
    let parsed: VisitRecord[] = [];
    if (adapter) {
      try {
        parsed = parseVisitRecords(adapter.read());
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
      adapter.write(serializeVisitRecords(records));
    } catch {
      // Quota or private mode: keep the session copy.
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return Object.freeze({
    list: () => load(),
    add: (record: VisitRecord) => {
      records = Object.freeze(appendVisitRecord(load(), record));
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
export function createMemoryVisitRecordStore(initial: readonly VisitRecord[] = []): VisitRecordStore {
  return createVisitRecordStore({ read: () => serializeVisitRecords(initial), write: () => undefined });
}
