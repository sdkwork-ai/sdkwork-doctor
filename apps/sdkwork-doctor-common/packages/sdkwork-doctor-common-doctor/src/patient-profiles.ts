/**
 * Patient files: the household's per-person health record.
 *
 * One profile per patient; a household keeps several. The conversation always
 * carries exactly one active profile, and every surface (PC, H5, Flutter, mini
 * program) reads and writes the same JSON document pinned by
 * `contracts/patient-profile.schema.json`.
 *
 * No network, storage, or user-facing copy here: the store writes through an
 * injected adapter and the UI owns the labels.
 */
import type { FamilyRelation, PatientProfile, Sex } from './index';

/** Storage key shared by every browser surface. */
export const PATIENT_PROFILES_STORAGE_KEY = 'sdkwork.doctor.patient-profiles.v1';

/** Serialized household document version. */
export const PATIENT_PROFILE_VERSION = 1;

/** A household may keep this many patient files. */
export const PATIENT_PROFILE_LIMIT = 12;

/** Earliest birth year a profile accepts. */
export const MIN_PATIENT_BIRTH_YEAR = 1900;

const RELATIONS: readonly FamilyRelation[] = Object.freeze(['self', 'spouse', 'child', 'parent', 'other']);
const SEXES: readonly Sex[] = Object.freeze(['female', 'male', 'unspecified']);
const BLOOD_TYPES: readonly string[] = Object.freeze(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const BIRTH_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function isFamilyRelation(value: unknown): value is FamilyRelation {
  return typeof value === 'string' && (RELATIONS as readonly string[]).includes(value);
}

export function isSex(value: unknown): value is Sex {
  return typeof value === 'string' && (SEXES as readonly string[]).includes(value);
}

export function isBloodType(value: unknown): value is string {
  return typeof value === 'string' && (BLOOD_TYPES as readonly string[]).includes(value);
}

/** Trims, drops blanks, de-duplicates case-insensitively, and keeps first spelling. */
export function normalizeProfileList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }
  return normalized;
}

/** Splits one comma-separated field into normalized entries; accepts full-width commas. */
export function splitProfileField(value: string | undefined): string[] {
  if (typeof value !== 'string') return [];
  return normalizeProfileList(value.split(/[,，、]/u));
}

/** Best-effort id that works in mini programs without `crypto.randomUUID`. */
export function newPatientProfileId(): string {
  const candidate = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (candidate && typeof candidate.randomUUID === 'function') {
    return candidate.randomUUID();
  }
  return 'patient-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * The seeded household, present only on a device that has never stored a
 * profile. Once a household document exists (even an empty one) the seed is
 * never re-applied, so deleting every profile stays deleted.
 */
export const demoSelfMember: PatientProfile = Object.freeze({
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  sex: 'unspecified',
  allergies: Object.freeze([]) as readonly string[],
  chronicConditions: Object.freeze([]) as readonly string[],
  medications: Object.freeze([]) as readonly string[],
});

export interface PatientHousehold {
  readonly profiles: readonly PatientProfile[];
  readonly activeId: string | null;
}

export function createDefaultHousehold(): PatientHousehold {
  return Object.freeze({ profiles: Object.freeze([demoSelfMember]) as readonly PatientProfile[], activeId: demoSelfMember.id });
}

export interface CreatePatientProfileInput {
  readonly id?: string;
  readonly displayName: string;
  readonly relation: FamilyRelation;
  readonly birthYear: number;
  readonly birthDate?: string | null;
  readonly sex: Sex;
  readonly bloodType?: string;
  readonly allergies?: readonly string[];
  readonly chronicConditions?: readonly string[];
  readonly medications?: readonly string[];
  readonly notes?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

function requiredText(value: string, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`patient profile needs a ${field}`);
  if (text.length > maxLength) throw new Error(`patient profile ${field} is too long`);
  return text;
}

function optionalText(value: string | null | undefined, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function validBirthDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!BIRTH_DATE.test(text)) return null;
  const [year, month, day] = text.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return text;
}

/**
 * Builds one patient file. Validation is strict and explicit so a form can
 * show a precise failure instead of persisting a half-valid record.
 */
