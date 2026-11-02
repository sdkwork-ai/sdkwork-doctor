// Patient files for the mini program: the household's per-person health record.
//
// Shape and validation mirror @sdkwork/doctor-common-doctor/patient-profiles and
// contracts/patient-profile.schema.json. One profile is active at a time and the
// conversation always consults for the active profile. Storage is device-local
// through wx.getStorageSync/setStorageSync; a storage failure degrades to the
// session copy instead of losing the household.
const STORAGE_KEY = 'sdkwork.doctor.patient-profiles.v1';
const DOCUMENT_VERSION = 1;
const LIMIT = 12;
const MIN_BIRTH_YEAR = 1900;
const RELATIONS = ['self', 'spouse', 'child', 'parent', 'other'];
const SEXES = ['female', 'male', 'unspecified'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BIRTH_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFamilyRelation(value) {
  return typeof value === 'string' && RELATIONS.indexOf(value) >= 0;
}

function isSex(value) {
  return typeof value === 'string' && SEXES.indexOf(value) >= 0;
}

function isBloodType(value) {
  return typeof value === 'string' && BLOOD_TYPES.indexOf(value) >= 0;
}

/** Trims, drops blanks, de-duplicates case-insensitively, and keeps first spelling. */
function normalizeProfileList(values) {
  if (!Array.isArray(values)) return [];
  const seen = [];
  const normalized = [];
  values.forEach((value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.indexOf(key) >= 0) return;
    seen.push(key);
    normalized.push(text);
  });
  return normalized;
}

/** Splits one comma-separated field into normalized entries; accepts full-width commas. */
function splitProfileField(value) {
  if (typeof value !== 'string') return [];
  return normalizeProfileList(value.split(/[,，、]/));
}

