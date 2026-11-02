import {
  VISIT_RECORDS_STORAGE_KEY,
  createVisitRecordStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';

/** The tiny slice of `Storage` this adapter needs. */
export interface DoctorBrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): DoctorBrowserStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Private mode or blocked storage: fall back to an in-memory store.
  }
  return null;
}

/**
 * PC visit-record store backed by `localStorage`. A blocked storage API
 * degrades to an in-memory list for the session instead of throwing.
 */
export function createDoctorPcVisitRecordStore(storage: DoctorBrowserStorage | null = browserStorage()): VisitRecordStore {
  if (!storage) return createVisitRecordStore(null);
  return createVisitRecordStore({
    read: () => storage.getItem(VISIT_RECORDS_STORAGE_KEY),
    write: (value) => storage.setItem(VISIT_RECORDS_STORAGE_KEY, value),
  });
}
