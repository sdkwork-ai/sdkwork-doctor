import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  careSessionAwaitingDoctorReply,
  careSessionLastMessage,
  careSessionUnreadCount,
  type CareSession,
  type CareSessionReadStore,
  type CareSessionStore,
} from '@sdkwork/doctor-common-doctor';
import { ActionButton, DoctorAvatar, Panel } from '@sdkwork/doctor-pc-commons';

/** Doctor identity printed on a conversation row. Empty name means the AI family doctor. */
export function careSessionDoctorLabel(session: CareSession): string {
  const doctor = session.doctor;
  if (!doctor) return '';
  return [doctor.displayName, doctor.department].filter((part) => Boolean(part)).join(' · ');
}

/** `HH:mm` for a conversation touched today, a short date otherwise. */
export function careSessionTime(at: string, locale: string, now = Date.now()): string {
  const value = new Date(at);
  if (Number.isNaN(value.getTime())) return '';
  const sameDay = new Date(now).toDateString() === value.toDateString();
  return sameDay
    ? value.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : value.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
}

/** Last-turn preview of a conversation. */
export function careSessionPreview(session: CareSession): string {
  const last = careSessionLastMessage(session);
  if (!last) return '';
  const text = last.text.trim();
  return text || (last.attachmentIds && last.attachmentIds.length > 0 ? '…' : '');
}

export function useCareSessionUnread(session: CareSession, reads: CareSessionReadStore): number {
  const lastReadAt = useSyncExternalStore(
    reads.subscribe,
    () => reads.lastReadAt(session.id),
    () => reads.lastReadAt(session.id),
  );
  return careSessionUnreadCount(session, lastReadAt);
}

/** Total unread across the list, used by the chat header trigger. */
export function useCareSessionUnreadTotal(
  sessions: readonly CareSession[],
  reads: CareSessionReadStore,
): number {
  const marks = useSyncExternalStore(reads.subscribe, reads.snapshot, reads.snapshot);
  let total = 0;
  for (const session of sessions) {
    // Only a human consultation carries doctor replies the family can miss;
    // an AI exchange is answered while the family is looking at it.
    if (session.mode !== 'human') continue;
    total += careSessionUnreadCount(session, marks[session.id]);
  }
  return total;
}

