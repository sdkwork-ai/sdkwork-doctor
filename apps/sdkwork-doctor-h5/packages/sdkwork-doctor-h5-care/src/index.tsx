export * from './attachment-sheet';
export * from './attachments';
export * from './call';
export * from './home';
export * from './me';
export * from './medical';
export * from './patients';
export * from './record-detail';
export * from './roster';
export * from './sessions';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SdkworkChatComposer } from '@sdkwork/chat-composer-mobile-react';
import {
  FAMILY_DOCTOR_AGENT_ID,
  findCareAgent,
  type AgentConversationPort,
  type CareAgentMode,
  type CareAgentSummary,
  type ChatMessage,
} from '@sdkwork/doctor-common-agent';
import {
  DOCTOR_SELECTION_LIMIT,
  careSessionAwaitingDoctorReply,
  careSessionRecord,
  careSessionUnreadCount,
  createMedicalRecord,
  createMedicalTranscriptEntry,
  createVisitRecord,
  demoSelfMember,
  doctorAvatarHref,
  mergeCareSessions,
  preferredDoctorChannel,
  primaryAffiliation,
  resolvePrimaryDoctor,
  resolveSelectedDoctors,
  type CareSession,
  type CareSessionReadStore,
  type CareSessionStore,
  type DoctorAffiliation,
  type DoctorProfile,
  type DoctorRoster,
  type DoctorSelectionStore,
  type MedicalAttachment,
  type MedicalAttachmentStore,
  type MedicalRecordStore,
  type PatientProfileStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, DoctorAvatar, DoctorIcon, MobileCard } from '@sdkwork/doctor-h5-commons';

import { AttachmentList } from './attachments';
import {
  ComposerAddSheet,
  applyAttachmentSource,
  type AttachmentSource,
} from './attachment-sheet';
import { MedicalRecordsSection } from './medical';
import { PatientSwitcher, usePatientLabel } from './patients';
import { RecordDetailPage, sessionLevel } from './record-detail';
import {
  CareSessionPanel,
  CareUnreadBadge,
  HumanConversationPage,
  useCareSessionUnreadTotal,
} from './sessions';

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
  /** 病历 generated when the patient ends the conversation. */
  readonly medicalRecords: MedicalRecordStore;
  /** One visit session per conversation; the records tab lists these. */
  readonly careSessions: CareSessionStore;
  /** Per-conversation read marks behind the unread badges. */
  readonly careSessionReads: CareSessionReadStore;
  /** Attachment bytes for the conversation and the generated medical record. */
  readonly attachments: MedicalAttachmentStore;
}

/**
 * 对话: the family-doctor conversation. The active patient can be switched in
 * place, and every completed exchange is recorded against that patient.
 *
 * Above the conversation, the patient ends the session: the agent summarizes it
 * into a 病历 and the human doctor diagnoses it in 记录. Files, images, and
 * videos may be attached to any turn and travel with the record.
 */
export interface AiConversationPageProps extends ChatPageProps {
  readonly unreadTotal: number;
  readonly liveAiSessionId: string | null;
  readonly onOpenSessions: () => void;
}

/**
 * The conversation home. A `?session=` naming a human consultation renders that
 * conversation; otherwise the AI family-doctor conversation is shown. Both
 * surfaces own the same conversation list so the family can switch session from
 * either one.
 */
