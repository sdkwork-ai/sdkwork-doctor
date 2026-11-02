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
 * Placeholder session port; replaced by the appbase IAM runtime when the
 * sdkwork-iam deployment exists (IAM_LOGIN_INTEGRATION_SPEC.md).
 */
export function createAnonymousSessionPort(): DoctorSessionPort {
  const session: DoctorSession = Object.freeze({ subject: 'anonymous', authenticated: false, accessToken: null });
  return Object.freeze({ current: () => session, subscribe: () => () => undefined });
}
