// Human-doctor directory and selection for the mini program.
//
// A doctor is a person; employment is a relationship to a healthcare
// organization. `DoctorProfile` carries person facts only, and each
// `DoctorAffiliation` carries the site facts (organization, hospital reference,
// department, rank, employment type, consulting hours, channels). The fallback
// roster is semantically identical to contracts/doctor-roster.json and every
// entry carries `verified: false`.
//
// A deployment binds a doctor-directory document through the runtime document
// key `careDoctorDirectoryUrl`; when it is empty or unreachable the authored
// roster answers and `source` tells the UI which one it is showing. Selection is
// device-local: which doctors a family picked, and which one is primary.
const DOCTOR_DIRECTORY_KIND = 'sdkwork.doctor.doctor-roster';
const DOCTOR_SELECTION_STORAGE_KEY = 'sdkwork.doctor.doctor-selection.v1';
const DOCTOR_SELECTION_LIMIT = 5;
const DOCTOR_DIRECTORY_TIMEOUT_MS = 8000;
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'visiting'];
const CONSULTATION_KINDS = ['video', 'phone', 'messaging', 'clinic'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ABSOLUTE_AVATAR_URL = /^https?:\/\/\S+$/i;
const AVATAR_ASSET_PATH = /^[a-z0-9][a-z0-9._/-]*$/i;

function isDoctorEmploymentType(value) {
  return typeof value === 'string' && EMPLOYMENT_TYPES.indexOf(value) >= 0;
}

function isDoctorConsultationKind(value) {
  return typeof value === 'string' && CONSULTATION_KINDS.indexOf(value) >= 0;
}

function trimText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function textList(value, maxLength) {
  if (!Array.isArray(value)) return [];
  const seen = [];
  const entries = [];
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const text = item.trim().slice(0, maxLength);
    if (!text || seen.indexOf(text.toLowerCase()) >= 0) return;
    seen.push(text.toLowerCase());
    entries.push(text);
  });
  return entries;
}

/**
 * Reads a portrait reference. An absolute http(s) URL is kept as published by
 * an operator directory; a bundle-relative asset path (`avatars/x.png`) is kept
 * for the authored roster. Any other scheme — a data URI, a `javascript:` URL,
 * or a path that climbs out of the bundle — is dropped.
 */
function avatarUrlFrom(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().slice(0, 500);
  if (!text) return '';
  if (ABSOLUTE_AVATAR_URL.test(text)) return text;
  if (!AVATAR_ASSET_PATH.test(text) || text.indexOf('..') >= 0) return '';
  return text;
}

/** True when a portrait is an absolute URL the client loads over the network. */
function isRemoteDoctorAvatar(avatarUrl) {
  return typeof avatarUrl === 'string' && ABSOLUTE_AVATAR_URL.test(avatarUrl.trim());
}

/**
 * The `image` source for a doctor portrait. The mini program serves its bundled
 * assets from `/assets/`, so the authored roster's `avatars/x.png` becomes
 * `/assets/avatars/x.png`; a directory document may publish an absolute URL.
 * Empty when the profile carries no usable portrait.
 */
function resolveDoctorAvatarSrc(avatarUrl) {
  const text = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  if (!text) return '';
  return ABSOLUTE_AVATAR_URL.test(text) ? text : '/assets/' + text;
}

/** One-character monogram shown when a doctor has no portrait. */
function doctorInitial(displayName) {
  const text = typeof displayName === 'string' ? displayName.trim() : '';
  if (!text) return '';
  return Array.from(text)[0].toUpperCase();
}

function channelsFrom(value) {
  if (!Array.isArray(value)) return [];
  const channels = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (!isDoctorConsultationKind(entry.kind)) return;
    channels.push({
      kind: entry.kind,
      target: trimText(entry.target, 500),
    });
  });
  return channels;
}

function availabilityFrom(value) {
  if (!Array.isArray(value)) return [];
  const slots = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const weekday = typeof entry.weekday === 'number' ? entry.weekday : -1;
    const startTime = typeof entry.startTime === 'string' ? entry.startTime.trim() : '';
    const endTime = typeof entry.endTime === 'string' ? entry.endTime.trim() : '';
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
    if (!TIME.test(startTime) || !TIME.test(endTime) || startTime >= endTime) return;
    slots.push({ weekday: weekday, startTime: startTime, endTime: endTime });
  });
  return slots;
}

