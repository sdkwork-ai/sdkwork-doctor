import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@sdkwork/doctor-common-agent';
import { createLocalCareAgent } from '@sdkwork/doctor-common-agent';
import type { DoctorRuntimeContext } from '@sdkwork/doctor-common-diagnostics';
import { demoSelfMember, summarizeHealth, type FamilyMember } from '@sdkwork/doctor-common-doctor';
import { ActionButton, Panel } from '@sdkwork/doctor-pc-commons';
import { CheckList, useDiagnosticsReport } from '@sdkwork/doctor-pc-diagnostics';

export const CARE_MEMBERS: readonly FamilyMember[] = Object.freeze([demoSelfMember]);

function memberLabel(member: FamilyMember): string {
  return member.displayName + ' (' + member.relation + ')';
}

export function ChatPage({ member }: { member: FamilyMember }) {
  const { t } = useTranslation();
  const agentRef = useRef(createLocalCareAgent());
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    void agentRef.current
      .send(text, { member })
      .then((reply) => {
        setMessages([...agentRef.current.history()]);
        setDraft('');
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

      {error ? <div className="doctor-error-banner">{error}</div> : null}

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
              {message.triage ? <span className="doctor-badge" data-status={message.triage.escalate ? 'warn' : 'ok'}>{message.triage.level}</span> : <span />}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            aria-label="Symptom description"
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
      <Panel title={t('platform.care.doctor.actions')} description="Emergency symptoms always go to local emergency services first.">
        <ul className="doctor-check-details">
          <li>Fill in allergies and chronic conditions before the first consultation.</li>
          <li>Use chat for symptom intake; a clinician reviews anything urgent the same day.</li>
          <li>Keep medication names and doses current so advice stays safe.</li>
        </ul>
      </Panel>
    </div>
  );
}

export function MePage({ context, member }: { context: DoctorRuntimeContext; member: FamilyMember }) {
  const { t } = useTranslation();
  const state = useDiagnosticsReport(context);
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
                <p className="doctor-check-summary">Profile completeness: {item.allergies.length + item.chronicConditions.length > 0 ? 'in progress' : 'needs review'}</p>
              </div>
              <span className="doctor-badge" data-status={item.id === member.id ? 'ok' : 'skipped'}>{item.id === member.id ? t('platform.care.active') : t('platform.care.available')}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('platform.care.me.device')} description="Local diagnostics. No health data is included.">
        <CheckList outcomes={state.report?.outcomes ?? []} />
        <div style={{ marginTop: 12 }}>
          <ActionButton onClick={state.run} disabled={state.running}>{state.running ? t('platform.care.me.running') : t('platform.care.me.rerun')}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}
