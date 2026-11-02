export interface DoctorH5HostAdapter {
  readonly kind: 'browser' | 'capacitor';
  readonly platform: () => string;
  vibrate: (durationMs: number) => boolean;
}

/**
 * Browser host adapter for H5. The Capacitor host package supplies the same
 * contract from `packages/sdkwork-doctor-h5-capacitor` when native packaging is
 * enabled (APP_H5_ARCHITECTURE_SPEC.md section 8).
 */
export function getDoctorH5HostAdapter(): DoctorH5HostAdapter {
  return Object.freeze({
    kind: 'browser' as const,
    platform: () => (typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent),
    vibrate: (durationMs: number) => (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? navigator.vibrate(durationMs) : false),
  });
}
