import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { DoctorH5Routes, DOCTOR_H5_HOME_PATH } from '@sdkwork/doctor-h5-shell';

import { AuthGate } from './AuthGate';
import { initDoctorH5I18n } from './bootstrap/i18n';
import { bootstrapDoctorH5, type DoctorH5Runtime } from './bootstrap/runtime';

import './index.css';

initDoctorH5I18n();

export default function App() {
  const [runtime, setRuntime] = useState<DoctorH5Runtime | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void bootstrapDoctorH5().then((value) => {
      if (active) setRuntime(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!runtime) {
    return <div className="doctor-content">{t('platform.diagnostics.action.loading')}</div>;
  }

  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Navigate replace to={DOCTOR_H5_HOME_PATH} />} />
          <Route
            path="/doctor/*"
            element={(
              <DoctorH5Routes
                agent={runtime.agent}
                agentCatalog={runtime.agentCatalog}
                blocks={runtime.blocks}
                doctorDirectory={runtime.doctorDirectory}
                hostPlatform={runtime.environment.deploymentProfile}
                patients={runtime.patients}
                records={runtime.records}
                runtime={runtime.context}
                selection={runtime.selection}
              />
            )}
          />
          <Route path="*" element={<Navigate replace to={DOCTOR_H5_HOME_PATH} />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
