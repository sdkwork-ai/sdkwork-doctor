export interface DoctorSession {
  readonly subject: string;
  readonly authenticated: boolean;
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
  const session: DoctorSession = Object.freeze({ subject: 'anonymous', authenticated: false });
  return Object.freeze({ current: () => session, subscribe: () => () => undefined });
}
