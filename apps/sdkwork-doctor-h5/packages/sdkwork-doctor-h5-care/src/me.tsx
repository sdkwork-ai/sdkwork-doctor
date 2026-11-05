import { useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import {
  patientProfileCompleteness,
  resolvePrimaryDoctor,
  type CareSessionStore,
  type DoctorRoster,
  type DoctorSelectionStore,
  type PatientProfileStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, DoctorIcon, MobileCard } from '@sdkwork/doctor-h5-commons';
import { CheckList, useDiagnosticsReport } from '@sdkwork/doctor-h5-diagnostics';

import { PatientPanel } from './patients';

/** One page-header cell with a back affordance for a 我的 sub-screen. */
function SubPageHeader({ title, subtitle }: { readonly title: string; readonly subtitle: string }) {
  const { t } = useTranslation();
  return (
    <header className="doctor-page-header doctor-subpage-header">
      <Link className="doctor-back-link" to="/doctor/me">
        <DoctorIcon className="doctor-back-chevron" name="chevron" />
        {t('platform.care.records.back')}
      </Link>
      <h1 className="doctor-page-title">{title}</h1>
      <p className="doctor-page-subtitle">{subtitle}</p>
    </header>
  );
}

/**
 * One capability row. The whole row is the link, and the row carries a single
 * line of copy — an icon, a title, an optional value, and the chevron — so the
 * profile hub reads like a system settings list rather than a stack of cards.
 */
function MeRow({
  to,
  icon,
  title,
  value,
}: {
  readonly to: string;
  readonly icon: 'chat' | 'doctor' | 'records' | 'users' | 'device' | 'video';
  readonly title: string;
  readonly value?: string;
}) {
  return (
    <Link className="doctor-cell" to={to}>
      <DoctorIcon className="doctor-cell-icon" name={icon} />
      <span className="doctor-cell-title">{title}</span>
      {value ? <span className="doctor-cell-value">{value}</span> : null}
      <DoctorIcon className="doctor-cell-chevron" name="chevron" />
    </Link>
  );
}

function MeGroup({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <nav aria-label={label} className="doctor-me-group">
      {children}
    </nav>
  );
}

export interface MePageProps {
  readonly agent: AgentConversationPort;
  readonly patients: PatientProfileStore;
  readonly records: VisitRecordStore;
  /** One session per visit; the records row counts visits, not exchanges. */
  readonly careSessions: CareSessionStore;
  readonly selection: DoctorSelectionStore;
  readonly roster: DoctorRoster | null;
}

/**
 * 我的: a profile hub in the shape of a native account screen. The identity
 * block states who this household is and how the app is answering (avatar,
 * name, patient facts, pills); below it each capability is one row of a grouped
 * list that opens its module, and the groups sit on the canvas with tonal gaps.
 */
export function MePage({ agent, patients, records, careSessions, selection, roster }: MePageProps) {
  const { t } = useTranslation();
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const sessions = useSyncExternalStore(careSessions.subscribe, careSessions.list, careSessions.list);
  const selectionState = useSyncExternalStore(selection.subscribe, selection.state, selection.state);
  const active = profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null;
  const primary = roster ? resolvePrimaryDoctor(roster, selectionState) : null;
  const modeLabel = agent.mode === 'hosted'
    ? t('platform.care.mode.hosted')
    : t('platform.care.mode.offline');
  const initial = active ? [...active.displayName.trim()][0]?.toUpperCase() ?? '' : '';

  return (
    <div className="doctor-me">
      <header className="doctor-me-identity">
        <Link className="doctor-me-identity-main" to="/doctor/me/patients">
          <span aria-hidden="true" className="doctor-me-avatar">
            {active ? initial : <DoctorIcon name="users" />}
          </span>
          <span className="doctor-me-identity-copy">
            <span className="doctor-me-name">
              {active ? active.displayName : t('platform.care.profile.notCreated')}
            </span>
            <span className="doctor-me-id">
              {active
                ? t('platform.care.profile.relation.' + active.relation)
                  + ' · ' + active.birthYear
                  + ' · ' + t('platform.care.profile.sex.' + active.sex)
                : t('platform.care.profile.subtitle')}
            </span>
          </span>
          <DoctorIcon className="doctor-me-identity-chevron" name="chevron" />
        </Link>
        <div className="doctor-me-pills">
          {active ? (
            <span className="doctor-me-pill">
              {t('platform.care.profile.completeness', { percent: patientProfileCompleteness(active) })}
            </span>
          ) : null}
          <span className="doctor-me-pill">
            <span
              aria-hidden="true"
              className="doctor-me-pill-dot"
              data-status={agent.mode === 'hosted' ? 'ok' : 'skipped'}
            />
            {modeLabel}
          </span>
        </div>
      </header>

      <div className="doctor-me-groups">
        <MeGroup label={t('platform.care.me.group.family')}>
          <MeRow
            icon="users"
            title={t('platform.care.me.patients')}
            to="/doctor/me/patients"
            value={t('platform.care.me.patientsCount', { count: profiles.length })}
          />
          <MeRow
            icon="doctor"
            title={t('platform.care.me.doctors')}
            to="/doctor/doctor"
            value={primary ? primary.displayName : t('platform.care.me.notChosen')}
          />
        </MeGroup>

        <MeGroup label={t('platform.care.me.group.care')}>
          <MeRow
            icon="chat"
            title={t('platform.care.chat.title')}
            to="/doctor/chat"
          />
          <MeRow
            icon="video"
            title={t('platform.care.call.videoTitle')}
            to="/doctor/call?video=1"
          />
          <MeRow
            icon="records"
            title={t('platform.care.me.recordsAndMedical')}
            to="/doctor/records"
            value={t('platform.care.me.recordsCount', { count: sessions.length })}
          />
        </MeGroup>

        <MeGroup label={t('platform.care.me.group.system')}>
          <MeRow
            icon="device"
            title={t('platform.care.me.device')}
            to="/doctor/me/device"
          />
        </MeGroup>
      </div>

      <p className="doctor-me-footnote">{t('platform.care.privacy.local')}</p>
    </div>
  );
}

export interface PatientFilesPageProps {
  readonly patients: PatientProfileStore;
}

/**
 * 病人档案: the full household file manager, reached from 我的. Keeping it on
 * its own route leaves the hub scannable and gives the editor a stable place to
 * live.
 */
export function PatientFilesPage({ patients }: PatientFilesPageProps) {
  const { t } = useTranslation();
  return (
    <div>
      <SubPageHeader
        subtitle={t('platform.care.profile.subtitle')}
        title={t('platform.care.profile.title')}
      />
      <MobileCard>
        <PatientPanel patients={patients} />
      </MobileCard>
    </div>
  );
}

export interface DevicePageProps {
  readonly context: DoctorRuntimeContext;
}

/** 设备环境: the local diagnostic run, kept out of the 我的 hub itself. */
export function DevicePage({ context }: DevicePageProps) {
  const { t } = useTranslation();
  const state = useDiagnosticsReport(context);
  return (
    <div>
      <SubPageHeader
        subtitle={t('platform.care.me.deviceHint')}
        title={t('platform.care.me.device')}
      />
      <MobileCard>
        <CheckList outcomes={state.report?.outcomes ?? []} />
        <div className="doctor-form-actions">
          <ActionButton disabled={state.running} onClick={state.run}>
            {state.running ? t('platform.care.me.running') : t('platform.care.me.rerun')}
          </ActionButton>
        </div>
      </MobileCard>
    </div>
  );
}
