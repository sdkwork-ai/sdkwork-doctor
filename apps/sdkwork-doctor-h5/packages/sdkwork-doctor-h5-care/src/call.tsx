import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AgentConversationPort } from '@sdkwork/doctor-common-agent';
import {
  createVisitRecord,
  type CareSessionStore,
  type PatientProfileStore,
  type VisitRecordStore,
} from '@sdkwork/doctor-common-doctor';
import { DoctorIcon } from '@sdkwork/doctor-h5-commons';

import {
  CareCallSession,
  type CareCallSnapshot,
  type CareSpeechSynthesizerPort,
  type CareCameraPort,
} from './call-session';
import {
  createBrowserCamera,
  createBrowserSpeechRecognizer,
  createBrowserSpeechSynthesizer,
} from './call-ports';

const IDLE: CareCallSnapshot = Object.freeze({
  phase: 'connecting',
  transcript: '',
  replyText: null,
  notice: null,
  micEnabled: true,
  videoEnabled: false,
});

/** Runs the call without a voice: the answer still appears as a caption. */
const silentSynthesizer: CareSpeechSynthesizerPort = {
  async initialize() {
    return false;
  },
  async speak() {
    // Nothing to read aloud; the caption carries the answer.
  },
  async stop() {
    // No utterance to interrupt.
  },
  async dispose() {
    // Nothing to release.
  },
};

/** A device with no camera keeps the call in voice mode. */
const unavailableCamera: CareCameraPort = {
  async open() {
    return false;
  },
  async flip() {
    // No camera to flip.
  },
  async close() {
    // No stream to close.
  },
};

export interface CareCallPageProps {
  /** Conversation transport shared with the chat page. */
  readonly agent: AgentConversationPort;
  /** Household files; the call consults for the active patient. */
  readonly patients: PatientProfileStore;
  /** Spoken turns are recorded as visit records, exactly like typed turns. */
  readonly records: VisitRecordStore;
  /** The visit session the call belongs to; a call is a segment of one visit. */
  readonly careSessions: CareSessionStore;
}

/**
 * 视频/语音通话 of the family doctor conversation. It is a full-screen mode of
 * the same session: every spoken turn goes through the shared agent exchange
 * and lands in 看病记录, and hanging up returns to the text conversation with
 * the transcript intact.
 */