function affiliationFromUnknown(value, fallbackPrimary) {
  if (!value || typeof value !== 'object') return null;
  const organizationId = trimText(value.organizationId, 80);
  const hospitalName = trimText(value.hospitalName, 120);
  if (!organizationId || !hospitalName) return null;
  const since = typeof value.since === 'string' && YEAR_MONTH.test(value.since.trim())
    ? value.since.trim()
    : '';
  return {
    organizationId: organizationId,
    hospitalCode: trimText(value.hospitalCode, 60),
    hospitalName: hospitalName,
    hospitalGrade: trimText(value.hospitalGrade, 40),
    departmentCode: trimText(value.departmentCode, 20),
    department: trimText(value.department, 60),
    title: trimText(value.title, 60),
    employmentType: isDoctorEmploymentType(value.employmentType) ? value.employmentType : 'full_time',
    primary: value.primary === true || (fallbackPrimary && value.primary !== false),
    acceptingNewPatients: value.acceptingNewPatients !== false,
    availability: availabilityFrom(value.availability),
    channels: channelsFrom(value.channels),
    since: since,
  };
}

/**
 * Reads the affiliations of one clinician. A directory document that still uses
 * the pre-affiliation flat shape is migrated into a single primary affiliation
 * so an older deployment document keeps working instead of losing every doctor.
 */
function affiliationsFrom(value) {
  if (Array.isArray(value.affiliations)) {
    const affiliations = value.affiliations
      .map((entry, index) => affiliationFromUnknown(entry, index === 0))
      .filter((entry) => entry !== null);
    if (affiliations.length > 0) {
      const hasPrimary = affiliations.some((entry) => entry.primary);
      return hasPrimary
        ? affiliations
        : affiliations.map((entry, index) => {
          const copy = Object.assign({}, entry);
          copy.primary = index === 0;
          return copy;
        });
    }
  }
  const legacyHospital = trimText(value.hospital, 120);
  if (!legacyHospital) return [];
  const legacy = affiliationFromUnknown(
    {
      organizationId: value.organizationId === undefined || value.organizationId === null
        ? 'org.legacy-directory'
        : value.organizationId,
      hospitalCode: value.hospitalCode === undefined || value.hospitalCode === null ? '' : value.hospitalCode,
      hospitalName: legacyHospital,
      department: value.department,
      title: value.title,
      employmentType: value.employmentType === undefined ? 'full_time' : value.employmentType,
      primary: true,
      acceptingNewPatients: value.acceptingNewPatients,
      availability: value.availability,
      channels: value.channels,
    },
    true,
  );
  return legacy ? [legacy] : [];
}

function doctorFromUnknown(value) {
  if (!value || typeof value !== 'object') return null;
  const id = trimText(value.id, 80);
  const displayName = trimText(value.displayName, 60);
  if (!id || !displayName) return null;
  const affiliations = affiliationsFrom(value);
  if (affiliations.length === 0) return null;
  const years = typeof value.yearsOfExperience === 'number' ? value.yearsOfExperience : 0;
  return {
    id: id,
    displayName: displayName,
    avatarUrl: avatarUrlFrom(value.avatarUrl),
    specialties: textList(value.specialties, 40),
    languages: textList(value.languages, 20),
    yearsOfExperience: Number.isInteger(years) && years >= 0 && years <= 70 ? years : 0,
    bio: trimText(value.bio, 600),
    verified: value.verified === true,
    affiliations: affiliations,
  };
}

function rosterArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.doctors)) return value.doctors;
  const data = value.data;
  if (data && typeof data === 'object') {
    const item = data.item;
    if (item && Array.isArray(item.doctors)) return item.doctors;
    if (Array.isArray(data.items)) return data.items;
  }
  return [];
}

/**
 * Parses a directory document defensively: a malformed clinician is dropped
 * instead of taking the doctor tab down. Accepts a bare array, a
 * `{ doctors: [] }` document, or a `data.item.doctors` / `data.items` envelope.
 */
function parseDoctorRoster(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return [];
    }
  }
  const seen = [];
  const doctors = [];
  rosterArray(parsed).forEach((entry) => {
    const doctor = doctorFromUnknown(entry);
    if (!doctor || seen.indexOf(doctor.id) >= 0) return;
    seen.push(doctor.id);
    doctors.push(doctor);
  });
  return doctors;
}

