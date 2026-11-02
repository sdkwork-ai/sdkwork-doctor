/**
 * Human-doctor directory and selection.
 *
 * A doctor is a **person**; employment is a **relationship** to a healthcare
 * organization. The two are modelled separately:
 *
 * - `DoctorProfile` carries person facts only (who the clinician is).
 * - `DoctorAffiliation` carries one employment/practice relationship: the
 *   employing organization, its hospital reference, the department and rank at
 *   that site, whether the engagement is full-time or part-time, and the
 *   consulting hours and channels that belong to that site.
 *
 * A clinician may be affiliated with more than one organization (a hospital
 * appointment plus a community-clinic session), and the household may consult
 * the same person at either site.
 *
 * Organizational authority: SDKWork Appbase. `organizationId` is the appbase
 * organization unit that employs or contracts the clinician, and `hospitalCode`
 * is the natural key of an Appbase `med_hospital` reference row. `sdkwork-company`
 * is the enterprise/recruitment center, not the clinical employer; an
 * affiliation may name a `companyId` only for the commercial contract that sits
 * beside the clinical relationship.
 *
 * The roster is deployment content: a deployment binds a doctor-directory
 * document through `careDoctorDirectoryUrl`, and the authored
 * `contracts/doctor-roster.json` is the fallback used when no directory is
 * reachable. Selection is device-local.
 */

/** How a clinician is engaged by one organization. */
export type DoctorEmploymentType = 'full_time' | 'part_time' | 'contract' | 'visiting';

/** How a human doctor can be consulted. */
export type DoctorConsultationKind = 'video' | 'phone' | 'messaging' | 'clinic';

/** One consult channel. `target` is a URL, `tel:` link, or channel id; empty means unavailable. */
export interface DoctorConsultationChannel {
  readonly kind: DoctorConsultationKind;
  readonly target: string;
}

/** Weekly consulting window at one affiliation, in the site's local time. `weekday` 0 = Sunday. */
export interface DoctorAvailabilitySlot {
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
}

/**
 * One employment / practice relationship between a clinician and a healthcare
 * organization. This is where site facts live: hospital, department, rank,
 * engagement type, consulting hours, and channels.
 */
export interface DoctorAffiliation {
  /** Appbase organization unit that employs or contracts the clinician. */
  readonly organizationId: string;
  /** Appbase `med_hospital` natural key (`hospital_code`). */
  readonly hospitalCode: string;
  /** Display name of the site at the time the roster was published. */
  readonly hospitalName: string;
  /** Hospital grade, e.g. `THIRD_A`; empty when the directory does not publish it. */
  readonly hospitalGrade: string;
  /** Appbase `med_department` code when the directory publishes one. */
  readonly departmentCode: string;
  /** Localized department name at this site. */
  readonly department: string;
  /** Clinician rank at this site (chief physician, attending, ...). */
  readonly title: string;
  readonly employmentType: DoctorEmploymentType;
  /** The affiliation shown first and used for a consultation by default. */
  readonly primary: boolean;
  readonly acceptingNewPatients: boolean;
  readonly availability: readonly DoctorAvailabilitySlot[];
  readonly channels: readonly DoctorConsultationChannel[];
  /** ISO year-month the engagement started, e.g. `2019-06`. */
  readonly since: string;
}

/** One human clinician in the family's roster. Person facts only. */
export interface DoctorProfile {
  readonly id: string;
  readonly displayName: string;
  readonly specialties: readonly string[];
  readonly languages: readonly string[];
  readonly yearsOfExperience: number;
  readonly bio: string;
  /** True when the deployment's doctor directory vouched for this clinician. */
  readonly verified: boolean;
  readonly affiliations: readonly DoctorAffiliation[];
}

/** Where a roster came from: an operator directory, or the authored fallback. */
export type DoctorRosterSource = 'directory' | 'catalog';

export interface DoctorRoster {
  readonly source: DoctorRosterSource;
  readonly doctors: readonly DoctorProfile[];
}

/**
 * Loads the roster for one surface.
 *
 * `configured` reports whether the deployment bound a doctor-directory URL, so
 * the UI can say which source answered instead of implying a live directory
 * when the authored fallback is in use.
 */
export interface DoctorDirectoryPort {
  readonly configured: boolean;
  readonly load: () => Promise<DoctorRoster>;
}

/** Machine kind of the deployment document this module consumes. */
export const DOCTOR_DIRECTORY_KIND = 'sdkwork.doctor.doctor-roster';

