export interface DoctorSession {
  readonly subject: string;
  readonly authenticated: boolean;
}

export interface DoctorSessionPort {
  readonly current: () => DoctorSession;
  readonly subscribe: (listener: (session: DoctorSession) => void) => () => void;
}

/**
 * Placeholder session port for the scaffold.
 *
 * The production app replaces this with the appbase IAM runtime and the global
 * TokenManager (IAM_LOGIN_INTEGRATION_SPEC.md, APP_SDK_INTEGRATION_SPEC.md).
 * Keeping the port here means no feature package has to change when it lands.
 */
export function createAnonymousSessionPort(): DoctorSessionPort {
  const session: DoctorSession = Object.freeze({ subject: 'anonymous', authenticated: false });
  return Object.freeze({
    current: () => session,
    subscribe: () => () => undefined,
  });
}
