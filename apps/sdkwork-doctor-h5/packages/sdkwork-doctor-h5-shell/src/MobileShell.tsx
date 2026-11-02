import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { doctorH5Tabs } from './navigation';

export function MobileShell({ children, profileId, appVersion }: { children: ReactNode; profileId: string; appVersion: string }) {
  return (
    <div className="doctor-app">
      <header className="doctor-appbar">
        <span className="doctor-appbar-title">SDKWork Doctor</span>
        <span className="doctor-appbar-meta">{profileId} · v{appVersion}</span>
      </header>
      <main className="doctor-content">{children}</main>
      <nav className="doctor-tabbar" aria-label="Doctor sections">
        {doctorH5Tabs.map((tab) => (
          <NavLink className="doctor-tab" end={tab.end} key={tab.to} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