/** Small count pill used on a row and on the header trigger. */
export function CareUnreadBadge({ count }: { readonly count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <span aria-label={t('platform.care.sessions.unreadLabel')} className="doctor-unread-badge">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export interface CareSessionPanelProps {
  readonly sessions: readonly CareSession[];
  readonly reads: CareSessionReadStore;
  readonly activeSessionId: string | null;
  readonly liveAiSessionId: string | null;
  readonly onSelect: (session: CareSession) => void;
  readonly onClose: () => void;
}

/**
 * The conversation list: every session on this device, newest first. Rows state
 * who the conversation belongs to, when it last changed, and how many doctor
 * turns the family has not read yet.
 */
export function CareSessionPanel({
  sessions,
  reads,
  activeSessionId,
  liveAiSessionId,
  onSelect,
  onClose,
}: CareSessionPanelProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="doctor-session-overlay" onClick={onClose} role="presentation">
      <section
        aria-label={t('platform.care.sessions.title')}
        aria-modal="true"
        className="doctor-session-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="doctor-session-head">
          <div>
            <h2 className="doctor-page-title">{t('platform.care.sessions.title')}</h2>
            <p className="doctor-page-subtitle">{t('platform.care.sessions.subtitle')}</p>
          </div>
          <button
            aria-label={t('platform.care.action.cancel')}
            className="doctor-icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {sessions.length === 0 ? (
          <p className="doctor-empty">{t('platform.care.sessions.empty')}</p>
        ) : (
          <ul className="doctor-session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <CareSessionRow
                  active={session.id === activeSessionId}
                  liveAi={session.id === liveAiSessionId}
                  onSelect={() => onSelect(session)}
                  reads={reads}
                  session={session}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="doctor-check-detail">{t('platform.care.sessions.switchHint')}</p>
      </section>
    </div>
  );
}

function CareSessionRow({
  session,
  reads,
  active,
  liveAi,
  onSelect,
}: {
  readonly session: CareSession;
  readonly reads: CareSessionReadStore;
  readonly active: boolean;
  readonly liveAi: boolean;
  readonly onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const sessionUnread = useCareSessionUnread(session, reads);
  const unread = session.mode === 'human' ? sessionUnread : 0;
  const waiting = careSessionAwaitingDoctorReply(session);
  const doctor = careSessionDoctorLabel(session) || t('platform.care.doctors.ai');
  const preview = careSessionPreview(session);
  return (
    <button
      className="doctor-session-row"
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
      type="button"
    >
      <span className="doctor-session-avatar">
        {session.doctor ? (
          <DoctorAvatar name={session.doctor.displayName} src={session.doctor.avatarUrl ?? ''} />
        ) : (
          <span aria-hidden="true">AI</span>
        )}
      </span>
      <span className="doctor-session-copy">
        <span className="doctor-session-row-head">
          <strong>{session.title}</strong>
          <span className="doctor-session-time">{careSessionTime(session.updatedAt, i18n.language)}</span>
        </span>
        <span className="doctor-session-meta">
          {doctor}
          {session.mode === 'human' ? ' · ' + t('platform.care.sessions.human') : ''}
          {liveAi ? ' · ' + t('platform.care.sessions.active') : ''}
        </span>
        {preview ? <span className="doctor-session-preview">{preview}</span> : null}
        <span className="doctor-inline-badges">
          <span className="doctor-badge" data-status={session.status === 'active' ? 'skipped' : 'ok'}>
            {t(session.status === 'active' ? 'platform.care.sessions.active' : 'platform.care.sessions.ended')}
          </span>
          {waiting ? (
            <span className="doctor-badge" data-status="warn">{t('platform.care.sessions.waiting')}</span>
          ) : unread === 0 && session.mode === 'human' ? (
            <span className="doctor-badge" data-status="ok">{t('platform.care.sessions.replied')}</span>
          ) : null}
        </span>
      </span>
      <CareUnreadBadge count={unread} />
    </button>
  );
}

export interface HumanConversationPageProps {
  readonly session: CareSession;
  readonly careSessions: CareSessionStore;
  readonly reads: CareSessionReadStore;
  readonly unreadTotal: number;
  readonly onOpenSessions: () => void;
}

/**
 * A human consultation inside the conversation home. The PC composer mirrors
 * the AI one: Enter sends, the attach action is omitted because a human
 * consultation is a text conversation.
 */
export function HumanConversationPage({
  session,
  careSessions,
  reads,
  unreadTotal,
  onOpenSessions,
}: HumanConversationPageProps) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doctorName = session.doctor?.displayName || t('platform.care.doctors.ai');
  const doctorLine = [session.doctor?.department, session.doctor?.hospitalName]
    .filter((part) => Boolean(part))
    .join(' · ');
  const waiting = careSessionAwaitingDoctorReply(session);
  const active = session.status === 'active';

  useEffect(() => {
    reads.markRead(session.id);
  }, [reads, session.id, session.transcript.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || !active) return;
    setError(null);
    setNotice(null);
    try {
      careSessions.appendMessage(session.id, {
        role: 'patient',
        text,
        at: new Date().toISOString(),
        channel: 'text',
      });
      setDraft('');
      setNotice(t('platform.care.chat.humanPending'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const end = () => {
    if (!active) return;
    if (typeof window !== 'undefined' && !window.confirm(t('platform.care.chat.humanEnd'))) return;
    careSessions.end(session.id, { endedAt: new Date().toISOString() });
    setNotice(t('platform.care.sessions.ended'));
  };

  return (
    <div>
      <header className="doctor-page-header">
        <div>
          <div className="doctor-human-doctor">
            <DoctorAvatar name={doctorName} src={session.doctor?.avatarUrl ?? ''} />
            <div>
              <h1 className="doctor-page-title">{doctorName}</h1>
              <p className="doctor-page-subtitle">
                {doctorLine ? doctorLine + ' · ' : ''}
                {session.memberLabel}
              </p>
            </div>
            <span className="doctor-badge" data-status={waiting ? 'warn' : 'ok'}>
              {t('platform.care.chat.humanBadge')}
            </span>
          </div>
          <p className="doctor-page-subtitle">
            {t('platform.care.chat.humanSubtitle', { member: session.memberLabel })}
          </p>
        </div>
        <div className="doctor-chat-header-actions">
          <button className="doctor-session-trigger" onClick={onOpenSessions} type="button">
            <span>{t('platform.care.chat.openSessions')}</span>
            <CareUnreadBadge count={unreadTotal} />
          </button>
        </div>
      </header>

      <Panel title={session.title} description={careSessionDoctorLabel(session) || doctorName}>
        <div className="doctor-inline-badges">
          <span className="doctor-badge" data-status={active ? 'skipped' : 'ok'}>
            {t(active ? 'platform.care.sessions.active' : 'platform.care.sessions.ended')}
          </span>
          <span className="doctor-badge" data-status={waiting ? 'warn' : 'ok'}>
            {t(waiting ? 'platform.care.sessions.waiting' : 'platform.care.sessions.replied')}
          </span>
          <span className="doctor-check-detail">
            {t('platform.care.records.messageCount', { count: session.transcript.length })}
          </span>
        </div>
        {notice ? <div className="doctor-notice">{notice}</div> : null}
        {error ? <div className="doctor-error-banner">{error}</div> : null}
        <div className="doctor-form-actions">
          <ActionButton disabled={!active} onClick={end}>{t('platform.care.chat.humanEnd')}</ActionButton>
        </div>
      </Panel>

      <Panel title={t('platform.care.chat.panel')}>
        <ul className="doctor-check-list" aria-live="polite">
          {session.transcript.length === 0 ? (
            <li className="doctor-check">
              <p className="doctor-check-summary">{t('platform.care.chat.humanEmpty')}</p>
            </li>
          ) : session.transcript.map((message) => (
            <li className="doctor-check" data-role={message.role} key={message.id}>
              <div>
                <h3 className="doctor-check-title">
                  {message.role === 'patient' ? t('platform.care.chat.you') : doctorName}
                </h3>
                {message.text ? <p className="doctor-check-summary">{message.text}</p> : null}
                <p className="doctor-check-detail">
                  {new Date(message.at).toLocaleTimeString(i18n.language)}
                  {' · '}
                  {t('platform.care.record.channel.' + message.channel)}
                </p>
              </div>
              {message.level ? (
                <span className="doctor-badge" data-status={message.level === 'emergency' || message.level === 'urgent' ? 'warn' : 'ok'}>
                  {t('platform.care.level.' + message.level)}
                </span>
              ) : <span />}
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
            placeholder={t('platform.care.chat.humanPlaceholder', { doctor: doctorName })}
            value={draft}
          />
          <ActionButton disabled={!active || draft.trim() === ''} onClick={send} tone="primary">
            {t('platform.care.chat.send')}
          </ActionButton>
        </div>
      </Panel>
    </div>
  );
}
