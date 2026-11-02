import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { DoctorPcRoutes, DOCTOR_PC_HOME_PATH } from '@sdkwork/doctor-pc-shell';

import { AuthGate } from './AuthGate';
import { bootstrapDoctorPc, type DoctorPcRuntime } from './bootstrap/runtime';

import './index.css';

export default function App() {
  const [runtime, setRuntime] = useState<DoctorPcRuntime | null>(null);

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
    return <div className="doctor-main">Loading SDKWork Doctor...</div>;
  }

  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Navigate replace to={DOCTOR_PC_HOME_PATH} />} />
          <Route path="/doctor/*" element={<DoctorPcRoutes runtime={runtime.context} hostLabel={runtime.environment.deploymentProfile} />} />
          <Route path="*" element={<Navigate replace to={DOCTOR_PC_HOME_PATH} />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
