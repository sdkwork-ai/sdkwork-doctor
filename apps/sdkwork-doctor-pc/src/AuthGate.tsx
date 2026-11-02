import type { ReactNode } from 'react';

/**
 * Session gate for the PC surface.
 *
 * The scaffold ships an explicit pass-through so the diagnostics surface is
 * inspectable before the sdkwork-iam deployment exists. When appbase IAM is
 * wired (IAM_LOGIN_INTEGRATION_SPEC.md), this component becomes the
 * SdkworkSessionAuthBrowserRoot wrapper and the pass-through is removed.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default AuthGate;
