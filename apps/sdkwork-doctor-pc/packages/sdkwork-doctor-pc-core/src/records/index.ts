import {
  CARE_SESSION_READS_STORAGE_KEY,
  CARE_SESSIONS_STORAGE_KEY,
  createBrowserMedicalAttachmentStore,
  createCareSessionReadStore,
  createCareSessionStore,
  createMedicalRecordStore,
  createVisitRecordStore,
  MEDICAL_RECORDS_STORAGE_KEY,
  VISIT_RECORDS_STORAGE_KEY,
  type CareSessionReadStore,
  type CareSessionStore,
  type MedicalAttachmentStore,
  type MedicalRecordStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';

import { resolveDoctorBrowserStorage, type DoctorBrowserStorage } from '../storage';

export type { DoctorBrowserStorage } from '../storage';

/**
 * PC visit-record store backed by `localStorage`. A blocked storage API
 * degrades to an in-memory list for the session instead of throwing.
 */
export function createDoctorPcVisitRecordStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): VisitRecordStore {
  if (!storage) return createVisitRecordStore(null);
  return createVisitRecordStore({
    read: () => storage.getItem(VISIT_RECORDS_STORAGE_KEY),
    write: (value) => storage.setItem(VISIT_RECORDS_STORAGE_KEY, value),
  });
}

/** 病历 store: the ended conversations and their AI/doctor diagnoses. */
export function createDoctorPcMedicalRecordStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): MedicalRecordStore {
  if (!storage) return createMedicalRecordStore(null);
  return createMedicalRecordStore({
    read: () => storage.getItem(MEDICAL_RECORDS_STORAGE_KEY),
    write: (value) => storage.setItem(MEDICAL_RECORDS_STORAGE_KEY, value),
  });
}

/** Attachment bytes live in IndexedDB, not in the small localStorage quota. */
export function createDoctorPcMedicalAttachmentStore(): MedicalAttachmentStore {
  return createBrowserMedicalAttachmentStore();
}

/**
 * 看病记录 store: one conversation session per visit, including the session
 * that is still open. The records tab lists these; the detail page joins the
 * session with the 病历 it produced.
 */
export function createDoctorPcCareSessionStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): CareSessionStore {
  if (!storage) return createCareSessionStore(null);
  return createCareSessionStore({
    read: () => storage.getItem(CARE_SESSIONS_STORAGE_KEY),
    write: (value) => storage.setItem(CARE_SESSIONS_STORAGE_KEY, value),
  });
}

/**
 * Per-session read marks for the conversation list. They live under their own
 * key so opening a conversation never rewrites the clinical session record.
 */
export function createDoctorPcCareSessionReadStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): CareSessionReadStore {
  if (!storage) return createCareSessionReadStore(null);
  return createCareSessionReadStore({
    read: () => storage.getItem(CARE_SESSION_READS_STORAGE_KEY),
    write: (value) => storage.setItem(CARE_SESSION_READS_STORAGE_KEY, value),
  });
}
