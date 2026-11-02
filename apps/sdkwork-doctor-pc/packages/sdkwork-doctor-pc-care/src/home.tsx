import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { ResolvedAppBlock } from '@sdkwork/doctor-common-blocks';
import type { FamilyMember, VisitRecordStore } from '@sdkwork/doctor-common-doctor';
import { BlockGrid, BlockTile, Panel, StatRow, StatTile } from '@sdkwork/doctor-pc-commons';

export interface HomePageProps {
  /** Blocks resolved from specs/app-composition.contract.json for this surface. */
  readonly blocks: readonly ResolvedAppBlock[];
  readonly agent: AgentConversationPort;
  readonly records: VisitRecordStore;
  readonly member: FamilyMember;
  readonly members: readonly FamilyMember[];
}

function markOf(label: string): string {
  return label.trim().slice(0, 1).toUpperCase();
}

/**
 * Workbench landing. It is composed from the same blocks as the rail, so hiding
 * or reordering a block in the composition contract changes both places at once
 * and the home page never drifts from the navigation.
 */
export function HomePage({ blocks, agent, records, member, members }: HomePageProps) {
  const { t, i18n } = useTranslation();
  const items = useSyncExternalStore(records.subscribe, records.list, records.list);
  const sections = blocks.filter((block) => block.id !== 'home');
  const recent = items.slice(0, 3);
  const modeLabel = agent.mode === 'hosted' ? t('platform.care.mode.hosted') : t('platform.care.mode.offline');

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.home.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.home.subtitle')}</p>
        </div>
      </header>

      <Panel title={t('platform.care.home.status')}>
        <StatRow>
          <StatTile
            label={t('platform.care.me.mode')}
            value={<span className="doctor-badge" data-status={agent.mode === 'hosted' ? 'ok' : 'skipped'}>{modeLabel}</span>}
          />
          <StatTile label={t('platform.care.home.tile.records')} value={items.length} />
          <StatTile label={t('platform.care.home.tile.members')} value={members.length} />
        </StatRow>
      </Panel>

      <Panel title={t('platform.care.home.sections')}>
        <BlockGrid>
          {sections.map((block) => (
            <Link className="doctor-block-link" key={block.id} to={block.route}>
              <BlockTile
                mark={markOf(t(block.label))}
                title={t(block.label)}
                description={t('platform.care.home.block.' + block.id)}
                action={<span aria-hidden="true" className="doctor-block-open">{t('platform.care.home.open')}</span>}
              />
            </Link>
          ))}
        </BlockGrid>
      </Panel>

      <Panel title={t('platform.care.home.recent')}>
        {recent.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.home.empty')}</p>
        ) : (
          <ul className="doctor-check-list">
            {recent.map((record) => (
              <li className="doctor-check" key={record.id}>
                <div>
                  <h3 className="doctor-check-title">{record.symptom}</h3>
                  <p className="doctor-check-summary">{record.advice}</p>
                  <p className="doctor-check-detail">
                    {record.memberLabel} · {new Date(record.recordedAt).toLocaleString(i18n.language)} ·{' '}
                    {record.mode === 'hosted' ? t('platform.care.mode.hosted') : t('platform.care.mode.offline')}
                  </p>
                </div>
                <span className="doctor-badge" data-status={record.level === 'emergency' || record.level === 'urgent' ? 'warn' : 'ok'}>
                  {t('platform.care.level.' + record.level)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
