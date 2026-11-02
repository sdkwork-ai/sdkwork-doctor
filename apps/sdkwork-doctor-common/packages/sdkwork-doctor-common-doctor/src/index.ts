/**
 * Family private-doctor domain vocabulary.
 *
 * Framework-neutral by design: every surface (PC, H5, Flutter, mini program)
 * maps its own transport and UI onto these types. No network, no storage, no
 * user-facing copy here.
 */

export type FamilyRelation = 'self' | 'spouse' | 'child' | 'parent' | 'other';

export type Sex = 'female' | 'male' | 'unspecified';

export interface FamilyMember {
  readonly id: string;
  readonly displayName: string;
  readonly relation: FamilyRelation;
  readonly birthYear: number;
  readonly sex: Sex;
  readonly bloodType?: string;
  readonly allergies: readonly string[];
  readonly chronicConditions: readonly string[];
  readonly medications: readonly string[];
}

export type TriageLevel = 'emergency' | 'urgent' | 'routine' | 'self-care';

export interface TriageResult {
  readonly level: TriageLevel;
  readonly reason: string;
  readonly actions: readonly string[];
  readonly escalate: boolean;
}

export interface HealthSummary {
  readonly memberId: string;
  readonly activeConditions: readonly string[];
  readonly activeMedications: readonly string[];
  readonly upcoming: readonly { readonly id: string; readonly title: string; readonly dueOn: string }[];
  readonly lastCheckupOn: string | null;
}

const EMERGENCY_PATTERNS: readonly RegExp[] = [
  /chest pain|crushing chest|胸痛|胸口压榨/i,
  /cannot breathe|shortness of breath at rest|呼吸困难|喘不上气/i,
  /unconscious|fainted|昏迷|意识不清/i,
  /severe bleeding|大量出血/i,
  /stroke|face droop|slurred speech|中风|口角歪斜|言语不清/i,
];

const URGENT_PATTERNS: readonly RegExp[] = [
  /high fever|fever above 39|高烧|持续发热/i,
  /fracture|broken bone|骨折/i,
  /severe abdominal pain|剧烈腹痛/i,
  /dehydration|脱水/i,
];

/**
 * Deterministic first-pass triage. The agent layer never overrides an
 * emergency result with conversational text.
 */
export function triageSymptoms(symptoms: string): TriageResult {
  const text = symptoms.trim();
  if (!text) {
    return {
      level: 'self-care',
      reason: 'No symptom text was provided.',
      actions: ['Describe the symptom, its onset, and its severity.'],
      escalate: false,
    };
  }
  if (EMERGENCY_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: 'emergency',
      reason: 'The description matches an emergency red flag.',
      actions: ['Call local emergency services now.', 'Do not drive yourself.', 'Stay with the person until help arrives.'],
      escalate: true,
    };
  }
  if (URGENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: 'urgent',
      reason: 'The description suggests a same-day clinical assessment.',
      actions: ['Contact a clinician today.', 'Record temperature and fluid intake.', 'Seek emergency care if breathing or consciousness changes.'],
      escalate: true,
    };
  }
  return {
    level: 'routine',
    reason: 'No red flag was detected in the description.',
    actions: ['Monitor for 24-48 hours.', 'Book a routine consultation if symptoms persist or worsen.'],
    escalate: false,
  };
}

export const demoSelfMember: FamilyMember = Object.freeze({
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  sex: 'unspecified',
  allergies: [],
  chronicConditions: [],
  medications: [],
});

export function summarizeHealth(member: FamilyMember): HealthSummary {
  return Object.freeze({
    memberId: member.id,
    activeConditions: member.chronicConditions,
    activeMedications: member.medications,
    upcoming: [],
    lastCheckupOn: null,
  });
}

export {
  VISIT_RECORD_LIMIT,
  VISIT_RECORDS_STORAGE_KEY,
  appendVisitRecord,
  createMemoryVisitRecordStore,
  createVisitRecord,
  createVisitRecordStore,
  isTriageLevel,
  isVisitRecordMode,
  newVisitRecordId,
  parseVisitRecords,
  serializeVisitRecords,
} from './visit-records';
export type {
  CreateVisitRecordInput,
  VisitRecord,
  VisitRecordMode,
  VisitRecordStorageAdapter,
  VisitRecordStore,
} from './visit-records';