export function ChatPage(props: ChatPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessions = useSyncExternalStore(
    props.careSessions.subscribe,
    props.careSessions.list,
    props.careSessions.list,
  );
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const unreadTotal = useCareSessionUnreadTotal(sessions, props.careSessionReads);
  const requested = searchParams.get('session') ?? '';
  const humanSession = requested
    ? sessions.find((session) => session.id === requested && session.mode === 'human') ?? null
    : null;
  const openSession = (session: CareSession) => {
    setSessionsOpen(false);
    if (session.mode === 'human' && session.status === 'active') {
      navigate('/doctor/chat?session=' + encodeURIComponent(session.id));
      return;
    }
    if (session.mode === 'human') {
      navigate('/doctor/records/' + encodeURIComponent(session.id));
      return;
    }
    if (session.status === 'active') {
      navigate('/doctor/chat');
      return;
    }
    navigate('/doctor/records/' + encodeURIComponent(session.id));
  };

  const panel = sessionsOpen ? (
    <CareSessionPanel
      activeSessionId={humanSession?.id ?? null}
      liveAiSessionId={sessions.find((session) => session.status === 'active' && session.mode !== 'human')?.id ?? null}
      onClose={() => setSessionsOpen(false)}
      onSelect={openSession}
      reads={props.careSessionReads}
      sessions={sessions}
    />
  ) : null;

  if (humanSession) {
    return (
      <>
        <HumanConversationPage
          careSessions={props.careSessions}
          onOpenSessions={() => setSessionsOpen(true)}
          reads={props.careSessionReads}
          session={humanSession}
          unreadTotal={unreadTotal}
        />
        {panel}
      </>
    );
  }

  return (
    <>
      <AiConversationPage
        {...props}
        liveAiSessionId={sessions.find((session) => session.status === 'active' && session.mode !== 'human')?.id ?? null}
        onOpenSessions={() => setSessionsOpen(true)}
        unreadTotal={unreadTotal}
      />
      {panel}
    </>
  );
}

