export interface DoctorSession {
  readonly subject: string;
  readonly authenticated: boolean;
  /**
   * IAM/appbase access token for outbound app API calls, or null before
   * sign-in. Feature packages never read this: the core package passes it to
   * the transport port.
   */
  readonly accessToken: string | null;
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
  const session: DoctorSession = Object.freeze({ subject: 'anonymous', authenticated: false, accessToken: null });
  return Object.freeze({
    current: () => session,
    subscribe: () => () => undefined,
  });
}
