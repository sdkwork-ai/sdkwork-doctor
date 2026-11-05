import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  buildCarePlayback,
  careSessionDurationMs,
  careSessionHasCall,
  careSessionLevel,
  careSessionRecord,
  mergeCareSessions,
  medicalRecordNeedsDoctorReview,
  resolvePrimaryDoctor,
  type CarePlaybackItem,
  type CareSession,
  type CareSessionStore,
  type CareSessionChannel,
  type DoctorRoster,
  type DoctorSelectionStore,
  type MedicalAttachmentStore,
  type MedicalRecord,
  type MedicalRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, MobileCard } from '@sdkwork/doctor-h5-commons';

import { AttachmentList } from './attachments';
import { DiagnosisBlock, DoctorReviewForm } from './medical';

type DetailTab = 'medical' | 'ai' | 'doctor' | 'playback';

const TABS: readonly DetailTab[] = Object.freeze(['medical', 'ai', 'doctor', 'playback']);

function tabLabelKey(tab: DetailTab): string {
  return 'platform.care.record.tab.' + tab;
}

function channelLabelKey(channel: CareSessionChannel): string {
  return 'platform.care.record.channel.' + channel;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? hours + ':' + two(minutes) + ':' + two(seconds) : minutes + ':' + two(seconds);
}

function statusKey(session: CareSession, record: MedicalRecord | null): string {
  if (session.status === 'active') return 'platform.care.records.status.active';
  if (!record) return 'platform.care.records.status.ended';
  return medicalRecordNeedsDoctorReview(record)
    ? 'platform.care.records.status.awaiting_doctor'
    : 'platform.care.records.status.confirmed';
}

function statusTone(session: CareSession, record: MedicalRecord | null): 'ok' | 'warn' | 'skipped' {
  if (session.status === 'active') return 'skipped';
  if (!record) return 'ok';
  return medicalRecordNeedsDoctorReview(record) ? 'warn' : 'ok';
}

function chiefComplaint(session: CareSession): string {
  const turn = session.transcript.find((message) => (
    message.role === 'patient' && message.text.trim().length > 0
  ));
  return turn?.text ?? '';
}

function RecordHeader({
  session,
  record,
}: {
  readonly session: CareSession;
  readonly record: MedicalRecord | null;
}) {
  const { t, i18n } = useTranslation();
  const doctor = session.doctor
    ? [session.doctor.displayName, session.doctor.department, session.doctor.hospitalName]
      .filter((part) => Boolean(part))
      .join(' · ')
    : '';
  return (
    <header className="doctor-page-header doctor-record-header">
      <Link className="doctor-back-link" to="/doctor/records">
        ← {t('platform.care.records.backToRecords')}
      </Link>
      <div className="doctor-record-heading">
        <div>
          <h1 className="doctor-page-title">{session.title}</h1>
          <p className="doctor-page-subtitle">
            {session.memberLabel} · {new Date(session.startedAt).toLocaleString(i18n.language)}
            {session.endedAt ? ' — ' + new Date(session.endedAt).toLocaleTimeString(i18n.language) : ''}
          </p>
          {doctor ? (
            <p className="doctor-page-subtitle">
              {t('platform.care.sessions.human')} · {doctor}
            </p>
          ) : null}
        </div>
        <span className="doctor-badge" data-status={statusTone(session, record)}>
          {t(statusKey(session, record))}
        </span>
      </div>
    </header>
  );
}

/**
 * The doctor's own reply surface for a human consultation.
 *
 * The clinician takes the device, writes in the family app, and the reply lands
 * in the conversation the family reads in 对话. Only a human session offers this
 * action; an AI session never accepts a doctor reply.
 */
