export * from './home';
export * from './patients';
export * from './roster';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  FAMILY_DOCTOR_AGENT_ID,
  findCareAgent,
  type AgentConversationPort,
  type CareAgentMode,
  type CareAgentSummary,
  type ChatMessage,
} from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import {
  DOCTOR_SELECTION_LIMIT,
  createVisitRecord,
  demoSelfMember,
  preferredDoctorChannel,
  primaryAffiliation,
  resolvePrimaryDoctor,
  resolveSelectedDoctors,
  type DoctorAffiliation,
  type DoctorProfile,
  type DoctorRoster,
  type DoctorSelectionStore,
  type PatientProfileStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, Panel } from '@sdkwork/doctor-pc-commons';
import { CheckList, useDiagnosticsReport } from '@sdkwork/doctor-pc-diagnostics';

import { PatientPanel, PatientSwitcher, usePatientLabel } from './patients';

/** Opens a doctor's consultation channel; `tel:` links navigate in place. */
function openConsultationChannel(target: string): void {
  if (typeof window === 'undefined') return;
  if (/^tel:/u.test(target)) {
    window.location.href = target;
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
}

function channelLabelKey(affiliation: DoctorAffiliation | null): string {
  const channel = preferredDoctorChannel(affiliation);
  return channel ? 'platform.care.doctors.channel.' + channel.kind : '';
}

function employmentLabelKey(affiliation: DoctorAffiliation): string {
  return 'platform.care.doctors.employment.' + affiliation.employmentType;
}

function visitModeLabel(
  mode: 'hosted' | 'offline' | 'human',
  t: (key: string) => string,
): string {
  if (mode === 'human') return t('platform.care.mode.human');
  return mode === 'hosted' ? t('platform.care.mode.hosted') : t('platform.care.mode.offline');
}

export interface ChatPageProps {
  /** Conversation transport composed by the core package (hosted or offline). */
  readonly agent: AgentConversationPort;
  /** Device-local consultation history; every completed exchange is recorded. */
  readonly records: VisitRecordStore;
  /** Household patient files; the active one supplies the conversation facts. */
  readonly patients: PatientProfileStore;
}

/**
 * 对话: the family-doctor conversation. The active patient can be switched in
 * place, and every completed exchange is recorded against that patient.
 */
export function ChatPage({ agent, records, patients }: ChatPageProps) {
  const { t } = useTranslation();
  const patientLabel = usePatientLabel();
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const active = profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null;
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const text = draft.trim();
    if (!text || busy || !active) return;
    setBusy(true);
    setError(null);
    void agent
      .send(text, { member: active })
      .then((reply) => {
        setMessages([...agent.history()]);
        setDraft('');
        records.add(createVisitRecord({
          member: active,
          symptom: text,
          advice: reply.text,
          level: reply.triage?.level ?? 'routine',
          mode: agent.mode,
        }));
        if (reply.triage?.escalate) {
          document.documentElement.dataset.triage = reply.triage.level;
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.chat.title')}</h1>
          <p className="doctor-page-subtitle">
            {active
              ? t('platform.care.chat.subtitle', { member: patientLabel(active) })
              : t('platform.care.chat.noPatient')}
          </p>
        </div>
      </header>

      <Panel title={t('platform.care.chat.patient')} description={t('platform.care.chat.switchPatient')}>
        <PatientSwitcher patients={patients} />
      </Panel>

      {error ? <div className="doctor-error-banner">{t('platform.care.chat.error', { message: error })}</div> : null}

      <Panel title={t('platform.care.chat.panel')}>
        <ul className="doctor-check-list" aria-live="polite">
          {messages.length === 0 ? (
            <li className="doctor-check"><p className="doctor-check-summary">{t('platform.care.chat.empty')}</p></li>
          ) : messages.map((message) => (
            <li className="doctor-check" key={message.id}>
              <div>
                <h3 className="doctor-check-title">{message.role === 'user' ? t('platform.care.chat.you') : t('platform.care.chat.doctor')}</h3>
                <p className="doctor-check-summary">{message.text}</p>
              </div>
              {message.triage ? <span className="doctor-badge" data-status={message.triage.escalate ? 'warn' : 'ok'}>{t('platform.care.level.' + message.triage.level)}</span> : <span />}
            </li>
          ))}
        </ul>
        <div className="doctor-chat-compose">
          <input
            aria-label={t('platform.care.chat.inputLabel')}
            className="doctor-input"
            disabled={!active}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') send(); }}
            placeholder={active ? t('platform.care.chat.placeholder') : t('platform.care.chat.noPatient')}
            value={draft}
          />
          <ActionButton tone="primary" onClick={send} disabled={busy || !active}>
            {busy ? t('platform.care.chat.sending') : t('platform.care.chat.send')}
          </ActionButton>
        </div>
      </Panel>
    </div>
  );
}

export interface DoctorPageProps {
  /** Roster loaded by the shell: deployment directory or authored fallback. */
  readonly roster: DoctorRoster | null;
  readonly rosterLoading: boolean;
  readonly patients: PatientProfileStore;
  readonly records: VisitRecordStore;
  readonly selection: DoctorSelectionStore;
  readonly agents: readonly CareAgentSummary[];
  readonly agentMode: CareAgentMode;
}

/**
 * 医生: the human-doctor directory. A doctor is a person plus one or more
 * employment affiliations, each naming the employing organization, hospital,
 * department, rank, engagement type, and site-level consulting hours. A family
 * selects doctors, names a primary doctor, and starts a human consultation at a
 * chosen site; the record keeps that site and engagement for the history.
 */
export function DoctorPage({
  roster,
  rosterLoading,
  patients,
  records,
  selection,
  agents,
  agentMode,
}: DoctorPageProps) {
  const { t } = useTranslation();
  const patientLabel = usePatientLabel();
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const active = profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? demoSelfMember;
  const state = useSyncExternalStore(selection.subscribe, selection.state, selection.state);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [siteByDoctor, setSiteByDoctor] = useState<Readonly<Record<string, string>>>({});
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doctors = roster?.doctors ?? [];
  const selected = roster ? resolveSelectedDoctors(roster, state) : [];
  const primary = roster ? resolvePrimaryDoctor(roster, state) : null;
  const familyAgent = findCareAgent(agents, FAMILY_DOCTOR_AGENT_ID);

  const siteOf = (doctor: DoctorProfile): DoctorAffiliation | null => {
    const requested = siteByDoctor[doctor.id];
    return doctor.affiliations.find((affiliation) => affiliation.organizationId === requested)
      ?? primaryAffiliation(doctor);
  };

  const chooseSite = (doctor: DoctorProfile, affiliation: DoctorAffiliation) => {
    setSiteByDoctor((current) => ({ ...current, [doctor.id]: affiliation.organizationId }));
  };

  const availability = (affiliation: DoctorAffiliation): string => affiliation.availability
    .map((slot) => t('platform.care.doctors.weekday.' + String(slot.weekday)) + ' ' + slot.startTime + '-' + slot.endTime)
    .join(' · ');

  useEffect(() => {
    if (roster && roster.doctors.length > 0) {
      selection.prune(roster.doctors.map((doctor) => doctor.id));
    }
  }, [roster, selection]);

  const startConsultation = (doctor: DoctorProfile) => {
    setNotice(null);
    setError(null);
    const symptom = reason.trim();
    if (!symptom) {
      setError(t('platform.care.doctors.consultReasonRequired'));
      return;
    }
    const site = siteOf(doctor);
    const channel = preferredDoctorChannel(site);
    if (!site || !channel) {
      setError(t('platform.care.doctors.noChannel'));
      return;
    }
    openConsultationChannel(channel.target);
    const started = t('platform.care.doctors.consultStarted', { doctor: doctor.displayName });
    records.add(createVisitRecord({
      member: active,
      symptom,
      advice: started,
      level: 'routine',
      mode: 'human',
      doctorId: doctor.id,
      doctorLabel: doctor.displayName + ' · ' + site.department,
      doctorOrganizationId: site.organizationId,
      doctorHospitalLabel: site.hospitalName,
      doctorEmploymentType: site.employmentType,
    }));
    setReason('');
    setNotice(started + ' · ' + site.hospitalName);
  };

  const renderSiteLine = (doctor: DoctorProfile, affiliation: DoctorAffiliation) => (
    <span className="doctor-check-detail">
      {affiliation.title} · {affiliation.department} · {affiliation.hospitalName}
      {' · '}
      <span className="doctor-badge" data-status={affiliation.employmentType === 'full_time' ? 'ok' : 'skipped'}>
        {t(employmentLabelKey(affiliation))}
      </span>
      {affiliation.since ? ' · ' + t('platform.care.doctors.since', { since: affiliation.since }) : ''}
    </span>
  );

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.doctors.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.doctors.subtitle')}</p>
        </div>
      </header>

      <Panel title={t('platform.care.doctors.ai')} description={t('platform.care.doctors.aiHint')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={agentMode === 'hosted' ? 'ok' : 'skipped'}>
            {agentMode === 'hosted' ? t('platform.care.doctors.aiHosted') : t('platform.care.doctors.aiOffline')}
          </span>
          {familyAgent ? (
            <span className="doctor-badge" data-status="ok">{familyAgent.displayName} · {familyAgent.status}</span>
          ) : null}
        </div>
      </Panel>

      <Panel title={t('platform.care.doctors.mine')} description={t('platform.care.doctors.chooseHint')}>
        {selected.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.doctors.none')}</p>
        ) : (
          <ul className="doctor-card-list">
            {selected.map((doctor) => {
              const site = primaryAffiliation(doctor);
              return (
                <li className="doctor-list-card" key={doctor.id}>
                  <div className="doctor-card-head">
                    <div>
                      <h3 className="doctor-check-title">{doctor.displayName}</h3>
                      {site ? renderSiteLine(doctor, site) : null}
                    </div>
                    {doctor.id === state.primaryId ? <span className="doctor-badge" data-status="ok">{t('platform.care.doctors.primary')}</span> : null}
                  </div>
                  <div className="doctor-card-actions">
                    {doctor.id === state.primaryId ? null : (
                      <ActionButton onClick={() => selection.setPrimary(doctor.id)}>{t('platform.care.doctors.setPrimary')}</ActionButton>
                    )}
                    <ActionButton onClick={() => selection.deselect(doctor.id)}>{t('platform.care.doctors.clear')}</ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {primary ? (
          <p className="doctor-check-detail">
            {t('platform.care.doctors.primary')}: {primary.displayName}
            {' · '}
            {patientLabel(active)}
          </p>
        ) : null}
      </Panel>

      <Panel title={t('platform.care.doctors.directory')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={roster?.source === 'directory' ? 'ok' : 'skipped'}>
            {roster?.source === 'directory'
              ? t('platform.care.doctors.source.directory')
              : t('platform.care.doctors.source.catalog')}
          </span>
          <span className="doctor-check-detail">{t('platform.care.doctors.count', { count: state.selectedIds.length })}</span>
          <span className="doctor-check-detail">{t('platform.care.doctors.limit', { count: DOCTOR_SELECTION_LIMIT })}</span>
        </div>
        {notice ? <div className="doctor-notice">{notice}</div> : null}
        {error ? <div className="doctor-error-banner">{error}</div> : null}
        {rosterLoading && doctors.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.doctors.loading')}</p>
        ) : doctors.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.doctors.empty')}</p>
        ) : (
          <ul className="doctor-card-list">
            {doctors.map((doctor) => {
              const isSelected = state.selectedIds.includes(doctor.id);
              const expanded = expandedId === doctor.id;
              const site = siteOf(doctor);
              const channel = preferredDoctorChannel(site);
              return (
                <li className="doctor-list-card" key={doctor.id}>
                  <div className="doctor-card-head">
                    <div>
                      <h3 className="doctor-check-title">{doctor.displayName}</h3>
                      {site ? renderSiteLine(doctor, site) : null}
                    </div>
                    <div className="doctor-inline-badges">
                      <span className="doctor-badge" data-status={doctor.verified ? 'ok' : 'skipped'}>
                        {doctor.verified ? t('platform.care.doctors.verified') : t('platform.care.doctors.unverified')}
                      </span>
                      {site ? (
                        <span className="doctor-badge" data-status={site.acceptingNewPatients ? 'ok' : 'warn'}>
                          {site.acceptingNewPatients ? t('platform.care.doctors.accepting') : t('platform.care.doctors.notAccepting')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="doctor-check-summary">
                    {t('platform.care.doctors.specialties')}: {doctor.specialties.join(' / ')}
                  </p>
                  <p className="doctor-check-detail">
                    {t('platform.care.doctors.experience', { count: doctor.yearsOfExperience })}
                    {' · '}
                    {t('platform.care.doctors.languages')}: {doctor.languages.join(', ')}
                    {doctor.affiliations.length > 1
                      ? ' · ' + t('platform.care.doctors.otherAffiliations', { count: doctor.affiliations.length - 1 })
                      : ''}
                  </p>
                  <div className="doctor-card-actions">
                    <ActionButton
                      disabled={!isSelected && state.selectedIds.length >= DOCTOR_SELECTION_LIMIT}
                      onClick={() => selection.toggle(doctor.id)}
                    >
                      {isSelected ? t('platform.care.doctors.selected') : t('platform.care.doctors.select')}
                    </ActionButton>
                    {isSelected && doctor.id !== state.primaryId ? (
                      <ActionButton onClick={() => selection.setPrimary(doctor.id)}>{t('platform.care.doctors.setPrimary')}</ActionButton>
                    ) : null}
                    <ActionButton onClick={() => setExpandedId(expanded ? null : doctor.id)}>
                      {t('platform.care.doctors.detail')}
                    </ActionButton>
                  </div>
                  {expanded ? (
                    <div className="doctor-editor">
                      <p className="doctor-check-summary">{doctor.bio}</p>
                      <p className="doctor-check-detail">{t('platform.care.doctors.affiliationsHint')}</p>
                      <ul className="doctor-affiliation-list">
                        {doctor.affiliations.map((affiliation) => (
                          <li key={affiliation.organizationId}>
                            <label className="doctor-affiliation">
                              <input
                                checked={site?.organizationId === affiliation.organizationId}
                                name={'site-' + doctor.id}
                                onChange={() => chooseSite(doctor, affiliation)}
                                type="radio"
                              />
                              <span>
                                <strong>{affiliation.hospitalName}</strong>
                                {' · '}
                                {affiliation.department} · {affiliation.title}
                                {' · '}
                                {t(employmentLabelKey(affiliation))}
                                <span className="doctor-check-detail">
                                  {affiliation.organizationId}
                                  {affiliation.hospitalCode ? ' · ' + affiliation.hospitalCode : ''}
                                </span>
                                {affiliation.availability.length > 0
                                  ? <span className="doctor-check-detail">{t('platform.care.doctors.availability')}: {availability(affiliation)}</span>
                                  : null}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="doctor-check-detail">
                        {channel
                          ? t('platform.care.doctors.consultHint', {
                            doctor: doctor.displayName,
                            channel: t(channelLabelKey(site)),
                          })
                          : t('platform.care.doctors.noChannel')}
                      </p>
                      <textarea
                        aria-label={t('platform.care.records.symptom')}
                        className="doctor-textarea"
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={t('platform.care.doctors.consultReason')}
                        rows={2}
                        value={reason}
                      />
                      <div className="doctor-form-actions">
                        <ActionButton tone="primary" disabled={!channel} onClick={() => startConsultation(doctor)}>
                          {t('platform.care.doctors.consult')}
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export interface RecordsPageProps {
  readonly records: VisitRecordStore;
}

/**
 * Visit records: every completed consultation, newest first. Reached from 我的
 * (it is no longer a tab of its own), so it carries an explicit way back.
 */
export function RecordsPage({ records }: RecordsPageProps) {
  const { t, i18n } = useTranslation();
  const items = useSyncExternalStore(records.subscribe, records.list, records.list);

  const clear = () => {
    if (items.length === 0) return;
    if (typeof window === 'undefined' || window.confirm(t('platform.care.records.clearConfirm'))) {
      records.clear();
    }
  };

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.records.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.records.subtitle')}</p>
        </div>
        <Link className="doctor-link" to="/doctor/me">{t('platform.care.records.back')}</Link>
      </header>
      <Panel title={t('platform.care.records.count', { count: items.length })}>
        {items.length === 0 ? (
          <p className="doctor-check-summary">{t('platform.care.records.empty')}</p>
        ) : (
          <ul className="doctor-check-list">
            {items.map((record) => (
              <li className="doctor-check" key={record.id}>
                <div>
                  <h3 className="doctor-check-title">{record.symptom}</h3>
                  <p className="doctor-check-summary">{record.advice}</p>
                  <p className="doctor-check-detail">
                    {record.memberLabel} · {new Date(record.recordedAt).toLocaleString(i18n.language)} ·{' '}
                    {visitModeLabel(record.mode, t)}
                  </p>
                  {record.doctorLabel || record.doctorHospitalLabel ? (
                    <p className="doctor-check-detail">
                      {record.doctorLabel ?? ''}
                      {record.doctorHospitalLabel ? ' · ' + t('platform.care.records.hospital') + ': ' + record.doctorHospitalLabel : ''}
                      {record.doctorEmploymentType
                        ? ' · ' + t('platform.care.records.employment') + ': ' + t('platform.care.doctors.employment.' + record.doctorEmploymentType)
                        : ''}
                    </p>
                  ) : null}
                </div>
                <span className="doctor-badge" data-status={record.level === 'emergency' || record.level === 'urgent' ? 'warn' : 'ok'}>
                  {t('platform.care.level.' + record.level)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 12 }}>
          <ActionButton onClick={clear} disabled={items.length === 0}>{t('platform.care.records.clear')}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}

export interface MePageProps {
  readonly context: DoctorRuntimeContext;
  readonly agent: AgentConversationPort;
  readonly patients: PatientProfileStore;
  readonly records: VisitRecordStore;
  readonly selection: DoctorSelectionStore;
  readonly roster: DoctorRoster | null;
  readonly agents: readonly CareAgentSummary[];
}

/**
 * 我的: the household control surface. Patient files live here (create / switch /
 * edit / delete), together with the selected family doctor, the visit-record
 * entry, the active conversation mode, and the device check.
 */
export function MePage({ context, agent, patients, records, selection, roster, agents }: MePageProps) {
  const { t } = useTranslation();
  const state = useDiagnosticsReport(context);
  const items = useSyncExternalStore(records.subscribe, records.list, records.list);
  const selectionState = useSyncExternalStore(selection.subscribe, selection.state, selection.state);
  const primary = roster ? resolvePrimaryDoctor(roster, selectionState) : null;
  const primarySite = primary ? primaryAffiliation(primary) : null;
  const modeLabel = agent.mode === 'hosted' ? t('platform.care.mode.hosted') : t('platform.care.mode.offline');
  const familyAgent = useMemo(() => findCareAgent(agents, FAMILY_DOCTOR_AGENT_ID), [agents]);

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.me.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.me.subtitle')}</p>
        </div>
      </header>

      <Panel title={t('platform.care.me.patients')}>
        <PatientPanel patients={patients} />
      </Panel>

      <Panel title={t('platform.care.me.doctors')} description={t('platform.care.doctors.chooseHint')}>
        {primary && primarySite ? (
          <div className="doctor-list-card">
            <div className="doctor-card-head">
              <div>
                <h3 className="doctor-check-title">{primary.displayName}</h3>
                <p className="doctor-check-detail">
                  {primarySite.title} · {primarySite.department} · {primarySite.hospitalName}
                </p>
                <p className="doctor-check-detail">
                  {t('platform.care.doctors.employment.label')}: {t(employmentLabelKey(primarySite))}
                  {' · '}
                  {primarySite.organizationId}
                </p>
              </div>
              <span className="doctor-badge" data-status="ok">{t('platform.care.doctors.primary')}</span>
            </div>
            <p className="doctor-check-summary">
              {t('platform.care.doctors.count', { count: selectionState.selectedIds.length })}
            </p>
          </div>
        ) : (
          <p className="doctor-empty">{t('platform.care.me.noDoctor')}</p>
        )}
        <div className="doctor-card-actions">
          <Link className="doctor-link" to="/doctor/doctor">{t('platform.care.doctors.choose')}</Link>
        </div>
      </Panel>

      <Panel title={t('platform.care.me.records')}>
        <p className="doctor-check-summary">{t('platform.care.me.recordsCount', { count: items.length })}</p>
        <div className="doctor-card-actions">
          <Link className="doctor-link" to="/doctor/me/records">{t('platform.care.records.title')}</Link>
        </div>
      </Panel>

      <Panel title={t('platform.care.me.mode')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={agent.mode === 'hosted' ? 'ok' : 'skipped'}>{modeLabel}</span>
          {familyAgent ? (
            <span className="doctor-badge" data-status="ok">{familyAgent.displayName} · {familyAgent.status}</span>
          ) : null}
        </div>
      </Panel>

      <Panel title={t('platform.care.me.device')} description={t('platform.care.me.deviceHint')}>
        <CheckList outcomes={state.report?.outcomes ?? []} />
        <div style={{ marginTop: 12 }}>
          <ActionButton onClick={state.run} disabled={state.running}>{state.running ? t('platform.care.me.running') : t('platform.care.me.rerun')}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}