export function createPatientProfile(input: CreatePatientProfileInput): PatientProfile {
  const displayName = requiredText(input.displayName, 'display name', 40);
  if (!isFamilyRelation(input.relation)) throw new Error('patient profile needs a known relation');
  if (!isSex(input.sex)) throw new Error('patient profile needs a known sex');
  const maxYear = new Date().getFullYear();
  if (!Number.isInteger(input.birthYear) || input.birthYear < MIN_PATIENT_BIRTH_YEAR || input.birthYear > maxYear) {
    throw new Error('patient profile needs a birth year between ' + String(MIN_PATIENT_BIRTH_YEAR) + ' and ' + String(maxYear));
  }
  const timestamp = new Date().toISOString();
  const bloodType = isBloodType(input.bloodType) ? String(input.bloodType) : '';
  return Object.freeze({
    id: (input.id ?? newPatientProfileId()).trim() || newPatientProfileId(),
    displayName,
    relation: input.relation,
    birthYear: input.birthYear,
    birthDate: validBirthDate(input.birthDate),
    sex: input.sex,
    bloodType,
    allergies: Object.freeze(normalizeProfileList(input.allergies)) as readonly string[],
    chronicConditions: Object.freeze(normalizeProfileList(input.chronicConditions)) as readonly string[],
    medications: Object.freeze(normalizeProfileList(input.medications)) as readonly string[],
    notes: optionalText(input.notes, 500),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  });
}

export type PatientProfilePatch = Partial<Omit<CreatePatientProfileInput, 'id' | 'createdAt'>>;

