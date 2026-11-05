import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import { DoctorIcon } from '@sdkwork/doctor-h5-commons';

import { LanguageToggle } from './LanguageToggle';

export interface MobileShellProps {
  readonly children: ReactNode;
  readonly profileId: string;
  readonly appVersion: string;
  /** Blocks resolved from the composition contract; the tab bar is a projection of them. */
  readonly blocks: readonly ResolvedAppBlock[];
}

/** Routes that own the whole screen: no app bar, no tab bar. */
const CHROMELESS_PATHS: ReadonlySet<string> = new Set(['/doctor/call']);

export function MobileShell({ children, profileId, appVersion, blocks }: MobileShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const chromeless = CHROMELESS_PATHS.has(pathname);
  return (
    <div className="doctor-app" data-chrome={chromeless ? 'none' : 'full'}>
      {chromeless ? null : (
        <header className="doctor-appbar">
          <span className="doctor-appbar-title">{t('platform.diagnostics.brand.name')}</span>
          <span className="doctor-appbar-meta">{profileId} · v{appVersion}</span>
          <LanguageToggle />
        </header>
      )}
      <main className="doctor-content">{children}</main>
      {chromeless ? null : (
        <nav aria-label={t('platform.diagnostics.nav.label')} className="doctor-tabbar">
          {blocks.map((block) => (
            <NavLink className="doctor-tab" key={block.id} to={block.route}>
              <DoctorIcon className="doctor-tab-icon" name={block.icon} />
              <span className="doctor-tab-label">{t(block.label)}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