/** Storage key shared by every browser surface. */
export const DOCTOR_SELECTION_STORAGE_KEY = 'sdkwork.doctor.doctor-selection.v1';

/** A household may keep this many doctors selected. */
export const DOCTOR_SELECTION_LIMIT = 5;

const EMPLOYMENT_TYPES: readonly DoctorEmploymentType[] = Object.freeze(['full_time', 'part_time', 'contract', 'visiting']);
const CONSULTATION_KINDS: readonly DoctorConsultationKind[] = Object.freeze(['video', 'phone', 'messaging', 'clinic']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

export function isDoctorEmploymentType(value: unknown): value is DoctorEmploymentType {
  return typeof value === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export function isDoctorConsultationKind(value: unknown): value is DoctorConsultationKind {
  return typeof value === 'string' && (CONSULTATION_KINDS as readonly string[]).includes(value);
}

function textList(value: unknown, maxLength: number): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]) as readonly string[];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, maxLength);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    entries.push(text);
  }
  return Object.freeze(entries) as readonly string[];
}

function requiredText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function channelsFrom(value: unknown): readonly DoctorConsultationChannel[] {
  if (!Array.isArray(value)) return Object.freeze([]) as readonly DoctorConsultationChannel[];
  const channels: DoctorConsultationChannel[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as { kind?: unknown; target?: unknown };
    if (!isDoctorConsultationKind(candidate.kind)) continue;
    channels.push(Object.freeze({
      kind: candidate.kind,
      target: typeof candidate.target === 'string' ? candidate.target.trim().slice(0, 500) : '',
    }));
  }
  return Object.freeze(channels) as readonly DoctorConsultationChannel[];
}

function availabilityFrom(value: unknown): readonly DoctorAvailabilitySlot[] {
  if (!Array.isArray(value)) return Object.freeze([]) as readonly DoctorAvailabilitySlot[];
  const slots: DoctorAvailabilitySlot[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as { weekday?: unknown; startTime?: unknown; endTime?: unknown };
    const weekday = typeof candidate.weekday === 'number' ? candidate.weekday : -1;
    const startTime = typeof candidate.startTime === 'string' ? candidate.startTime.trim() : '';
    const endTime = typeof candidate.endTime === 'string' ? candidate.endTime.trim() : '';
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!TIME.test(startTime) || !TIME.test(endTime) || startTime >= endTime) continue;
    slots.push(Object.freeze({ weekday, startTime, endTime }));
  }
  return Object.freeze(slots) as readonly DoctorAvailabilitySlot[];
}

function affiliationFromUnknown(value: unknown, fallbackPrimary: boolean): DoctorAffiliation | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const organizationId = requiredText(candidate.organizationId, 80);
  const hospitalName = requiredText(candidate.hospitalName, 120);
  if (!organizationId || !hospitalName) return null;
  const since = typeof candidate.since === 'string' && YEAR_MONTH.test(candidate.since.trim()) ? candidate.since.trim() : '';
  return Object.freeze({
    organizationId,
    hospitalCode: requiredText(candidate.hospitalCode, 60),
    hospitalName,
    hospitalGrade: requiredText(candidate.hospitalGrade, 40),
    departmentCode: requiredText(candidate.departmentCode, 20),
    department: requiredText(candidate.department, 60),
    title: requiredText(candidate.title, 60),
    employmentType: isDoctorEmploymentType(candidate.employmentType) ? candidate.employmentType : 'full_time',
    primary: candidate.primary === true || (fallbackPrimary && candidate.primary !== false),
    acceptingNewPatients: candidate.acceptingNewPatients !== false,
    availability: availabilityFrom(candidate.availability),
    channels: channelsFrom(candidate.channels),
    since,
  });
}

/**
 * Reads the affiliations of one clinician. A directory document that still uses
 * the pre-affiliation flat shape is migrated into a single primary affiliation
 * so an older deployment document keeps working instead of losing every doctor.
 */