/** Applies a form patch and re-validates the result; `id` and `createdAt` never change. */
export function updatePatientProfile(profile: PatientProfile, patch: PatientProfilePatch): PatientProfile {
  return createPatientProfile({
    id: profile.id,
    displayName: patch.displayName ?? profile.displayName,
    relation: patch.relation ?? profile.relation,
    birthYear: patch.birthYear ?? profile.birthYear,
    birthDate: patch.birthDate === undefined ? profile.birthDate ?? null : patch.birthDate,
    sex: patch.sex ?? profile.sex,
    bloodType: patch.bloodType === undefined ? profile.bloodType ?? '' : patch.bloodType,
    allergies: patch.allergies ?? profile.allergies,
    chronicConditions: patch.chronicConditions ?? profile.chronicConditions,
    medications: patch.medications ?? profile.medications,
    notes: patch.notes === undefined ? profile.notes ?? '' : patch.notes,
    createdAt: profile.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

/** Share of the six care facts that are filled in, as a whole percentage. */
export function patientProfileCompleteness(profile: PatientProfile): number {
  const checks = [
    Boolean(profile.birthDate) || profile.birthYear > MIN_PATIENT_BIRTH_YEAR,
    Boolean(profile.bloodType),
    profile.allergies.length > 0,
    profile.chronicConditions.length > 0,
    profile.medications.length > 0,
    Boolean((profile.notes ?? '').trim()),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

function profileFromUnknown(value: unknown): PatientProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' || !candidate.id.trim() ||
    typeof candidate.displayName !== 'string' || !candidate.displayName.trim() ||
    !isFamilyRelation(candidate.relation) ||
    typeof candidate.birthYear !== 'number' || !Number.isInteger(candidate.birthYear) ||
    !isSex(candidate.sex)
  ) {
    return null;
  }
  const list = (entry: unknown): readonly string[] =>
    Array.isArray(entry) ? normalizeProfileList(entry.filter((item): item is string => typeof item === 'string')) : [];
  return Object.freeze({
    id: candidate.id.trim(),
    displayName: candidate.displayName.trim(),
    relation: candidate.relation,
    birthYear: candidate.birthYear,
    birthDate: validBirthDate(typeof candidate.birthDate === 'string' ? candidate.birthDate : null),
    sex: candidate.sex,
    bloodType: isBloodType(candidate.bloodType) ? String(candidate.bloodType) : '',
    allergies: list(candidate.allergies),
    chronicConditions: list(candidate.chronicConditions),
    medications: list(candidate.medications),
    notes: optionalText(typeof candidate.notes === 'string' ? candidate.notes : '', 500),
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  });
}

/**
 * Parses a persisted household defensively. A corrupt profile is dropped
 * instead of taking the tab down; an unknown active id falls back to the first
 * profile so the app is never left without an active patient.
 */
export function parsePatientHousehold(value: unknown): PatientHousehold {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return Object.freeze({ profiles: Object.freeze([]) as readonly PatientProfile[], activeId: null });
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return Object.freeze({ profiles: Object.freeze([]) as readonly PatientProfile[], activeId: null });
    }
  }
  const source = Array.isArray(parsed)
    ? { profiles: parsed, activeId: null as unknown }
    : typeof parsed === 'object' && parsed !== null
      ? (parsed as { profiles?: unknown; activeId?: unknown })
      : { profiles: [], activeId: null as unknown };
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.map(profileFromUnknown).filter((entry): entry is PatientProfile => entry !== null)
    : [];
  const requested = typeof source.activeId === 'string' ? source.activeId : '';
  const activeId = profiles.some((profile) => profile.id === requested) ? requested : profiles[0]?.id ?? null;
  return Object.freeze({ profiles: Object.freeze(profiles) as readonly PatientProfile[], activeId });
}

export function serializePatientHousehold(household: PatientHousehold): string {
  return JSON.stringify({ version: PATIENT_PROFILE_VERSION, activeId: household.activeId, profiles: household.profiles });
}

/** Storage port the browser, Flutter, and mini program adapters implement. */
export interface PatientProfileStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

export interface PatientProfileStore {
  readonly list: () => readonly PatientProfile[];
  /** The active profile, or null when the household has no profile yet. */
  readonly active: () => PatientProfile | null;
  readonly activeId: () => string | null;
  readonly select: (id: string) => void;
  readonly add: (input: CreatePatientProfileInput) => PatientProfile;
  readonly update: (id: string, patch: PatientProfilePatch) => PatientProfile;
  readonly remove: (id: string) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface CreatePatientProfileStoreOptions {
  /** Applied only when the device has never stored a household document. */
  readonly seed?: PatientHousehold;
}

/**
 * Synchronous household store over an injected adapter.
 *
 * `list()` returns the same frozen array until the next mutation, so React's
 * `useSyncExternalStore` can subscribe without a snapshot loop. A storage
 * failure degrades to an in-memory household for the session.
 */
export function createPatientProfileStore(
  adapter: PatientProfileStorageAdapter | null,
  options: CreatePatientProfileStoreOptions = {},
): PatientProfileStore {
  const seed = options.seed ?? createDefaultHousehold();
  let household: PatientHousehold | null = null;
  const listeners = new Set<() => void>();

  function load(): PatientHousehold {
    if (household) return household;
    let raw: string | null = null;
    if (adapter) {
      try {
        raw = adapter.read();
      } catch {
        raw = null;
      }
    }
    if (raw === null || raw.trim() === '') {
      household = Object.freeze({
        profiles: Object.freeze([...seed.profiles]) as readonly PatientProfile[],
        activeId: seed.activeId ?? seed.profiles[0]?.id ?? null,
      });
    } else {
      household = parsePatientHousehold(raw);
    }
    return household;
  }

  function persist(): void {
    if (!adapter || !household) return;
    try {
      adapter.write(serializePatientHousehold(household));
    } catch {
      // Quota or private mode: keep the session copy.
    }
  }

  function commit(next: PatientHousehold): void {
    household = Object.freeze({
      profiles: Object.freeze([...next.profiles]) as readonly PatientProfile[],
      activeId: next.activeId,
    });
    persist();
    for (const listener of listeners) listener();
  }

  function requireProfile(id: string): PatientProfile {
    const found = load().profiles.find((profile) => profile.id === id);
    if (!found) throw new Error('unknown patient profile: ' + id);
    return found;
  }

  return Object.freeze({
    list: () => load().profiles,
    activeId: () => load().activeId,
    active: () => {
      const current = load();
      return current.profiles.find((profile) => profile.id === current.activeId) ?? current.profiles[0] ?? null;
    },
    select: (id: string) => {
      const current = load();
      if (!current.profiles.some((profile) => profile.id === id)) return;
      if (current.activeId === id) return;
      commit({ profiles: current.profiles, activeId: id });
    },
    add: (input: CreatePatientProfileInput) => {
      const current = load();
      if (current.profiles.length >= PATIENT_PROFILE_LIMIT) {
        throw new Error('patient profile limit reached: ' + String(PATIENT_PROFILE_LIMIT));
      }
      const profile = createPatientProfile(input);
      const profiles = [...current.profiles, profile];
      commit({ profiles, activeId: current.activeId ?? profile.id });
      return profile;
    },
    update: (id: string, patch: PatientProfilePatch) => {
      const current = load();
      const updated = updatePatientProfile(requireProfile(id), patch);
      commit({
        profiles: current.profiles.map((profile) => (profile.id === id ? updated : profile)),
        activeId: current.activeId,
      });
      return updated;
    },
    remove: (id: string) => {
      const current = load();
      const profiles = current.profiles.filter((profile) => profile.id !== id);
      if (profiles.length === current.profiles.length) return;
      const activeId = current.activeId === id ? profiles[0]?.id ?? null : current.activeId;
      commit({ profiles, activeId });
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
export function createMemoryPatientProfileStore(initial?: PatientHousehold): PatientProfileStore {
  const seeded = initial ?? createDefaultHousehold();
  return createPatientProfileStore(
    { read: () => serializePatientHousehold(seeded), write: () => undefined },
    { seed: seeded },
  );
}
