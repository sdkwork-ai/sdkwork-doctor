import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { AppBlockIcon, ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';

import { LanguageToggle } from './LanguageToggle';

const ICON_PATHS: Readonly<Record<AppBlockIcon, string>> = Object.freeze({
  chat: 'M4 5h16v11H8l-4 4z',
  doctor: 'M12 4v16M4 12h16',
  records: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
});

function RailIcon({ icon }: { icon: AppBlockIcon }) {
  return (
    <svg aria-hidden="true" className="doctor-rail-icon" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <path d={ICON_PATHS[icon]} />
    </svg>
  );
}

export interface AppShellProps {
  readonly children: ReactNode;
  readonly profileId: string;
  readonly appVersion: string;
  /** Blocks resolved from the composition contract; the rail is a projection of them. */
  readonly blocks: readonly ResolvedAppBlock[];
}

export function AppShell({ children, profileId, appVersion, blocks }: AppShellProps) {
  const { t } = useTranslation();
  return (
    <div className="doctor-layout">
      <aside className="doctor-rail">
        <div aria-hidden="true" className="doctor-rail-brand">D</div>
        <nav aria-label={t('platform.diagnostics.nav.label')} className="doctor-rail-nav">
          {blocks.map((block) => (
            <NavLink className="doctor-rail-item" key={block.id} to={block.route}>
              <RailIcon icon={block.icon} />
              <span className="doctor-rail-label">{t(block.label)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="doctor-rail-footer">
          <LanguageToggle />
          <div className="doctor-rail-meta">{profileId}</div>
          <div className="doctor-rail-meta">v{appVersion}</div>
        </div>
      </aside>
      <main className="doctor-main">{children}</main>
    </div>
  );
}
