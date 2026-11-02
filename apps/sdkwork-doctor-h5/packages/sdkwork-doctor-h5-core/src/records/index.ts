import {
  VISIT_RECORDS_STORAGE_KEY,
  createVisitRecordStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';

/** The tiny slice of `Storage` this adapter needs. */
export interface DoctorH5Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): DoctorH5Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Private mode or blocked storage: fall back to an in-memory store.
  }
  return null;
}

/** H5 visit-record store backed by `localStorage`, with an in-memory fallback. */
export function createDoctorH5VisitRecordStore(storage: DoctorH5Storage | null = browserStorage()): VisitRecordStore {
  if (!storage) return createVisitRecordStore(null);
  return createVisitRecordStore({
    read: () => storage.getItem(VISIT_RECORDS_STORAGE_KEY),
    write: (value) => storage.setItem(VISIT_RECORDS_STORAGE_KEY, value),
  });
}
