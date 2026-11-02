export interface DoctorPcHostAdapter {
  readonly kind: 'browser';
  readonly platform: () => string;
  copyText: (value: string) => Promise<boolean>;
  openExternal: (url: string) => boolean;
}

function detectPlatform(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }
  return navigator.userAgent;
}

/**
 * Browser host adapter. A future Tauri/Electron host package supplies the same
 * contract from `src-tauri` or `src-electron` without changing feature code
 * (DESKTOP_APP_ARCHITECTURE_SPEC.md).
 */
export function getDoctorPcHostAdapter(): DoctorPcHostAdapter {
  return Object.freeze({
    kind: 'browser' as const,
    platform: detectPlatform,
    async copyText(value: string): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        return false;
      }
    },
    openExternal(url: string): boolean {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
  });
}
