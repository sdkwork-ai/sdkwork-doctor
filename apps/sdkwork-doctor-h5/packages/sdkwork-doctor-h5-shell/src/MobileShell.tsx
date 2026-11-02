import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';

import { LanguageToggle } from './LanguageToggle';

export interface MobileShellProps {
  readonly children: ReactNode;
  readonly profileId: string;
  readonly appVersion: string;
  /** Blocks resolved from the composition contract; the tab bar is a projection of them. */
  readonly blocks: readonly ResolvedAppBlock[];
}

export function MobileShell({ children, profileId, appVersion, blocks }: MobileShellProps) {
  const { t } = useTranslation();
  return (
    <div className="doctor-app">
      <header className="doctor-appbar">
        <span className="doctor-appbar-title">{t('platform.diagnostics.brand.name')}</span>
        <span className="doctor-appbar-meta">{profileId} · v{appVersion}</span>
        <LanguageToggle />
      </header>
      <main className="doctor-content">{children}</main>
      <nav aria-label={t('platform.diagnostics.nav.label')} className="doctor-tabbar">
        {blocks.map((block) => (
          <NavLink className="doctor-tab" end={block.id === 'home'} key={block.id} to={block.route}>
            {t(block.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
