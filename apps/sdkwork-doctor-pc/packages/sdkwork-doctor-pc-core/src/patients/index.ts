import { createPatientProfileStore, PATIENT_PROFILES_STORAGE_KEY, type PatientProfileStore } from '@sdkwork/doctor-common-doctor';

import { resolveDoctorBrowserStorage, type DoctorBrowserStorage } from '../storage';

/** PC patient-file store backed by `localStorage`. */
export function createDoctorPcPatientProfileStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): PatientProfileStore {
  if (!storage) return createPatientProfileStore(null);
  return createPatientProfileStore({
    read: () => storage.getItem(PATIENT_PROFILES_STORAGE_KEY),
    write: (value) => storage.setItem(PATIENT_PROFILES_STORAGE_KEY, value),
  });
}
