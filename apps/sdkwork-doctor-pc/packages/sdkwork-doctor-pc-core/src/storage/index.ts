/**
 * The tiny slice of `Storage` the browser surfaces need, resolved once.
 *
 * A blocked storage API (private mode, quota, embedded webview) resolves to
 * null, and every store then degrades to an in-memory session copy instead of
 * throwing during bootstrap.
 */
export interface DoctorBrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function resolveDoctorBrowserStorage(): DoctorBrowserStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Private mode or blocked storage: fall back to an in-memory store.
  }
  return null;
}
