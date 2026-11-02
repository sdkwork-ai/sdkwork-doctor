import { useMemo, useRef, useState } from 'react';
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
          <h1 className="doctor-page-title">Family doctor chat</h1>
          <p className="doctor-page-subtitle">Talking about {memberLabel(member)}. Emergency red flags are escalated before any reply.</p>
        </div>
      </header>

      {error ? <div className="doctor-error-banner">{error}</div> : null}

      <Panel title="Conversation" description="Describe a symptom, when it started, and how severe it is.">
        <ul className="doctor-check-list" aria-live="polite">
          {messages.length === 0 ? (
            <li className="doctor-check"><p className="doctor-check-summary">No messages yet.</p></li>
          ) : messages.map((message) => (
            <li className="doctor-check" key={message.id}>
              <div>
                <h3 className="doctor-check-title">{message.role === 'user' ? 'You' : 'Doctor'}</h3>
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
            placeholder="e.g. child has fever 39C since last night"
          />
          <ActionButton tone="primary" onClick={send} disabled={busy}>{busy ? 'Sending...' : 'Send'}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}

export function DoctorPage({ member }: { member: FamilyMember }) {
  const summary = useMemo(() => summarizeHealth(member), [member]);
  const rows: Array<[string, string]> = [
    ['Member', memberLabel(member)],
    ['Born', String(member.birthYear)],
    ['Blood type', member.bloodType ?? 'unknown'],
    ['Allergies', member.allergies.length > 0 ? member.allergies.join(', ') : 'none recorded'],
    ['Conditions', summary.activeConditions.length > 0 ? summary.activeConditions.join(', ') : 'none recorded'],
    ['Medications', summary.activeMedications.length > 0 ? summary.activeMedications.join(', ') : 'none recorded'],
    ['Last checkup', summary.lastCheckupOn ?? 'not recorded'],
  ];
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">Doctor</h1>
          <p className="doctor-page-subtitle">Health record for the selected family member.</p>
        </div>
      </header>
      <Panel title="Health summary">
        <table className="doctor-facts">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Care actions" description="Emergency symptoms always go to local emergency services first.">
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
  const state = useDiagnosticsReport(context);
  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">Me</h1>
          <p className="doctor-page-subtitle">Family members, privacy controls, and the device environment check.</p>
        </div>
      </header>
      <Panel title="Family members">
        <ul className="doctor-check-list">
          {CARE_MEMBERS.map((item) => (
            <li className="doctor-check" key={item.id}>
              <div>
                <h3 className="doctor-check-title">{memberLabel(item)}</h3>
                <p className="doctor-check-summary">Profile completeness: {item.allergies.length + item.chronicConditions.length > 0 ? 'in progress' : 'needs review'}</p>
              </div>
              <span className="doctor-badge" data-status={item.id === member.id ? 'ok' : 'skipped'}>{item.id === member.id ? 'active' : 'available'}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Device environment" description="Local diagnostics. No health data is included.">
        <CheckList outcomes={state.report?.outcomes ?? []} />
        <div style={{ marginTop: 12 }}>
          <ActionButton onClick={state.run} disabled={state.running}>{state.running ? 'Running...' : 'Re-run checks'}</ActionButton>
        </div>
      </Panel>
    </div>
  );
}