function affiliationsFrom(value: Record<string, unknown>): readonly DoctorAffiliation[] {
  if (Array.isArray(value.affiliations)) {
    const affiliations = value.affiliations
      .map((entry, index) => affiliationFromUnknown(entry, index === 0))
      .filter((entry): entry is DoctorAffiliation => entry !== null);
    if (affiliations.length > 0) {
      const hasPrimary = affiliations.some((entry) => entry.primary);
      return Object.freeze(
        hasPrimary ? affiliations : affiliations.map((entry, index) => Object.freeze({ ...entry, primary: index === 0 })),
      ) as readonly DoctorAffiliation[];
    }
  }
  const legacyHospital = requiredText(value.hospital, 120);
  if (!legacyHospital) return Object.freeze([]) as readonly DoctorAffiliation[];
  const legacy = affiliationFromUnknown(
    {
      organizationId: value.organizationId ?? 'org.legacy-directory',
      hospitalCode: value.hospitalCode ?? '',
      hospitalName: legacyHospital,
      department: value.department,
      title: value.title,
      employmentType: value.employmentType ?? 'full_time',
      primary: true,
      acceptingNewPatients: value.acceptingNewPatients,
      availability: value.availability,
      channels: value.channels,
    },
    true,
  );
  return legacy ? (Object.freeze([legacy]) as readonly DoctorAffiliation[]) : (Object.freeze([]) as readonly DoctorAffiliation[]);
}

function doctorFromUnknown(value: unknown): DoctorProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const id = requiredText(candidate.id, 80);
  const displayName = requiredText(candidate.displayName, 60);
  if (!id || !displayName) return null;
  const affiliations = affiliationsFrom(candidate);
  if (affiliations.length === 0) return null;
  const years = typeof candidate.yearsOfExperience === 'number' ? candidate.yearsOfExperience : 0;
  return Object.freeze({
    id,
    displayName,
    specialties: textList(candidate.specialties, 40),
    languages: textList(candidate.languages, 20),
    yearsOfExperience: Number.isInteger(years) && years >= 0 && years <= 70 ? years : 0,
    bio: requiredText(candidate.bio, 600),
    verified: candidate.verified === true,
    affiliations,
  });
}

function rosterArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object' || value === null) return [];
  const candidate = value as { doctors?: unknown; data?: unknown };
  if (Array.isArray(candidate.doctors)) return candidate.doctors;
  const data = candidate.data as { item?: unknown; items?: unknown } | undefined;
  if (data && typeof data === 'object') {
    const item = data.item as { doctors?: unknown } | undefined;
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
export function parseDoctorRoster(value: unknown): readonly DoctorProfile[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return Object.freeze([]) as readonly DoctorProfile[];
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return Object.freeze([]) as readonly DoctorProfile[];
    }
  }
  const seen = new Set<string>();
  const doctors: DoctorProfile[] = [];
  for (const entry of rosterArray(parsed)) {
    const doctor = doctorFromUnknown(entry);
    if (!doctor || seen.has(doctor.id)) continue;
    seen.add(doctor.id);
    doctors.push(doctor);
  }
  return Object.freeze(doctors) as readonly DoctorProfile[];
}

export function createDoctorRoster(source: DoctorRosterSource, doctors: readonly DoctorProfile[]): DoctorRoster {
  return Object.freeze({ source, doctors: Object.freeze([...doctors]) as readonly DoctorProfile[] });
}

/** The affiliation shown first and used for a consultation by default. */
export function primaryAffiliation(doctor: DoctorProfile): DoctorAffiliation | null {
  return doctor.affiliations.find((entry) => entry.primary) ?? doctor.affiliations[0] ?? null;
}

/** One affiliation by organization id, or null when the doctor is not affiliated there. */
export function affiliationByOrganization(doctor: DoctorProfile, organizationId: string): DoctorAffiliation | null {
  return doctor.affiliations.find((entry) => entry.organizationId === organizationId) ?? null;
}

/** True when the clinician holds at least one part-time engagement. */
export function hasPartTimeEngagement(doctor: DoctorProfile): boolean {
  return doctor.affiliations.some((entry) => entry.employmentType === 'part_time');
}

/** Unique engagement types, ordered by the employment vocabulary. */
export function doctorEmploymentTypes(doctor: DoctorProfile): readonly DoctorEmploymentType[] {
  return Object.freeze(EMPLOYMENT_TYPES.filter((type) => doctor.affiliations.some((entry) => entry.employmentType === type)));
}

/** One consult channel that can actually be opened at this affiliation, or null. */
export function preferredDoctorChannel(
  affiliation: DoctorAffiliation | null | undefined,
): DoctorConsultationChannel | null {
  if (!affiliation) return null;
  for (const kind of ['video', 'messaging', 'phone', 'clinic'] as const) {
    const channel = affiliation.channels.find((entry) => entry.kind === kind && entry.target.trim().length > 0);
    if (channel) return channel;
  }
  return null;
}

