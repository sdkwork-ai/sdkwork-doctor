import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { doctorPcNavigation } from './navigation';

export function AppShell({ children, profileId, appVersion }: { children: ReactNode; profileId: string; appVersion: string }) {
  return (
    <div className="doctor-layout">
      <aside className="doctor-sidebar">
        <div className="doctor-brand">
          <span className="doctor-brand-mark" aria-hidden="true">D</span>
          <span className="doctor-brand-name">SDKWork Doctor</span>
        </div>
        <nav className="doctor-nav" aria-label="Doctor sections">
          {doctorPcNavigation.map((item) => (
            <NavLink className="doctor-nav-link" end={item.end} key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="doctor-sidebar-footer">
          <div>{profileId}</div>
          <div>v{appVersion}</div>
        </div>
      </aside>
      <main className="doctor-main">{children}</main>
    </div>
  );
}
