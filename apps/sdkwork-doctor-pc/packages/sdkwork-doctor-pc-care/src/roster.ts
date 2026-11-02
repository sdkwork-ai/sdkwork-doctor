import { useCallback, useEffect, useState } from 'react';
import type { CareAgentCatalogPort, CareAgentSummary } from '@sdkwork/doctor-common-agent';
import type { DoctorDirectoryPort, DoctorRoster } from '@sdkwork/doctor-common-doctor';

export interface DoctorRosterState {
  readonly roster: DoctorRoster | null;
  readonly loading: boolean;
  readonly configured: boolean;
  readonly reload: () => void;
}

/**
 * Loads the deployment doctor roster once per mount. The directory port never
 * throws (it falls back to the authored roster), so a network problem shows the
 * fallback source instead of an empty doctor tab.
 */
export function useDoctorRoster(port: DoctorDirectoryPort): DoctorRosterState {
  const [roster, setRoster] = useState<DoctorRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void port.load().then((value) => {
      if (!active) return;
      setRoster(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [port, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { roster, loading, configured: port.configured, reload };
}

export interface CareAgentCatalogState {
  readonly agents: readonly CareAgentSummary[];
  readonly loading: boolean;
}

/**
 * Reads the managed agent catalogue once so the doctor tab can show whether the
 * pinned family-doctor agent exists in this deployment. An offline transport or
 * a failed probe yields an empty catalogue, never an error banner.
 */
export function useCareAgentCatalog(port: CareAgentCatalogPort): CareAgentCatalogState {
  const [agents, setAgents] = useState<readonly CareAgentSummary[]>(Object.freeze([]) as readonly CareAgentSummary[]);
  const [loading, setLoading] = useState(port.mode === 'hosted');

  useEffect(() => {
    let active = true;
    if (port.mode !== 'hosted') {
      setAgents(Object.freeze([]) as readonly CareAgentSummary[]);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void port.list()
      .then((value) => {
        if (!active) return;
        setAgents(value);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [port]);

  return { agents, loading };
}
