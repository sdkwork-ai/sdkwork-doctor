/**
 * H5 human-doctor ports: the deployment doctor directory and the device-local
 * selection of family doctors.
 *
 * The directory URL comes from the runtime document (`careDoctorDirectoryUrl`).
 * When it is empty or unreachable the authored fallback roster answers, and the
 * roster's `source` field tells the UI which one it is showing.
 */
import {
  CATALOG_DOCTOR_ROSTER,
  DOCTOR_SELECTION_STORAGE_KEY,
  createDoctorRoster,
  createDoctorSelectionStore,
  parseDoctorRoster,
  type DoctorDirectoryPort,
  type DoctorRoster,
  type DoctorSelectionStore,
} from '@sdkwork/doctor-common-doctor';

import { resolveDoctorBrowserStorage, type DoctorBrowserStorage } from '../storage';

/** Minimal GET response surface so tests can inject a fetch double. */
export interface DoctorDirectoryResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type DoctorDirectoryFetch = (
  url: string,
  init: { readonly method: 'GET'; readonly headers: Readonly<Record<string, string>>; readonly cache?: 'no-store' },
) => Promise<DoctorDirectoryResponse>;

export interface CreateDoctorDirectoryPortOptions {
  /** Deployment directory document URL; empty means "use the authored roster". */
  readonly directoryUrl: string;
  readonly fetchImpl?: DoctorDirectoryFetch;
}

function defaultFetch(): DoctorDirectoryFetch {
  return (url, init) => fetch(url, init);
}

/**
 * Builds the roster port for this page load. It never throws: an unreachable
 * or malformed directory falls back to the authored roster so the doctor tab
 * still lists human doctors instead of going blank.
 */
export function createDoctorH5DoctorDirectoryPort(options: CreateDoctorDirectoryPortOptions): DoctorDirectoryPort {
  const url = (options.directoryUrl ?? '').trim();
  if (!url) {
    return Object.freeze({
      configured: false,
      load: async () => CATALOG_DOCTOR_ROSTER,
    });
  }
  const httpGet = options.fetchImpl ?? defaultFetch();
  return Object.freeze({
    configured: true,
    load: async (): Promise<DoctorRoster> => {
      try {
        const response = await httpGet(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) return CATALOG_DOCTOR_ROSTER;
        const doctors = parseDoctorRoster(await response.text());
        return doctors.length > 0 ? createDoctorRoster('directory', doctors) : CATALOG_DOCTOR_ROSTER;
      } catch {
        return CATALOG_DOCTOR_ROSTER;
      }
    },
  });
}

/** H5 selection store backed by `localStorage`. */
export function createDoctorH5DoctorSelectionStore(
  storage: DoctorBrowserStorage | null = resolveDoctorBrowserStorage(),
): DoctorSelectionStore {
  if (!storage) return createDoctorSelectionStore(null);
  return createDoctorSelectionStore({
    read: () => storage.getItem(DOCTOR_SELECTION_STORAGE_KEY),
    write: (value) => storage.setItem(DOCTOR_SELECTION_STORAGE_KEY, value),
  });
}