export function CareCallPage({ agent, patients, records, careSessions }: CareCallPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVideo = searchParams.get('video') === '1';
  const profiles = useSyncExternalStore(patients.subscribe, patients.list, patients.list);
  const activeId = useSyncExternalStore(patients.subscribe, patients.activeId, patients.activeId);
  const active = profiles.find((profile) => profile.id === activeId) ?? profiles[0] ?? null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const channelRef = useRef<'voice' | 'video'>(initialVideo ? 'video' : 'voice');
  const callRef = useRef<{ sessionId: string; callId: string; createdHere: boolean } | null>(null);

  const [session, setSession] = useState<CareCallSession | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const subscribe = useCallback(
    (listener: () => void) => (session ? session.subscribe(listener) : () => undefined),
    [session],
  );
  const getSnapshot = useCallback(() => session?.snapshot() ?? IDLE, [session]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    channelRef.current = state.videoEnabled ? 'video' : 'voice';
  }, [state.videoEnabled]);

  const patient = active;
  const patientLabel = patient
    ? t('platform.care.profile.relation.' + patient.relation) + ' · ' + patient.displayName
    : t('platform.care.profile.notCreated');

  useEffect(() => {
    const member = activeRef.current;
    if (!member) return undefined;
    const recognizer = createBrowserSpeechRecognizer();
    if (!recognizer) {
      setUnsupported(true);
      return undefined;
    }
    const camera = createBrowserCamera({
      onStream: (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      },
    }) ?? unavailableCamera;
    const localeTag = i18n.language === 'en-US' ? 'en-US' : 'zh-CN';
    // A call is a segment of the visit, not a second visit: join the open
    // session (the one the chat tab started) or open one for the call.
    const existing = careSessions.findActive(member.id);
    const visit = careSessions.ensureActive({
      member,
      mode: agent.mode,
      sessionId: agent.sessionId() ?? undefined,
    });
    const withCall = careSessions.startCall(visit.id, channelRef.current) ?? visit;
    const openCall = [...withCall.calls].reverse().find((call) => !call.endedAt && call.mode === channelRef.current);
    callRef.current = {
      sessionId: visit.id,
      callId: openCall?.id ?? '',
      createdHere: !existing,
    };
    const next = new CareCallSession({
      locale: localeTag,
      recognizer,
      synthesizer: createBrowserSpeechSynthesizer() ?? silentSynthesizer,
      camera,
      greeting: i18n.t('platform.care.call.greeting'),
      sendTurn: async (text) => {
        const current = activeRef.current;
        if (!current) return { reply: null, error: null };
        try {
          const reply = await agent.send(text, { member: current });
          records.add(createVisitRecord({
            member: current,
            symptom: text,
            advice: reply.text,
            level: reply.triage?.level ?? 'routine',
            mode: agent.mode,
          }));
          const call = callRef.current;
          if (call) {
            const channel = channelRef.current;
            careSessions.appendMessage(call.sessionId, {
              role: 'patient',
              text,
              at: new Date().toISOString(),
              channel,
              ...(reply.triage?.level ? { level: reply.triage.level } : {}),
            });
            careSessions.appendMessage(call.sessionId, {
              role: 'assistant',
              text: reply.text,
              at: new Date().toISOString(),
              channel,
            });
          }
          if (reply.triage?.escalate && typeof document !== 'undefined') {
            document.documentElement.dataset.triage = reply.triage.level;
          }
          return { reply: reply.text, error: null };
        } catch (reason) {
          return {
            reply: null,
            error: reason instanceof Error ? reason.message : String(reason),
          };
        }
      },
    });
    setUnsupported(false);
    setSession(next);
    void next.start(initialVideo);
    return () => {
      const call = callRef.current;
      if (call) {
        if (call.callId) careSessions.endCall(call.sessionId, call.callId, new Date().toISOString());
        const latest = careSessions.find(call.sessionId);
        if (call.createdHere && latest && latest.transcript.length === 0) {
          careSessions.remove(call.sessionId);
        }
        callRef.current = null;
      }
      next.dispose();
      setSession(null);
    };
  }, [agent, records, careSessions, i18n, i18n.language, initialVideo]);

  const endCall = useCallback(() => {
    const finish = () => navigate('/doctor/chat', { replace: true });
    if (!session) {
      finish();
      return;
    }
    void session.hangUp().finally(finish);
  }, [navigate, session]);

  const statusText = ((): string => {
    switch (state.phase) {
      case 'connecting': return t('platform.care.call.connecting');
      case 'listening': return state.micEnabled ? t('platform.care.call.listening') : t('platform.care.call.muted');
      case 'thinking': return t('platform.care.call.thinking');
      case 'speaking': return t('platform.care.call.interrupt');
      case 'unavailable': return t('platform.care.call.title');
      default: return '';
    }
  })();
  const caption = state.phase === 'speaking' ? state.replyText : (state.transcript || null);
  const notice = state.notice
    ? t(state.notice.key, state.notice.params ?? {})
    : null;

  if (!active) {
    return (
      <div className="doctor-call doctor-call-state">
        <DoctorIcon className="doctor-call-state-icon" name="video" />
        <p className="doctor-call-state-text">{t('platform.care.call.patientMissing')}</p>
        <div className="doctor-call-state-actions">
          <Link className="doctor-call-primary" to="/doctor/me/patients">
            {t('platform.care.profile.title')}
          </Link>
          <Link className="doctor-call-secondary" to="/doctor/chat">
            {t('platform.care.call.toText')}
          </Link>
        </div>
      </div>
    );
  }

  if (unsupported || state.phase === 'unavailable') {
    return (
      <div className="doctor-call doctor-call-state">
        <DoctorIcon className="doctor-call-state-icon" name="micOff" />
        <p className="doctor-call-state-text">{t('platform.care.call.unavailable')}</p>
        <div className="doctor-call-state-actions">
          <Link className="doctor-call-primary" to="/doctor/chat">
            {t('platform.care.call.toText')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="doctor-call" data-video={state.videoEnabled ? 'true' : undefined}>
      <div aria-hidden="true" className="doctor-call-backdrop" />
      <video aria-hidden="true" autoPlay className="doctor-call-video" muted playsInline ref={videoRef} />
      {state.videoEnabled ? <div aria-hidden="true" className="doctor-call-scrim" /> : null}

      <div className="doctor-call-top">
        <span className="doctor-call-mode">
          {t(state.videoEnabled ? 'platform.care.call.videoTitle' : 'platform.care.call.title')}
        </span>
        <span className="doctor-call-patient">
          <DoctorIcon className="doctor-call-patient-icon" name="user" />
          {patientLabel}
        </span>
        <button className="doctor-call-text" onClick={endCall} type="button">
          {t('platform.care.call.toText')}
        </button>
      </div>

      <div className="doctor-call-center">
        <button
          aria-label={t('platform.care.call.interrupt')}
          className="doctor-call-orb"
          onClick={() => void session?.interrupt()}
          type="button"
        >
          <span aria-hidden="true" className="doctor-call-orb-glow" />
          <span aria-hidden="true" className="doctor-call-orb-sphere" />
        </button>
        <p aria-live="polite" className="doctor-call-status">{statusText}</p>
        {caption ? <p className="doctor-call-caption">{caption}</p> : null}
        {notice ? <p className="doctor-call-notice">{notice}</p> : null}
      </div>

      <div className="doctor-call-controls">
        <button
          aria-label={t(state.micEnabled ? 'platform.care.call.micOn' : 'platform.care.call.micOff')}
          className="doctor-call-control"
          data-active={state.micEnabled ? 'true' : undefined}
          onClick={() => void session?.toggleMic()}
          type="button"
        >
          <DoctorIcon name={state.micEnabled ? 'mic' : 'micOff'} />
        </button>
        <button
          aria-label={t(state.videoEnabled ? 'platform.care.call.cameraOff' : 'platform.care.call.cameraOn')}
          className="doctor-call-control"
          data-active={state.videoEnabled ? 'true' : undefined}
          onClick={() => void session?.toggleCamera()}
          type="button"
        >
          <DoctorIcon name={state.videoEnabled ? 'video' : 'videoOff'} />
        </button>
        {state.videoEnabled ? (
          <button
            aria-label={t('platform.care.call.flip')}
            className="doctor-call-control"
            onClick={() => void session?.flipCamera()}
            type="button"
          >
            <DoctorIcon name="flip" />
          </button>
        ) : null}
        <button
          aria-label={t('platform.care.call.hangUp')}
          className="doctor-call-control"
          data-tone="danger"
          onClick={endCall}
          type="button"
        >
          <DoctorIcon name="close" />
        </button>
      </div>

      <p className="doctor-call-ai">{t('platform.care.call.aiNotice')}</p>
    </div>
  );
}
