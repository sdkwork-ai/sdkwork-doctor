import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentConversationPort, ChatMessage } from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import {
  createVisitRecord,
  demoSelfMember,
  summarizeHealth,
  type FamilyMember,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, Panel } from '@sdkwork/doctor-pc-commons';
import { CheckList, useDiagnosticsReport } from '@sdkwork/doctor-pc-diagnostics';

export const CARE_MEMBERS: readonly FamilyMember[] = Object.freeze([demoSelfMember]);

function memberLabel(member: FamilyMember): string {
  return member.displayName + ' (' + member.relation + ')';
}

export interface ChatPageProps {
  readonly member: FamilyMember;
  /** Conversation transport composed by the core package (hosted or offline). */
  readonly agent: AgentConversationPort;
  /** Device-local consultation history; every completed exchange is recorded. */
  readonly records: VisitRecordStore;
}

export function ChatPage({ member, agent, records }: ChatPageProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    void agent
      .send(text, { member })
      .then((reply) => {
        setMessages([...agent.history()]);
        setDraft('');
        records.add(createVisitRecord({
          member,
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
          <p className="doctor-page-subtitle">{t('platform.care.chat.subtitle', { member: memberLabel(member) })}</p>
        </div>
      </header>

      {error ? <div className="doctor-error-banner">{t('platform.care.chat.error', { message: error })}</div> : null}

      <Panel title={t('platform.care.chat.panel')} description={t('platform.care.chat.subtitle', { member: memberLabel(member) })}>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            aria-label={t('platform.care.chat.inputLabel')}
            className="doctor-button"
            style={{ flex: 1, textAlign: 'left' }}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') send(); }}
            placeholder={t('platform.care.chat.placeholder')}
          />
          <ActionButton tone="primary" onClick={send} disabled={busy}>{busy ? t('platform.care.chat.sending') : t('platform.care.chat.send')}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}

export function DoctorPage({ member }: { member: FamilyMember }) {
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeHealth(member), [member]);
  const rows: Array<[string, string]> = [
    [t('platform.care.fact.member'), memberLabel(member)],
    [t('platform.care.fact.born'), String(member.birthYear)],
    [t('platform.care.fact.bloodType'), member.bloodType ?? t('platform.care.value.unknown')],
    [t('platform.care.fact.allergies'), member.allergies.length > 0 ? member.allergies.join(', ') : t('platform.care.value.none')],
    [t('platform.care.fact.conditions'), summary.activeConditions.length > 0 ? summary.activeConditions.join(', ') : t('platform.care.value.none')],
    [t('platform.care.fact.medications'), summary.activeMedications.length > 0 ? summary.activeMedications.join(', ') : t('platform.care.value.none')],
    [t('platform.care.fact.lastCheckup'), summary.lastCheckupOn ?? t('platform.care.value.none')],
  ];
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.doctor.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.doctor.subtitle')}</p>
        </div>
      </header>
      <Panel title={t('platform.care.doctor.panel')}>
        <table className="doctor-facts">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title={t('platform.care.doctor.actions')} description={t('platform.care.doctor.actionsHint')}>
        <ul className="doctor-check-details">
          <li>{t('platform.care.doctor.bullet.record')}</li>
          <li>{t('platform.care.doctor.bullet.urgent')}</li>
          <li>{t('platform.care.doctor.bullet.medication')}</li>
        </ul>
      </Panel>
    </div>
  );
}

export interface RecordsPageProps {
  readonly records: VisitRecordStore;
}

/**
 * Visit records: every completed consultation, newest first. The list subscribes
 * to the store so a consultation recorded in the chat tab shows up immediately.
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
        <div style={{ marginTop: 12 }}>
          <ActionButton onClick={clear} disabled={items.length === 0}>{t('platform.care.records.clear')}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}

export interface MePageProps {
  readonly context: DoctorRuntimeContext;
  readonly member: FamilyMember;
  /** The transport that actually answers, so the tab never claims the wrong mode. */
  readonly agent: AgentConversationPort;
}

export function MePage({ context, member, agent }: MePageProps) {
  const { t } = useTranslation();
  const state = useDiagnosticsReport(context);
  const modeLabel = agent.mode === 'hosted' ? t('platform.care.mode.hosted') : t('platform.care.mode.offline');
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.me.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.me.subtitle')}</p>
        </div>
      </header>
      <Panel title={t('platform.care.me.members')}>
        <ul className="doctor-check-list">
          {CARE_MEMBERS.map((item) => (
            <li className="doctor-check" key={item.id}>
              <div>
                <h3 className="doctor-check-title">{memberLabel(item)}</h3>
                <p className="doctor-check-summary">
                  {t('platform.care.me.completeness')}: {item.allergies.length + item.chronicConditions.length > 0 ? t('platform.care.me.completenessInProgress') : t('platform.care.me.completenessNeedsReview')}
                </p>
              </div>
              <span className="doctor-badge" data-status={item.id === member.id ? 'ok' : 'skipped'}>{item.id === member.id ? t('platform.care.active') : t('platform.care.available')}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('platform.care.me.mode')}>
        <span className="doctor-badge" data-status={agent.mode === 'hosted' ? 'ok' : 'skipped'}>{modeLabel}</span>
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