/** Best-effort id that works in mini programs without `crypto.randomUUID`. */
function newPatientProfileId() {
  const candidate = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
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
const demoSelfMember = {
  id: 'member-self',
  displayName: 'Me',
  relation: 'self',
  birthYear: 1990,
  birthDate: null,
  sex: 'unspecified',
  bloodType: '',
  allergies: [],
  chronicConditions: [],
  medications: [],
  notes: '',
};

function createDefaultHousehold() {
  return { profiles: [cloneProfile(demoSelfMember)], activeId: demoSelfMember.id };
}

function cloneProfile(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    relation: profile.relation,
    birthYear: profile.birthYear,
    birthDate: profile.birthDate === undefined ? null : profile.birthDate,
    sex: profile.sex,
    bloodType: profile.bloodType || '',
    allergies: normalizeProfileList(profile.allergies),
    chronicConditions: normalizeProfileList(profile.chronicConditions),
    medications: normalizeProfileList(profile.medications),
    notes: typeof profile.notes === 'string' ? profile.notes : '',
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function requiredText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error('patient profile needs a ' + field);
  if (text.length > maxLength) throw new Error('patient profile ' + field + ' is too long');
  return text;
}

function optionalText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function validBirthDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!BIRTH_DATE.test(text)) return null;
  const parts = text.split('-').map((part) => Number.parseInt(part, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return text;
}

function currentYear() {
  return new Date().getFullYear();
}

/**
 * Builds one patient file. Validation is strict and explicit so a form can
 * show a precise failure instead of persisting a half-valid record.
 */
function createPatientProfile(input) {
  const source = input || {};
  const displayName = requiredText(source.displayName, 'display name', 40);
  if (!isFamilyRelation(source.relation)) throw new Error('patient profile needs a known relation');
  if (!isSex(source.sex)) throw new Error('patient profile needs a known sex');
  const maxYear = currentYear();
  if (!Number.isInteger(source.birthYear) || source.birthYear < MIN_BIRTH_YEAR || source.birthYear > maxYear) {
    throw new Error(
      'patient profile needs a birth year between ' + String(MIN_BIRTH_YEAR) + ' and ' + String(maxYear),
    );
  }
  const timestamp = new Date().toISOString();
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : newPatientProfileId();
  return {
    id: id,
    displayName: displayName,
    relation: source.relation,
    birthYear: source.birthYear,
    birthDate: validBirthDate(source.birthDate),
    sex: source.sex,
    bloodType: isBloodType(source.bloodType) ? String(source.bloodType) : '',
    allergies: normalizeProfileList(source.allergies),
    chronicConditions: normalizeProfileList(source.chronicConditions),
    medications: normalizeProfileList(source.medications),
    notes: optionalText(source.notes, 500),
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : timestamp,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : timestamp,
  };
}

/** Applies a form patch and re-validates the result; `id` and `createdAt` never change. */
function updatePatientProfile(profile, patch) {
  const changes = patch || {};
  return createPatientProfile({
    id: profile.id,
    displayName: changes.displayName === undefined ? profile.displayName : changes.displayName,
    relation: changes.relation === undefined ? profile.relation : changes.relation,
    birthYear: changes.birthYear === undefined ? profile.birthYear : changes.birthYear,
    birthDate: changes.birthDate === undefined ? profile.birthDate || null : changes.birthDate,
    sex: changes.sex === undefined ? profile.sex : changes.sex,
    bloodType: changes.bloodType === undefined ? profile.bloodType || '' : changes.bloodType,
    allergies: changes.allergies === undefined ? profile.allergies : changes.allergies,
    chronicConditions: changes.chronicConditions === undefined ? profile.chronicConditions : changes.chronicConditions,
    medications: changes.medications === undefined ? profile.medications : changes.medications,
    notes: changes.notes === undefined ? profile.notes || '' : changes.notes,
    createdAt: profile.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

/** Share of the six care facts that are filled in, as a whole percentage. */
function patientProfileCompleteness(profile) {
  const checks = [
    Boolean(profile.birthDate) || profile.birthYear > MIN_BIRTH_YEAR,
    Boolean(profile.bloodType),
    profile.allergies.length > 0,
    profile.chronicConditions.length > 0,
    profile.medications.length > 0,
    Boolean((profile.notes || '').trim()),
  ];
  let filled = 0;
  checks.forEach((check) => {
    if (check) filled += 1;
  });
  return Math.round((filled / checks.length) * 100);
}

function profileFromUnknown(value) {
  if (!value || typeof value !== 'object') return null;
  if (
    typeof value.id !== 'string' || !value.id.trim() ||
    typeof value.displayName !== 'string' || !value.displayName.trim() ||
    !isFamilyRelation(value.relation) ||
    typeof value.birthYear !== 'number' || !Number.isInteger(value.birthYear) ||
    !isSex(value.sex)
  ) {
    return null;
  }
  const list = (entry) => (Array.isArray(entry)
    ? normalizeProfileList(entry.filter((item) => typeof item === 'string'))
    : []);
  return {
    id: value.id.trim(),
    displayName: value.displayName.trim(),
    relation: value.relation,
    birthYear: value.birthYear,
    birthDate: validBirthDate(typeof value.birthDate === 'string' ? value.birthDate : null),
    sex: value.sex,
    bloodType: isBloodType(value.bloodType) ? String(value.bloodType) : '',
    allergies: list(value.allergies),
    chronicConditions: list(value.chronicConditions),
    medications: list(value.medications),
    notes: optionalText(typeof value.notes === 'string' ? value.notes : '', 500),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  };
}

/**
 * Parses a persisted household defensively. A corrupt profile is dropped
 * instead of taking the tab down; an unknown active id falls back to the first
 * profile so the app is never left without an active patient.
 *
 * Document shape: {"version":1,"activeId":"...","profiles":[...]}
 */
function parsePatientHousehold(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return { profiles: [], activeId: null };
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return { profiles: [], activeId: null };
    }
  }
  const source = Array.isArray(parsed)
    ? { profiles: parsed, activeId: null }
    : parsed && typeof parsed === 'object'
      ? parsed
      : { profiles: [], activeId: null };
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.map(profileFromUnknown).filter((entry) => entry !== null)
    : [];
  const requested = typeof source.activeId === 'string' ? source.activeId : '';
  const hasRequested = profiles.some((profile) => profile.id === requested);
  const activeId = hasRequested ? requested : profiles.length > 0 ? profiles[0].id : null;
  return { profiles: profiles, activeId: activeId };
}

function serializePatientHousehold(household) {
  const source = household || { profiles: [], activeId: null };
  return JSON.stringify({
    version: DOCUMENT_VERSION,
    activeId: typeof source.activeId === 'string' ? source.activeId : null,
    profiles: Array.isArray(source.profiles) ? source.profiles : [],
  });
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
 * Storage port seam. The mini program adapters take `(key)` / `(key, value)`
 * like `lib/visit-records.js`, while the shared TypeScript domain uses
 * `read()` / `write(value)`; accepting both keeps one host adapter shape from
 * silently dropping a household.
 */
function readStored(adapter, key) {
  return adapter.read.length > 0 ? adapter.read(key) : adapter.read();
}

function writeStored(adapter, key, value) {
  if (adapter.write.length >= 2) adapter.write(key, value);
  else adapter.write(value);
}

/**
 * Observable household store. A storage failure degrades to an in-memory
 * household for the session instead of losing the patient files.
 */
function createPatientProfileStore(storage) {
  const adapter = storage === undefined ? defaultStorage() : storage;
  let household = null;
  const listeners = [];

  function load() {
    if (household) return household;
    let raw = null;
    if (adapter) {
      try {
        raw = readStored(adapter, STORAGE_KEY);
      } catch (error) {
        raw = null;
      }
    }
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      household = createDefaultHousehold();
    } else {
      household = parsePatientHousehold(raw);
    }
    return household;
  }

  function persist() {
    if (!adapter || !household) return;
    try {
      writeStored(adapter, STORAGE_KEY, serializePatientHousehold(household));
    } catch (error) {
      // ignore
    }
  }

  function notify() {
    listeners.slice().forEach((listener) => listener());
  }

  function commit(next) {
    household = { profiles: next.profiles, activeId: next.activeId };
    persist();
    notify();
    return household;
  }

  function requireProfile(id) {
    const found = load().profiles.filter((profile) => profile.id === id)[0];
    if (!found) throw new Error('unknown patient profile: ' + id);
    return found;
  }

  function activeProfile() {
    const current = load();
    const found = current.profiles.filter((profile) => profile.id === current.activeId)[0];
    if (found) return found;
    return current.profiles.length > 0 ? current.profiles[0] : null;
  }

  const store = {
    list() {
      return load().profiles.slice();
    },
    getActive() {
      return activeProfile();
    },
    active() {
      return activeProfile();
    },
    getActiveId() {
      return load().activeId;
    },
    activeId() {
      return load().activeId;
    },
    select(id) {
      const current = load();
      if (!current.profiles.some((profile) => profile.id === id)) return;
      if (current.activeId === id) return;
      commit({ profiles: current.profiles, activeId: id });
    },
    add(input) {
      const current = load();
      if (current.profiles.length >= LIMIT) {
        throw new Error('patient profile limit reached: ' + String(LIMIT));
      }
      const profile = createPatientProfile(input);
      const profiles = current.profiles.concat([profile]);
      commit({ profiles: profiles, activeId: current.activeId || profile.id });
      return profile;
    },
    update(id, patch) {
      const current = load();
      const updated = updatePatientProfile(requireProfile(id), patch);
      commit({
        profiles: current.profiles.map((profile) => (profile.id === id ? updated : profile)),
        activeId: current.activeId,
      });
      return updated;
    },
    remove(id) {
      const current = load();
      const profiles = current.profiles.filter((profile) => profile.id !== id);
      if (profiles.length === current.profiles.length) return;
      const activeId = current.activeId === id
        ? (profiles.length > 0 ? profiles[0].id : null)
        : current.activeId;
      commit({ profiles: profiles, activeId: activeId });
    },
    subscribe(listener) {
      listeners.push(listener);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
  return store;
}

/** In-memory store for tests and hosts without storage. */
function createMemoryPatientProfileStore(initial) {
  const seeded = initial || createDefaultHousehold();
  return createPatientProfileStore({
    read: () => serializePatientHousehold(seeded),
    write: () => undefined,
  });
}

module.exports = {
  PATIENT_PROFILES_STORAGE_KEY: STORAGE_KEY,
  PATIENT_PROFILE_VERSION: DOCUMENT_VERSION,
  PATIENT_PROFILE_LIMIT: LIMIT,
  MIN_PATIENT_BIRTH_YEAR: MIN_BIRTH_YEAR,
  PATIENT_RELATIONS: RELATIONS,
  PATIENT_SEXES: SEXES,
  PATIENT_BLOOD_TYPES: BLOOD_TYPES,
  demoSelfMember,
  createDefaultHousehold,
  isFamilyRelation,
  isSex,
  isBloodType,
  normalizeProfileList,
  splitProfileField,
  newPatientProfileId,
  createPatientProfile,
  updatePatientProfile,
  patientProfileCompleteness,
  parsePatientHousehold,
  serializePatientHousehold,
  createPatientProfileStore,
  createMemoryPatientProfileStore,
};
