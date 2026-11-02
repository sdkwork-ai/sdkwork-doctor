import type { DoctorCheck } from '../types';
import { apiSurfaceCheck } from './api-surface';
import { browserSupportCheck } from './browser-support';
import { clockCheck } from './clock';
import { connectivityCheck } from './connectivity';
import { localeCheck } from './locale';
import { runtimeProfileCheck } from './runtime-profile';
import { secureContextCheck } from './secure-context';
import { storageCheck } from './storage';

/**
 * The default catalog. Order is the run order and the UI order.
 */
export const defaultDoctorChecks: readonly DoctorCheck[] = Object.freeze([
  runtimeProfileCheck,
  browserSupportCheck,
  secureContextCheck,
  storageCheck,
  localeCheck,
  clockCheck,
  apiSurfaceCheck,
  connectivityCheck,
]);

export {
  apiSurfaceCheck,
  browserSupportCheck,
  clockCheck,
  connectivityCheck,
  localeCheck,
  runtimeProfileCheck,
  secureContextCheck,
  storageCheck,
};
