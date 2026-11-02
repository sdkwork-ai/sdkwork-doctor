import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

import { doctorPcNavigation } from './navigation';
import { LanguageToggle } from './LanguageToggle';

export function AppShell({ children, profileId, appVersion }: { children: ReactNode; profileId: string; appVersion: string }) {
  const { t } = useTranslation();
  return (
    <div className="doctor-layout">
      <aside className="doctor-sidebar">
        <div className="doctor-brand">
          <span className="doctor-brand-mark" aria-hidden="true">D</span>
          <span className="doctor-brand-name">{t('platform.diagnostics.brand.name')}</span>
        </div>
        <nav className="doctor-nav" aria-label={t('platform.diagnostics.nav.label')}>
          {doctorPcNavigation.map((item) => (
            <NavLink className="doctor-nav-link" end={item.end} key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="doctor-sidebar-footer">
          <LanguageToggle />
          <div>{profileId}</div>
          <div>v{appVersion}</div>
        </div>
      </aside>
      <main className="doctor-main">{children}</main>
    </div>
  );
}
