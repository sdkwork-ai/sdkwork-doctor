import type { ReactNode } from 'react';

/**
 * H5 session gate. The scaffold passes through until appbase IAM lands
 * (IAM_LOGIN_INTEGRATION_SPEC.md); the Capacitor host profile never owns auth.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default AuthGate;