function createDoctorRoster(source, doctors) {
  return {
    source: source === 'directory' ? 'directory' : 'catalog',
    doctors: Array.isArray(doctors) ? doctors.slice() : [],
  };
}

/** The affiliation shown first and used for a consultation by default. */
function primaryAffiliation(doctor) {
  const affiliations = (doctor && doctor.affiliations) || [];
  return affiliations.filter((entry) => entry.primary)[0] || affiliations[0] || null;
}

/** One affiliation by organization id, or null when the doctor is not affiliated there. */
function affiliationByOrganization(doctor, organizationId) {
  const affiliations = (doctor && doctor.affiliations) || [];
  return affiliations.filter((entry) => entry.organizationId === organizationId)[0] || null;
}

/** True when the clinician holds at least one part-time engagement. */
function hasPartTimeEngagement(doctor) {
  const affiliations = (doctor && doctor.affiliations) || [];
  return affiliations.some((entry) => entry.employmentType === 'part_time');
}

/** Unique engagement types, ordered by the employment vocabulary. */
function doctorEmploymentTypes(doctor) {
  const affiliations = (doctor && doctor.affiliations) || [];
  return EMPLOYMENT_TYPES.filter(
    (type) => affiliations.some((entry) => entry.employmentType === type),
  );
}

/** One consult channel that can actually be opened at this affiliation, or null. */
function preferredDoctorChannel(affiliation) {
  const channels = (affiliation && affiliation.channels) || [];
  const ranked = ['video', 'messaging', 'phone', 'clinic'];
  for (let index = 0; index < ranked.length; index += 1) {
    const channel = channels.filter(
      (entry) => entry.kind === ranked[index] && typeof entry.target === 'string' && entry.target.trim().length > 0,
    )[0];
    if (channel) return channel;
  }
  return null;
}

/** The label a visit record keeps for a human consultation at one site. */
function doctorRecordLabel(doctor, affiliation) {
  if (!doctor) return '';
  const site = affiliation || primaryAffiliation(doctor);
  return doctor.displayName + (site && site.department ? ' · ' + site.department : '');
}

function parseDoctorSelection(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return { selectedIds: [], primaryId: null };
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return { selectedIds: [], primaryId: null };
    }
  }
  const source = Array.isArray(parsed)
    ? { selectedIds: parsed, primaryId: null }
    : parsed && typeof parsed === 'object'
      ? parsed
      : { selectedIds: [], primaryId: null };
  const selectedIds = [];
  if (Array.isArray(source.selectedIds)) {
    for (let index = 0; index < source.selectedIds.length; index += 1) {
      const raw = source.selectedIds[index];
      if (typeof raw !== 'string') continue;
      const normalized = raw.trim();
      if (!normalized || selectedIds.indexOf(normalized) >= 0) continue;
      if (selectedIds.length >= DOCTOR_SELECTION_LIMIT) break;
      selectedIds.push(normalized);
    }
  }
  const requested = typeof source.primaryId === 'string' ? source.primaryId.trim() : '';
  const primaryId = selectedIds.indexOf(requested) >= 0
    ? requested
    : (selectedIds.length > 0 ? selectedIds[0] : null);
  return { selectedIds: selectedIds, primaryId: primaryId };
}

function serializeDoctorSelection(state) {
  const source = state || { selectedIds: [], primaryId: null };
  return JSON.stringify({
    version: 1,
    selectedIds: Array.isArray(source.selectedIds) ? source.selectedIds : [],
    primaryId: typeof source.primaryId === 'string' ? source.primaryId : null,
  });
}