function AiConversationPage({
  agent,
  records,
  patients,
  medicalRecords,
  careSessions,
  careSessionReads,
  attachments,
  unreadTotal,
  liveAiSessionId,
  onOpenSessions,
}: AiConversationPageProps) {
  const { t } = useTranslation();
  const patientLabel = usePatientLabel();
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const active = profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null;
  const [messages, setMessages] = useState<readonly ChatMessage[]>(() => agent.history());
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<readonly MedicalAttachment[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The composer's "+" popup: open while the patient picks an attachment source. */
  const [addOpen, setAddOpen] = useState(false);

  // The AI conversation is being read right now; clear its badge without
  // touching any other conversation's mark.
  useEffect(() => {
    if (liveAiSessionId) careSessionReads.markRead(liveAiSessionId);
  }, [careSessionReads, liveAiSessionId, messages.length]);

  const sessionAttachments = useMemo(() => {
    const seen = new Set<string>();
    const all: MedicalAttachment[] = [];
    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (seen.has(attachment.id)) continue;
        seen.add(attachment.id);
        all.push(attachment);
      }
    }
    for (const attachment of pending) {
      if (seen.has(attachment.id)) continue;
      seen.add(attachment.id);
      all.push(attachment);
    }
    return all;
  }, [messages, pending]);

  const attach = (files: readonly File[]) => {
    if (files.length === 0) return;
    setError(null);
    void Promise.all(files.map((file) => attachments.put({
      file,
      name: file.name,
      mimeType: file.type || undefined,
    })))
      .then((added) => setPending((current) => [...current, ...added]))
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(t('platform.care.chat.attachmentFailed', { name: files[0]?.name ?? '', message }));
      });
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    attach(files);
  };

  /**
   * One choice of the "+" popup: point the hidden input at that source, then
   * open the chooser. Closing the popup never reaches this path.
   */
  const pickFrom = (source: AttachmentSource) => {
    setAddOpen(false);
    const input = fileRef.current;
    if (!input) return;
    applyAttachmentSource(input, source);
    input.click();
  };

  const removePending = (id: string) => {
    void attachments.remove(id);
    setPending((current) => current.filter((attachment) => attachment.id !== id));
  };

  const send = (input: string) => {
    const text = input.trim();
    if ((!text && pending.length === 0) || busy || ending || !active) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const sending = pending;
    void agent
      .send(text, { member: active, ...(sending.length > 0 ? { attachments: sending } : {}) })
      .then((reply) => {
        setMessages([...agent.history()]);
        setDraft('');
        setPending([]);
        records.add(createVisitRecord({
          member: active,
          symptom: text || sending.map((attachment) => attachment.name).join(', '),
          advice: reply.text,
          level: reply.triage?.level ?? 'routine',
          mode: agent.mode,
        }));
        // One 看病记录 per visit: the typed exchange joins the open session (or
        // starts one), so the detail page can replay the whole visit.
        const session = careSessions.ensureActive({
          member: active,
          mode: agent.mode,
          sessionId: agent.sessionId() ?? undefined,
        });
        sessionIdRef.current = session.id;
        const at = new Date().toISOString();
        careSessions.appendMessage(session.id, {
          role: 'patient',
          text: text || sending.map((attachment) => attachment.name).join(', '),
          at,
          channel: 'text',
          ...(reply.triage?.level ? { level: reply.triage.level } : {}),
          ...(sending.length > 0 ? { attachmentIds: sending.map((attachment) => attachment.id) } : {}),
        });
        careSessions.appendMessage(session.id, {
          role: 'assistant',
          text: reply.text,
          at: new Date().toISOString(),
          channel: 'text',
        });
        if (reply.triage?.escalate) {
          document.documentElement.dataset.triage = reply.triage.level;
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false));
  };

  const endConversation = () => {
    if (!active || ending || busy || messages.length === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(t('platform.care.medical.endConfirm'))) return;
    setEnding(true);
    setError(null);
    setNotice(null);
    const endedAt = new Date().toISOString();
    const open = careSessions.findActive(active.id)
      ?? (sessionIdRef.current ? careSessions.find(sessionIdRef.current) : null);
    const startedAt = open?.startedAt ?? sessionStartedAt;
    const turns = messages.map((message) => ({
      role: message.role === 'user' ? 'user' as const : 'assistant' as const,
      text: message.text || (message.attachments ?? []).map((attachment) => attachment.name).join(', '),
    }));
    void agent
      .summarize({
        member: active,
        transcript: turns,
        attachments: sessionAttachments.map((attachment) => ({ name: attachment.name, kind: attachment.kind })),
        startedAt,
        endedAt,
      })
      .then((draftSummary) => {
        const record = createMedicalRecord({
          member: active,
          mode: agent.mode,
          sessionId: open?.id ?? agent.sessionId() ?? undefined,
          startedAt,
          endedAt,
          summary: draftSummary.summary,
          attachments: sessionAttachments,
          transcript: messages.map((message) => createMedicalTranscriptEntry({
            id: message.id,
            role: message.role === 'user' ? 'patient' : 'assistant',
            text: message.text,
            at: message.createdAt,
            ...(message.triage ? { level: message.triage.level } : {}),
            ...((message.attachments ?? []).length > 0
              ? { attachmentIds: (message.attachments ?? []).map((attachment) => attachment.id) }
              : {}),
          })),
          diagnosis: {
            impression: draftSummary.diagnosis.impression,
            conditions: draftSummary.diagnosis.conditions,
            recommendations: draftSummary.diagnosis.recommendations,
            level: draftSummary.diagnosis.level,
            ...(draftSummary.diagnosis.notes ? { notes: draftSummary.diagnosis.notes } : {}),
          },
        });
        medicalRecords.add(record);
        if (open) {
          careSessions.end(open.id, { medicalRecordId: record.id, endedAt });
        }
        sessionIdRef.current = null;
        agent.reset();
        setMessages([]);
        setDraft('');
        setPending([]);
        setSessionStartedAt(new Date().toISOString());
        setNotice(t('platform.care.medical.generated') + ' ' + t('platform.care.medical.generatedHint'));
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(t('platform.care.medical.failed', { message }));
      })
      .finally(() => setEnding(false));
  };

  const modeLabel = agent.mode === 'hosted'
    ? t('platform.care.mode.hosted')
    : t('platform.care.mode.offline');

  return (
    <div className="doctor-chat-page">
      <header className="doctor-page-header doctor-chat-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.chat.title')}</h1>
          <p className="doctor-page-subtitle">
            {active
              ? t('platform.care.chat.subtitle', { member: patientLabel(active) })
              : t('platform.care.chat.noPatient')}
          </p>
        </div>
        <div className="doctor-chat-header-actions">
          <button className="doctor-session-trigger" onClick={onOpenSessions} type="button">
            <DoctorIcon name="chat" />
            <span>{t('platform.care.chat.openSessions')}</span>
            <CareUnreadBadge count={unreadTotal} />
          </button>
          <Link className="doctor-call-entry" to="/doctor/call?video=1">
            <DoctorIcon name="video" />
            <span>{t('platform.care.call.videoTitle')}</span>
          </Link>
        </div>
      </header>

      <MobileCard title={t('platform.care.chat.patient')} description={t('platform.care.chat.switchPatient')}>
        <PatientSwitcher patients={patients} />
      </MobileCard>

      <MobileCard title={t('platform.care.medical.session')} description={t('platform.care.medical.sessionActive')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={agent.mode === 'hosted' ? 'ok' : 'skipped'}>{modeLabel}</span>
          <span className="doctor-check-detail">
            {t('platform.care.medical.sessionMeta', { messages: messages.length, attachments: sessionAttachments.length })}
          </span>
        </div>
        {notice ? <div className="doctor-notice">{notice}</div> : null}
        <div className="doctor-form-actions">
          <ActionButton
            disabled={ending || busy || messages.length === 0 || !active}
            onClick={endConversation}
            tone="primary"
          >
            {ending ? t('platform.care.medical.ending') : t('platform.care.medical.endAction')}
          </ActionButton>
        </div>
        {!active ? <p className="doctor-check-detail">{t('platform.care.medical.endEmpty')}</p> : null}
      </MobileCard>

      {error ? <div className="doctor-error-banner">{t('platform.care.chat.error', { message: error })}</div> : null}

      <MobileCard title={t('platform.care.chat.panel')}>
        <ul className="doctor-check-list" aria-live="polite">
          {messages.length === 0 ? (
            <li className="doctor-check"><p className="doctor-check-summary">{t('platform.care.chat.empty')}</p></li>
          ) : messages.map((message) => (
            <li className="doctor-check" key={message.id}>
              <div>
                <h3 className="doctor-check-title">{message.role === 'user' ? t('platform.care.chat.you') : t('platform.care.chat.doctor')}</h3>
                {message.text ? <p className="doctor-check-summary">{message.text}</p> : null}
                <AttachmentList attachments={message.attachments ?? []} store={attachments} />
              </div>
              {message.triage ? <span className="doctor-badge" data-status={message.triage.escalate ? 'warn' : 'ok'}>{t('platform.care.level.' + message.triage.level)}</span> : <span />}
            </li>
          ))}
        </ul>
        {pending.length > 0 ? (
          <AttachmentList attachments={pending} onRemove={removePending} store={attachments} />
        ) : null}
        <p className="doctor-check-detail">{t('platform.care.chat.attachmentHint')}</p>
      </MobileCard>

      <div className="doctor-chat-dock">
        {/* The source attributes are applied per choice in `pickFrom`, so one
            input serves the camera, the library, and the file browser. */}
        <input
          className="doctor-attachment-input"
          multiple
          onChange={onFileChange}
          ref={fileRef}
          type="file"
        />
        <SdkworkChatComposer
          busy={busy || ending}
          disabled={!active}
          labels={{
            attach: t('platform.care.chat.attach'),
            busy: t('platform.care.chat.sending'),
            inputLabel: t('platform.care.chat.inputLabel'),
            mode: t('platform.care.me.mode'),
            placeholder: active ? t('platform.care.chat.placeholder') : t('platform.care.chat.noPatient'),
            send: t('platform.care.chat.send'),
            voice: t('platform.care.chat.voice'),
          }}
          mode={active
            ? { label: modeLabel }
            : null}
          // "+" opens the source popup first; a dismissed popup opens no chooser.
          onAttach={() => setAddOpen(true)}
          onSend={send}
          onValueChange={setDraft}
          value={draft}
        />
      </div>

      <ComposerAddSheet
        labels={{
          camera: t('platform.care.chat.attachCamera'),
          files: t('platform.care.chat.attachFile'),
          media: t('platform.care.chat.attachMedia'),
          title: t('platform.care.chat.attach'),
        }}
        onClose={() => setAddOpen(false)}
        onPick={pickFrom}
        open={addOpen}
      />
    </div>
  );
}

export interface DoctorPageProps {
  /** Roster loaded by the shell: deployment directory or authored fallback. */
  readonly roster: DoctorRoster | null;
  readonly rosterLoading: boolean;
  readonly patients: PatientProfileStore;
  readonly records: VisitRecordStore;
  /** Human consultations are conversations: this store owns the session. */
  readonly careSessions: CareSessionStore;
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
  careSessions,
  selection,
  agents,
  agentMode,
}: DoctorPageProps) {
  const { t } = useTranslation();
  const patientLabel = usePatientLabel();
  const navigate = useNavigate();
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
    if (profiles.length === 0) {
      setError(t('platform.care.chat.noPatient'));
      return;
    }
    const site = siteOf(doctor);
    if (!site) {
      setError(t('platform.care.doctors.noChannel'));
      return;
    }
    // The consultation is a conversation, not an external launch: open the
    // session addressed to this doctor and land on the conversation home.
    const session = careSessions.startHumanConsultation({
      member: active,
      doctor: {
        id: doctor.id,
        displayName: doctor.displayName,
        department: site.department,
        hospitalName: site.hospitalName,
        organizationId: site.organizationId,
        employmentType: site.employmentType,
        avatarUrl: doctorAvatarHref(doctor.avatarUrl),
      },
      reason: symptom,
    });
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
    navigate('/doctor/chat?session=' + encodeURIComponent(session.id));
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

      <MobileCard title={t('platform.care.doctors.ai')} description={t('platform.care.doctors.aiHint')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={agentMode === 'hosted' ? 'ok' : 'skipped'}>
            {agentMode === 'hosted' ? t('platform.care.doctors.aiHosted') : t('platform.care.doctors.aiOffline')}
          </span>
          {familyAgent ? (
            <span className="doctor-badge" data-status="ok">{familyAgent.displayName} · {familyAgent.status}</span>
          ) : null}
        </div>
      </MobileCard>

      <MobileCard title={t('platform.care.doctors.mine')} description={t('platform.care.doctors.chooseHint')}>
        {selected.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.doctors.none')}</p>
        ) : (
          <ul className="doctor-card-list">
            {selected.map((doctor) => {
              const site = primaryAffiliation(doctor);
              return (
                <li className="doctor-list-card" key={doctor.id}>
                  <div className="doctor-card-head">
                    <div className="doctor-card-identity">
                      <DoctorAvatar name={doctor.displayName} src={doctorAvatarHref(doctor.avatarUrl)} />
                      <div className="doctor-card-copy">
                        <h3 className="doctor-check-title">{doctor.displayName}</h3>
                        {site ? renderSiteLine(doctor, site) : null}
                      </div>
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
      </MobileCard>

      <MobileCard title={t('platform.care.doctors.directory')}>
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
                    <div className="doctor-card-identity">
                      <DoctorAvatar name={doctor.displayName} src={doctorAvatarHref(doctor.avatarUrl)} />
                      <div className="doctor-card-copy">
                        <h3 className="doctor-check-title">{doctor.displayName}</h3>
                        {site ? renderSiteLine(doctor, site) : null}
                      </div>
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
                        {t('platform.care.doctors.consultHint', { doctor: doctor.displayName })}
                        {channel ? ' · ' + t(channelLabelKey(site)) : ''}
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
                        <ActionButton tone="primary" onClick={() => startConsultation(doctor)}>
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
      </MobileCard>
    </div>
  );
}

export interface RecordsPageProps {
  readonly records: VisitRecordStore;
  /** 病历 generated by ending conversations, with both diagnosis records. */
  readonly medicalRecords: MedicalRecordStore;
  /** One conversation session per visit; the records list is this store. */
  readonly careSessions: CareSessionStore;
  /** Read marks behind the unread badges of each conversation. */
  readonly careSessionReads: CareSessionReadStore;
  /** Attachment bytes referenced by the medical records. */
  readonly attachments: MedicalAttachmentStore;
  readonly roster: DoctorRoster | null;
  readonly selection: DoctorSelectionStore;
}

/**
 * 看病记录: one row per conversation session, newest first. Each row opens the
 * dedicated 4-tab detail page (病历 / AI总结 / 医生人工确认 / 通话回放); the list
 * never expands the full record in place. A human consultation prints its doctor
 * and the unread doctor replies, exactly like the conversation list.
 */
export function RecordsPage({
  careSessions,
  careSessionReads,
  medicalRecords,
  attachments,
  records,
}: RecordsPageProps) {
  const { t, i18n } = useTranslation();
  const sessions = useSyncExternalStore(careSessions.subscribe, careSessions.list, careSessions.list);
  const medicalItems = useSyncExternalStore(medicalRecords.subscribe, medicalRecords.list, medicalRecords.list);
  const readMarks = useSyncExternalStore(
    careSessionReads.subscribe,
    careSessionReads.snapshot,
    careSessionReads.snapshot,
  );
  const items = mergeCareSessions(sessions, medicalItems);
  void records;

  const clear = () => {
    if (items.length === 0) return;
    if (typeof window === 'undefined' || window.confirm(t('platform.care.records.clearAllConfirm'))) {
      careSessions.clear();
      medicalRecords.clear();
      void attachments.clear();
    }
  };

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <h1 className="doctor-page-title">{t('platform.care.records.title')}</h1>
          <p className="doctor-page-subtitle">{t('platform.care.records.subtitle')}</p>
        </div>
        <span className="doctor-badge" data-status="ok">
          {t('platform.care.records.sessionCount', { count: items.length })}
        </span>
      </header>

      {items.length === 0 ? (
        <MobileCard>
          <p className="doctor-empty">{t('platform.care.records.empty')}</p>
        </MobileCard>
      ) : (
        <ul className="doctor-card-list">
          {items.map((session) => {
            const record = careSessionRecord(session, medicalItems);
            const level = sessionLevel(session);
            const status = session.status === 'active'
              ? 'active'
              : record
                ? (record.confirmation ? 'confirmed' : 'awaiting_doctor')
                : 'ended';
            const unread = session.mode === 'human'
              ? careSessionUnreadCount(session, readMarks[session.id])
              : 0;
            const doctor = session.doctor
              ? [session.doctor.displayName, session.doctor.department].filter((part) => Boolean(part)).join(' · ')
              : '';
            return (
              <li key={session.id}>
                <Link className="doctor-list-card doctor-visit-card" to={'/doctor/records/' + encodeURIComponent(session.id)}>
                  <div className="doctor-card-head">
                    <div className="doctor-card-copy">
                      <h3 className="doctor-check-title">{session.title}</h3>
                      <p className="doctor-check-detail">
                        {session.memberLabel} · {new Date(session.startedAt).toLocaleString(i18n.language)}
                        {doctor ? ' · ' + doctor : ''}
                      </p>
                      <p className="doctor-check-summary">
                        {record ? record.aiDiagnosis.impression : t('platform.care.record.recordPending')}
                      </p>
                      <div className="doctor-inline-badges">
                        <span className="doctor-badge" data-status={status === 'active' ? 'skipped' : status === 'awaiting_doctor' ? 'warn' : 'ok'}>
                          {t('platform.care.records.status.' + status)}
                        </span>
                        {session.mode === 'human' ? (
                          <span className="doctor-badge" data-status="ok">{t('platform.care.sessions.human')}</span>
                        ) : null}
                        {careSessionAwaitingDoctorReply(session) ? (
                          <span className="doctor-badge" data-status="warn">{t('platform.care.sessions.waiting')}</span>
                        ) : null}
                        <span className="doctor-badge" data-status="ok">
                          {t('platform.care.records.messageCount', { count: session.transcript.length })}
                        </span>
                        {session.calls.length > 0 ? (
                          <span className="doctor-badge" data-status="skipped">
                            {t('platform.care.records.callCount', { count: session.calls.length })}
                          </span>
                        ) : null}
                        {level !== 'self-care' ? (
                          <span className="doctor-badge" data-status={level === 'emergency' || level === 'urgent' ? 'warn' : 'ok'}>
                            {t('platform.care.level.' + level)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="doctor-visit-actions">
                      <CareUnreadBadge count={unread} />
                      <span className="doctor-visit-open">{t('platform.care.records.open')} ›</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="doctor-form-actions">
        <ActionButton disabled={items.length === 0} onClick={clear}>{t('platform.care.records.clearAll')}</ActionButton>
      </div>
    </div>
  );
}

