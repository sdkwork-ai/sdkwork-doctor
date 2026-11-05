// 问诊详情: one conversation session and the 病历 it produced, split into the
// four tabs the doctor and the patient read it with — 病历 / AI总结 /
// 医生人工确认 / 通话回放.
const { careText } = require('../../lib/i18n.js');
const {
  addDoctorDiagnosis,
  confirmAiDiagnosis,
  medicalRecordNeedsDoctorReview,
} = require('../../lib/medical-records.js');
const {
  buildCarePlayback,
  careSessionDurationMs,
  careSessionLevel,
  careSessionRecord,
  mergeCareSessions,
} = require('../../lib/care-sessions.js');
const { resolvePrimaryDoctor } = require('../../lib/doctors.js');
const { formatBytes } = require('../../lib/attachments.js');

const LEVELS = ['emergency', 'urgent', 'routine', 'self-care'];
const TABS = ['medical', 'ai', 'doctor', 'playback'];

function formatTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso);
  const two = (part) => String(part).padStart(2, '0');
  return (
    value.getFullYear() + '-' + two(value.getMonth() + 1) + '-' + two(value.getDate()) +
    ' ' + two(value.getHours()) + ':' + two(value.getMinutes())
  );
}

function formatClock(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return String(iso);
  const two = (part) => String(part).padStart(2, '0');
  return two(value.getHours()) + ':' + two(value.getMinutes()) + ':' + two(value.getSeconds());
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value) => String(value).padStart(2, '0');
  return hours > 0 ? hours + ':' + two(minutes) + ':' + two(seconds) : minutes + ':' + two(seconds);
}

function splitList(value) {
  return String(value || '')
    .split(/[\n,，]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function mapAttachment(attachment) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    sizeLabel: formatBytes(attachment.sizeBytes),
    path: attachment.path || '',
    dataUrl: attachment.dataUrl || '',
  };
}

function mapDiagnosis(diagnosis) {
  return {
    impression: diagnosis.impression,
    conditions: diagnosis.conditions.join(' · '),
    recommendations: diagnosis.recommendations,
    notes: diagnosis.notes || '',
    level: careText('platform.care.level.' + diagnosis.level),
    warn: diagnosis.level === 'emergency' || diagnosis.level === 'urgent',
    createdAtLabel: formatTime(diagnosis.createdAt),
    doctorLabel: diagnosis.doctorLabel || '',
  };
}

function statusOf(session, record) {
  if (session.status === 'active') return { key: 'active', tone: 'skipped' };
  if (record && record.confirmation) return { key: 'confirmed', tone: 'ok' };
  if (record) return { key: 'awaiting_doctor', tone: 'warn' };
  return { key: 'ended', tone: 'ok' };
}

