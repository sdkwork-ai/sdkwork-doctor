import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

import { doctorH5Tabs } from './navigation';
import { LanguageToggle } from './LanguageToggle';

export function MobileShell({ children, profileId, appVersion }: { children: ReactNode; profileId: string; appVersion: string }) {
  const { t } = useTranslation();
  return (
    <div className="doctor-app">
      <header className="doctor-appbar">
        <span className="doctor-appbar-title">{t('platform.diagnostics.brand.name')}</span>
        <span className="doctor-appbar-meta">{profileId} · v{appVersion}</span>
        <LanguageToggle />
      </header>
      <main className="doctor-content">{children}</main>
      <nav className="doctor-tabbar" aria-label={t('platform.diagnostics.nav.label')}>
        {doctorH5Tabs.map((tab) => (
          <NavLink className="doctor-tab" end={tab.end} key={tab.to} to={tab.to}>
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
