import { useCallback, useEffect, useRef, useState } from 'react';
import type { DoctorReport, DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';

import { runPcDiagnostics } from '../services/diagnosticsService';

export interface DiagnosticsReportState {
  readonly report: DoctorReport | null;
  readonly running: boolean;
  readonly error: string | null;
  readonly run: () => void;
}

export function useDiagnosticsReport(context: DoctorRuntimeContext): DiagnosticsReportState {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disposed = useRef(false);

  const run = useCallback(() => {
    setRunning(true);
    setError(null);
    void runPcDiagnostics(context)
      .then((next) => {
        if (!disposed.current) setReport(next);
      })
      .catch((reason: unknown) => {
        if (!disposed.current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!disposed.current) setRunning(false);
      });
  }, [context]);

  useEffect(() => {
    disposed.current = false;
    run();
    return () => {
      disposed.current = true;
    };
  }, [run]);

  return { report, running, error, run };
}
