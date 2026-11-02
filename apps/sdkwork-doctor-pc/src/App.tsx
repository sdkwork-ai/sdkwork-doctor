import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { DoctorPcRoutes, DOCTOR_PC_HOME_PATH } from '@sdkwork/doctor-pc-shell';

import { AuthGate } from './AuthGate';
import { initDoctorPcI18n } from './bootstrap/i18n';
import { bootstrapDoctorPc, type DoctorPcRuntime } from './bootstrap/runtime';

import './index.css';

initDoctorPcI18n();

export default function App() {
  const [runtime, setRuntime] = useState<DoctorPcRuntime | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void bootstrapDoctorPc().then((value) => {
      if (active) setRuntime(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!runtime) {
    return <div className="doctor-main">{t('platform.diagnostics.action.loading')}</div>;
  }

  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Navigate replace to={DOCTOR_PC_HOME_PATH} />} />
          <Route
            path="/doctor/*"
            element={(
              <DoctorPcRoutes
                agent={runtime.agent}
                agentCatalog={runtime.agentCatalog}
                blocks={runtime.blocks}
                doctorDirectory={runtime.doctorDirectory}
                hostLabel={runtime.environment.deploymentProfile}
                patients={runtime.patients}
                records={runtime.records}
                runtime={runtime.context}
                selection={runtime.selection}
              />
            )}
          />
          <Route path="*" element={<Navigate replace to={DOCTOR_PC_HOME_PATH} />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