Page({
  data: {
    notFound: '',
    backLabel: '',
    detailTitle: '',
    tabs: [],
    activeTab: 'medical',
    session: null,
    statusLabel: '',
    statusTone: 'ok',
    record: null,
    chiefComplaint: '',
    transcript: [],
    attachments: [],
    playback: [],
    playbackIndex: -1,
    playing: false,
    playbackNotice: '',
    playbackProgress: 0,
    playbackLabel: '',
    playbackHint: '',
    playbackUnavailable: '',
    playbackEmpty: '',
    aiPending: '',
    aiHint: '',
    doctorPending: '',
    doctorHint: '',
    recordPending: '',
    recordHint: '',
    review: null,
    reviewError: '',
    notice: '',
    labels: {},
  },

  onLoad(options) {
    this.id = decodeURIComponent((options && options.id) || '');
    this.playTimer = null;
    this.setData({
      notFound: careText('platform.care.records.notFound'),
      backLabel: careText('platform.care.records.backToRecords'),
      detailTitle: careText('platform.care.records.detailTitle'),
      tabs: TABS.map((key) => ({ key: key, label: careText('platform.care.record.tab.' + key) })),
      aiPending: careText('platform.care.record.aiPending'),
      aiHint: careText('platform.care.record.aiHint'),
      doctorPending: careText('platform.care.record.doctorPending'),
      doctorHint: careText('platform.care.record.doctorHint'),
      recordPending: careText('platform.care.record.recordPending'),
      recordHint: careText('platform.care.record.recordHint'),
      playbackHint: careText('platform.care.record.playback.hint'),
      playbackUnavailable: careText('platform.care.record.playback.unavailable'),
      playbackEmpty: careText('platform.care.record.playback.empty'),
      labels: {
        visitTime: careText('platform.care.record.visitTime'),
        duration: careText('platform.care.record.duration'),
        mode: careText('platform.care.records.mode'),
        status: careText('platform.care.record.status'),
        doctor: careText('platform.care.record.doctor'),
        doctorUnassigned: careText('platform.care.record.doctorUnassigned'),
        chiefComplaint: careText('platform.care.record.chiefComplaint'),
        transcript: careText('platform.care.record.transcript'),
        transcriptEmpty: careText('platform.care.record.transcriptEmpty'),
        attachments: careText('platform.care.record.attachments'),
        attachmentsEmpty: careText('platform.care.record.attachmentsEmpty'),
        member: careText('platform.care.records.member'),
        summary: careText('platform.care.medical.summary'),
        aiDiagnosis: careText('platform.care.medical.aiDiagnosis'),
        aiDiagnosisHint: careText('platform.care.medical.aiDiagnosisHint'),
        doctorDiagnosis: careText('platform.care.medical.doctorDiagnosis'),
        doctorDiagnosisHint: careText('platform.care.medical.doctorDiagnosisHint'),
        noDoctorDiagnosis: careText('platform.care.medical.noDoctorDiagnosis'),
        impression: careText('platform.care.medical.impression'),
        conditions: careText('platform.care.medical.conditions'),
        recommendations: careText('platform.care.medical.recommendations'),
        notes: careText('platform.care.medical.notes'),
        review: careText('platform.care.medical.review'),
        reviewHint: careText('platform.care.medical.reviewHint'),
        doctorLabel: careText('platform.care.medical.doctorLabel'),
        doctorPlaceholder: careText('platform.care.medical.doctorPlaceholder'),
        confirmAi: careText('platform.care.medical.confirmAi'),
        amendAi: careText('platform.care.medical.amendAi'),
        addDoctorDiagnosis: careText('platform.care.medical.addDoctorDiagnosis'),
        level: careText('platform.care.records.level'),
        save: careText('platform.care.medical.saveDiagnosis'),
        saved: careText('platform.care.medical.reviewSaved'),
        doctorRequired: careText('platform.care.medical.doctorRequired'),
        impressionRequired: careText('platform.care.medical.impressionRequired'),
        reviewFailed: careText('platform.care.medical.reviewFailed'),
        confirmationStatus: careText('platform.care.record.confirmationStatus'),
        playbackTitle: careText('platform.care.record.playback.title'),
        play: careText('platform.care.record.playback.play'),
        pause: careText('platform.care.record.playback.pause'),
        stop: careText('platform.care.record.playback.stop'),
        replay: careText('platform.care.record.playback.replay'),
        finished: careText('platform.care.record.playback.finished'),
        callVoice: careText('platform.care.record.playback.callVoice'),
        callVideo: careText('platform.care.record.playback.callVideo'),
        callOpen: careText('platform.care.record.playback.callOpen'),
        patient: careText('platform.care.record.playback.patient'),
        doctorRole: careText('platform.care.record.playback.doctor'),
        jump: careText('platform.care.record.playback.jump'),
        tabsTitle: careText('platform.care.records.detailTitle'),
      },
      levelLabels: LEVELS.map((level) => careText('platform.care.level.' + level)),
    });
    this.reload();
  },

  onShow() {
    this.reload();
  },

  onUnload() {
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = null;
  },

  reload() {
    const app = getApp();
    const store = app.globalData.careSessions;
    const medicalStore = app.globalData.medicalRecords;
    const sessions = store ? store.list() : [];
    const records = medicalStore ? medicalStore.list() : [];
    const merged = mergeCareSessions(sessions, records);
    const session = merged.find((entry) => entry.id === this.id) || null;
    if (!session) {
      this.setData({ session: null });
      return;
    }
    this.session = session;
    const record = careSessionRecord(session, records);
    this.record = record;
    const status = statusOf(session, record);
    const attachmentMap = {};
    (record ? record.attachments : []).forEach((attachment) => {
      attachmentMap[attachment.id] = attachment;
    });
    const transcript = session.transcript.map((message) => ({
      id: message.id,
      role: careText(message.role === 'patient' ? 'platform.care.chat.you' : 'platform.care.chat.doctor'),
      text: message.text,
      channel: careText('platform.care.record.channel.' + message.channel),
      level: message.level ? careText('platform.care.level.' + message.level) : '',
      warn: message.level === 'emergency' || message.level === 'urgent',
      time: formatClock(message.at),
      attachments: (message.attachmentIds || [])
        .map((attachmentId) => attachmentMap[attachmentId])
        .filter((attachment) => Boolean(attachment))
        .map(mapAttachment),
    }));
    const complaintMessage = session.transcript.find((message) => (
      message.role === 'patient' && message.text.trim()
    ));
    const playback = buildCarePlayback(session).map((item) => {
      if (item.kind === 'call') {
        return {
          kind: 'call',
          id: item.id,
          label: careText(item.mode === 'video'
            ? 'platform.care.record.playback.callVideo'
            : 'platform.care.record.playback.callVoice'),
          meta: formatClock(item.at) + ' · ' + formatDuration(item.durationMs)
            + (item.open ? ' · ' + careText('platform.care.record.playback.callOpen') : ''),
        };
      }
      return {
        kind: 'message',
        id: item.id,
        role: careText(item.role === 'patient'
          ? 'platform.care.record.playback.patient'
          : 'platform.care.record.playback.doctor'),
        text: item.text,
        channel: careText('platform.care.record.channel.' + item.channel),
        time: formatClock(item.at),
        offset: formatDuration(item.offsetMs),
        level: item.level ? careText('platform.care.level.' + item.level) : '',
        warn: item.level === 'emergency' || item.level === 'urgent',
      };
    });
    this.setData({
      session: {
        id: session.id,
        title: session.title,
        member: session.memberLabel,
        startedAt: formatTime(session.startedAt),
        endedAt: session.endedAt ? formatTime(session.endedAt) : '',
        duration: formatDuration(careSessionDurationMs(session)),
        mode: careText(session.mode === 'hosted' ? 'platform.care.mode.hosted' : 'platform.care.mode.offline'),
        messages: careText('platform.care.records.messageCount', { count: String(session.transcript.length) }),
        calls: careText('platform.care.records.callCount', { count: String((session.calls || []).length) }),
        level: careSessionLevel(session) === 'self-care'
          ? ''
          : careText('platform.care.level.' + careSessionLevel(session)),
        warn: careSessionLevel(session) === 'emergency' || careSessionLevel(session) === 'urgent',
      },
      statusLabel: careText('platform.care.records.status.' + status.key),
      statusTone: status.tone,
      active: session.status === 'active',
      chiefComplaint: complaintMessage ? complaintMessage.text : '',
      transcript: transcript,
      attachments: (record ? record.attachments : []).map(mapAttachment),
      playback: playback,
      record: record
        ? {
          summary: record.summary,
          ai: mapDiagnosis(record.aiDiagnosis),
          doctorDiagnosis: record.doctorDiagnosis ? mapDiagnosis(record.doctorDiagnosis) : null,
          statusLabel: careText('platform.care.medical.status.'
            + (medicalRecordNeedsDoctorReview(record) ? 'awaiting_doctor' : 'confirmed')),
          statusWarn: medicalRecordNeedsDoctorReview(record),
          confirmationLabel: record.confirmation
            ? careText('platform.care.medical.decision.' + record.confirmation.decision) + ' · '
              + careText('platform.care.medical.confirmedBy', {
                doctor: record.confirmation.doctorLabel,
                at: formatTime(record.confirmation.confirmedAt),
              })
            : '',
          doctorLabel: record.confirmation ? record.confirmation.doctorLabel : '',
        }
        : null,
      playbackEmpty: playback.length === 0 ? careText('platform.care.record.playback.empty') : '',
    });
    if (this.data.activeTab === 'doctor') this.ensureReview();
  },

  primaryDoctorName() {
    const app = getApp();
    const roster = app.globalData.doctorRoster;
    const selection = app.globalData.doctors ? app.globalData.doctors.state() : null;
    const primary = roster && selection ? resolvePrimaryDoctor(roster, selection) : null;
    return primary ? primary.displayName : '';
  },

  ensureReview() {
    if (!this.record) return;
    if (this.data.review) return;
    const needsReview = medicalRecordNeedsDoctorReview(this.record);
    this.setData({
      review: {
        mode: needsReview ? 'confirm' : 'manual',
        doctorLabel: this.primaryDoctorName(),
        impression: needsReview ? this.record.aiDiagnosis.impression : '',
        conditions: this.record.aiDiagnosis.conditions.join('\n'),
        recommendations: this.record.aiDiagnosis.recommendations.join('\n'),
        levelIndex: Math.max(0, LEVELS.indexOf(this.record.aiDiagnosis.level)),
        notes: '',
      },
      reviewError: '',
      notice: '',
    });
  },

  onTab(event) {
    const tab = event && event.currentTarget ? event.currentTarget.dataset.tab : '';
    if (!tab) return;
    this.setData({ activeTab: tab });
    if (tab === 'doctor') this.ensureReview();
    if (tab === 'playback') this.setData({ playbackNotice: this.data.playbackUnavailable });
    if (tab !== 'playback') this.stopPlayback();
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onOpenAttachment(event) {
    const path = event && event.currentTarget ? event.currentTarget.dataset.path : '';
    if (!path) return;
    try {
      wx.openDocument({ filePath: path, showMenu: true });
    } catch (error) {
      // A file the host cannot preview stays listed by name.
    }
  },

  onReviewInput(event) {
    const field = event && event.currentTarget ? event.currentTarget.dataset.field : '';
    if (!field || !this.data.review) return;
    const value = event && event.detail ? event.detail.value : '';
    this.setData({ ['review.' + field]: value });
  },

  onReviewMode(event) {
    const mode = event && event.currentTarget ? event.currentTarget.dataset.mode : '';
    if (!mode || !this.data.review) return;
    this.setData({ 'review.mode': mode });
  },

  onLevelChange(event) {
    const index = event && event.detail ? Number(event.detail.value) : 0;
    this.setData({ 'review.levelIndex': index });
  },

  onSaveReview() {
    const review = this.data.review;
    const record = this.record;
    const store = getApp().globalData.medicalRecords;
    if (!review || !record || !store) return;
    const doctorLabel = String(review.doctorLabel || '').trim();
    if (!doctorLabel) {
      this.setData({ reviewError: careText('platform.care.medical.doctorRequired') });
      return;
    }
    const needsImpression = review.mode === 'amend' || review.mode === 'manual';
    if (needsImpression && !String(review.impression || '').trim()) {
      this.setData({ reviewError: careText('platform.care.medical.impressionRequired') });
      return;
    }
    const level = LEVELS[review.levelIndex] || record.aiDiagnosis.level;
    const at = new Date().toISOString();
    try {
      let next;
      if (review.mode === 'manual') {
        next = addDoctorDiagnosis(record, {
          doctorLabel: doctorLabel,
          impression: review.impression,
          conditions: splitList(review.conditions),
          recommendations: splitList(review.recommendations),
          level: level,
          notes: review.notes,
          createdAt: at,
        });
      } else if (review.mode === 'amend') {
        next = confirmAiDiagnosis(record, {
          doctorLabel: doctorLabel,
          decision: 'amended',
          confirmedAt: at,
          doctorDiagnosis: {
            doctorLabel: doctorLabel,
            impression: review.impression,
            conditions: splitList(review.conditions),
            recommendations: splitList(review.recommendations),
            level: level,
            notes: review.notes,
            createdAt: at,
          },
        });
      } else {
        next = confirmAiDiagnosis(record, {
          doctorLabel: doctorLabel,
          decision: 'confirmed',
          confirmedAt: at,
        });
      }
      store.save(next);
      this.setData({
        review: null,
        reviewError: '',
        notice: this.data.labels.saved,
      });
      this.reload();
    } catch (error) {
      this.setData({
        reviewError: careText('platform.care.medical.reviewFailed', {
          message: (error && error.message) || String(error),
        }),
      });
    }
  },

  togglePlayback() {
    if (this.data.playing) {
      this.stopPlayback();
      return;
    }
    const total = this.data.playback.length;
    if (total === 0) return;
    let index = this.data.playbackIndex;
    if (index < 0 || index >= total - 1) index = 0;
    this.setData({ playing: true, notice: '', playbackNotice: '' });
    this.advancePlayback(index);
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = setInterval(() => {
      const next = this.data.playbackIndex + 1;
      if (next >= this.data.playback.length) {
        this.stopPlayback(true);
        this.setData({ playbackNotice: careText('platform.care.record.playback.finished') });
        return;
      }
      this.advancePlayback(next);
    }, 2500);
  },

  advancePlayback(index) {
    const item = this.data.playback[index];
    const total = this.data.playback.length;
    this.setData({
      playbackIndex: index,
      playbackProgress: total === 0 ? 0 : Math.round(((index + 1) / total) * 100),
      playbackLabel: item
        ? (item.kind === 'call' ? item.label : item.role)
        : '',
    });
  },

  stopPlayback(finished) {
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = null;
    this.setData({
      playing: false,
      playbackIndex: -1,
      playbackProgress: 0,
      playbackLabel: '',
      playbackNotice: finished ? this.data.playbackNotice : '',
    });
  },

  onSelectPlayback(event) {
    const index = event && event.currentTarget ? Number(event.currentTarget.dataset.index) : -1;
    if (index < 0) return;
    const wasPlaying = this.data.playing;
    this.stopPlayback();
    this.advancePlayback(index);
    if (wasPlaying) {
      this.setData({ playing: true });
      this.playTimer = setInterval(() => {
        const next = this.data.playbackIndex + 1;
        if (next >= this.data.playback.length) {
          this.stopPlayback(true);
          this.setData({ playbackNotice: careText('platform.care.record.playback.finished') });
          return;
        }
        this.advancePlayback(next);
      }, 2500);
    }
  },

  onReplay() {
    this.stopPlayback();
    this.setData({ playbackIndex: -1, playbackProgress: 0 });
    this.togglePlayback();
  },

  onStopPlayback() {
    this.stopPlayback();
  },
});