export interface DoctorSelectionState {
  readonly selectedIds: readonly string[];
  readonly primaryId: string | null;
}

/** Parses a persisted selection; primary must be one of the selected ids. */
export function parseDoctorSelection(value: unknown): DoctorSelectionState {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return Object.freeze({ selectedIds: Object.freeze([]) as readonly string[], primaryId: null });
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return Object.freeze({ selectedIds: Object.freeze([]) as readonly string[], primaryId: null });
    }
  }
  const source = Array.isArray(parsed)
    ? { selectedIds: parsed, primaryId: null as unknown }
    : typeof parsed === 'object' && parsed !== null
      ? (parsed as { selectedIds?: unknown; primaryId?: unknown })
      : { selectedIds: [], primaryId: null as unknown };
  const selectedIds: string[] = [];
  if (Array.isArray(source.selectedIds)) {
    for (const id of source.selectedIds) {
      if (typeof id !== 'string') continue;
      const normalized = id.trim();
      if (!normalized || selectedIds.includes(normalized)) continue;
      if (selectedIds.length >= DOCTOR_SELECTION_LIMIT) break;
      selectedIds.push(normalized);
    }
  }
  const requested = typeof source.primaryId === 'string' ? source.primaryId.trim() : '';
  const primaryId = selectedIds.includes(requested) ? requested : selectedIds[0] ?? null;
  return Object.freeze({ selectedIds: Object.freeze(selectedIds) as readonly string[], primaryId });
}

export function serializeDoctorSelection(state: DoctorSelectionState): string {
  return JSON.stringify({ version: 1, selectedIds: state.selectedIds, primaryId: state.primaryId });
}