function defaultSelectionStorage() {
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
 * silently dropping the selection.
 */
function readStored(adapter, key) {
  return adapter.read.length > 0 ? adapter.read(key) : adapter.read();
}

function writeStored(adapter, key, value) {
  if (adapter.write.length >= 2) adapter.write(key, value);
  else adapter.write(value);
}

function sameSelection(left, right) {
  if (left.primaryId !== right.primaryId) return false;
  if (left.selectedIds.length !== right.selectedIds.length) return false;
  return left.selectedIds.every((id, index) => id === right.selectedIds[index]);
}

/**
 * Synchronous selection store over an injected adapter. The first doctor a
 * family selects automatically becomes the primary doctor; removing the
 * primary promotes the next selected doctor instead of leaving a hole.
 */
function createDoctorSelectionStore(storage) {
  const adapter = storage === undefined ? defaultSelectionStorage() : storage;
  let state = null;
  const listeners = [];

  function load() {
    if (state) return state;
    let raw = null;
    if (adapter) {
      try {
        raw = readStored(adapter, DOCTOR_SELECTION_STORAGE_KEY);
      } catch (error) {
        raw = null;
      }
    }
    state = parseDoctorSelection(raw);
    return state;
  }

  function persist() {
    if (!adapter || !state) return;
    try {
      writeStored(adapter, DOCTOR_SELECTION_STORAGE_KEY, serializeDoctorSelection(state));
    } catch (error) {
      // ignore
    }
  }

  function notify() {
    listeners.slice().forEach((listener) => listener());
  }

  function commit(next) {
    const normalized = {
      selectedIds: next.selectedIds.slice(),
      primaryId: next.primaryId,
    };
    const previous = load();
    state = normalized;
    if (!sameSelection(previous, normalized)) {
      persist();
      notify();
    }
    return normalized;
  }

  function normalizedId(doctorId) {
    return typeof doctorId === 'string' ? doctorId.trim() : '';
  }

  const store = {
    state() {
      return load();
    },
    getState() {
      return load();
    },
    isSelected(doctorId) {
      return load().selectedIds.indexOf(normalizedId(doctorId)) >= 0;
    },
    select(doctorId) {
      const id = normalizedId(doctorId);
      const current = load();
      if (!id || current.selectedIds.indexOf(id) >= 0) return current;
      if (current.selectedIds.length >= DOCTOR_SELECTION_LIMIT) return current;
      return commit({
        selectedIds: current.selectedIds.concat([id]),
        primaryId: current.primaryId || id,
      });
    },
    deselect(doctorId) {
      const id = normalizedId(doctorId);
      const current = load();
      if (current.selectedIds.indexOf(id) < 0) return current;
      const selectedIds = current.selectedIds.filter((entry) => entry !== id);
      return commit({
        selectedIds: selectedIds,
        primaryId: current.primaryId === id
          ? (selectedIds.length > 0 ? selectedIds[0] : null)
          : current.primaryId,
      });
    },
    toggle(doctorId) {
      return store.isSelected(doctorId) ? store.deselect(doctorId) : store.select(doctorId);
    },
    setPrimary(doctorId) {
      const id = normalizedId(doctorId);
      const current = load();
      if (!id) return current;
      if (current.selectedIds.indexOf(id) < 0) {
        if (current.selectedIds.length >= DOCTOR_SELECTION_LIMIT) return current;
        return commit({ selectedIds: current.selectedIds.concat([id]), primaryId: id });
      }
      return commit({ selectedIds: current.selectedIds, primaryId: id });
    },
    clear() {
      const current = load();
      if (current.selectedIds.length === 0) return current;
      return commit({ selectedIds: [], primaryId: null });
    },
    /** Drops selected ids that are no longer in the roster. */
    prune(availableIds) {
      const available = [];
      (Array.isArray(availableIds) ? availableIds : []).forEach((id) => {
        const normalized = normalizedId(id);
        if (normalized) available.push(normalized);
      });
      const current = load();
      const selectedIds = current.selectedIds.filter((id) => available.indexOf(id) >= 0);
      if (selectedIds.length === current.selectedIds.length) return current;
      const primaryId = current.primaryId && available.indexOf(current.primaryId) >= 0
        ? current.primaryId
        : (selectedIds.length > 0 ? selectedIds[0] : null);
      return commit({ selectedIds: selectedIds, primaryId: primaryId });
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

/** In-memory selection store for tests and hosts without storage. */
function createMemoryDoctorSelectionStore(initial) {
  return createDoctorSelectionStore({
    read: () => serializeDoctorSelection(initial || { selectedIds: [], primaryId: null }),
    write: () => undefined,
  });
}

/** The family's primary doctor, resolved against the roster that is on screen. */
function resolvePrimaryDoctor(roster, selection) {
  const doctors = (roster && roster.doctors) || [];
  const state = selection || { selectedIds: [], primaryId: null };
  const primary = doctors.filter((doctor) => doctor.id === state.primaryId)[0];
  if (primary) return primary;
  const selectedIds = state.selectedIds || [];
  for (let index = 0; index < selectedIds.length; index += 1) {
    const doctor = doctors.filter((entry) => entry.id === selectedIds[index])[0];
    if (doctor) return doctor;
  }
  return null;
}

/** Selected doctors in selection order, skipping ids that are not in the roster. */
function resolveSelectedDoctors(roster, selection) {
  const doctors = (roster && roster.doctors) || [];
  const selectedIds = (selection && selection.selectedIds) || [];
  const resolved = [];
  selectedIds.forEach((id) => {
    const doctor = doctors.filter((entry) => entry.id === id)[0];
    if (doctor) resolved.push(doctor);
  });
  return resolved;
}

/**
 * The authored fallback roster, used when the deployment has no doctor
 * directory configured or the directory is unreachable. These entries carry
 * `verified: false` and reference demo organizations/hospital codes, so no
 * surface presents them as directory-verified real appointments.
 *
 * Authority for every client: `contracts/doctor-roster.json`. This literal is
 * asserted equal to that file by the mini program doctor tests.
 */
const CATALOG_DOCTORS = [
  {
    id: 'doctor-lin-qinghe',
    displayName: 'Lin Qinghe',
    avatarUrl: 'avatars/doctor-lin-qinghe.png',
    specialties: ['Hypertension', 'Coronary heart disease', 'Arrhythmia'],
    languages: ['zh-CN', 'en-US'],
    yearsOfExperience: 22,
    bio: 'Cardiology lead focused on long-term blood-pressure and coronary care for families.',
    verified: false,
    affiliations: [
      {
        organizationId: 'org-sdkwork-care-network',
        hospitalCode: 'SDKWORK-CARE-001',
        hospitalName: 'SDKWork Care Network',
        hospitalGrade: 'THIRD_A',
        departmentCode: '0304',
        department: 'Cardiology',
        title: 'Chief physician',
        employmentType: 'full_time',
        primary: true,
        acceptingNewPatients: true,
        since: '2011-07',
        availability: [
          { weekday: 1, startTime: '09:00', endTime: '12:00' },
          { weekday: 3, startTime: '14:00', endTime: '17:30' },
          { weekday: 5, startTime: '09:00', endTime: '12:00' },
        ],
        channels: [
          { kind: 'video', target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe' },
          { kind: 'messaging', target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe/messages' },
        ],
      },
      {
        organizationId: 'org-sdkwork-community-clinic',
        hospitalCode: 'SDKWORK-CARE-002',
        hospitalName: 'SDKWork Community Clinic',
        hospitalGrade: 'COMMUNITY',
        departmentCode: '02',
        department: 'General practice',
        title: 'Visiting cardiologist',
        employmentType: 'part_time',
        primary: false,
        acceptingNewPatients: true,
        since: '2023-03',
        availability: [
          { weekday: 6, startTime: '09:00', endTime: '11:30' },
        ],
        channels: [
          { kind: 'video', target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe/clinic' },
        ],
      },
    ],
  },
  {
    id: 'doctor-su-wanning',
    displayName: 'Su Wanning',
    avatarUrl: 'avatars/doctor-su-wanning.png',
    specialties: ['Child fever', 'Childhood asthma', 'Vaccination planning'],
    languages: ['zh-CN'],
    yearsOfExperience: 15,
    bio: 'Pediatrician for infants and school-age children, with a focus on fever triage and asthma.',
    verified: false,
    affiliations: [
      {
        organizationId: 'org-sdkwork-care-network',
        hospitalCode: 'SDKWORK-CARE-001',
        hospitalName: 'SDKWork Care Network',
        hospitalGrade: 'THIRD_A',
        departmentCode: '07',
        department: 'Pediatrics',
        title: 'Associate chief physician',
        employmentType: 'full_time',
        primary: true,
        acceptingNewPatients: true,
        since: '2018-09',
        availability: [
          { weekday: 2, startTime: '08:30', endTime: '12:00' },
          { weekday: 4, startTime: '13:30', endTime: '17:00' },
          { weekday: 6, startTime: '09:00', endTime: '11:30' },
        ],
        channels: [
          { kind: 'video', target: 'https://care.sdkwork.com/consult/doctor-su-wanning' },
          { kind: 'phone', target: 'https://care.sdkwork.com/consult/doctor-su-wanning/phone' },
        ],
      },
    ],
  },
  {
    id: 'doctor-he-zhiyuan',
    displayName: 'He Zhiyuan',
    avatarUrl: 'avatars/doctor-he-zhiyuan.png',
    specialties: ['Respiratory infection', 'Gastroenteritis', 'Chronic disease follow-up'],
    languages: ['zh-CN', 'en-US'],
    yearsOfExperience: 9,
    bio: 'Family physician handling common infections and chronic-disease follow-up for all ages.',
    verified: false,
    affiliations: [
      {
        organizationId: 'org-sdkwork-community-clinic',
        hospitalCode: 'SDKWORK-CARE-002',
        hospitalName: 'SDKWork Community Clinic',
        hospitalGrade: 'COMMUNITY',
        departmentCode: '02',
        department: 'General practice',
        title: 'Attending physician',
        employmentType: 'part_time',
        primary: true,
        acceptingNewPatients: false,
        since: '2024-01',
        availability: [
          { weekday: 1, startTime: '13:30', endTime: '18:00' },
          { weekday: 3, startTime: '08:30', endTime: '12:00' },
          { weekday: 5, startTime: '13:30', endTime: '18:00' },
        ],
        channels: [
          { kind: 'messaging', target: 'https://care.sdkwork.com/consult/doctor-he-zhiyuan/messages' },
          { kind: 'clinic', target: 'https://care.sdkwork.com/consult/doctor-he-zhiyuan/clinic' },
        ],
      },
    ],
  },
];

const CATALOG_DOCTOR_ROSTER = createDoctorRoster('catalog', CATALOG_DOCTORS);

function responseStatus(response) {
  if (!response || typeof response !== 'object') return 0;
  if (typeof response.statusCode === 'number') return response.statusCode;
  if (typeof response.status === 'number') return response.status;
  return 0;
}

function responseBody(response) {
  if (!response || typeof response !== 'object') return null;
  if (response.data !== undefined) return response.data;
  if (response.body !== undefined) return response.body;
  return null;
}

function defaultDirectoryRequest(options) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
      reject(new Error('wx.request is unavailable'));
      return;
    }
    try {
      wx.request({
        url: options.url,
        method: 'GET',
        header: options.header,
        timeout: options.timeout,
        success: (response) => resolve(response),
        fail: (error) => reject(new Error((error && error.errMsg) || 'doctor directory request failed')),
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Builds the roster port for one page load. It never throws: an unreachable or
 * malformed directory falls back to the authored roster so the doctor tab still
 * lists human doctors instead of going blank. `configured` reports whether the
 * deployment bound a directory URL.
 */
function createDoctorDirectoryPort(options) {
  const settings = options || {};
  const url = typeof settings.directoryUrl === 'string' ? settings.directoryUrl.trim() : '';
  const request = settings.request || defaultDirectoryRequest;
  return {
    configured: Boolean(url),
    load() {
      if (!url) return Promise.resolve(CATALOG_DOCTOR_ROSTER);
      return Promise.resolve()
        .then(() => request({
          url: url,
          method: 'GET',
          header: { Accept: 'application/json' },
          timeout: DOCTOR_DIRECTORY_TIMEOUT_MS,
        }))
        .then((response) => {
          const status = responseStatus(response);
          if (status < 200 || status >= 300) return CATALOG_DOCTOR_ROSTER;
          const doctors = parseDoctorRoster(responseBody(response));
          return doctors.length > 0 ? createDoctorRoster('directory', doctors) : CATALOG_DOCTOR_ROSTER;
        })
        .catch(() => CATALOG_DOCTOR_ROSTER);
    },
  };
}

module.exports = {
  DOCTOR_DIRECTORY_KIND,
  DOCTOR_DIRECTORY_TIMEOUT_MS,
  DOCTOR_SELECTION_STORAGE_KEY,
  DOCTOR_SELECTION_LIMIT,
  DOCTOR_EMPLOYMENT_TYPES: EMPLOYMENT_TYPES,
  DOCTOR_CONSULTATION_KINDS: CONSULTATION_KINDS,
  CATALOG_DOCTORS,
  CATALOG_DOCTOR_ROSTER,
  isDoctorEmploymentType,
  isDoctorConsultationKind,
  createDoctorRoster,
  parseDoctorRoster,
  primaryAffiliation,
  affiliationByOrganization,
  hasPartTimeEngagement,
  doctorEmploymentTypes,
  preferredDoctorChannel,
  doctorRecordLabel,
  doctorInitial,
  isRemoteDoctorAvatar,
  resolveDoctorAvatarSrc,
  parseDoctorSelection,
  serializeDoctorSelection,
  createDoctorSelectionStore,
  createMemoryDoctorSelectionStore,
  resolvePrimaryDoctor,
  resolveSelectedDoctors,
  createDoctorDirectoryPort,
};
