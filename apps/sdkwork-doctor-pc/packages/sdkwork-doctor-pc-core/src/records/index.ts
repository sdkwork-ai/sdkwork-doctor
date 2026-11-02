import { createVisitRecordStore, VISIT_RECORDS_STORAGE_KEY, type VisitRecordStore } from '@sdkwork/doctor-common-doctor';

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