export interface DoctorSelectionStorageAdapter {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

export interface DoctorSelectionStore {
  readonly state: () => DoctorSelectionState;
  readonly isSelected: (doctorId: string) => boolean;
  readonly select: (doctorId: string) => DoctorSelectionState;
  readonly deselect: (doctorId: string) => DoctorSelectionState;
  readonly toggle: (doctorId: string) => DoctorSelectionState;
  readonly setPrimary: (doctorId: string) => DoctorSelectionState;
  readonly clear: () => DoctorSelectionState;
  /** Drops selected ids that are no longer in the roster. */
  readonly prune: (availableIds: readonly string[]) => DoctorSelectionState;
  readonly subscribe: (listener: () => void) => () => void;
}

function sameSelection(left: DoctorSelectionState, right: DoctorSelectionState): boolean {
  return left.primaryId === right.primaryId
    && left.selectedIds.length === right.selectedIds.length
    && left.selectedIds.every((id, index) => id === right.selectedIds[index]);
}

/**
 * Synchronous selection store over an injected adapter. The first doctor a
 * family selects automatically becomes the primary doctor; removing the
 * primary promotes the next selected doctor instead of leaving a hole.
 */
export function createDoctorSelectionStore(adapter: DoctorSelectionStorageAdapter | null): DoctorSelectionStore {
  let state: DoctorSelectionState | null = null;
  const listeners = new Set<() => void>();

  function load(): DoctorSelectionState {
    if (state) return state;
    let raw: string | null = null;
    if (adapter) {
      try {
        raw = adapter.read();
      } catch {
        raw = null;
      }
    }
    state = parseDoctorSelection(raw);
    return state;
  }

  function persist(): void {
    if (!adapter || !state) return;
    try {
      adapter.write(serializeDoctorSelection(state));
    } catch {
      // Quota or private mode: keep the session copy.
    }
  }

  function commit(next: DoctorSelectionState): DoctorSelectionState {
    const normalized = Object.freeze({
      selectedIds: Object.freeze([...next.selectedIds]) as readonly string[],
      primaryId: next.primaryId,
    });
    const previous = load();
    state = normalized;
    if (!sameSelection(previous, normalized)) {
      persist();
      for (const listener of listeners) listener();
    }
    return normalized;
  }

  function normalizedId(doctorId: string): string {
    return typeof doctorId === 'string' ? doctorId.trim() : '';
  }

  const store: DoctorSelectionStore = {
    state: () => load(),
    isSelected: (doctorId: string) => load().selectedIds.includes(normalizedId(doctorId)),
    select: (doctorId: string) => {
      const id = normalizedId(doctorId);
      const current = load();
      if (!id || current.selectedIds.includes(id)) return current;
      if (current.selectedIds.length >= DOCTOR_SELECTION_LIMIT) return current;
      return commit({ selectedIds: [...current.selectedIds, id], primaryId: current.primaryId ?? id });
    },
    deselect: (doctorId: string) => {
      const id = normalizedId(doctorId);
      const current = load();
      if (!current.selectedIds.includes(id)) return current;
      const selectedIds = current.selectedIds.filter((entry) => entry !== id);
      return commit({ selectedIds, primaryId: current.primaryId === id ? selectedIds[0] ?? null : current.primaryId });
    },
    toggle: (doctorId: string) => (store.isSelected(doctorId) ? store.deselect(doctorId) : store.select(doctorId)),
    setPrimary: (doctorId: string) => {
      const id = normalizedId(doctorId);
      const current = load();
      if (!id) return current;
      if (!current.selectedIds.includes(id)) {
        if (current.selectedIds.length >= DOCTOR_SELECTION_LIMIT) return current;
        return commit({ selectedIds: [...current.selectedIds, id], primaryId: id });
      }
      return commit({ selectedIds: current.selectedIds, primaryId: id });
    },
    clear: () => {
      const current = load();
      if (current.selectedIds.length === 0) return current;
      return commit({ selectedIds: [], primaryId: null });
    },
    prune: (availableIds: readonly string[]) => {
      const available = new Set(availableIds.map((id) => normalizedId(id)).filter(Boolean));
      const current = load();
      const selectedIds = current.selectedIds.filter((id) => available.has(id));
      if (selectedIds.length === current.selectedIds.length) return current;
      return commit({
        selectedIds,
        primaryId: current.primaryId && available.has(current.primaryId) ? current.primaryId : selectedIds[0] ?? null,
      });
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return Object.freeze(store);
}

/** In-memory selection store for tests and hosts without storage. */
export function createMemoryDoctorSelectionStore(initial?: DoctorSelectionState): DoctorSelectionStore {
  return createDoctorSelectionStore({
    read: () => serializeDoctorSelection(initial ?? { selectedIds: [], primaryId: null }),
    write: () => undefined,
  });
}

/** The family's primary doctor, resolved against the roster that is on screen. */
export function resolvePrimaryDoctor(roster: DoctorRoster, selection: DoctorSelectionState): DoctorProfile | null {
  const primary = roster.doctors.find((doctor) => doctor.id === selection.primaryId);
  if (primary) return primary;
  for (const id of selection.selectedIds) {
    const doctor = roster.doctors.find((entry) => entry.id === id);
    if (doctor) return doctor;
  }
  return null;
}

/** Selected doctors in selection order, skipping ids that are not in the roster. */
export function resolveSelectedDoctors(roster: DoctorRoster, selection: DoctorSelectionState): readonly DoctorProfile[] {
  const resolved: DoctorProfile[] = [];
  for (const id of selection.selectedIds) {
    const doctor = roster.doctors.find((entry) => entry.id === id);
    if (doctor) resolved.push(doctor);
  }
  return Object.freeze(resolved) as readonly DoctorProfile[];
}

function affiliation(
  value: Omit<DoctorAffiliation, 'hospitalGrade' | 'departmentCode' | 'since' | 'primary' | 'acceptingNewPatients'> &
    Partial<Pick<DoctorAffiliation, 'hospitalGrade' | 'departmentCode' | 'since' | 'primary' | 'acceptingNewPatients'>>,
): DoctorAffiliation {
  return Object.freeze({
    hospitalGrade: '',
    departmentCode: '',
    since: '',
    primary: false,
    acceptingNewPatients: true,
    ...value,
  });
}

/**
 * The authored fallback roster, used when the deployment has no doctor
 * directory configured or the directory is unreachable. These entries carry
 * `verified: false` and reference demo organizations/hospital codes, so no
 * surface presents them as directory-verified real appointments.
 *
 * Authority for every client: `contracts/doctor-roster.json`. This literal is
 * asserted equal to that file by `tests/doctor-directory.test.mjs`.
 */
export const CATALOG_DOCTOR_ROSTER: DoctorRoster = createDoctorRoster('catalog', [
  Object.freeze({
    id: 'doctor-lin-qinghe',
    displayName: 'Lin Qinghe',
    specialties: Object.freeze(['Hypertension', 'Coronary heart disease', 'Arrhythmia']),
    languages: Object.freeze(['zh-CN', 'en-US']),
    yearsOfExperience: 22,
    bio: 'Cardiology lead focused on long-term blood-pressure and coronary care for families.',
    verified: false,
    affiliations: Object.freeze([
      affiliation({
        organizationId: 'org-sdkwork-care-network',
        hospitalCode: 'SDKWORK-CARE-001',
        hospitalName: 'SDKWork Care Network',
        hospitalGrade: 'THIRD_A',
        departmentCode: '0304',
        department: 'Cardiology',
        title: 'Chief physician',
        employmentType: 'full_time',
        primary: true,
        since: '2011-07',
        availability: Object.freeze([
          Object.freeze({ weekday: 1, startTime: '09:00', endTime: '12:00' }),
          Object.freeze({ weekday: 3, startTime: '14:00', endTime: '17:30' }),
          Object.freeze({ weekday: 5, startTime: '09:00', endTime: '12:00' }),
        ]),
        channels: Object.freeze([
          Object.freeze({ kind: 'video' as const, target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe' }),
          Object.freeze({ kind: 'messaging' as const, target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe/messages' }),
        ]),
      }),
      affiliation({
        organizationId: 'org-sdkwork-community-clinic',
        hospitalCode: 'SDKWORK-CARE-002',
        hospitalName: 'SDKWork Community Clinic',
        hospitalGrade: 'COMMUNITY',
        departmentCode: '02',
        department: 'General practice',
        title: 'Visiting cardiologist',
        employmentType: 'part_time',
        since: '2023-03',
        availability: Object.freeze([
          Object.freeze({ weekday: 6, startTime: '09:00', endTime: '11:30' }),
        ]),
        channels: Object.freeze([
          Object.freeze({ kind: 'video' as const, target: 'https://care.sdkwork.com/consult/doctor-lin-qinghe/clinic' }),
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: 'doctor-su-wanning',
    displayName: 'Su Wanning',
    specialties: Object.freeze(['Child fever', 'Childhood asthma', 'Vaccination planning']),
    languages: Object.freeze(['zh-CN']),
    yearsOfExperience: 15,
    bio: 'Pediatrician for infants and school-age children, with a focus on fever triage and asthma.',
    verified: false,
    affiliations: Object.freeze([
      affiliation({
        organizationId: 'org-sdkwork-care-network',
        hospitalCode: 'SDKWORK-CARE-001',
        hospitalName: 'SDKWork Care Network',
        hospitalGrade: 'THIRD_A',
        departmentCode: '07',
        department: 'Pediatrics',
        title: 'Associate chief physician',
        employmentType: 'full_time',
        primary: true,
        since: '2018-09',
        availability: Object.freeze([
          Object.freeze({ weekday: 2, startTime: '08:30', endTime: '12:00' }),
          Object.freeze({ weekday: 4, startTime: '13:30', endTime: '17:00' }),
          Object.freeze({ weekday: 6, startTime: '09:00', endTime: '11:30' }),
        ]),
        channels: Object.freeze([
          Object.freeze({ kind: 'video' as const, target: 'https://care.sdkwork.com/consult/doctor-su-wanning' }),
          Object.freeze({ kind: 'phone' as const, target: 'https://care.sdkwork.com/consult/doctor-su-wanning/phone' }),
        ]),
      }),
    ]),
  }),
  Object.freeze({
    id: 'doctor-he-zhiyuan',
    displayName: 'He Zhiyuan',
    specialties: Object.freeze(['Respiratory infection', 'Gastroenteritis', 'Chronic disease follow-up']),
    languages: Object.freeze(['zh-CN', 'en-US']),
    yearsOfExperience: 9,
    bio: 'Family physician handling common infections and chronic-disease follow-up for all ages.',
    verified: false,
    affiliations: Object.freeze([
      affiliation({
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
        availability: Object.freeze([
          Object.freeze({ weekday: 1, startTime: '13:30', endTime: '18:00' }),
          Object.freeze({ weekday: 3, startTime: '08:30', endTime: '12:00' }),
          Object.freeze({ weekday: 5, startTime: '13:30', endTime: '18:00' }),
        ]),
        channels: Object.freeze([
          Object.freeze({ kind: 'messaging' as const, target: 'https://care.sdkwork.com/consult/doctor-he-zhiyuan/messages' }),
          Object.freeze({ kind: 'clinic' as const, target: 'https://care.sdkwork.com/consult/doctor-he-zhiyuan/clinic' }),
        ]),
      }),
    ]),
  }),
]);