function DoctorReplyCard({
  session,
  store,
}: {
  readonly session: CareSession;
  readonly store: CareSessionStore;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = session.status === 'active' && session.mode === 'human';
  const send = () => {
    if (!active) return;
    const reply = text.trim();
    if (!reply) {
      setError(t('platform.care.sessions.replyRequired'));
      return;
    }
    try {
      store.replyAsDoctor(session.id, { text: reply });
      setText('');
      setError(null);
      setNotice(t('platform.care.sessions.replySaved'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <MobileCard
      title={t('platform.care.sessions.replyTitle')}
      description={t('platform.care.sessions.replyHint')}
    >
      <div className="doctor-inline-badges">
        <span className="doctor-badge" data-status="ok">
          {session.doctor?.displayName ?? t('platform.care.sessions.untitledDoctor')}
        </span>
        <span className="doctor-badge" data-status="skipped">
          {t(active ? 'platform.care.sessions.active' : 'platform.care.sessions.ended')}
        </span>
      </div>
      <textarea
        aria-label={t('platform.care.sessions.replyTitle')}
        className="doctor-textarea"
        onChange={(event) => setText(event.target.value)}
        placeholder={t('platform.care.sessions.replyPlaceholder')}
        rows={3}
        value={text}
      />
      {notice ? <div className="doctor-notice">{notice}</div> : null}
      {error ? <div className="doctor-error-banner">{error}</div> : null}
      <div className="doctor-form-actions">
        <ActionButton disabled={!active} onClick={send} tone="primary">
          {t('platform.care.sessions.replyAction')}
        </ActionButton>
      </div>
    </MobileCard>
  );
}

function MedicalTab({
  session,
  record,
  attachments,
}: {
  readonly session: CareSession;
  readonly record: MedicalRecord | null;
  readonly attachments: MedicalAttachmentStore;
}) {
  const { t, i18n } = useTranslation();
  const complaint = chiefComplaint(session);
  const recordAttachments = record?.attachments ?? [];
  const channelFor = (id: string): CareSessionChannel => (
    session.transcript.find((message) => message.id === id)?.channel ?? 'text'
  );

  return (
    <div className="doctor-record-stack">
      {session.status === 'active' ? (
        <div className="doctor-notice">{t('platform.care.record.recordPending')}</div>
      ) : null}

      <MobileCard title={t('platform.care.record.visitTime')}>
        <dl className="doctor-fact-grid">
          <div><dt>{t('platform.care.records.member')}</dt><dd>{session.memberLabel}</dd></div>
          <div><dt>{t('platform.care.record.visitTime')}</dt><dd>{new Date(session.startedAt).toLocaleString(i18n.language)}</dd></div>
          <div><dt>{t('platform.care.record.duration')}</dt><dd>{formatDuration(careSessionDurationMs(session))}</dd></div>
          <div><dt>{t('platform.care.records.mode')}</dt><dd>{t(session.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline')}</dd></div>
          <div><dt>{t('platform.care.record.status')}</dt><dd>{t(statusKey(session, record))}</dd></div>
          <div><dt>{t('platform.care.record.doctor')}</dt><dd>{record?.confirmation?.doctorLabel ?? t('platform.care.record.doctorUnassigned')}</dd></div>
        </dl>
      </MobileCard>

      {complaint ? (
        <MobileCard title={t('platform.care.record.chiefComplaint')}>
          <p className="doctor-check-summary">{complaint}</p>
        </MobileCard>
      ) : null}

      <MobileCard title={t('platform.care.record.transcript')} description={t('platform.care.record.recordHint')}>
        {session.transcript.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.record.transcriptEmpty')}</p>
        ) : (
          <ul className="doctor-check-list doctor-timeline">
            {session.transcript.map((message) => (
              <li className="doctor-check" key={message.id}>
                <div>
                  <div className="doctor-inline-badges">
                    <h3 className="doctor-check-title">
                      {t(message.role === 'patient' ? 'platform.care.chat.you' : 'platform.care.chat.doctor')}
                    </h3>
                    <span className="doctor-badge" data-status="skipped">
                      {t(channelLabelKey(message.channel))}
                    </span>
                    {message.level ? (
                      <span className="doctor-badge" data-status={message.level === 'emergency' || message.level === 'urgent' ? 'warn' : 'ok'}>
                        {t('platform.care.level.' + message.level)}
                      </span>
                    ) : null}
                  </div>
                  {message.text ? <p className="doctor-check-summary">{message.text}</p> : null}
                  {message.attachmentIds && message.attachmentIds.length > 0 ? (
                    <AttachmentList
                      attachments={recordAttachments.filter((attachment) => message.attachmentIds?.includes(attachment.id))}
                      store={attachments}
                    />
                  ) : null}
                  <p className="doctor-check-detail">{new Date(message.at).toLocaleString(i18n.language)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </MobileCard>

      <MobileCard title={t('platform.care.record.attachments')}>
        {recordAttachments.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.record.attachmentsEmpty')}</p>
        ) : (
          <AttachmentList attachments={recordAttachments} store={attachments} />
        )}
      </MobileCard>
    </div>
  );
}

function AiTab({ session, record }: { readonly session: CareSession; readonly record: MedicalRecord | null }) {
  const { t } = useTranslation();
  if (!record) {
    return <div className="doctor-notice">{t('platform.care.record.aiPending')}</div>;
  }
  return (
    <div className="doctor-record-stack">
      <div className="doctor-notice">{t('platform.care.record.aiHint')}</div>
      <MobileCard title={t('platform.care.record.aiTitle')}>
        <p className="doctor-check-summary">{record.summary}</p>
      </MobileCard>
      <MobileCard>
        <DiagnosisBlock
          diagnosis={record.aiDiagnosis}
          hint={t('platform.care.medical.aiDiagnosisHint')}
          title={t('platform.care.medical.aiDiagnosis')}
        />
      </MobileCard>
      <p className="doctor-check-detail">
        {t('platform.care.records.messages', { count: session.transcript.length })}
        {careSessionHasCall(session) ? ' · ' + t('platform.care.records.calls', { count: session.calls.length }) : ''}
      </p>
    </div>
  );
}

function DoctorTab({
  session,
  record,
  store,
  primaryDoctorName,
}: {
  readonly session: CareSession;
  readonly record: MedicalRecord | null;
  readonly store: MedicalRecordStore;
  readonly primaryDoctorName: string;
}) {
  const { t, i18n } = useTranslation();
  if (!record) {
    return <div className="doctor-notice">{t('platform.care.record.doctorPending')}</div>;
  }
  const needsReview = medicalRecordNeedsDoctorReview(record);
  return (
    <div className="doctor-record-stack">
      <MobileCard title={t('platform.care.record.confirmationStatus')} description={t('platform.care.record.doctorHint')}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={needsReview ? 'warn' : 'ok'}>
            {t('platform.care.medical.status.' + (needsReview ? 'awaiting_doctor' : 'confirmed'))}
          </span>
        </div>
        {record.confirmation ? (
          <p className="doctor-check-detail">
            {t('platform.care.medical.decision.' + record.confirmation.decision)}
            {' · '}
            {t('platform.care.medical.confirmedBy', {
              doctor: record.confirmation.doctorLabel,
              at: new Date(record.confirmation.confirmedAt).toLocaleString(i18n.language),
            })}
          </p>
        ) : null}
      </MobileCard>

      <MobileCard>
        <DiagnosisBlock
          diagnosis={record.aiDiagnosis}
          hint={t('platform.care.medical.aiDiagnosisHint')}
          title={t('platform.care.medical.aiDiagnosis')}
        />
      </MobileCard>

      <MobileCard title={t('platform.care.medical.doctorDiagnosis')}>
        {record.doctorDiagnosis ? (
          <DiagnosisBlock
            diagnosis={record.doctorDiagnosis}
            hint={t('platform.care.medical.doctorDiagnosisHint')}
            title={t('platform.care.medical.doctorDiagnosis')}
          />
        ) : (
          <p className="doctor-empty">{t('platform.care.medical.noDoctorDiagnosis')}</p>
        )}
      </MobileCard>

      <MobileCard>
        <DoctorReviewForm
          initialMode={needsReview ? 'confirm' : 'manual'}
          primaryDoctorName={primaryDoctorName}
          record={record}
          store={store}
        />
      </MobileCard>
      <p className="doctor-check-detail">
        {t('platform.care.records.member')}: {session.memberLabel}
      </p>
    </div>
  );
}

function PlaybackItemRow({
  item,
  active,
  onSelect,
}: {
  readonly item: CarePlaybackItem;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const time = new Date(item.at).toLocaleTimeString(i18n.language);
  if (item.kind === 'call') {
    return (
      <li className="doctor-timeline-call" data-active={active ? 'true' : undefined}>
        <span className="doctor-badge" data-status="skipped">
          {t(item.mode === 'video' ? 'platform.care.record.playback.callVideo' : 'platform.care.record.playback.callVoice')}
        </span>
        <span className="doctor-check-detail">
          {time} · {formatDuration(item.durationMs)}
          {item.open ? ' · ' + t('platform.care.record.playback.callOpen') : ''}
        </span>
      </li>
    );
  }
  return (
    <li className="doctor-check" data-active={active ? 'true' : undefined}>
      <div>
        <div className="doctor-inline-badges">
          <h3 className="doctor-check-title">
            {t(item.role === 'patient' ? 'platform.care.record.playback.patient' : 'platform.care.record.playback.doctor')}
          </h3>
          <span className="doctor-badge" data-status="skipped">{t(channelLabelKey(item.channel))}</span>
          <span className="doctor-check-detail">
            {t('platform.care.record.playback.offset', { time })} · {formatDuration(item.offsetMs)}
          </span>
        </div>
        <p className="doctor-check-summary">{item.text}</p>
      </div>
      <ActionButton onClick={onSelect}>{t('platform.care.record.playback.jump')}</ActionButton>
    </li>
  );
}

export function CarePlaybackPanel({ session }: { readonly session: CareSession }) {
  const { t, i18n } = useTranslation();
  const timeline = useMemo(() => buildCarePlayback(session), [session]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const stopped = useRef(false);

  const cancel = useCallback(() => {
    stopped.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const messageCount = timeline.filter((item) => item.kind === 'message').length;
  const spokenCount = activeIndex < 0
    ? 0
    : timeline.slice(0, activeIndex + 1).filter((item) => item.kind === 'message').length;

  const speakFrom = useCallback((from: number) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    stopped.current = false;
    setFinished(false);
    setPlaying(true);
    let index = Math.max(0, from);
    const step = () => {
      if (stopped.current) return;
      while (index < timeline.length) {
        const candidate = timeline[index];
        if (candidate.kind === 'message' && candidate.text.trim().length > 0) break;
        index += 1;
      }
      if (index >= timeline.length) {
        setPlaying(false);
        setFinished(true);
        setActiveIndex(-1);
        return;
      }
      const item = timeline[index];
      if (item.kind !== 'message') return;
      setActiveIndex(index);
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = i18n.language === 'en-US' ? 'en-US' : 'zh-CN';
      utterance.onend = () => {
        index += 1;
        step();
      };
      utterance.onerror = () => {
        index += 1;
        step();
      };
      window.speechSynthesis.speak(utterance);
    };
    step();
  }, [i18n.language, supported, timeline]);

  const stop = () => {
    cancel();
    setPlaying(false);
    setActiveIndex(-1);
    setFinished(false);
  };

  const toggle = () => {
    if (playing) {
      cancel();
      setPlaying(false);
      return;
    }
    speakFrom(activeIndex >= 0 ? activeIndex : 0);
  };

  const select = (index: number) => {
    const wasPlaying = playing;
    cancel();
    setActiveIndex(index);
    if (wasPlaying) speakFrom(index);
  };

  if (timeline.length === 0 || messageCount === 0) {
    return <div className="doctor-empty">{t('platform.care.record.playback.empty')}</div>;
  }

  return (
    <div className="doctor-record-stack">
      <div className="doctor-notice">{t('platform.care.record.playback.hint')}</div>
      <MobileCard title={t('platform.care.record.playback.title')}>
        <div className="doctor-playback-controls">
          <ActionButton onClick={toggle} tone="primary">
            {playing
              ? t('platform.care.record.playback.pause')
              : finished
                ? t('platform.care.record.playback.replay')
                : t('platform.care.record.playback.play')}
          </ActionButton>
          <ActionButton onClick={stop}>{t('platform.care.record.playback.stop')}</ActionButton>
          <span className="doctor-check-detail">
            {playing
              ? t('platform.care.record.playback.speaking')
              : finished
                ? t('platform.care.record.playback.finished')
                : t('platform.care.record.playback.aiVoice')}
          </span>
          <span className="doctor-check-detail">
            {spokenCount}/{messageCount}
          </span>
        </div>
        {!supported ? (
          <p className="doctor-empty">{t('platform.care.record.playback.unavailable')}</p>
        ) : null}
        {!playing && activeIndex < 0 ? (
          <div className="doctor-progress" aria-hidden="true"><span style={{ width: '0%' }} /></div>
        ) : (
          <div className="doctor-progress" aria-hidden="true">
            <span style={{ width: (messageCount === 0 ? 0 : (spokenCount / messageCount) * 100) + '%' }} />
          </div>
        )}
      </MobileCard>

      <MobileCard>
        <ul className="doctor-check-list doctor-timeline">
          {timeline.map((item, index) => (
            <PlaybackItemRow
              active={index === activeIndex}
              item={item}
              key={item.kind + '-' + item.id}
              onSelect={() => select(index)}
            />
          ))}
        </ul>
      </MobileCard>
    </div>
  );
}

export interface RecordDetailPageProps {
  readonly careSessions: CareSessionStore;
  readonly medicalRecords: MedicalRecordStore;
  readonly attachments: MedicalAttachmentStore;
  readonly roster: DoctorRoster | null;
  readonly selection: DoctorSelectionStore;
}

/**
 * One 看病记录: a conversation session with its 病历. The page is a route of its
 * own (`/doctor/records/:recordId`) so it can be linked, refreshed, and read on
 * a phone without the list in the way. Tabs: 病历 / AI总结 / 医生人工确认 /
 * 通话回放.
 */
export function RecordDetailPage({
  careSessions,
  medicalRecords,
  attachments,
  roster,
  selection,
}: RecordDetailPageProps) {
  const { t } = useTranslation();
  const { recordId = '' } = useParams();
  const id = decodeURIComponent(recordId);
  const sessions = useSyncExternalStore(careSessions.subscribe, careSessions.list, careSessions.list);
  const records = useSyncExternalStore(medicalRecords.subscribe, medicalRecords.list, medicalRecords.list);
  const [tab, setTab] = useState<DetailTab>('medical');
  const selectionState = useSyncExternalStore(selection.subscribe, selection.state, selection.state);
  const primary = roster ? resolvePrimaryDoctor(roster, selectionState) : null;
  const primaryDoctorName = primary?.displayName ?? '';

  const merged = useMemo(() => mergeCareSessions(sessions, records), [sessions, records]);
  const session = merged.find((entry) => entry.id === id) ?? null;
  const record = session ? careSessionRecord(session, records) : null;

  if (!session) {
    return (
      <div className="doctor-record-stack">
        <Link className="doctor-back-link" to="/doctor/records">← {t('platform.care.records.backToRecords')}</Link>
        <div className="doctor-empty">{t('platform.care.records.notFound')}</div>
      </div>
    );
  }

  return (
    <div className="doctor-record-page">
      <RecordHeader record={record} session={session} />

      {session.mode === 'human' ? (
        <DoctorReplyCard session={session} store={careSessions} />
      ) : null}

      <div aria-label={t('platform.care.records.detailTitle')} className="doctor-record-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            aria-selected={tab === entry}
            className="doctor-record-tab"
            data-active={tab === entry ? 'true' : undefined}
            key={entry}
            onClick={() => setTab(entry)}
            role="tab"
            type="button"
          >
            {t(tabLabelKey(entry))}
          </button>
        ))}
      </div>

      <div className="doctor-record-panel" role="tabpanel">
        {tab === 'medical' ? (
          <MedicalTab attachments={attachments} record={record} session={session} />
        ) : tab === 'ai' ? (
          <AiTab record={record} session={session} />
        ) : tab === 'doctor' ? (
          <DoctorTab
            primaryDoctorName={primaryDoctorName}
            record={record}
            session={session}
            store={medicalRecords}
          />
        ) : (
          <CarePlaybackPanel session={session} />
        )}
      </div>
    </div>
  );
}

/** Triage level of the session, for the list badge. */
export function sessionLevel(session: CareSession) {
  return careSessionLevel(session);
}
